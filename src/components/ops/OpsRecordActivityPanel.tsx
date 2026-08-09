"use client";

import { useState } from "react";
import { ChevronDown, Download, Loader2, MessageSquare, Paperclip, Upload } from "lucide-react";
import {
  OpsDirectUploadField,
  type OpsUploadedFile,
} from "@/components/ops/OpsDirectUploadField";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  addOpsRecordCommentAction,
  uploadOpsRecordAttachmentAction,
} from "@/lib/ops/record-activity-actions";
import {
  OPS_DOCUMENT_VISIBILITY_LABELS,
  OPS_DOCUMENT_VISIBILITY_ORDER,
} from "@/lib/ops/document-permissions";
import {
  OPS_RECORD_ACTIVITY_SOURCE_LABELS,
  OPS_RECORD_ATTACHMENT_DEFAULT_VISIBILITY,
  type OpsRecordActivitySourceTable,
} from "@/lib/ops/record-activity";
import { formatOpsRole, formatOpsUserName } from "@/lib/ops/roles";
import {
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
} from "@/lib/ops/ui";
import type { OpsRecordComment } from "@/lib/ops/comments";
import type { OpsDocumentVersionSummary, OpsLinkedDocument } from "@/lib/ops/documents";
import { formatOpsDateTime as formatDateTime } from "@/lib/ops/format";

type OpsRecordActivityPanelProps = {
  canManage: boolean;
  sourceId: string;
  sourceTable: OpsRecordActivitySourceTable;
};

type ActivityState = {
  comments: OpsRecordComment[];
  documents: OpsLinkedDocument[];
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

function currentVersion(document: OpsLinkedDocument): OpsDocumentVersionSummary | undefined {
  return (
    document.versions.find(
      (version) => version.version_number === document.current_version_number,
    ) ?? document.versions[0]
  );
}

export function OpsRecordActivityPanel({
  canManage,
  sourceId,
  sourceTable,
}: OpsRecordActivityPanelProps) {
  const [activity, setActivity] = useState<ActivityState | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // The file is already in R2 by the time the form is submitted, so the submit
  // is gated on the upload having finished rather than on a file being picked.
  const [uploadedFile, setUploadedFile] = useState<OpsUploadedFile | null>(null);
  const totalItems = activity ? activity.comments.length + activity.documents.length : null;

  async function loadActivity() {
    if (activity || isLoading) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/ops/record-activity?source_table=${encodeURIComponent(
          sourceTable,
        )}&source_id=${encodeURIComponent(sourceId)}`,
      );

      if (!response.ok) {
        throw new Error("Could not load activity.");
      }

      const data = (await response.json()) as ActivityState;
      setActivity({
        comments: data.comments ?? [],
        documents: data.documents ?? [],
      });
    } catch {
      setError("Could not load activity. Refresh and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <details
      className="group border-t border-border bg-card px-5 py-4"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          void loadActivity();
        }
      }}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground transition hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/10">
            <Paperclip className="size-4" aria-hidden="true" />
          </span>
          Attachments and comments
        </span>
        <span className="inline-flex items-center gap-2">
          <Badge className="h-auto px-2.5 py-1 text-xs font-semibold" variant="outline">
            {totalItems ?? "Open"}
          </Badge>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground/60 transition group-open:rotate-180"
            aria-hidden="true"
          />
        </span>
      </summary>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <section className="min-w-0">
          <div className="flex items-center gap-2">
            <Paperclip className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-heading text-base font-semibold text-foreground">
              Linked documents
            </h3>
          </div>

          {isLoading ? (
            <div className="mt-3 flex min-h-24 items-center gap-2 rounded-md border border-border px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
              <div className="grid flex-1 gap-2">
                <span>Loading activity</span>
                <Skeleton className="h-3 w-full max-w-xs" />
              </div>
            </div>
          ) : null}

          {error ? (
            <Alert className="mt-3 border-destructive/25 bg-destructive/10 text-sm font-semibold text-destructive">
              {error}
            </Alert>
          ) : null}

          {activity && activity.documents.length > 0 ? (
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {activity.documents.map((document) => {
                const version = currentVersion(document);

                return (
                  <li className="py-3" key={document.link_id}>
                    <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-foreground">{document.title}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {document.category} / v{document.current_version_number}
                        </p>
                        {version ? (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {version.file_name} / {formatBytes(version.file_size_bytes)}
                          </p>
                        ) : null}
                      </div>
                      {version ? (
                        <a
                          className={`${OPS_SECONDARY_BUTTON_CLASS} shrink-0`}
                          href={`/api/ops/documents/${version.id}/download`}
                        >
                          <Download className="size-4" aria-hidden="true" />
                          Download
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {activity && activity.documents.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              No attachments linked to this {OPS_RECORD_ACTIVITY_SOURCE_LABELS[sourceTable]} yet.
            </p>
          ) : null}

          {canManage ? (
            <form action={uploadOpsRecordAttachmentAction} className="mt-4 grid gap-3">
              <input name="source_id" type="hidden" value={sourceId} />
              <input name="source_table" type="hidden" value={sourceTable} />
              <Label className={`${OPS_LABEL_CLASS} grid gap-1.5`}>
                <span>Attachment title</span>
                <Input className="min-h-11" name="title" />
              </Label>
              <div className="grid gap-3 min-[520px]:grid-cols-2">
                <Label className={`${OPS_LABEL_CLASS} grid gap-1.5`}>
                  <span>Visibility</span>
                  {/* These must be the members of `ops_document_visibility`.
                      The old Restricted/Company/Private list matched nothing in
                      the database, so every upload was rejected by Postgres. */}
                  <select
                    className={OPS_INPUT_CLASS}
                    defaultValue={OPS_RECORD_ATTACHMENT_DEFAULT_VISIBILITY[sourceTable]}
                    name="visibility"
                  >
                    {OPS_DOCUMENT_VISIBILITY_ORDER.map((tier) => (
                      <option key={tier} value={tier}>
                        {OPS_DOCUMENT_VISIBILITY_LABELS[tier]}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label className={`${OPS_LABEL_CLASS} grid gap-1.5`}>
                  <span>File</span>
                  <OpsDirectUploadField
                    onUploadedChange={(files) => setUploadedFile(files[0] ?? null)}
                    scope="record_attachment"
                  />
                </Label>
              </div>
              <OpsSubmitButton
                className={OPS_PRIMARY_BUTTON_CLASS}
                disabled={!uploadedFile}
                pendingLabel="Linking attachment..."
              >
                <Upload className="size-4" aria-hidden="true" />
                {uploadedFile ? "Attach uploaded file" : "Choose a file first"}
              </OpsSubmitButton>
            </form>
          ) : null}
        </section>

        <section className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-heading text-base font-semibold text-foreground">
              Internal comments
            </h3>
          </div>

          {activity && activity.comments.length > 0 ? (
            <ol className="mt-3 divide-y divide-border border-y border-border">
              {activity.comments.map((comment) => (
                <li className="py-3" key={comment.id}>
                  <div className="flex flex-col gap-1 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
                    <p className="font-bold text-foreground">
                      {formatOpsUserName(comment.author?.full_name, comment.author_id)}
                    </p>
                    <time className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {formatDateTime(comment.created_at)}
                    </time>
                  </div>
                  {comment.author ? (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {formatOpsRole(comment.author.role)}
                    </p>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/80">
                    {comment.body}
                  </p>
                </li>
              ))}
            </ol>
          ) : null}

          {activity && activity.comments.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              No internal comments yet.
            </p>
          ) : null}

          {canManage ? (
            <form action={addOpsRecordCommentAction} className="mt-4 grid gap-3">
              <input name="source_id" type="hidden" value={sourceId} />
              <input name="source_table" type="hidden" value={sourceTable} />
              <Label className={`${OPS_LABEL_CLASS} grid gap-1.5`}>
                <span>Add comment</span>
                <Textarea
                  className="min-h-28 resize-y"
                  name="body"
                  required
                />
              </Label>
              <OpsSubmitButton
                className={OPS_SECONDARY_BUTTON_CLASS}
                pendingLabel="Adding comment..."
              >
                <MessageSquare className="size-4" aria-hidden="true" />
                Add comment
              </OpsSubmitButton>
            </form>
          ) : null}
        </section>
      </div>
    </details>
  );
}
