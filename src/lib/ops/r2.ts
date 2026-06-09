import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireServerEnv } from "@/lib/ops/env";

let r2Client: S3Client | null = null;
const OPS_R2_READ_URL_EXPIRES_SECONDS = 60 * 10;

export function getOpsR2BucketName() {
  return requireServerEnv("R2_BUCKET_NAME");
}

export function getOpsR2Client() {
  if (!r2Client) {
    const accountId = requireServerEnv("CF_ACCOUNT_ID");

    r2Client = new S3Client({
      credentials: {
        accessKeyId: requireServerEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireServerEnv("R2_SECRET_ACCESS_KEY"),
      },
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      region: "auto",
    });
  }

  return r2Client;
}

export async function putOpsR2Object({
  body,
  contentType,
  key,
}: {
  body: Uint8Array;
  contentType: string;
  key: string;
}) {
  await getOpsR2Client().send(
    new PutObjectCommand({
      Body: body,
      Bucket: getOpsR2BucketName(),
      ContentType: contentType,
      Key: key,
    }),
  );
}

export async function createOpsR2ReadUrl(key: string) {
  return getSignedUrl(
    getOpsR2Client(),
    new GetObjectCommand({
      Bucket: getOpsR2BucketName(),
      Key: key,
    }),
    { expiresIn: OPS_R2_READ_URL_EXPIRES_SECONDS },
  );
}

export async function deleteOpsR2Object(key: string) {
  await getOpsR2Client().send(
    new DeleteObjectCommand({
      Bucket: getOpsR2BucketName(),
      Key: key,
    }),
  );
}
