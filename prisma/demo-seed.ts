import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";
import { uploadObject } from "../src/lib/s3";

// Realistic sample data for a single-creator demo: a ceramics creator with three tiers, four posts
// (with inline images), two patrons and a few weeks of views. Used for the README screenshots and
// for trying Agora out. It refuses to run on a database that already has accounts.
//
//   npm run demo:seed
//
// Demo password for every account: demo-password. Never seed a public instance.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PASSWORD = "demo-password";
const day = (daysAgo: number, hour = 10) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};

// Abstract "kiln" artwork: no text, so it renders the same with or without system fonts.
async function artwork(palette: [string, string, string], width = 1200, height = 800): Promise<Buffer> {
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
  return sharp(Buffer.from(svg)).jpeg({ quality: 84 }).toBuffer();
}

async function storeImage(creatorId: string, palette: [string, string, string]) {
  const body = await artwork(palette);
  const key = `posts/${creatorId}/${randomUUID()}.jpg`;
  await uploadObject(key, body, "image/jpeg");
  return { key, size: body.length };
}

async function main() {
  if ((await prisma.user.count()) > 0) {
    throw new Error("This database already has accounts. Point DATABASE_URL at an empty database for the demo.");
  }
  const passwordHash = await hashPassword(PASSWORD);

  const maya = await prisma.user.create({
    data: {
      name: "Maya Okafor",
      email: "maya@example.com",
      passwordHash,
      role: "CREATOR",
      slug: "maya-makes",
      tagline: "Handmade ceramics, one kiln load at a time",
      bio:
        "I throw, glaze and fire everything in a small studio in Bristol. Every week I share the glaze tests, " +
        "the failures and the firings that finally worked. Supporters get the recipes and the process videos.",
      currency: "GBP",
      acceptsPayments: true,
      tipsEnabled: true,
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

  await prisma.tier.create({
    data: {
      creatorId: maya.id,
      name: "Follower",
      price: 0,
      description: "Follow for updates and every public post.",
      perks: ["New public posts in your feed", "Glaze test results when I share them"],
    },
  });
  await prisma.instanceSetting.upsert({
    where: { id: "instance" },
    update: { ownerId: maya.id },
    create: { id: "instance", ownerId: maya.id },
  });
  const studioFriend = await prisma.tier.create({
    data: {
      creatorId: maya.id,
      name: "Studio Friend",
      price: 400,
      description: "Behind the scenes from the studio floor.",
      perks: ["Process videos from every firing", "Monthly studio notes", "Early access to new glaze recipes"],
    },
  });
  const makerClub = await prisma.tier.create({
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
    },
  });

  // Patrons.
  const jordan = await prisma.user.create({
    data: { name: "Jordan Lee", email: "jordan@example.com", passwordHash, role: "PATRON", onboardedAt: day(200) },
  });
  const priya = await prisma.user.create({
    data: { name: "Priya Shah", email: "priya@example.com", passwordHash, role: "PATRON", onboardedAt: day(200) },
  });
  for (const [patron, tier, started] of [
    [jordan, makerClub, day(90)],
    [priya, studioFriend, day(40)],
  ] as const) {
    await prisma.subscription.create({
      data: { patronId: patron.id, tierId: tier.id, status: "ACTIVE", createdAt: started },
    });
  }

  // Posts. Inline images are real media rows, referenced from the text by their address.
  const palettes: [string, string, string][] = [
    ["#f5d0a9", "#c2410c", "#7c2d12"],
    ["#bae6fd", "#0e7490", "#164e63"],
    ["#fde68a", "#b45309", "#78350f"],
    ["#e9d5ff", "#7e22ce", "#3b0764"],
    ["#d9f99d", "#4d7c0f", "#1a2e05"],
    ["#fecaca", "#b91c1c", "#450a0a"],
  ];

  async function post(input: {
    title: string;
    text: (ids: string[]) => string;
    images: number;
    gallery?: number;
    isPublic: boolean;
    tier?: { id: string };
    createdAt: Date;
  }) {
    const postId = randomUUID();
    const inlineIds = Array.from({ length: input.images }, () => randomUUID());
    const galleryIds = Array.from({ length: input.gallery ?? 0 }, () => randomUUID());
    const media = [];
    let position = 0;
    for (const id of [...inlineIds, ...galleryIds]) {
      const index = media.length;
      const stored = await storeImage(maya.id, palettes[(index + position) % palettes.length]);
      media.push({
        id,
        position: position++,
        inline: inlineIds.includes(id),
        kind: "IMAGE" as const,
        contentType: "image/jpeg",
        size: BigInt(stored.size),
        objectKey: stored.key,
      });
    }
    await prisma.post.create({
      data: {
        id: postId,
        creatorId: maya.id,
        title: input.title,
        textContent: input.text(inlineIds),
        isPublic: input.isPublic,
        minTierId: input.tier?.id ?? null,
        createdAt: input.createdAt,
        media: { create: media },
      },
    });
    return postId;
  }

  const firstPost = await post({
    title: "The blue that finally worked",
    createdAt: day(21),
    isPublic: true,
    images: 2,
    text: ([one, two]) =>
      [
        "After nineteen failed tests the copper-blue finally came out of the kiln the colour I wanted.",
        "## What changed",
        "- Cobalt dropped from 2% to 1.4%",
        "- Firing to cone 6 with a slower cool-down",
        "- The bowl sat on a wad of kaolin, not directly on the shelf",
        `![Test tile, cooled slowly](/api/media/${one})`,
        "The same glaze on a dry white stoneware body gave a deeper edge. On the grey body it went almost black.",
        `![The three tiles side by side](/api/media/${two})`,
        "> Thin layers, slow cooling. That was the whole secret.",
        "The recipe is in the Maker Club library if you want to try it.",
      ].join("\n\n"),
  });
  const secondPost = await post({
    title: "Kiln log: fourteen bowls in one firing",
    createdAt: day(12),
    isPublic: true,
    images: 0,
    gallery: 2,
    text: () =>
      "Loaded the kiln on Tuesday, fired Wednesday, unloaded Friday. Two bowls cracked on the rim, which I think is a drying problem rather than a firing one. Next batch I'm drying them under a bin for a day longer.",
  });
  await post({
    title: "Studio Friend: wedging a 5kg block by hand",
    createdAt: day(6),
    isPublic: false,
    tier: studioFriend,
    images: 1,
    text: ([one]) =>
      [
        "Short process video is below. Hand-wedging takes me about ten minutes and keeps the clay honest.",
        `![A block of clay on the wedging table](/api/media/${one})`,
        "Next week: trimming leather-hard bowls.",
      ].join("\n\n"),
  });
  await post({
    title: "Maker Club: my glaze chart, updated",
    createdAt: day(2),
    isPublic: false,
    tier: makerClub,
    images: 0,
    gallery: 1,
    text: () =>
      [
        "## This month's additions",
        "1. Honey matt (cone 6, oxidation)",
        "2. Sea salt speckle (cone 6, reduction)",
        "3. Ash green, now without the copper flash",
        "Full recipes, test tile photos and the firing schedule are in the chart below.",
      ].join("\n\n"),
  });

  // Likes and comments from patrons, so the feed looks lived in.
  await prisma.postLike.createMany({
    data: [
      { postId: firstPost, userId: jordan.id, createdAt: day(20) },
      { postId: firstPost, userId: priya.id, createdAt: day(20) },
      { postId: secondPost, userId: priya.id, createdAt: day(11) },
    ],
  });
  await prisma.comment.create({
    data: {
      postId: firstPost,
      authorId: jordan.id,
      body: "The grey-body tile is my favourite. Is that the same glaze with less cobalt?",
      createdAt: day(19),
    },
  });
  await prisma.comment.create({
    data: {
      postId: firstPost,
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
    for (const postId of [firstPost, secondPost]) {
      if (daysAgo <= 21) postViews.push({ postId, day: day(daysAgo, 0), views: Math.round(6 * wave) });
    }
  }
  await prisma.profileViewDay.createMany({ data: profileViews });
  await prisma.postViewDay.createMany({ data: postViews });

  console.log("Demo data created.");
  console.log(`Creator: maya@example.com (page /support is at /support, the home page is the creator page)`);
  console.log(`Patrons: jordan@example.com (Maker Club), priya@example.com (Studio Friend)`);
  console.log(`Password for every account: ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
