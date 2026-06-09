type EnvRequirement = {
  key: string;
  scope: "public" | "server";
  requiredForProduction?: boolean;
  description: string;
};

export const OPS_ENV_REQUIREMENTS: EnvRequirement[] = [
  {
    key: "NEXT_PUBLIC_OPS_HOST",
    scope: "public",
    requiredForProduction: true,
    description: "Ops subdomain host, usually ops.pymbleconstruction.com.",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    scope: "public",
    requiredForProduction: true,
    description: "Pymble Supabase project URL.",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    scope: "public",
    requiredForProduction: true,
    description: "Pymble Supabase public anon key.",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    scope: "server",
    requiredForProduction: true,
    description: "Server-only Pymble Supabase service role key.",
  },
  {
    key: "CRON_SECRET",
    scope: "server",
    requiredForProduction: true,
    description: "Server-only bearer token for protected scheduled jobs and readiness checks.",
  },
  {
    key: "CF_ACCOUNT_ID",
    scope: "server",
    requiredForProduction: true,
    description: "Cloudflare account ID for Pymble R2.",
  },
  {
    key: "R2_ACCESS_KEY_ID",
    scope: "server",
    requiredForProduction: true,
    description: "Server-only R2 access key ID.",
  },
  {
    key: "R2_SECRET_ACCESS_KEY",
    scope: "server",
    requiredForProduction: true,
    description: "Server-only R2 access key secret.",
  },
  {
    key: "R2_BUCKET_NAME",
    scope: "server",
    requiredForProduction: true,
    description: "Pymble-only R2 bucket name.",
  },
  {
    key: "RESEND_API_KEY",
    scope: "server",
    requiredForProduction: true,
    description: "Server-only Resend API key for Pymble operational email alerts.",
  },
  {
    key: "OPS_EMAIL_FROM",
    scope: "server",
    description: "Verified sender identity for Pymble operational email alerts.",
  },
  {
    key: "OPS_EMAIL_REPLY_TO",
    scope: "server",
    description: "Reply-to mailbox for Pymble operational email alerts.",
  },
  {
    key: "NEXT_PUBLIC_SENTRY_DSN",
    scope: "public",
    description: "Public Sentry browser DSN for production error monitoring.",
  },
  {
    key: "SENTRY_DSN",
    scope: "server",
    description: "Server-side Sentry DSN for production error monitoring.",
  },
  {
    key: "SENTRY_AUTH_TOKEN",
    scope: "server",
    description: "Server-only token used by Sentry source map uploads during production builds.",
  },
  {
    key: "SENTRY_ORG",
    scope: "server",
    description: "Sentry organization slug used by the production build.",
  },
  {
    key: "SENTRY_PROJECT",
    scope: "server",
    description: "Sentry project slug used by the production build.",
  },
];

function hasEnvValue(key: string) {
  return Boolean(process.env[key]?.trim());
}

export function getOpsEnvironmentStatus() {
  const variables = OPS_ENV_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    configured: hasEnvValue(requirement.key),
  }));

  return {
    variables,
    isSupabaseConfigured:
      hasEnvValue("NEXT_PUBLIC_SUPABASE_URL") &&
      hasEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
      hasEnvValue("SUPABASE_SERVICE_ROLE_KEY"),
    isR2Configured:
      hasEnvValue("CF_ACCOUNT_ID") &&
      hasEnvValue("R2_ACCESS_KEY_ID") &&
      hasEnvValue("R2_SECRET_ACCESS_KEY") &&
      hasEnvValue("R2_BUCKET_NAME"),
    isCronConfigured: hasEnvValue("CRON_SECRET"),
    isEmailConfigured:
      hasEnvValue("RESEND_API_KEY") &&
      (hasEnvValue("OPS_EMAIL_FROM") || hasEnvValue("RESEND_FROM_EMAIL")),
    isMonitoringConfigured:
      hasEnvValue("NEXT_PUBLIC_SENTRY_DSN") ||
      hasEnvValue("SENTRY_DSN"),
  };
}

export function requirePublicEnv(key: string) {
  const value = process.env[key];

  if (!value?.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

export function requireServerEnv(key: string) {
  if (key.startsWith("NEXT_PUBLIC_")) {
    throw new Error(`${key} is public; use requirePublicEnv instead.`);
  }

  const value = process.env[key];

  if (!value?.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value;
}
