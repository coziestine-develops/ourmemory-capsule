import { describe, expect, it } from 'vitest';
import { filterBucket, sortBucket, summarizeBucket } from '../src/lib/bucket';
import { summarizeReactions } from '../src/lib/reactions';
import type { BucketItem } from '../src/types';

function item(overrides: Partial<BucketItem> & { id: string }): BucketItem {
  return {
    relationship_id: 'r1',
    created_by: 'u1',
    title: overrides.id,
    notes: null,
    category: 'Dream',
    completed_at: null,
    completed_by: null,
    completed_memory_id: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('bucket list helpers', () => {
  const items = [
    item({ id: 'old-open', created_at: '2025-01-01T00:00:00Z' }),
    item({ id: 'new-open', created_at: '2025-03-01T00:00:00Z' }),
    item({ id: 'done-early', created_at: '2025-01-05T00:00:00Z', completed_at: '2025-02-01T00:00:00Z' }),
    item({ id: 'done-late', created_at: '2025-01-06T00:00:00Z', completed_at: '2025-04-01T00:00:00Z' }),
  ];

  it('summarizes progress and rounds the percentage', () => {
    expect(summarizeBucket(items)).toEqual({ total: 4, done: 2, open: 2, percent: 50 });
    expect(summarizeBucket([item({ id: 'a', completed_at: 'x' }), item({ id: 'b' }), item({ id: 'c' })])).toMatchObject({ percent: 33 });
    expect(summarizeBucket([])).toEqual({ total: 0, done: 0, open: 0, percent: 0 });
  });

  it('puts open items first (newest first), then done items (most recently ticked first)', () => {
    expect(sortBucket(items).map((i) => i.id)).toEqual(['new-open', 'old-open', 'done-late', 'done-early']);
  });

  it('filters to open or done items', () => {
    expect(filterBucket(items, 'open').map((i) => i.id)).toEqual(['old-open', 'new-open']);
    expect(filterBucket(items, 'done').map((i) => i.id)).toEqual(['done-early', 'done-late']);
    expect(filterBucket(items, 'all')).toHaveLength(4);
  });
});

describe('summarizeReactions', () => {
  const rows = [
    { user_id: 'me', reaction: 'love' as const },
    { user_id: 'them', reaction: 'love' as const },
    { user_id: 'them', reaction: 'laugh' as const },
  ];

  it('counts each reaction and flags the ones the current person added', () => {
    const summary = summarizeReactions(rows, 'me');
    const love = summary.find((s) => s.key === 'love');
    const laugh = summary.find((s) => s.key === 'laugh');
    const fire = summary.find((s) => s.key === 'fire');
    expect(love).toMatchObject({ count: 2, mine: true, emoji: '💕' });
    expect(laugh).toMatchObject({ count: 1, mine: false });
    expect(fire).toMatchObject({ count: 0, mine: false });
    expect(summary).toHaveLength(6);
  });

  it('shows nothing selected when the current person has not reacted', () => {
    expect(summarizeReactions(rows, 'stranger').every((s) => !s.mine)).toBe(true);
  });
});
