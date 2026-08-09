import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireServerEnv } from "@/lib/ops/env";

let r2Client: S3Client | null = null;
const OPS_R2_READ_URL_EXPIRES_SECONDS = 60 * 10;
/**
 * Short by design: the URL is minted the instant the user picks a file and is
 * used immediately by the same browser. A long window would leave a bearer
 * credential for a writable object key sitting in the page.
 */
const OPS_R2_UPLOAD_URL_EXPIRES_SECONDS = 60 * 5;

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

/**
 * Presigned PUT so the browser writes the bytes straight to R2.
 *
 * The alternative — posting the file to a Server Action — cannot work for real
 * site evidence: Next caps Server Action bodies at 1 MB by default and Vercel
 * caps a serverless request body at 4.5 MB regardless of that setting, so every
 * phone photo and scanned drawing died with a 413 *before* any of our code ran,
 * surfacing to the user as "An unexpected response was received from the
 * server". Signing the PUT keeps the 25 MB limit the UI has always advertised.
 *
 * `ContentType` is part of the signature: the browser must send exactly the
 * type we validated, so the stored object cannot be something other than what
 * the allowlist approved.
 *
 * NOTE: the R2 bucket needs a CORS rule allowing PUT from the ops origin, or
 * the browser blocks this request before it leaves the page.
 */
export async function createOpsR2UploadUrl({
  contentType,
  key,
}: {
  contentType: string;
  key: string;
}) {
  return getSignedUrl(
    getOpsR2Client(),
    new PutObjectCommand({
      Bucket: getOpsR2BucketName(),
      ContentType: contentType,
      Key: key,
    }),
    { expiresIn: OPS_R2_UPLOAD_URL_EXPIRES_SECONDS },
  );
}

/**
 * What actually landed in the bucket. A presigned PUT cannot enforce a maximum
 * size (only a POST policy can), so the size the client claimed is not
 * evidence — this is how the recording action checks the real object before it
 * writes a row pointing at it.
 */
export async function headOpsR2Object(key: string) {
  try {
    const result = await getOpsR2Client().send(
      new HeadObjectCommand({
        Bucket: getOpsR2BucketName(),
        Key: key,
      }),
    );

    return {
      contentLength: result.ContentLength ?? 0,
      contentType: result.ContentType ?? "",
    };
  } catch {
    return null;
  }
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
