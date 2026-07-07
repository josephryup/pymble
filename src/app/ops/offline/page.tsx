import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import { OPS_BRAND } from "@/lib/ops/constants";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Offline | ${OPS_BRAND.name}`,
  robots: { follow: false, index: false },
};

/**
 * Shown instead of the browser's raw connection-error page when a
 * navigation fails while offline. Precached and registered as the Serwist
 * `fallbacks` entry in src/app/sw.ts, so it's available even on the very
 * first offline visit — deliberately a plain server component (no
 * client-side JS dependency) so it renders reliably with no network and no
 * hydration required. The "Try again" link is a real navigation, not a
 * script-driven reload.
 */
export default function OpsOfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#f6f7fb] px-6 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-primary-blue/10 text-primary-blue">
        <CloudOff aria-hidden="true" className="size-8" />
      </span>
      <div className="max-w-md space-y-2">
        <h1 className="font-heading text-2xl font-bold text-foreground">You&rsquo;re offline</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {OPS_BRAND.shortName} can&rsquo;t reach the server right now. Pages you&rsquo;ve already
          opened may still work from your device&rsquo;s cache.
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          Attendance, daily site reports, and site photos you submit while offline are saved on
          this device and will sync automatically once you&rsquo;re back online.
        </p>
      </div>
      <a
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-blue/88"
        href="/ops"
      >
        Try again
      </a>
    </main>
  );
}
