/** Local calendar date as `YYYY-MM-DD`. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Next local midnight. Never `ms + 86_400_000`: DST days are 23 or 25 h long. */
export function nextMidnight(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** Local midnight of a `YYYY-MM-DD` date, `plus` days later. */
export function dateOf(day: string, plus = 0): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d + plus);
}

export const nextDay = (day: string) => dayKey(dateOf(day, 1).getTime());
