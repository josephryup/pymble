# Pymble Ops Vercel Firewall Rules

Last updated: 2026-06-08

This runbook defines the production Vercel Firewall setup for `ops.pymbleconstruction.com`.

Vercel `vercel.json` can define `challenge` and `deny` mitigations, but true `rate_limit` rules must be configured in the Vercel Firewall dashboard or through the Firewall API. Keep these rules in version control so production configuration is deliberate and repeatable.

Official references:

- Vercel Firewall overview: https://vercel.com/docs/vercel-firewall
- Rate limiting: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Firewall API: https://vercel.com/docs/vercel-firewall/firewall-api

## Required Dashboard Setup

Open:

```txt
https://vercel.com/<team>/<project>/firewall
```

Enable:

- Firewall enabled
- Bot Protection: `challenge`
- Security event logging

Recommended:

- Start custom rules in log/challenge mode during UAT if employee testing is active.
- Switch auth and API rate-limit rules to `deny` before production launch.
- Use Attack Challenge Mode only during an active attack or load anomaly.

## Required Custom Rules

### 1. Pymble Ops Login Rate Limit

Purpose: reduce brute-force attempts against the staff login endpoint.

Match:

- Host equals `ops.pymbleconstruction.com`
- Path equals `/api/ops/auth/login`
- Method equals `POST`

Rate limit:

- Algorithm: fixed window
- Window: 600 seconds
- Limit: 5 requests
- Key: IP
- Exceeded action: deny

PATCH payload:

```json
{
  "action": "rules.insert",
  "value": {
    "name": "Pymble Ops Login Rate Limit",
    "description": "Limit repeated staff login attempts by IP.",
    "active": true,
    "conditionGroup": [
      {
        "conditions": [
          { "type": "host", "op": "eq", "value": "ops.pymbleconstruction.com" },
          { "type": "path", "op": "eq", "value": "/api/ops/auth/login" },
          { "type": "method", "op": "eq", "value": "POST" }
        ]
      }
    ],
    "action": {
      "mitigate": {
        "action": "rate_limit",
        "rateLimit": {
          "algo": "fixed_window",
          "window": 600,
          "limit": 5,
          "keys": ["ip"],
          "action": "deny"
        }
      }
    }
  }
}
```

### 2. Pymble Ops Password Reset Rate Limit

Purpose: prevent abuse of reset emails. This is IP-based because body/email-based keys are not available on all Vercel plans.

Match:

- Host equals `ops.pymbleconstruction.com`
- Path equals `/api/ops/auth/reset-password`
- Method equals `POST`

Rate limit:

- Algorithm: fixed window
- Window: 600 seconds
- Limit: 3 requests
- Key: IP
- Exceeded action: deny

PATCH payload:

```json
{
  "action": "rules.insert",
  "value": {
    "name": "Pymble Ops Password Reset Rate Limit",
    "description": "Limit password reset email requests by IP.",
    "active": true,
    "conditionGroup": [
      {
        "conditions": [
          { "type": "host", "op": "eq", "value": "ops.pymbleconstruction.com" },
          { "type": "path", "op": "eq", "value": "/api/ops/auth/reset-password" },
          { "type": "method", "op": "eq", "value": "POST" }
        ]
      }
    ],
    "action": {
      "mitigate": {
        "action": "rate_limit",
        "rateLimit": {
          "algo": "fixed_window",
          "window": 600,
          "limit": 3,
          "keys": ["ip"],
          "action": "deny"
        }
      }
    }
  }
}
```

### 3. Pymble Ops API Write Rate Limit

Purpose: protect staff API write routes from accidental loops or scripted abuse without affecting normal browsing.

Match:

- Host equals `ops.pymbleconstruction.com`
- Path starts with `/api/ops/`
- Method is one of `POST`, `PUT`, `PATCH`, `DELETE`

Rate limit:

- Algorithm: fixed window
- Window: 60 seconds
- Limit: 120 requests
- Key: IP
- Exceeded action: deny

PATCH payload:

```json
{
  "action": "rules.insert",
  "value": {
    "name": "Pymble Ops API Write Rate Limit",
    "description": "Limit high-volume ops API write traffic by IP.",
    "active": true,
    "conditionGroup": [
      {
        "conditions": [
          { "type": "host", "op": "eq", "value": "ops.pymbleconstruction.com" },
          { "type": "path", "op": "pre", "value": "/api/ops/" },
          { "type": "method", "op": "inc", "value": ["POST", "PUT", "PATCH", "DELETE"] }
        ]
      }
    ],
    "action": {
      "mitigate": {
        "action": "rate_limit",
        "rateLimit": {
          "algo": "fixed_window",
          "window": 60,
          "limit": 120,
          "keys": ["ip"],
          "action": "deny"
        }
      }
    }
  }
}
```

### 4. Pymble Ops Document Download Rate Limit

Purpose: limit rapid document download attempts if an authenticated browser or IP is abused.

Match:

- Host equals `ops.pymbleconstruction.com`
- Path starts with `/api/ops/documents/`

Rate limit:

- Algorithm: fixed window
- Window: 60 seconds
- Limit: 60 requests
- Key: IP
- Exceeded action: deny

PATCH payload:

```json
{
  "action": "rules.insert",
  "value": {
    "name": "Pymble Ops Document Download Rate Limit",
    "description": "Limit rapid operational document download attempts by IP.",
    "active": true,
    "conditionGroup": [
      {
        "conditions": [
          { "type": "host", "op": "eq", "value": "ops.pymbleconstruction.com" },
          { "type": "path", "op": "pre", "value": "/api/ops/documents/" }
        ]
      }
    ],
    "action": {
      "mitigate": {
        "action": "rate_limit",
        "rateLimit": {
          "algo": "fixed_window",
          "window": 60,
          "limit": 60,
          "keys": ["ip"],
          "action": "deny"
        }
      }
    }
  }
}
```

## API Application Notes

Use a Vercel token from a secure local shell or CI secret. Do not commit it.

```txt
PATCH https://api.vercel.com/v1/security/firewall/config?projectId=<project_id>&teamId=<team_id>
Authorization: Bearer <VERCEL_TOKEN>
Content-Type: application/json
```

Apply each payload separately. After applying, confirm the active config includes all four rule names.

## UAT Checks

- Five bad login attempts from the same IP should trigger rate limiting within ten minutes.
- Three password reset requests from the same IP should trigger rate limiting within ten minutes.
- Normal staff browsing and form submissions should continue to work.
- Cron requests to `/api/ops/cron/hse-escalations` should still pass because the API write limit allows normal traffic volume.
- Firewall event logs should show matching rule names when limits are hit.
