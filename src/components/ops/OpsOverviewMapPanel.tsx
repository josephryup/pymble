"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { BadgeDollarSign, Camera, ClipboardCheck, MapPin, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { OpsBrandMark } from "@/components/ops/OpsBrandMark";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { OpsSiteMapProps } from "@/components/ops/OpsSiteMapClient";
import type {
  OpsOverviewAttendancePing,
  OpsOverviewSite,
  OpsOverviewWorker,
} from "@/lib/ops/overview";
import { formatZmw, OPS_INPUT_CLASS, OPS_SECONDARY_BUTTON_CLASS } from "@/lib/ops/ui";

const OpsSiteMap = dynamic<OpsSiteMapProps>(
  () =>
    import("@/components/ops/OpsSiteMapClient").then((module) => ({
      default: module.OpsSiteMapClient,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        aria-live="polite"
        className="flex min-h-96 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground"
        role="status"
      >
        <span className="flex size-16 items-center justify-center rounded-lg border border-border">
          <OpsBrandMark decorative className="h-12 w-12" sizes="48px" />
        </span>
        <span>Loading Pymble site map...</span>
        <Skeleton className="h-2 w-44" />
      </div>
    ),
  },
);

type OpsOverviewMapPanelProps = {
  activeDate: string;
  attendancePings: OpsOverviewAttendancePing[];
  headquarters: {
    addressLine: string | null;
    city: string | null;
    country: string;
    latitude: number | null;
    longitude: number | null;
    name: string;
  };
  openCashAdvances: number;
  sitePhotos: Array<{ id: string; site_id: string }>;
  sites: OpsOverviewSite[];
  workers: OpsOverviewWorker[];
};

function statusClass(status: OpsOverviewSite["status"]) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "mobilizing") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
}

function DetailStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <Card className="py-0">
      <CardContent className="px-4 py-3">
      <div className="flex items-center gap-2 text-primary">
        <Icon className="size-4" aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-2 font-heading text-xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

export function OpsOverviewMapPanel({
  activeDate,
  attendancePings,
  headquarters,
  openCashAdvances,
  sitePhotos,
  sites,
  workers,
}: OpsOverviewMapPanelProps) {
  const [selectedSiteId, setSelectedSiteId] = useState(
    sites.find((site) => site.latitude !== null && site.longitude !== null)?.id ??
      sites[0]?.id ??
      "",
  );
  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? sites[0],
    [selectedSiteId, sites],
  );
  const siteStats = useMemo(() => {
    if (!selectedSite) {
      return {
        approvedAttendance: 0,
        attendance: 0,
        photos: 0,
        workers: 0,
      };
    }

    let approvedAttendance = 0;
    let attendance = 0;
    let photos = 0;
    let workersOnSite = 0;

    for (const worker of workers) {
      if (worker.site_id === selectedSite.id) {
        workersOnSite += 1;
      }
    }

    for (const record of attendancePings) {
      if (record.site_id === selectedSite.id) {
        attendance += 1;

        if (record.approved_at) {
          approvedAttendance += 1;
        }
      }
    }

    for (const photo of sitePhotos) {
      if (photo.site_id === selectedSite.id) {
        photos += 1;
      }
    }

    return {
      approvedAttendance,
      attendance,
      photos,
      workers: workersOnSite,
    };
  }, [attendancePings, selectedSite, sitePhotos, workers]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <Card
        aria-labelledby="ops-map-title"
        className="py-0"
      >
        <CardHeader className="p-5 pb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Site Locations
          </p>
          <CardTitle
            className="mt-1 text-xl font-bold text-foreground"
            id="ops-map-title"
          >
            Pymble operating map
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
        {sites.length > 0 ? (
          <Label className="mb-4 grid gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <span>Select site</span>
            <select
              className={OPS_INPUT_CLASS}
              onChange={(event) => setSelectedSiteId(event.target.value)}
              value={selectedSite?.id ?? ""}
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.code} - {site.name}
                </option>
              ))}
            </select>
          </Label>
        ) : null}
        <OpsSiteMap
          activeDate={activeDate}
          attendancePings={attendancePings}
          headquarters={headquarters}
          onSelectSite={setSelectedSiteId}
          selectedSiteId={selectedSite?.id ?? ""}
          sites={sites}
          workers={workers}
        />
        </CardContent>
      </Card>

      <Card
        aria-labelledby="ops-map-details-title"
        className="py-0"
      >
        <CardHeader className="p-5 pb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Focused Site
          </p>
          <CardTitle
            className="mt-1 text-xl font-bold text-foreground"
            id="ops-map-details-title"
          >
            {selectedSite?.name ?? "Pymble site details"}
          </CardTitle>
        </CardHeader>

        <CardContent className="p-5 pt-0">
        {selectedSite ? (
          <div className="space-y-4">
            <Card className="bg-muted/70 py-0">
              <CardContent className="p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">{selectedSite.name}</p>
                  <CardDescription className="mt-1.5 text-xs">
                    {selectedSite.code} - {selectedSite.location}
                  </CardDescription>
                </div>
                <Badge
                  className={`h-auto w-fit border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(
                    selectedSite.status,
                  )}`}
                  variant="outline"
                >
                  {selectedSite.status}
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedSite.budget_zmw !== null ? (
                  <Badge className="h-auto border-border bg-background px-3 py-1 text-xs font-semibold text-foreground/70" variant="outline">
                    {formatZmw(selectedSite.budget_zmw)} budget
                  </Badge>
                ) : null}
                <Badge className="h-auto border-border bg-background px-3 py-1 text-xs font-semibold text-foreground/70" variant="outline">
                  {selectedSite.client_name || "Client not recorded"}
                </Badge>
                <Badge className="h-auto border-border bg-background px-3 py-1 text-xs font-semibold text-foreground/70" variant="outline">
                  {selectedSite.supervisor_name || "Supervisor not assigned"}
                </Badge>
              </div>
              </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-2">
              <DetailStat icon={Users} label="Crew" value={String(siteStats.workers)} />
              <DetailStat
                icon={ClipboardCheck}
                label="Today"
                value={`${siteStats.approvedAttendance}/${siteStats.attendance} approved`}
              />
              <DetailStat icon={Camera} label="Photos" value={String(siteStats.photos)} />
              <DetailStat
                icon={BadgeDollarSign}
                label="Advances"
                value={String(openCashAdvances)}
              />
            </div>

            <Card className="py-0">
              <CardContent className="p-4">
              <div className="flex items-center gap-2 text-primary">
                <MapPin className="size-4" aria-hidden="true" />
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Site GPS
                </p>
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {selectedSite.latitude !== null && selectedSite.longitude !== null
                  ? `${selectedSite.latitude.toFixed(6)}, ${selectedSite.longitude.toFixed(6)}`
                  : "Coordinates not set"}
              </p>
              </CardContent>
            </Card>

            <Link
              className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`}
              href="/ops/sites"
            >
              Manage site records
            </Link>
          </div>
        ) : (
          <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-border bg-muted/70 p-8 text-center text-sm leading-6 text-muted-foreground">
            Create a Pymble site to populate the map and focused site panel.
          </div>
        )}
        </CardContent>
      </Card>
    </div>
  );
}
