"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  OPS_MAX_UPLOAD_BYTES,
  validateOpsUploadDescriptor,
  type OpsUploadScope,
} from "@/lib/ops/upload-validation";

const MAX_UPLOAD_MB = Math.floor(OPS_MAX_UPLOAD_BYTES / (1024 * 1024));

const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp";

export type OpsUploadedFile = {
  contentType: string;
  fileName: string;
  key: string;
  size: number;
};

type OpsDirectUploadFieldProps = {
  multiple?: boolean;
  /** Told when the set of finished uploads changes, so the form can gate its submit. */
  onUploadedChange?: (uploaded: OpsUploadedFile[]) => void;
  scope: OpsUploadScope;
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

/**
 * Sends the bytes to R2 itself, then hands the enclosing form nothing but keys.
 *
 * The file input is deliberately unnamed, so the file never becomes part of the
 * Server Action body — that was the whole bug. A Server Action post is capped at
 * 1 MB by Next (and 4.5 MB by Vercel whatever we configure), so any real site
 * photo or scanned drawing was rejected at the platform edge with a 413 and the
 * user saw a bare "An unexpected response was received from the server". Here
 * the action only ever carries a handful of small text fields.
 *
 * Uploading on selection rather than on submit is what makes the progress bar
 * possible, and means an oversized or wrong-typed file is refused with a
 * readable sentence the moment it is picked.
 */
export function OpsDirectUploadField({
  multiple = false,
  onUploadedChange,
  scope,
}: OpsDirectUploadFieldProps) {
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploaded, setUploaded] = useState<OpsUploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function publish(next: OpsUploadedFile[]) {
    setUploaded(next);
    onUploadedChange?.(next);
  }

  function clearInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);

    if (files.length === 0) {
      setError("");
      publish([]);
      return;
    }

    for (const file of files) {
      const validation = validateOpsUploadDescriptor(
        { contentType: file.type, size: file.size },
        {
          empty: `"${file.name}" is empty.`,
          tooLarge: `Files must be ${MAX_UPLOAD_MB} MB or smaller. "${file.name}" is ${formatBytes(file.size)}.`,
          unsupportedType: "Upload a PDF, Word, Excel, CSV, text, JPEG, PNG, or WebP file.",
        },
      );

      if (!validation.ok) {
        setError(validation.message);
        publish([]);
        clearInput();
        return;
      }
    }

    setError("");
    publish([]);
    setIsUploading(true);
    setProgress(0);

    const finished: OpsUploadedFile[] = [];

    try {
      for (const [index, file] of files.entries()) {
        const presignResponse = await fetch("/api/ops/uploads/presign", {
          body: JSON.stringify({
            content_type: file.type,
            file_name: file.name,
            scope,
            size: file.size,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        const presigned = (await presignResponse.json().catch(() => null)) as {
          error?: string;
          key?: string;
          url?: string;
        } | null;

        if (!presignResponse.ok || !presigned?.key || !presigned.url) {
          throw new Error(presigned?.error ?? "Could not start the upload.");
        }

        await putWithProgress(presigned.url, file, (percent) => {
          // One bar for the whole batch, so five drawings read as one job.
          setProgress(Math.round(((index + percent / 100) / files.length) * 100));
        });

        finished.push({
          contentType: file.type,
          fileName: file.name,
          key: presigned.key,
          size: file.size,
        });
      }

      publish(finished);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error && uploadError.message
          ? uploadError.message
          : "The upload failed. Check your connection and try again.",
      );
      publish([]);
      clearInput();
    } finally {
      setIsUploading(false);
    }
  }

  const summary =
    uploaded.length === 1
      ? uploaded[0].fileName
      : `${uploaded.length} files ready to attach`;

  return (
    <span className="mt-1 block rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center transition hover:border-primary hover:bg-primary/[0.03]">
      <span className="mx-auto flex size-10 items-center justify-center rounded-md bg-card text-primary shadow-sm ring-1 ring-border">
        {isUploading ? (
          <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : uploaded.length > 0 ? (
          <CheckCircle2 className="size-5" aria-hidden="true" />
        ) : (
          <Upload className="size-5" aria-hidden="true" />
        )}
      </span>
      <span className="mt-2 block text-sm font-semibold text-foreground">
        {uploaded.length > 0 ? summary : isUploading ? "Uploading..." : "Click to upload"}
      </span>
      <span className="mt-1 block text-xs font-medium text-muted-foreground">
        PDF, Office, CSV, text, or image evidence — up to {MAX_UPLOAD_MB} MB each
      </span>

      <Input
        accept={ACCEPT}
        className="mt-3 min-h-11 cursor-pointer text-xs font-medium file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground"
        disabled={isUploading}
        multiple={multiple}
        onChange={(event) => void handleFiles(event.currentTarget.files)}
        ref={inputRef}
        type="file"
      />

      {isUploading ? (
        <span className="mt-3 block h-1.5 w-full overflow-hidden rounded-full bg-border">
          <span
            className="block h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </span>
      ) : null}

      {uploaded.length > 0 && !isUploading ? (
        <span className="mt-2 block text-xs font-semibold text-muted-foreground">
          {formatBytes(uploaded.reduce((total, file) => total + file.size, 0))} uploaded
        </span>
      ) : null}

      {error ? (
        <span className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-destructive">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </span>
      ) : null}

      {uploaded.map((file) => (
        <span key={file.key}>
          <input name="r2_key" type="hidden" value={file.key} />
          <input name="file_name" type="hidden" value={file.fileName} />
        </span>
      ))}
    </span>
  );
}

/**
 * XHR rather than fetch purely for `upload.onprogress` — a 25 MB drawing over a
 * Zambian mobile connection is a long silence otherwise, and a silent form is
 * one users click twice.
 */
function putWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("PUT", url);
    // Must match the Content-Type baked into the signature, or R2 rejects it.
    request.setRequestHeader("Content-Type", file.type);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }

      reject(new Error("The storage service rejected the upload."));
    };

    request.onerror = () =>
      reject(new Error("The upload could not reach storage. Check your connection."));
    request.onabort = () => reject(new Error("The upload was cancelled."));

    request.send(file);
  });
}
