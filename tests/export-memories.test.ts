import { describe, expect, it } from 'vitest';
import { buildMemoriesPdf, toPdfText } from '../src/lib/exportMemories';
import type { Memory } from '../src/types';

const memory: Memory = {
  id: 'm1',
  relationship_id: 'r1',
  created_by: 'u1',
  title: 'First trip \u2014 the beach',
  description: 'Sunset at the bay. Emoji check \uD83D\uDC95 done.',
  memory_date: '2025-03-01',
  memory_time: '18:30:00',
  location: 'Batangas',
  category: 'Travel',
  mood: 'Happy',
  is_favorite: true,
  created_at: '2025-03-02T00:00:00Z',
  updated_at: '2025-03-02T00:00:00Z',
  memory_media: [
    {
      id: 'x1', memory_id: 'm1', storage_path: 'secret/path.jpg', media_type: 'image',
      original_filename: 'beach.jpg', file_size: 1234, mime_type: 'image/jpeg', display_order: 0, is_cover: true,
    },
  ],
};

describe('toPdfText', () => {
  it('keeps common punctuation and drops emoji', () => {
    expect(toPdfText('a \u2014 b \u201Cq\u201D \u00B7 \uD83D\uDC95')).toBe('a \u2014 b "q" \u00B7');
  });
});

describe('buildMemoriesPdf', () => {
  it('produces a PDF document', () => {
    const doc = buildMemoriesPdf([memory], 'Sam & Alex', new Date('2025-04-01T00:00:00Z'));
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    const header = String.fromCharCode(...bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('writes the memory text and never embeds media paths', () => {
    const doc = buildMemoriesPdf([memory], 'Sam & Alex');
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    const raw = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    expect(raw).toContain('First trip');
    expect(raw).toContain('Batangas');
    expect(raw).toContain('Sunset at the bay');
    expect(raw).toContain('Favorite');
    expect(raw).not.toContain('secret/path.jpg');
    expect(raw).not.toContain('beach.jpg');
  });

  it('still produces a valid PDF for an empty space', () => {
    const doc = buildMemoriesPdf([], 'Empty');
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(0);
  });

  it('adds pages when the content is long', () => {
    const long = { ...memory, description: 'Lorem ipsum dolor sit amet. '.repeat(400) };
    const many = Array.from({ length: 10 }, (_, i) => ({ ...long, id: `m${i}` }));
    const doc = buildMemoriesPdf(many, 'Long');
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});
