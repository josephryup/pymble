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
