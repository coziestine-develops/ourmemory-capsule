export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Local calendar date as yyyy-mm-dd. */
export function isoDate(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

/** Next date an event happens on. Recurring events repeat every year. */
export function nextOccurrence(eventDate: string, recurring: boolean, today: Date = new Date()): Date {
  const base = parseIsoDate(eventDate);
  const t = startOfDay(today);
  if (!recurring) return base;
  let next = new Date(t.getFullYear(), base.getMonth(), base.getDate());
  if (next < t) next = new Date(t.getFullYear() + 1, base.getMonth(), base.getDate());
  return next;
}

export function daysUntil(d: Date, today: Date = new Date()): number {
  return Math.round((startOfDay(d).getTime() - startOfDay(today).getTime()) / 86_400_000);
}

export function occursOn(eventDate: string, recurring: boolean, day: Date): boolean {
  const base = parseIsoDate(eventDate);
  if (recurring) return base.getMonth() === day.getMonth() && base.getDate() === day.getDate();
  return isoDate(base) === isoDate(day);
}
