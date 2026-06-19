# Sentry setup for Pymble Operations

Sentry is wired into both runtimes (server, edge) and the browser via Next.js Sentry SDK 10.x.

- Server config: [sentry.server.config.ts](../sentry.server.config.ts)
- Edge config: [sentry.edge.config.ts](../sentry.edge.config.ts)
- Browser config: [instrumentation-client.ts](../instrumentation-client.ts)
- Build wrapper: [next.config.ts](../next.config.ts) (uses `withSentryConfig`)
- Health probe: `GET /api/ops/sentry-check` (returns whether the SDK is enabled; pass `?throw=1` to send a test exception)

## Required production env vars

| Variable | Used by | Notes |
|-|-|-|
| `SENTRY_DSN` | server + edge | DSN copied from Sentry → Project Settings → Client Keys (DSN). Same value as the public one. |
| `NEXT_PUBLIC_SENTRY_DSN` | browser bundle | Same DSN as above. Baked into the client bundle at build time. |
| `SENTRY_AUTH_TOKEN` | CI build only | Created at Sentry → User Settings → Auth Tokens. Needs **project:releases** + **project:write**. Used by `withSentryConfig` to upload source maps. **Do not** expose this to the browser — it's CI-only. |
| `SENTRY_ORG` | CI build only | Defaults to `joseph-5u` in [next.config.ts](../next.config.ts); override if it changes. |
| `SENTRY_PROJECT` | CI build only | Defaults to `pymble-ops`; override if it changes. |

## Running the wizard (one-time)

The `@sentry/wizard` CLI requires an interactive terminal that this agent shell can't provide. From your own terminal:

```bash
npx @sentry/wizard@latest -i nextjs --saas --org joseph-5u --project pymble-ops
```

The wizard will:
- Confirm the existing config files
- Add `SENTRY_AUTH_TOKEN` to `.env.sentry-build-plugin` (gitignored)
- Optionally add a Sentry example page

Anything the wizard would overwrite is already in this repo at the right shape, so the wizard's diff should be small.

## Verifying after deploy

1. `GET https://ops.pymbleconstruction.com/api/ops/sentry-check` — confirms `sdkEnabled: true`
2. `GET .../api/ops/sentry-check?throw=1` — sends a test exception
3. Check Sentry dashboard within ~30s for the new event with tag `scope=ops.sentry-check.manual`

## What gets captured automatically

- Server-component render errors → routed through workspace error boundary ([error.tsx](../src/app/ops/(workspace)/error.tsx))
- Client-side errors → routed through Sentry's React error boundary
- Server actions that throw → logged with module/action/actor context via [logOpsServerError](../src/lib/ops/log.ts)
- Router transitions → traced via `onRouterTransitionStart` in [instrumentation-client.ts](../instrumentation-client.ts)

## What does NOT get captured

- Auth tokens, Supabase service-role key (the SDK strips obvious secrets but don't rely on it — never log full tokens)
- Worker phone numbers, MoMo numbers, payslip net amounts (treat as PII; redact at log boundaries)

## Tunnel route

Events are POSTed to `/monitoring` and tunnelled to `*.ingest.sentry.io` from the server, so ad-blockers don't drop them.
