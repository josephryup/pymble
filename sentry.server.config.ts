import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
    // Kept low: server traces run inside the Vercel function and each sampled
    // request adds instrumentation + tunnel-forward CPU. 5% is plenty for a
    // low-traffic app to spot regressions without burning Active CPU.
    tracesSampleRate: 0.05,
});
