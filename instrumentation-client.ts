import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    tracesSampleRate: 0.05,
    // Was 1.0: a full session replay uploaded on EVERY error. Two problems.
    // Privacy first — replays of ops screens carry payroll figures, TPINs and
    // the credentials register to a third-party processor, which is regulated
    // personal data under the Data Protection Act 2021 (Sentry masks form
    // inputs by default, not rendered text). Cost second — every replay is
    // proxied through the /monitoring tunnel, so it is billed Vercel function
    // CPU and bandwidth, not just Sentry quota. 10% still surfaces recurring
    // faults; one-off errors keep their stack trace and breadcrumbs.
    replaysOnErrorSampleRate: 0.1,
    replaysSessionSampleRate: 0.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
