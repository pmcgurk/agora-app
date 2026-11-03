import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { generateInternalReadUrl, getObjectBuffer, uploadObject } from "@/lib/s3";

const run = promisify(execFile);

// The original is shrunk to a few pixels first, so the detail is destroyed before the blur;
// the blur then only smooths the upscale. The result cannot be sharpened back into the photo.
export async function createBlurredImage(sourceKey: string, targetKey: string): Promise<void> {
  const original = await getObjectBuffer(sourceKey);
  const tiny = await sharp(original, { limitInputPixels: 100_000_000 })
    .rotate()
    .resize(20, 20, { fit: "inside" })
    .toBuffer();
  const blurred = await sharp(tiny)
    .resize(480, 480, { fit: "inside", kernel: "cubic" })
    .blur(6)
    .webp({ quality: 60 })
    .toBuffer();
  await uploadObject(targetKey, blurred, "image/webp");
}

// Cuts the first N seconds into a separate object. Viewers without access only ever receive
// this clip, never a URL to the original file. ffmpeg reads the source straight from MinIO.
export async function createVideoPreview(
  sourceKey: string,
  targetKey: string,
  seconds: number,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "agora-preview-"));
  const output = join(directory, "preview.mp4");
  try {
    const sourceUrl = await generateInternalReadUrl(sourceKey);
    await run(
      process.env.FFMPEG_PATH ?? "ffmpeg",
      [
        "-nostdin", "-y",
        "-i", sourceUrl,
        "-t", String(seconds),
        "-map", "0:v:0", "-map", "0:a:0?",
        "-map_metadata", "-1",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
        "-vf", "scale=-2:'min(720,ih)'",
        "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart",
        output,
      ],
      { timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 },
    );
    await uploadObject(targetKey, await readFile(output), "video/mp4");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// Poster frame for a video. Tries one second in (to skip black intro frames), then the first frame.
export async function createVideoThumbnail(sourceKey: string, targetKey: string): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "agora-thumb-"));
  const output = join(directory, "thumb.jpg");
  try {
    const sourceUrl = await generateInternalReadUrl(sourceKey);
    for (const start of ["1", "0"]) {
      await run(
        process.env.FFMPEG_PATH ?? "ffmpeg",
        ["-nostdin", "-y", "-ss", start, "-i", sourceUrl, "-frames:v", "1",
          "-vf", "scale='min(960,iw)':-2", "-q:v", "4", output],
        { timeout: 2 * 60 * 1000 },
      ).catch(() => undefined);
      const data = await readFile(output).catch(() => null);
      if (data && data.length > 0) {
        await uploadObject(targetKey, data, "image/jpeg");
        return;
      }
    }
    throw new Error("ffmpeg could not extract a frame.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
