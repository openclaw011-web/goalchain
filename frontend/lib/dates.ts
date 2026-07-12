const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseISODate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ISO date: ${value}`);
  return date;
}

export function formatShortDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? parseISODate(value) : value;
  const month = MONTHS[date.getMonth()] ?? '';
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month} ${day}, ${hours}:${minutes}`;
}

export function formatShortDate(value: string | Date): string {
  const date = typeof value === 'string' ? parseISODate(value) : value;
  const month = MONTHS[date.getMonth()] ?? '';
  return `${month} ${date.getDate()}`;
}

export function formatDistanceToNow(value: string | Date, opts: { addSuffix?: boolean } = {}): string {
  const target = typeof value === 'string' ? parseISODate(value) : value;
  const diffMs = target.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const units: Array<[string, number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  const [unit, size] = units.find(([, ms]) => absMs >= ms) ?? ['minute', 60_000];
  const count = Math.max(1, Math.round(absMs / size));
  const phrase = `${count} ${unit}${count === 1 ? '' : 's'}`;
  if (!opts.addSuffix) return phrase;
  return diffMs >= 0 ? `in ${phrase}` : `${phrase} ago`;
}
