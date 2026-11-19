import type { BucketItem } from '../types';

export type BucketFilter = 'all' | 'open' | 'done';

export interface BucketSummary {
  total: number;
  done: number;
  open: number;
  percent: number;
}

export function summarizeBucket(items: Pick<BucketItem, 'completed_at'>[]): BucketSummary {
  const total = items.length;
  const done = items.filter((item) => item.completed_at !== null).length;
  return {
    total,
    done,
    open: total - done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/** Open items first, newest first; then done items, most recently ticked off first. */
export function sortBucket(items: BucketItem[]): BucketItem[] {
  const open = items
    .filter((item) => item.completed_at === null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const done = items
    .filter((item) => item.completed_at !== null)
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
  return [...open, ...done];
}

export function filterBucket(items: BucketItem[], filter: BucketFilter): BucketItem[] {
  if (filter === 'open') return items.filter((item) => item.completed_at === null);
  if (filter === 'done') return items.filter((item) => item.completed_at !== null);
  return items;
}
