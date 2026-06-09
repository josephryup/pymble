import { MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatOpsRole, formatOpsUserName } from "@/lib/ops/roles";
import type { OpsRecordComment } from "@/lib/ops/comments";

function formatCommentTime(value: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function OpsCommentTimeline({ comments }: { comments: OpsRecordComment[] }) {
  if (comments.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-40 flex-col items-center justify-center gap-3 p-6 text-center">
          <MessageSquare className="size-8 text-primary" aria-hidden="true" />
          <div>
            <p className="font-heading text-lg font-bold text-foreground">No comments yet</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Comments and decision notes will appear here once this record has discussion history.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <ol className="space-y-3" aria-label="Record comments">
      {comments.map((comment) => (
        <li key={comment.id}>
          <Card className="py-0">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <MessageSquare className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
                  <p className="font-bold text-foreground">
                    {formatOpsUserName(comment.author?.full_name, comment.author_id)}
                  </p>
                  <time className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {formatCommentTime(comment.created_at)}
                  </time>
                </div>
                {comment.author ? (
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {formatOpsRole(comment.author.role)}
                  </p>
                ) : null}
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/70">
                  {comment.body}
                </p>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}
