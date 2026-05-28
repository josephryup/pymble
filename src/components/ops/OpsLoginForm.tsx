"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  OPS_INPUT_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
} from "@/lib/ops/ui";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Login failed. Check your credentials and try again.";
}

type OpsLoginFormProps = {
  initialError?: string | null;
};

export function OpsLoginForm({ initialError = null }: OpsLoginFormProps) {
  const router = useRouter();
  const formId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ops/auth/login", {
        body: JSON.stringify({ email, password }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Login failed. Check your credentials.");
      }

      router.replace("/ops");
      router.refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    setErrorMessage(null);
    setResetMessage(null);

    if (!email.trim()) {
      setErrorMessage("Enter your email address first.");
      return;
    }

    setIsResetting(true);

    try {
      const response = await fetch("/api/ops/auth/reset-password", {
        body: JSON.stringify({ email }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Password reset email could not be sent.");
      }

      setResetMessage(payload?.message ?? "If the account exists, a password reset email has been sent.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsResetting(false);
    }
  }

  const emailId = `${formId}-email`;
  const passwordId = `${formId}-password`;
  const errorId = `${formId}-error`;
  const resetId = `${formId}-reset`;
  const describedBy = [
    errorMessage ? errorId : null,
    resetMessage ? resetId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form
      aria-busy={isSubmitting || isResetting}
      aria-describedby={describedBy || undefined}
      className="mt-6 grid gap-3"
      onSubmit={handleSubmit}
    >
      <div className="grid gap-1.5">
        <label className="text-sm font-semibold text-primary-dark" htmlFor={emailId}>
          Email
        </label>
        <input
          aria-invalid={errorMessage ? true : undefined}
          autoComplete="email"
          className={OPS_INPUT_CLASS}
          id={emailId}
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>

      <div className="grid gap-1.5">
        <label className="text-sm font-semibold text-primary-dark" htmlFor={passwordId}>
          Password
        </label>
        <input
          aria-invalid={errorMessage ? true : undefined}
          autoComplete="current-password"
          className={OPS_INPUT_CLASS}
          id={passwordId}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      {errorMessage ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          id={errorId}
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      {resetMessage ? (
        <p
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          id={resetId}
          role="status"
        >
          {resetMessage}
        </p>
      ) : null}

      <button
        className={`${OPS_PRIMARY_BUTTON_CLASS} mt-2 w-full`}
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>

      <button
        className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`}
        disabled={isResetting || isSubmitting}
        onClick={handlePasswordReset}
        type="button"
      >
        {isResetting ? "Sending reset email..." : "Forgot password"}
      </button>
    </form>
  );
}
