export function todayIso(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function daysBetween(from: string, to: Date = new Date()): number {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

export function nextAnniversary(startDate: string, today: Date = new Date()) {
  const start = new Date(`${startDate}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(t.getFullYear(), start.getMonth(), start.getDate());
  if (next < t) next = new Date(t.getFullYear() + 1, start.getMonth(), start.getDate());
  return {
    days: Math.round((next.getTime() - t.getTime()) / 86_400_000),
    years: next.getFullYear() - start.getFullYear(),
  };
}

export function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' },
): string {
  const normalized = value.length === 10 ? `${value}T00:00:00` : value;
  return new Date(normalized).toLocaleDateString(undefined, options);
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return fallback;
}
