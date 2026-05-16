export function getOpenTimeMinutes(input: number | { capacity?: { totalAvailableMinutes?: number | null } }) {
  if (typeof input === "number") return Math.max(0, Math.round(input));
  return Math.max(0, Math.round(Number(input.capacity?.totalAvailableMinutes ?? 0)));
}

export function minutesToDecimalHours(minutes: number) {
  return Math.round((getOpenTimeMinutes(minutes) / 60) * 100) / 100;
}

export function formatDecimalHours(minutes: number) {
  const hours = minutesToDecimalHours(minutes);
  return `${hours.toFixed(Number.isInteger(hours) ? 0 : 2)} hour${hours === 1 ? "" : "s"}`;
}
