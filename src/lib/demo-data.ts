import sharp from "sharp";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { hashPassword } from "./password";
import { uploadObject } from "./s3";

// Sample data for the public demo and for trying Agora locally: a fictional ceramics creator with
// three tiers, a dozen posts (images, a video, locked posts), two patrons and a few weeks of views.
// Relative imports keep this usable from the `npm run demo:seed` script as well as from the app.

export const DEMO_PASSWORD = "demo-password";
const CREATOR_ID = "demo-creator-maya";

const day = (daysAgo: number, hour = 10) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};

type Palette = [string, string, string];

// Abstract "kiln" artwork: no text, so it renders the same with or without system fonts.
async function artwork(palette: Palette, width = 1200, height = 800): Promise<Buffer> {
  const [a, b, c] = palette;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <radialGradient id="g" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stop-color="${a}"/><stop offset="55%" stop-color="${b}"/><stop offset="100%" stop-color="${c}"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${Math.round(width * 0.7)}" cy="${Math.round(height * 0.42)}" r="${Math.round(height * 0.26)}" fill="${c}" opacity="0.55"/>
    <ellipse cx="${Math.round(width * 0.32)}" cy="${Math.round(height * 0.72)}" rx="${Math.round(width * 0.22)}" ry="${Math.round(height * 0.08)}" fill="#ffffff" opacity="0.18"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

const PALETTES: Palette[] = [
  ["#f5d0a9", "#c2410c", "#7c2d12"],
  ["#bae6fd", "#0e7490", "#164e63"],
  ["#fde68a", "#b45309", "#78350f"],
  ["#e9d5ff", "#7e22ce", "#3b0764"],
  ["#d9f99d", "#4d7c0f", "#1a2e05"],
  ["#fecaca", "#b91c1c", "#450a0a"],
];

// How many pictures each post needs: inline ones appear inside the text, gallery ones below it.
const IMAGES = {
  blue: { inline: 2, gallery: 0 },
  kiln: { inline: 0, gallery: 2 },
  wedging: { inline: 1, gallery: 0 },
  glaze: { inline: 0, gallery: 1 },
  trimming: { inline: 1, gallery: 0 },
  shelf: { inline: 0, gallery: 3 },
} as const;
type ImageSet = keyof typeof IMAGES;

type StoredImage = { id: string; key: string; size: number; palette: number };

export type DemoAssets = { passwordHash: string; images: Record<ImageSet, { inline: StoredImage[]; gallery: StoredImage[] }> };

// Pictures get fixed object keys, so every re-seed overwrites the same files instead of piling up.
export async function prepareDemoAssets(): Promise<DemoAssets> {
  const images = {} as DemoAssets["images"];
  let paletteIndex = 0;
  for (const [name, counts] of Object.entries(IMAGES) as [ImageSet, { inline: number; gallery: number }][]) {
    const make = async (kind: "inline" | "gallery", count: number): Promise<StoredImage[]> =>
      Promise.all(
        Array.from({ length: count }, async (_, n) => {
          const palette = paletteIndex++ % PALETTES.length;
          const body = await artwork(PALETTES[palette]);
          const key = `posts/${CREATOR_ID}/${name}-${kind}-${n}.jpg`;
          await uploadObject(key, body, "image/jpeg");
          return { id: `demo-media-${name}-${kind}-${n}`, key, size: body.length, palette };
        }),
      );
    images[name] = { inline: await make("inline", counts.inline), gallery: await make("gallery", counts.gallery) };
  }
  return { passwordHash: await hashPassword(DEMO_PASSWORD), images };
}

// Writes the whole demo into an empty database. Runs inside one transaction when called from a reset.
export async function writeDemoData(db: Prisma.TransactionClient, assets: DemoAssets): Promise<void> {
  const { passwordHash, images } = assets;

  const maya = await db.user.create({
    data: {
      id: CREATOR_ID,
      name: "Maya Okafor",
      email: "maya@example.com",
      passwordHash,
      role: "CREATOR",
      slug: "maya-makes",
      tagline: "Handmade ceramics, one kiln load at a time",
      bio:
        "I throw, glaze and fire everything in a small studio in Bristol. Every week I share the glaze tests, " +
        "the failures and the firings that finally worked. Supporters get the recipes and the process videos.\n\n" +
        "This is a fictional demo creator. Everything here resets regularly, so poke around.",
      currency: "GBP",
      acceptsPayments: true,
      tipsEnabled: true,
      tipThanks: "Thank you so much, that buys another bag of clay!",
      allowDMs: true,
      onboardedAt: day(120),
      themeName: "light",
      fontHeading: "playfair-display",
      fontBody: "dm-sans",
      socialLinks: {
        youtube: "https://www.youtube.com/@mayamakes",
        instagram: "https://www.instagram.com/mayamakes",
      },
    },
  });

  await db.tier.create({
    data: {
      creatorId: maya.id,
      name: "Follower",
      price: 0,
      description: "Follow for updates and every public post.",
      perks: ["New public posts in your feed", "Glaze test results when I share them"],
    },
  });
  const studioFriend = await db.tier.create({
    data: {
      creatorId: maya.id,
      name: "Studio Friend",
      price: 400,
      description: "Behind the scenes from the studio floor.",
      perks: ["Process videos from every firing", "Monthly studio notes", "Early access to new glaze recipes"],
      welcomeMessage: "Welcome to the studio! Your first process video lands this week.",
    },
  });
  const makerClub = await db.tier.create({
    data: {
      creatorId: maya.id,
      name: "Maker Club",
      price: 1200,
      description: "Everything in Studio Friend, plus the recipe library and monthly live Q&As.",
      perks: [
        "Full glaze recipe library",
        "Monthly live Q&A on the last Sunday",
        "Pattern and template downloads",
        "Name in the thank-you list",
      ],
      badge: "Most popular",
      highlighted: true,
      welcomeMessage: "You're in the Maker Club! The recipe library is open and the next Q&A is on the last Sunday.",
    },
  });
  await db.instanceSetting.upsert({
    where: { id: "instance" },
    update: { ownerId: maya.id },
    create: { id: "instance", ownerId: maya.id },
  });

  const jordan = await db.user.create({
    data: { name: "Jordan Lee", email: "jordan@example.com", passwordHash, role: "PATRON", onboardedAt: day(200) },
  });
  const priya = await db.user.create({
    data: { id: "demo-supporter-priya", name: "Priya Shah", email: "priya@example.com", passwordHash, role: "PATRON", onboardedAt: day(200) },
  });
  await db.subscription.create({ data: { patronId: jordan.id, tierId: makerClub.id, status: "ACTIVE", createdAt: day(90) } });
  await db.subscription.create({ data: { patronId: priya.id, tierId: studioFriend.id, status: "ACTIVE", createdAt: day(40) } });

  type PostInput = {
    id: string;
    title: string;
    createdAt: Date;
    images?: ImageSet;
    isPublic: boolean;
    tier?: { id: string };
    text: (inline: string[]) => string;
  };
  const post = async (input: PostInput) => {
    const set = input.images ? images[input.images] : null;
    const inline = set?.inline ?? [];
    const gallery = set?.gallery ?? [];
    await db.post.create({
      data: {
        id: input.id,
        creatorId: maya.id,
        title: input.title,
        textContent: input.text(inline.map((image) => image.id)),
        isPublic: input.isPublic,
        minTierId: input.tier?.id ?? null,
        createdAt: input.createdAt,
        media: {
          create: [...inline.map((image) => ({ ...image, inline: true })), ...gallery.map((image) => ({ ...image, inline: false }))].map(
            (image, position) => ({
              id: image.id,
              position,
              inline: image.inline,
              kind: "IMAGE" as const,
              contentType: "image/jpeg",
              size: BigInt(image.size),
              objectKey: image.key,
            }),
          ),
        },
      },
    });
    return input.id;
  };

  // Newest first in the feed, so the order below is oldest to newest.
  await post({
    id: "demo-post-welcome",
    title: "Welcome to my studio",
    createdAt: day(40),
    isPublic: true,
    text: () =>
      [
        "Hello, and thanks for stopping by. I'm Maya. I make bowls, mugs and the occasional lopsided vase in a shed at the bottom of my garden.",
        "Here you'll find glaze tests, kiln logs and process videos. **Followers** see every public post. **Studio Friends** and the **Maker Club** get the behind-the-scenes material.",
        "Say hello in the comments. I read all of them.",
      ].join("\n\n"),
  });
  const blue = await post({
    id: "demo-post-blue",
    title: "The blue that finally worked",
    createdAt: day(21),
    isPublic: true,
    images: "blue",
    text: ([one, two]) =>
      [
        "After nineteen failed tests the copper-blue finally came out of the kiln the colour I wanted. Here's the whole story, because the failures taught me more than the success did.",
        "## What changed",
        "- Cobalt dropped from 2% to 1.4%\n- Firing to cone 6 with a slower cool-down\n- The bowl sat on a wad of kaolin, not directly on the shelf",
        `![Test tile, cooled slowly](/api/media/${one})`,
        "The same glaze on a dry white stoneware body gave a deeper edge. On the grey body it went almost black.",
        `![The three tiles side by side](/api/media/${two})`,
        "## Why the cool-down matters",
        "Glaze is a glass. If it cools too fast it never gets the chance to grow the tiny crystals that give a blue like this its depth, and it can craze as it shrinks faster than the clay underneath. A slow cool lets the surface settle.",
        "I used to open the kiln as soon as the dial said it was safe. Now I wait until the next morning. It costs me a day per firing and saves me a shelf of ruined bowls.",
        "## What I'd do differently",
        "1. Weigh the cobalt on the small scale, not the big one\n2. Label every tile with the recipe number before it goes in\n3. Photograph them in daylight, not under the studio lights",
        "> Thin layers, slow cooling. That was the whole secret.",
        "The recipe is in the Maker Club library if you want to try it.",
      ].join("\n\n"),
  });
  const kiln = await post({
    id: "demo-post-kiln",
    title: "Kiln log: fourteen bowls in one firing",
    createdAt: day(12),
    isPublic: true,
    images: "kiln",
    text: () =>
      "Loaded the kiln on Tuesday, fired Wednesday, unloaded Friday. Two bowls cracked on the rim, which I think is a drying problem rather than a firing one. Next batch I'm drying them under a bin for a day longer.",
  });
  await post({
    id: "demo-post-video",
    title: "Videos play right in the post",
    createdAt: day(9),
    isPublic: true,
    text: () =>
      [
        "Paste a YouTube, Vimeo, Loom or Spotify link on a line of its own and it turns into a player. Nothing to upload, nothing to configure.",
        "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        "That's the very first video ever uploaded to YouTube, as a stand-in for my kiln-opening videos.",
      ].join("\n\n"),
  });
  await post({
    id: "demo-post-wedging",
    title: "Studio Friend: wedging a 5kg block by hand",
    createdAt: day(6),
    isPublic: false,
    tier: studioFriend,
    images: "wedging",
    text: ([one]) =>
      [
        "Short process video is below. Hand-wedging takes me about ten minutes and keeps the clay honest.",
        `![A block of clay on the wedging table](/api/media/${one})`,
        "Next week: trimming leather-hard bowls.",
      ].join("\n\n"),
  });
  await post({
    id: "demo-post-trimming",
    title: "Studio Friend: trimming leather-hard bowls",
    createdAt: day(4),
    isPublic: false,
    tier: studioFriend,
    images: "trimming",
    text: ([one]) =>
      [
        "As promised: the trimming session. The trick is to catch the bowl at leather-hard, when it's firm enough to hold its shape and soft enough to cut cleanly.",
        `![A bowl upside down on the wheel head](/api/media/${one})`,
        "I trim a foot ring on everything. It lifts the bowl off the table, so it looks lighter, and it stops the glaze running onto the shelf.",
      ].join("\n\n"),
  });
  await post({
    id: "demo-post-glaze-chart",
    title: "Maker Club: my glaze chart, updated",
    createdAt: day(2),
    isPublic: false,
    tier: makerClub,
    images: "glaze",
    text: () =>
      [
        "## This month's additions",
        "1. Honey matt (cone 6, oxidation)\n2. Sea salt speckle (cone 6, reduction)\n3. Ash green, now without the copper flash",
        "Full recipes, test tile photos and the firing schedule are in the chart below.",
      ].join("\n\n"),
  });
  await post({
    id: "demo-post-shelf",
    title: "A shelf of finished work",
    createdAt: day(1),
    isPublic: true,
    images: "shelf",
    text: () => "Everything from the last three firings, waiting for the Saturday market. Which one would you take home?",
  });
  await post({
    id: "demo-post-open-studio",
    title: "Open studio this Saturday",
    createdAt: day(0, 8),
    isPublic: true,
    text: () =>
      "The studio door is open from 10 until 4 this Saturday. Come and throw a bowl, drink too much tea and tell me which glazes I should retire. Supporters get the first pick of the seconds table.",
  });

  await db.postLike.createMany({
    data: [
      { postId: blue, userId: jordan.id, createdAt: day(20) },
      { postId: blue, userId: priya.id, createdAt: day(20) },
      { postId: kiln, userId: priya.id, createdAt: day(11) },
      { postId: "demo-post-welcome", userId: jordan.id, createdAt: day(39) },
    ],
  });
  await db.comment.create({
    data: {
      postId: blue,
      authorId: jordan.id,
      body: "The grey-body tile is my favourite. Is that the same glaze with less cobalt?",
      createdAt: day(19),
    },
  });
  await db.comment.create({
    data: {
      postId: blue,
      authorId: priya.id,
      body: "Thank you for the slow-cool tip. Mine always crazes when I rush it.",
      createdAt: day(18),
    },
  });

  // Four weeks of views, so the analytics chart has some shape.
  const profileViews = [];
  const postViews = [];
  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const wave = 1 + Math.sin(daysAgo / 3) * 0.4;
    profileViews.push({ creatorId: maya.id, day: day(daysAgo, 0), views: Math.round((18 + (29 - daysAgo) * 1.2) * wave) });
    for (const postId of [blue, kiln]) {
      if (daysAgo <= 21) postViews.push({ postId, day: day(daysAgo, 0), views: Math.round(6 * wave) });
    }
  }
  await db.profileViewDay.createMany({ data: profileViews });
  await db.postViewDay.createMany({ data: postViews });
}

// Wipes everything except the migration history and the waitlist, then writes the demo again, in one
// transaction so visitors never see a half-empty site. Never call this on a real instance.
export async function resetDemoData(prisma: PrismaClient): Promise<void> {
  const assets = await prepareDemoAssets();
  await prisma.$transaction(
    async (tx) => {
      const tables = await tx.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = current_schema() AND tablename NOT IN ('_prisma_migrations', 'WaitlistEntry')`;
      if (tables.length > 0) {
        const list = tables.map((table) => `"${table.tablename.replaceAll('"', '""')}"`).join(", ");
        await tx.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
      }
      await writeDemoData(tx, assets);
    },
    { timeout: 60_000, maxWait: 20_000 },
  );
}
