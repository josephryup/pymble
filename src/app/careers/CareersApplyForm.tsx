"use client";

import { useRef, useState } from "react";

type PostingOption = {
  id: string;
  title: string;
};

type CareersApplyFormProps = {
  postings: PostingOption[];
};

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-primary-dark/15 bg-white px-3 py-2.5 text-sm text-primary-dark shadow-sm transition focus:border-primary-blue focus:outline-none focus:ring-2 focus:ring-primary-blue/30";
const LABEL_CLASS = "block text-sm font-semibold text-primary-dark";

export function CareersApplyForm({ postings }: CareersApplyFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage(null);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/careers/apply", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; ok?: boolean }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "We could not submit your application. Please try again.");
      }

      setStatus("success");
      setMessage("Thank you — your application has been received. We will be in touch.");
      formRef.current?.reset();
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "We could not submit your application. Please try again.",
      );
    }
  }

  if (status === "success") {
    return (
      <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-6 text-emerald-800">
        <p className="font-semibold">{message}</p>
        <button
          className="mt-4 text-sm font-semibold text-emerald-700 underline"
          onClick={() => {
            setStatus("idle");
            setMessage(null);
          }}
          type="button"
        >
          Submit another application
        </button>
      </div>
    );
  }

  return (
    <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit} ref={formRef}>
      {/* Honeypot: bots fill this, humans never see it */}
      <input
        aria-hidden="true"
        autoComplete="off"
        className="hidden"
        name="website"
        tabIndex={-1}
        type="text"
      />

      <label className={`${LABEL_CLASS} sm:col-span-2`}>
        Position
        <select className={INPUT_CLASS} defaultValue="" name="job_posting_id">
          <option value="">General application</option>
          {postings.map((posting) => (
            <option key={posting.id} value={posting.id}>
              {posting.title}
            </option>
          ))}
        </select>
      </label>

      <label className={LABEL_CLASS}>
        Full name *
        <input autoComplete="name" className={INPUT_CLASS} name="full_name" required />
      </label>
      <label className={LABEL_CLASS}>
        Email *
        <input autoComplete="email" className={INPUT_CLASS} name="email" required type="email" />
      </label>
      <label className={LABEL_CLASS}>
        Phone
        <input autoComplete="tel" className={INPUT_CLASS} name="phone" type="tel" />
      </label>
      <label className={LABEL_CLASS}>
        LinkedIn / portfolio URL
        <input className={INPUT_CLASS} name="linkedin_url" placeholder="https://" type="url" />
      </label>

      <label className={`${LABEL_CLASS} sm:col-span-2`}>
        Cover letter / message
        <textarea
          className={`${INPUT_CLASS} min-h-32`}
          name="cover_letter"
          placeholder="Tell us why you would be a great fit"
        />
      </label>

      <label className={`${LABEL_CLASS} sm:col-span-2`}>
        CV / resume (PDF or Word, max 10 MB)
        <input
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className={INPUT_CLASS}
          name="cv"
          type="file"
        />
      </label>

      {status === "error" && message ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:col-span-2"
          role="alert"
        >
          {message}
        </div>
      ) : null}

      <div className="sm:col-span-2">
        <button
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent-orange px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-orange/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          disabled={status === "submitting"}
          type="submit"
        >
          {status === "submitting" ? "Submitting…" : "Submit application"}
        </button>
      </div>
    </form>
  );
}
