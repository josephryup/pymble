export function safeOpsReturnTo(value: string | undefined, fallback = "/ops") {
  if (!value || value.startsWith("//")) {
    return fallback;
  }

  const isOpsPath =
    value === "/ops" ||
    value.startsWith("/ops/") ||
    value.startsWith("/ops?") ||
    value.startsWith("/ops#");

  if (!isOpsPath) {
    return fallback;
  }

  return value;
}
