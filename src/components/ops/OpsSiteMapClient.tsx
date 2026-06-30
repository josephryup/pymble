"use client";

import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import {
  DEFAULT_ZAMBIA_MAP_CENTER,
  getOsmTileUrl,
  OSM_ATTRIBUTION,
} from "@/lib/ops/map-config";
import type {
  OpsOverviewAttendancePing,
  OpsOverviewSite,
  OpsOverviewWorker,
} from "@/lib/ops/overview";

export type OpsSiteMapProps = {
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
  onSelectSite: (siteId: string) => void;
  selectedSiteId: string;
  sites: OpsOverviewSite[];
  workers: OpsOverviewWorker[];
};

type CoordinatePoint = {
  latitude: number;
  longitude: number;
};

type SiteWithCoordinates = OpsOverviewSite & {
  latitude: number;
  longitude: number;
};

function hasCoordinates(site: OpsOverviewSite): site is SiteWithCoordinates {
  return typeof site.latitude === "number" && typeof site.longitude === "number";
}

function FitMapBounds({ points }: { points: CoordinatePoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) {
      return;
    }

    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 10, {
        animate: false,
      });
      return;
    }

    map.fitBounds(
      points.map((point) => [point.latitude, point.longitude] as [number, number]),
      {
        animate: false,
        padding: [36, 36],
      },
    );
  }, [map, points]);

  return null;
}

export function OpsSiteMapClient({
  activeDate,
  attendancePings,
  headquarters,
  onSelectSite,
  selectedSiteId,
  sites,
  workers,
}: OpsSiteMapProps) {
  const sitesWithCoordinates = useMemo(() => sites.filter(hasCoordinates), [sites]);
  const headquartersHasCoordinates =
    typeof headquarters.latitude === "number" && typeof headquarters.longitude === "number";
  const selectedSite =
    sitesWithCoordinates.find((site) => site.id === selectedSiteId) ?? sitesWithCoordinates[0];
  const attendancePoints = useMemo(
    () =>
      attendancePings.filter(
        (record) => record.gps_latitude !== null && record.gps_longitude !== null,
      ),
    [attendancePings],
  );
  const siteCounts = useMemo(() => {
    const crewBySite = new Map<string, number>();
    const approvedBySite = new Map<string, number>();

    for (const worker of workers) {
      if (worker.site_id) {
        crewBySite.set(worker.site_id, (crewBySite.get(worker.site_id) ?? 0) + 1);
      }
    }

    for (const record of attendancePings) {
      if (record.approved_at) {
        approvedBySite.set(record.site_id, (approvedBySite.get(record.site_id) ?? 0) + 1);
      }
    }

    return { approvedBySite, crewBySite };
  }, [attendancePings, workers]);
  const mapPoints = useMemo(
    () => [
      ...(headquartersHasCoordinates
        ? [
            {
              latitude: headquarters.latitude as number,
              longitude: headquarters.longitude as number,
            },
          ]
        : []),
      ...sitesWithCoordinates.map((site) => ({
        latitude: site.latitude,
        longitude: site.longitude,
      })),
      ...attendancePoints.map((record) => ({
        latitude: record.gps_latitude as number,
        longitude: record.gps_longitude as number,
      })),
    ],
    [
      attendancePoints,
      headquarters.latitude,
      headquarters.longitude,
      headquartersHasCoordinates,
      sitesWithCoordinates,
    ],
  );
  const sitesMissingCoordinates = sites.length - sitesWithCoordinates.length;

  if (!sitesWithCoordinates.length && !headquartersHasCoordinates) {
    return (
      <div className="flex min-h-96 items-center justify-center rounded-md border border-dashed border-border bg-muted/30 p-8 text-center text-sm leading-6 text-muted-foreground">
        Add headquarters or site coordinates to activate the Pymble map.
      </div>
    );
  }

  return (
    <div
      aria-label="Pymble site and attendance map"
      className="relative overflow-hidden rounded-lg border border-border"
      role="region"
    >
      <p className="sr-only">
        Map showing Pymble headquarters, active sites, and attendance GPS points. Site details are
        also available in the focused site panel beside the map.
      </p>
      <MapContainer
        center={[
          selectedSite?.latitude ??
            headquarters.latitude ??
            DEFAULT_ZAMBIA_MAP_CENTER.latitude,
          selectedSite?.longitude ??
            headquarters.longitude ??
            DEFAULT_ZAMBIA_MAP_CENTER.longitude,
        ]}
        className="h-64 w-full bg-muted md:h-80 lg:h-[26rem]"
        scrollWheelZoom={false}
        zoom={7}
      >
        <TileLayer attribution={OSM_ATTRIBUTION} url={getOsmTileUrl()} />
        <FitMapBounds points={mapPoints} />

        {headquartersHasCoordinates ? (
          <CircleMarker
            center={[headquarters.latitude as number, headquarters.longitude as number]}
            pathOptions={{
              color: "#131739",
              fillColor: "#131739",
              fillOpacity: 0.95,
              weight: 2,
            }}
            radius={12}
          >
            <Tooltip direction="top" opacity={1} permanent>
              <span className="text-xs font-bold tracking-tight">HQ</span>
            </Tooltip>
            <Popup>
              <div className="space-y-1 p-1 text-sm text-foreground">
                <p className="font-bold leading-tight text-foreground">{headquarters.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[headquarters.addressLine, headquarters.city, headquarters.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p className="mt-1 text-xs font-semibold text-primary">
                  Pymble headquarters
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ) : null}

        {sitesWithCoordinates.map((site) => {
          const crewCount = siteCounts.crewBySite.get(site.id) ?? 0;
          const approvedCount = siteCounts.approvedBySite.get(site.id) ?? 0;
          const isSelected = selectedSiteId === site.id;

          return (
            <CircleMarker
              center={[site.latitude, site.longitude]}
              eventHandlers={{
                click: () => onSelectSite(site.id),
              }}
              key={site.id}
              pathOptions={{
                color: isSelected ? "#131739" : "#2235DD",
                fillColor: isSelected ? "#FFA500" : "#2235DD",
                fillOpacity: 0.92,
                weight: isSelected ? 3 : 1.5,
              }}
              radius={isSelected ? 14 : 10}
            >
              {isSelected ? (
                <Tooltip direction="top" opacity={1} permanent>
                  <span className="text-xs font-bold tracking-tight">{site.code}</span>
                </Tooltip>
              ) : null}
              <Popup>
                <div className="space-y-1 p-1 text-sm text-foreground">
                  <p className="font-bold leading-tight text-foreground">{site.name}</p>
                  <p className="text-xs text-muted-foreground">{site.location}</p>
                  <p className="mt-1 text-xs font-semibold text-primary">
                    {crewCount} crew - {approvedCount} approved today
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {attendancePoints.map((record) => (
          <CircleMarker
            center={[record.gps_latitude as number, record.gps_longitude as number]}
            key={record.id}
            pathOptions={{
              color: "#FFA500",
              fillColor: "#FFA500",
              fillOpacity: 0.85,
              weight: 1,
            }}
            radius={6}
          >
            <Popup>
              <div className="space-y-1 p-1 text-sm text-foreground">
                <p className="font-bold text-foreground">
                  {record.gps_label || "Clock point"}
                </p>
                <p className="text-xs text-muted-foreground">
                  GPS: {record.gps_latitude?.toFixed(4)},{" "}
                  {record.gps_longitude?.toFixed(4)}
                </p>
                <p className="mt-1 text-xs font-semibold capitalize text-accent-orange">
                  {record.presence} - {new Date(record.clock_in_at).toLocaleTimeString("en-ZM", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Africa/Lusaka",
                  })}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute left-3 top-3 z-[1000] hidden max-w-xs rounded-md border border-border bg-card/95 px-3.5 py-2.5 shadow-sm md:block">
        <p className="text-[11px] font-bold text-foreground">Pymble site map</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          Tap a site pin to review crew, approvals, and site details. HQ marks the Pymble office.
        </p>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 z-[1000] hidden rounded-md border border-border bg-card/95 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground shadow-sm md:block">
        {sitesMissingCoordinates > 0
          ? `${sitesMissingCoordinates} sites missing GPS`
          : `All sites geolocated - ${activeDate}`}
      </div>
    </div>
  );
}
