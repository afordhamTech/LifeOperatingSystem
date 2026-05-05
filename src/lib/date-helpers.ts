function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toDateKey(date = new Date()) {
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(
    "-",
  );
}

export function getWeekStartDate(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getWeekStartDateKey(date = new Date()) {
  return toDateKey(getWeekStartDate(date));
}
