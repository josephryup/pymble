import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const strictEnv =
  process.argv.includes("--strict-env") ||
  process.env.npm_config_strict_env === "true";

const requiredEnvKeys = [
  "NEXT_PUBLIC_OPS_HOST",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "CF_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "OPS_EMAIL_FROM",
  "OPS_EMAIL_REPLY_TO",
  "NEXT_PUBLIC_SENTRY_DSN",
  "SENTRY_DSN",
  "SENTRY_AUTH_TOKEN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
];

const strictRuntimeEnvKeys = [
  "NEXT_PUBLIC_OPS_HOST",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "CF_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "RESEND_API_KEY",
];

const requiredDocs = [
  "docs/pymble-ops-erp-roadmap.md",
  "docs/pymble-ops-design-system.md",
  "docs/pymble-ops-setup.md",
  "docs/pymble-ops-production-launch-checklist.md",
  "docs/pymble-ops-role-permission-matrix.md",
  "docs/pymble-ops-uat-plan.md",
  "docs/pymble-ops-vercel-firewall.md",
];

const allowedServiceRoleReferences = new Set([
  path.normalize("src/lib/ops/env.ts"),
  path.normalize("src/lib/ops/supabase-server.ts"),
]);

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const failures = [];
const warnings = [];

function loadLocalEnvFiles() {
  const envFiles = [".env.local", ".env.production.local", ".env.production", ".env"];

  for (const envFile of envFiles) {
    const envPath = path.join(root, envFile);

    if (!existsSync(envPath)) {
      continue;
    }

    const contents = readFileSync(envPath, "utf8");

    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

      if (!match) {
        continue;
      }

      const [, key, rawValue] = match;

      if (process.env[key]) {
        continue;
      }

      const value = rawValue
        .replace(/^(['"])(.*)\1$/, "$2")
        .replace(/\\n/g, "\n")
        .trim();

      process.env[key] = value;
    }
  }
}

function repoPath(filePath) {
  return path.normalize(filePath).replaceAll("\\", "/");
}

function readRepoFile(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function walkFiles(dir, extensions = sourceExtensions) {
  const absoluteDir = path.join(root, dir);

  if (!existsSync(absoluteDir)) {
    return [];
  }

  return readdirSync(absoluteDir).flatMap((entry) => {
    const absolutePath = path.join(absoluteDir, entry);
    const relativePath = path.relative(root, absolutePath);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      if ([".next", "node_modules"].includes(entry)) {
        return [];
      }

      return walkFiles(relativePath, extensions);
    }

    return extensions.has(path.extname(entry)) ? [repoPath(relativePath)] : [];
  });
}

function check(name, condition, detail) {
  if (condition) {
    console.log(`ok - ${name}`);
    return;
  }

  failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  console.error(`fail - ${name}${detail ? `: ${detail}` : ""}`);
}

function warn(name, condition, detail) {
  if (condition) {
    console.log(`ok - ${name}`);
    return;
  }

  warnings.push(`${name}${detail ? `: ${detail}` : ""}`);
  console.warn(`warn - ${name}${detail ? `: ${detail}` : ""}`);
}

loadLocalEnvFiles();

const packageJson = JSON.parse(readRepoFile("package.json"));
check("quality scripts exist", ["test", "lint", "build", "ops:readiness"].every((script) => packageJson.scripts?.[script]));

for (const docPath of requiredDocs) {
  check(`${docPath} exists`, existsSync(path.join(root, docPath)));
}

const envExample = readRepoFile(".env.example");
for (const key of requiredEnvKeys) {
  check(`.env.example includes ${key}`, new RegExp(`^${key}=`, "m").test(envExample));
}

if (strictEnv) {
  for (const key of strictRuntimeEnvKeys) {
    check(`process env has ${key}`, Boolean(process.env[key]?.trim()));
  }
  check(
    "email sender identity configured",
    Boolean(process.env.OPS_EMAIL_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim()),
    "set OPS_EMAIL_FROM or RESEND_FROM_EMAIL",
  );
  warn(
    "ops email reply-to configured",
    Boolean(process.env.OPS_EMAIL_REPLY_TO?.trim()),
    "using Pymble support email fallback until OPS_EMAIL_REPLY_TO is set",
  );
  warn(
    "Sentry monitoring env configured",
    Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.SENTRY_DSN?.trim()),
    "add Sentry env values before final monitored go-live",
  );
  warn(
    "Sentry source map upload env configured",
    ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"].every((key) =>
      Boolean(process.env[key]?.trim()),
    ),
    "needed only when uploading source maps during production builds",
  );
} else {
  warn("strict production env value check skipped", false, "run npm run ops:readiness -- --strict-env after pulling Vercel/Supabase env values locally");
}

const vercelConfig = JSON.parse(readRepoFile("vercel.json"));
check(
  "Vercel ops escalation cron configured",
  Array.isArray(vercelConfig.crons) &&
    vercelConfig.crons.some((cron) => cron.path === "/api/ops/cron/escalations"),
);
check(
  "Vercel HSE cron configured",
  Array.isArray(vercelConfig.crons) &&
    vercelConfig.crons.some((cron) => cron.path === "/api/ops/cron/hse-escalations"),
);

const vercelFirewallDoc = readRepoFile("docs/pymble-ops-vercel-firewall.md");
check(
  "Vercel WAF rate-limit runbook configured",
  [
    "Pymble Ops Login Rate Limit",
    "Pymble Ops Password Reset Rate Limit",
    "Pymble Ops API Write Rate Limit",
    "Pymble Ops Document Download Rate Limit",
    '"action": "rate_limit"',
  ].every((snippet) => vercelFirewallDoc.includes(snippet)),
);

const proxySource = readRepoFile("src/proxy.ts");
check("ops no-store headers configured", proxySource.includes("Cache-Control") && proxySource.includes("no-store"));
check("ops CSP headers configured", proxySource.includes("Content-Security-Policy") && proxySource.includes("frame-ancestors 'none'"));
check("ops HSTS headers configured", proxySource.includes("Strict-Transport-Security") && proxySource.includes("includeSubDomains"));
check("ops iframe protection configured", proxySource.includes("X-Frame-Options") && proxySource.includes("DENY"));
check("ops indexing protection configured", proxySource.includes("X-Robots-Tag") && proxySource.includes("noindex"));

const apiSecuritySource = readRepoFile("src/lib/ops/api-security.ts");
check(
  "unsafe ops auth writes verify request origin",
  apiSecuritySource.includes("rejectMismatchedOpsOrigin") &&
    ["login", "logout", "reset-password"].every((routeName) =>
      readRepoFile(`src/app/api/ops/auth/${routeName}/route.ts`).includes("rejectMismatchedOpsOrigin"),
    ),
);

const r2Source = readRepoFile("src/lib/ops/r2.ts");
check(
  "R2 read URLs use short-lived signatures",
  r2Source.includes("OPS_R2_READ_URL_EXPIRES_SECONDS") &&
    r2Source.includes("60 * 10") &&
    !r2Source.includes("60 * 30"),
);

const documentDownloadSource = readRepoFile("src/app/api/ops/documents/[versionId]/download/route.ts");
check(
  "document downloads record audit events",
  documentDownloadSource.includes("recordOpsAuditEvent") &&
    documentDownloadSource.includes("document.downloaded"),
);

const healthSource = readRepoFile("src/app/api/ops/health/route.ts");
check(
  "protected readiness health mode configured",
  healthSource.includes('mode") !== "readiness"') &&
    healthSource.includes("authorization") &&
    healthSource.includes("CRON_SECRET"),
);

const sourceFiles = walkFiles("src");
const opsSourceFiles = sourceFiles.filter(
  (filePath) => filePath.startsWith("src/app/ops/") || filePath.startsWith("src/lib/ops/") || filePath.startsWith("src/components/ops/"),
);
const opsActionFiles = opsSourceFiles.filter((filePath) => filePath.endsWith("-actions.ts"));
const migrationFiles = walkFiles("supabase/migrations", new Set([".sql"]));

const serviceRoleLeaks = sourceFiles.filter((filePath) => {
  const normalized = path.normalize(filePath);
  return (
    readRepoFile(filePath).includes("SUPABASE_SERVICE_ROLE_KEY") &&
    !allowedServiceRoleReferences.has(normalized)
  );
});
check(
  "service role key is server-helper only",
  serviceRoleLeaks.length === 0,
  serviceRoleLeaks.join(", "),
);

const clientSecretLeaks = sourceFiles.filter((filePath) => {
  const contents = readRepoFile(filePath);

  return (
    contents.startsWith('"use client";') &&
    /SUPABASE_SERVICE_ROLE_KEY|R2_SECRET_ACCESS_KEY|RESEND_API_KEY|SENTRY_AUTH_TOKEN|CRON_SECRET/.test(contents)
  );
});
check("no server secrets referenced by client components", clientSecretLeaks.length === 0, clientSecretLeaks.join(", "));

const retiredSetupReferences = opsSourceFiles.filter((filePath) =>
  /setup requirements|\/ops\/setup|\/ops\/signup|\/ops\/register/i.test(readRepoFile(filePath)),
);
check("retired setup/signup UI is absent from ops source", retiredSetupReferences.length === 0, retiredSetupReferences.join(", "));

const sitePilotReferences = opsSourceFiles.filter((filePath) => /sitepilot/i.test(readRepoFile(filePath)));
check("ops source has no SitePilot wording", sitePilotReferences.length === 0, sitePilotReferences.join(", "));

const tenantReferences = [...opsSourceFiles, ...migrationFiles].filter((filePath) =>
  /\b(company_id|tenant_id|workspace_id)\b/i.test(readRepoFile(filePath)),
);
check("ops schema/source remains true single-company", tenantReferences.length === 0, tenantReferences.join(", "));

const rawActionErrorRedirects = opsActionFiles.filter((filePath) =>
  readRepoFile(filePath).includes("encodeURIComponent(message)"),
);
check(
  "ops action redirects sanitize user-facing errors",
  existsSync(path.join(root, "src/lib/ops/action-errors.ts")) && rawActionErrorRedirects.length === 0,
  rawActionErrorRedirects.join(", "),
);

const rolePolicySource = readRepoFile("src/lib/ops/role-policy.ts");
check("production role policy includes hidden Developer", rolePolicySource.includes("visibleInAccessRegister: false"));
check("production role policy includes Managing Director", rolePolicySource.includes('role: "managing_director"'));

if (warnings.length > 0) {
  console.warn(`\n${warnings.length} warning(s):`);
  for (const item of warnings) {
    console.warn(`- ${item}`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} readiness failure(s):`);
  for (const item of failures) {
    console.error(`- ${item}`);
  }
  process.exitCode = 1;
} else {
  console.log("\nPymble Ops production readiness checks passed.");
}
