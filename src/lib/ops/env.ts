type EnvRequirement = {
  key: string;
  scope: "public" | "server";
  description: string;
};

export const OPS_ENV_REQUIREMENTS: EnvRequirement[] = [
  {
    key: "NEXT_PUBLIC_OPS_HOST",
    scope: "public",
    description: "Ops subdomain host, usually ops.pymbleconstruction.com.",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    scope: "public",
    description: "Pymble Supabase project URL.",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    scope: "public",
    description: "Pymble Supabase public anon key.",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    scope: "server",
    description: "Server-only Pymble Supabase service role key.",
  },
  {
    key: "CF_ACCOUNT_ID",
    scope: "server",
    description: "Cloudflare account ID for Pymble R2.",
  },
  {
    key: "R2_ACCESS_KEY_ID",
    scope: "server",
    description: "Server-only R2 access key ID.",
  },
  {
    key: "R2_SECRET_ACCESS_KEY",
    scope: "server",
    description: "Server-only R2 access key secret.",
  },
  {
    key: "R2_BUCKET_NAME",
    scope: "server",
    description: "Pymble-only R2 bucket name.",
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
