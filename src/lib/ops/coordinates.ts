export type CoordinateKind = "latitude" | "longitude";

const COORDINATE_LIMITS: Record<CoordinateKind, number> = {
  latitude: 90,
  longitude: 180,
};

type CardinalDirection = "N" | "S" | "E" | "W";

function normalizeDecimalSeparator(value: string) {
  if (value.includes(".") || !value.includes(",")) {
    return value;
  }

  return value.replace(",", ".");
}

function extractDirection(value: string): CardinalDirection | null | "invalid" {
  const matches = Array.from(new Set(value.toUpperCase().match(/[NSEW]/g) ?? []));

  if (matches.length > 1) {
    return "invalid";
  }

  return (matches[0] as CardinalDirection | undefined) ?? null;
}

function isCoordinateInRange(value: number, kind: CoordinateKind) {
  return Math.abs(value) <= COORDINATE_LIMITS[kind];
}

function applyCoordinateSign(
  absoluteValue: number,
  rawValue: number,
  direction: CardinalDirection | null,
) {
  if (direction === "S" || direction === "W") {
    return -absoluteValue;
  }

  if (direction === "N" || direction === "E") {
    return absoluteValue;
  }

  return rawValue < 0 ? -absoluteValue : absoluteValue;
}

function parseDecimalCoordinate(value: string, kind: CoordinateKind) {
  const direction = extractDirection(value);

  if (direction === "invalid") {
    return undefined;
  }

  const candidate = normalizeDecimalSeparator(value.replace(/[NSEW]/gi, "").trim());

  if (!/^[+-]?\d+(?:\.\d+)?$/.test(candidate)) {
    return undefined;
  }

  const numeric = Number(candidate);

  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  const parsed = applyCoordinateSign(Math.abs(numeric), numeric, direction);
  return isCoordinateInRange(parsed, kind) ? parsed : undefined;
}

function parseDelimitedDmsCoordinate(value: string, kind: CoordinateKind) {
  const direction = extractDirection(value);

  if (direction === "invalid") {
    return undefined;
  }

  const normalized = normalizeDecimalSeparator(value)
    .replace(/[NSEW]/gi, " ")
    .replace(/[\u00b0\u00ba]/g, " ")
    .replace(/['`"]/g, " ")
    .replace(/[^\d+\-.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = normalized.match(/[+-]?\d+(?:\.\d+)?/g);

  if (!parts || parts.length < 2 || parts.length > 3) {
    return undefined;
  }

  const degrees = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = Number(parts[2] ?? "0");

  if (
    !Number.isFinite(degrees) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    minutes < 0 ||
    seconds < 0 ||
    minutes >= 60 ||
    seconds >= 60
  ) {
    return undefined;
  }

  const absoluteValue = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  const parsed = applyCoordinateSign(absoluteValue, degrees, direction);

  return isCoordinateInRange(parsed, kind) ? parsed : undefined;
}

function parseCompactDmsCoordinate(value: string, kind: CoordinateKind) {
  const direction = extractDirection(value);

  if (direction === "invalid") {
    return undefined;
  }

  const candidate = normalizeDecimalSeparator(value.replace(/[NSEW]/gi, "").trim());

  if (!/^[+-]?\d+(?:\.\d+)?$/.test(candidate)) {
    return undefined;
  }

  const sign = candidate.startsWith("-") ? -1 : 1;
  const unsigned = candidate.replace(/^[+-]/, "");
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  const degreeDigits = kind === "longitude" && wholePart.length >= 7 ? 3 : 2;

  if (wholePart.length < degreeDigits + 4) {
    return undefined;
  }

  const degreesText = wholePart.slice(0, degreeDigits);
  const minutesText = wholePart.slice(degreeDigits, degreeDigits + 2);
  const secondsWholeText = wholePart.slice(degreeDigits + 2);

  if (!secondsWholeText || secondsWholeText.length > 2) {
    return undefined;
  }

  const degrees = Number(degreesText);
  const minutes = Number(minutesText);
  const seconds = Number(fractionPart ? `${secondsWholeText}.${fractionPart}` : secondsWholeText);

  if (
    !Number.isFinite(degrees) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    minutes < 0 ||
    seconds < 0 ||
    minutes >= 60 ||
    seconds >= 60
  ) {
    return undefined;
  }

  const absoluteValue = degrees + minutes / 60 + seconds / 3600;
  const parsed = applyCoordinateSign(absoluteValue, sign < 0 ? -degrees : degrees, direction);

  return isCoordinateInRange(parsed, kind) ? parsed : undefined;
}

export function parseCoordinateInput(value: string, kind: CoordinateKind) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return (
    parseDecimalCoordinate(trimmed, kind) ??
    parseDelimitedDmsCoordinate(trimmed, kind) ??
    parseCompactDmsCoordinate(trimmed, kind)
  );
}

export function formatCoordinateValue(value: number) {
  const normalized = Object.is(value, -0) ? 0 : value;
  return normalized.toFixed(6).replace(/\.?0+$/, "");
}
