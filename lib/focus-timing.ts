export const FIRST_USE_FOCUS_MS = 3000;

export function focusDurationMs(
  durationType: "small" | "large",
  demo = false,
): number {
  if (demo) return durationType === "small" ? 10_000 : 20_000;
  return (durationType === "small" ? 25 : 52) * 60_000;
}

export function breakDurationMs(demo = false): number {
  return demo ? 5000 : 5 * 60_000;
}
