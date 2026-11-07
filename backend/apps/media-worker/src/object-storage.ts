import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface WorkerStorageConfig {
  STORAGE_PROVIDER?: "minio" | "cloudflare_r2";
  STORAGE_ENDPOINT?: string;
  STORAGE_BUCKET_NAME?: string;
  STORAGE_ACCESS_KEY_ID?: string;
  STORAGE_SECRET_ACCESS_KEY?: string;
}

interface StorageContext {
  client: S3Client;
  bucketName: string;
}

export function createStorageContext(config: WorkerStorageConfig): StorageContext {
  const accessKeyId = config.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = config.STORAGE_SECRET_ACCESS_KEY;
  if (!config.STORAGE_ENDPOINT || !config.STORAGE_BUCKET_NAME || !accessKeyId || !secretAccessKey) {
    throw new Error("Worker storage configuration is incomplete");
  }

  return {
    bucketName: config.STORAGE_BUCKET_NAME,
    client: new S3Client({
      endpoint: config.STORAGE_ENDPOINT,
      region: "auto",
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: (config.STORAGE_PROVIDER ?? "minio") === "minio",
    }),
  };
}

export async function downloadObjectToFile(
  context: StorageContext,
  objectKey: string,
  destinationPath: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  const response = await context.client.send(
    new GetObjectCommand({ Bucket: context.bucketName, Key: objectKey }),
  );
  if (!response.Body) {
    throw new Error(`Storage object has no body: ${objectKey}`);
  }

  await pipeline(response.Body as AsyncIterable<Uint8Array>, fs.createWriteStream(destinationPath));
}

function contentTypeForPath(filePath: string): string {
  if (filePath.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (filePath.endsWith(".ts")) return "video/mp2t";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export async function uploadFile(
  context: StorageContext,
  filePath: string,
  objectKey: string,
): Promise<void> {
  await context.client.send(
    new PutObjectCommand({
      Bucket: context.bucketName,
      Key: objectKey,
      Body: fs.createReadStream(filePath),
      ContentLength: fs.statSync(filePath).size,
      ContentType: contentTypeForPath(filePath),
    }),
  );
}

export async function uploadDirectory(
  context: StorageContext,
  directoryPath: string,
  objectPrefix: string,
): Promise<void> {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const localPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await uploadDirectory(context, localPath, `${objectPrefix}/${entry.name}`);
    } else {
      await uploadFile(context, localPath, `${objectPrefix}/${entry.name}`);
    }
  }
}
