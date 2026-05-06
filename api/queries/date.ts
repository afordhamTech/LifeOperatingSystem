export function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDaysUtc(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
