function parseTimeToMinutes(value: string) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23) return null;
  return hours * 60 + minutes;
}

export function calculateSleepDurationHours(bedtime: string, wakeTime: string) {
  const bedMinutes = parseTimeToMinutes(bedtime);
  const wakeMinutes = parseTimeToMinutes(wakeTime);
  if (bedMinutes == null || wakeMinutes == null) return 0;
  let durationMinutes = wakeMinutes - bedMinutes;
  if (durationMinutes < 0) durationMinutes += 24 * 60;
  return Math.round((durationMinutes / 60) * 100) / 100;
}
