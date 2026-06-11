import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { putOpsR2Object } from "@/lib/ops/r2";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import { safeOpsFileName } from "@/lib/ops/upload-validation";

const MAX_CV_BYTES = 10 * 1024 * 1024;

const ALLOWED_CV_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(value: FormDataEntryValue | null, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: NextRequest) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  }

  // Honeypot: silently accept bot submissions without storing them.
  if (str(formData.get("website"), 200)) {
    return NextResponse.json({ ok: true });
  }

  const fullName = str(formData.get("full_name"), 160);
  const email = str(formData.get("email"), 200);
  const phone = str(formData.get("phone"), 60);
  const coverLetter = str(formData.get("cover_letter"), 5000);
  const linkedinUrl = str(formData.get("linkedin_url"), 300);
  const jobPostingIdRaw = str(formData.get("job_posting_id"), 60);

  if (fullName.length < 2 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { error: "Please provide your full name and a valid email address." },
      { status: 400 },
    );
  }

  const supabase = getOpsSupabaseServiceClient();

  // Only accept a posting id that is a real, published posting; otherwise treat
  // it as a general application.
  let jobPostingId: string | null = null;

  if (jobPostingIdRaw && UUID_PATTERN.test(jobPostingIdRaw)) {
    const { data: posting } = await supabase
      .from("job_postings")
      .select("id")
      .eq("id", jobPostingIdRaw)
      .eq("is_published", true)
      .maybeSingle<{ id: string }>();

    jobPostingId = posting?.id ?? null;
  }

  // Optional CV upload.
  let cvR2Key: string | null = null;
  const cv = formData.get("cv");

  if (cv instanceof File && cv.size > 0) {
    if (cv.size > MAX_CV_BYTES) {
      return NextResponse.json({ error: "Your CV must be 10 MB or smaller." }, { status: 400 });
    }

    if (!ALLOWED_CV_TYPES.has(cv.type)) {
      return NextResponse.json(
        { error: "Upload your CV as a PDF or Word document." },
        { status: 400 },
      );
    }

    try {
      const bytes = new Uint8Array(await cv.arrayBuffer());
      const safeName = safeOpsFileName(cv.name || "cv");
      cvR2Key = `careers/applications/${crypto.randomUUID()}-${safeName}`;
      await putOpsR2Object({ body: bytes, contentType: cv.type, key: cvR2Key });
    } catch {
      return NextResponse.json(
        { error: "We could not upload your CV. Please try again." },
        { status: 500 },
      );
    }
  }

  const { data: insertedApplication, error } = await supabase
    .from("job_applications")
    .insert({
      cover_letter: coverLetter,
      cv_r2_key: cvR2Key,
      email,
      full_name: fullName,
      job_posting_id: jobPostingId,
      linkedin_url: linkedinUrl,
      phone,
      source: "website",
      status: "new",
    })
    .select("id, application_number")
    .single<{ id: string; application_number: string }>();

  if (error || !insertedApplication) {
    return NextResponse.json(
      { error: "We could not submit your application right now. Please try again." },
      { status: 500 },
    );
  }

  // Fan out a notification to HR and leadership so they see new applications in
  // their queue immediately. Failures here must never reject the candidate.
  try {
    const { data: hrUsers } = await supabase
      .from("users")
      .select("id")
      .in("role", [
        "developer",
        "managing_director",
        "general_manager",
        "human_resource",
        "hr",
        "owner",
        "manager",
      ])
      .eq("is_active", true);

    const body = `${fullName} applied for ${jobPostingId ? "an open role" : "a general position"}. Open the application to review and progress them through your hiring stages.`;
    await Promise.all(
      ((hrUsers ?? []) as Array<{ id: string }>).map((user) =>
        queueOpsNotification({
          actionHref: "/ops/recruitment#applications",
          body,
          idempotencyKey: `job_application.created:${insertedApplication.id}:${user.id}`,
          moduleKey: "recruitment",
          recipientId: user.id,
          sourceId: insertedApplication.id,
          sourceTable: "job_applications",
          title: `New application: ${insertedApplication.application_number}`,
        }).catch(() => null),
      ),
    );
  } catch {
    // ignore — application is already saved
  }

  return NextResponse.json({ ok: true });
}
