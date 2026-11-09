import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be configured to use MinIO.`);
  }
  return value;
}

function createClient(endpoint: string): S3Client {
  return new S3Client({
    region: process.env.MINIO_REGION ?? "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnvironmentVariable("MINIO_ROOT_USER"),
      secretAccessKey: requiredEnvironmentVariable("MINIO_ROOT_PASSWORD"),
    },
  });
}

// Server-to-MinIO traffic uses the internal endpoint; presigned URLs must be signed for the
// endpoint the browser can reach, because the host is part of the signature.
const internalEndpoint = () => process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
const publicEndpoint = () => process.env.MINIO_PUBLIC_ENDPOINT ?? internalEndpoint();

let internalClient: S3Client | undefined;
let publicClient: S3Client | undefined;

function bucketName(): string {
  return requiredEnvironmentVariable("MINIO_BUCKET");
}

export async function uploadObject(
  objectKey: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  internalClient ??= createClient(internalEndpoint());
  await internalClient.send(
    new PutObjectCommand({ Bucket: bucketName(), Key: objectKey, Body: body, ContentType: contentType }),
  );
}

// True when the object already exists, so a re-seed can skip uploading it again.
export async function objectExists(objectKey: string): Promise<boolean> {
  internalClient ??= createClient(internalEndpoint());
  try {
    await internalClient.send(new HeadObjectCommand({ Bucket: bucketName(), Key: objectKey }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(objectKey: string): Promise<void> {
  internalClient ??= createClient(internalEndpoint());
  await internalClient.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: objectKey }));
}

export async function generatePresignedUrl(
  objectKey: string,
  expiresInSeconds = 300,
): Promise<string> {
  if (!objectKey.trim()) {
    throw new Error("A media object key is required to generate a presigned URL.");
  }

  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 604800) {
    throw new RangeError("Presigned URL expiration must be an integer between 1 and 604800 seconds.");
  }

  publicClient ??= createClient(publicEndpoint());
  return getSignedUrl(
    publicClient,
    new GetObjectCommand({ Bucket: bucketName(), Key: objectKey }),
    { expiresIn: expiresInSeconds },
  );
}

// Browsers upload straight to MinIO with this URL, so large videos never pass through the app.
export async function generatePresignedUploadUrl(
  objectKey: string,
  contentType: string,
  expiresInSeconds = 3600,
): Promise<string> {
  publicClient ??= createClient(publicEndpoint());
  return getSignedUrl(
    publicClient,
    new PutObjectCommand({ Bucket: bucketName(), Key: objectKey, ContentType: contentType }),
    { expiresIn: expiresInSeconds },
  );
}

// Signed for the internal endpoint: only for server-side tools (ffmpeg) that read from MinIO.
export async function generateInternalReadUrl(objectKey: string, expiresInSeconds = 600): Promise<string> {
  internalClient ??= createClient(internalEndpoint());
  return getSignedUrl(
    internalClient,
    new GetObjectCommand({ Bucket: bucketName(), Key: objectKey }),
    { expiresIn: expiresInSeconds },
  );
}

export async function headObject(
  objectKey: string,
): Promise<{ size: number; contentType: string | undefined } | null> {
  internalClient ??= createClient(internalEndpoint());
  try {
    const result = await internalClient.send(new HeadObjectCommand({ Bucket: bucketName(), Key: objectKey }));
    return { size: result.ContentLength ?? 0, contentType: result.ContentType };
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

export async function getObjectBuffer(objectKey: string): Promise<Buffer> {
  internalClient ??= createClient(internalEndpoint());
  const result = await internalClient.send(new GetObjectCommand({ Bucket: bucketName(), Key: objectKey }));
  if (!result.Body) throw new Error("Object has no body.");
  return Buffer.from(await result.Body.transformToByteArray());
}

export type StreamedObject = {
  body: ReadableStream<Uint8Array>;
  status: 200 | 206;
  headers: Record<string, string>;
};

// Used for video and audio: the app authorizes every request and pipes the bytes (with HTTP Range
// support for seeking), so no reusable storage URL is ever sent to the browser.
export async function streamObject(
  objectKey: string,
  range: string | null,
  signal?: AbortSignal,
): Promise<StreamedObject | "unsatisfiable" | null> {
  internalClient ??= createClient(internalEndpoint());
  try {
    const result = await internalClient.send(
      new GetObjectCommand({ Bucket: bucketName(), Key: objectKey, Range: range ?? undefined }),
      { abortSignal: signal },
    );
    if (!result.Body) return null;
    const headers: Record<string, string> = { "Accept-Ranges": "bytes" };
    if (result.ContentType) headers["Content-Type"] = result.ContentType;
    if (result.ContentLength !== undefined) headers["Content-Length"] = String(result.ContentLength);
    if (result.ContentRange) headers["Content-Range"] = result.ContentRange;
    return {
      body: result.Body.transformToWebStream() as ReadableStream<Uint8Array>,
      status: result.ContentRange ? 206 : 200,
      headers,
    };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 416) return "unsatisfiable";
    if (status === 404) return null;
    throw error;
  }
}
