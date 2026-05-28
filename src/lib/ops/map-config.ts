export const DEFAULT_OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const DEFAULT_ZAMBIA_MAP_CENTER = {
  latitude: -15.4167,
  longitude: 28.2833,
};

export function getOsmTileUrl() {
  return process.env.NEXT_PUBLIC_OSM_TILE_URL?.trim() || DEFAULT_OSM_TILE_URL;
}
