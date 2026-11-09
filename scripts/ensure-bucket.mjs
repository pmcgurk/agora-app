// Creates the private media bucket if it does not exist. Runs on every container start.
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const { MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, MINIO_REGION } = process.env;

if (!MINIO_ENDPOINT || !MINIO_BUCKET || !MINIO_ROOT_USER || !MINIO_ROOT_PASSWORD) {
  console.error("MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ROOT_USER and MINIO_ROOT_PASSWORD are required.");
  process.exit(1);
}

const client = new S3Client({
  region: MINIO_REGION ?? "us-east-1",
  endpoint: MINIO_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: MINIO_ROOT_USER, secretAccessKey: MINIO_ROOT_PASSWORD },
});

const ATTEMPTS = 30;

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  try {
    try {
      await client.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }));
      console.log(`Bucket "${MINIO_BUCKET}" already exists.`);
    } catch (error) {
      const status = error?.$metadata?.httpStatusCode;
      // Hosted storage often gives the app a key that can read and write one bucket but not inspect or
      // create buckets. A 403 means the bucket is there and managed elsewhere, so carry on.
      if (status === 403) {
        console.log(`Cannot inspect bucket "${MINIO_BUCKET}" (access denied). Assuming it exists.`);
        process.exit(0);
      }
      if (status !== 404) throw error;
      await client.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }));
      console.log(`Created bucket "${MINIO_BUCKET}".`);
    }
    process.exit(0);
  } catch (error) {
    console.log(`Waiting for MinIO (${attempt}/${ATTEMPTS}): ${error?.name ?? error}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

console.error("MinIO did not become ready; giving up.");
process.exit(1);
