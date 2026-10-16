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

export function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return dayKey(new Date(y, m - 1, d + 1).getTime());
}
