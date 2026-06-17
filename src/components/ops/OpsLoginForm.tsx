"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [showPassword, setShowPassword] = useState(false);
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
        <Label className="text-sm font-semibold text-foreground" htmlFor={emailId}>
          Email
        </Label>
        <Input
          aria-invalid={errorMessage ? true : undefined}
          autoComplete="email"
          className="min-h-11"
          id={emailId}
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-sm font-semibold text-foreground" htmlFor={passwordId}>
          Password
        </Label>
        <div className="relative">
          <Input
            aria-invalid={errorMessage ? true : undefined}
            autoComplete="current-password"
            className="min-h-11 pr-12"
            id={passwordId}
            onChange={(event) => setPassword(event.target.value)}
            required
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setShowPassword((current) => !current)}
            tabIndex={0}
            type="button"
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <Alert
          className="border-destructive/25 bg-destructive/10 text-sm text-destructive"
          id={errorId}
          role="alert"
        >
          {errorMessage}
        </Alert>
      ) : null}

      {resetMessage ? (
        <Alert
          className="border-emerald-200 bg-emerald-50 text-sm text-emerald-700"
          id={resetId}
          role="status"
        >
          {resetMessage}
        </Alert>
      ) : null}

      <Button
        aria-disabled={isSubmitting}
        className="mt-2 min-h-11 w-full"
        disabled={isSubmitting}
        size="lg"
        type="submit"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </Button>

      <Button
        aria-disabled={isResetting || isSubmitting}
        className="min-h-11 w-full"
        disabled={isResetting || isSubmitting}
        onClick={handlePasswordReset}
        size="lg"
        type="button"
        variant="outline"
      >
        {isResetting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Sending reset email...
          </>
        ) : (
          "Forgot password"
        )}
      </Button>
    </form>
  );
}
