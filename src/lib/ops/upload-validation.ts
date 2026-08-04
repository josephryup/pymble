export const OPS_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const OPS_ALLOWED_UPLOAD_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type OpsUploadValidationMessages = {
  empty: string;
  tooLarge: string;
  unsupportedType: string;
};

export type OpsUploadValidationResult =
  | {
      file: File;
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

/**
 * Does the file's leading bytes actually match a PDF or Word document?
 *
 * `File.type` comes from the browser's multipart Content-Type header, which is
 * entirely client-supplied — a caller can label a script `application/pdf` and
 * the MIME allowlist waves it through. That mattered less while uploads were
 * authenticated, but `careers/apply` accepts files from the public internet and
 * writes them to R2 (audit finding S4).
 *
 * This is a signature check, not virus scanning: it confirms the bytes are the
 * container they claim to be, which is what stops the allowlist from being
 * purely decorative. It does not attempt to validate the document's contents.
 */
export function opsLooksLikeDocument(bytes: Uint8Array) {
  const startsWith = (...signature: number[]) =>
    signature.length <= bytes.length &&
    signature.every((byte, index) => bytes[index] === byte);

  return (
    // "%PDF"
    startsWith(0x25, 0x50, 0x44, 0x46) ||
    // OLE2 compound file — legacy .doc
    startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1) ||
    // ZIP container — .docx (and the empty/spanned archive variants)
    startsWith(0x50, 0x4b, 0x03, 0x04) ||
    startsWith(0x50, 0x4b, 0x05, 0x06) ||
    startsWith(0x50, 0x4b, 0x07, 0x08)
  );
}

export function safeOpsFileName(name: string) {
  const fileName = name.split(/[\\/]/).pop() ?? "";

  const safeName = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/-\./g, ".")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 96);

  return safeName || "file";
}

export function validateOpsUploadFile(
  value: FormDataEntryValue | null,
  messages: OpsUploadValidationMessages,
): OpsUploadValidationResult {
  if (!(value instanceof File) || value.size === 0) {
    return {
      message: messages.empty,
      ok: false,
    };
  }

  if (value.size > OPS_MAX_UPLOAD_BYTES) {
    return {
      message: messages.tooLarge,
      ok: false,
    };
  }

  if (!OPS_ALLOWED_UPLOAD_TYPES.has(value.type)) {
    return {
      message: messages.unsupportedType,
      ok: false,
    };
  }

  return {
    file: value,
    ok: true,
  };
}
