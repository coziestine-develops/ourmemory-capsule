import { jsPDF } from 'jspdf';
import type { Memory } from '../types';
import { formatDate } from './format';

const MARGIN = 56;
const TITLE_SIZE = 20;
const HEADING_SIZE = 14;
const BODY_SIZE = 11;
const META_SIZE = 9.5;

/**
 * jsPDF's built-in fonts only cover Latin characters. Keep the common typographic
 * punctuation, drop anything else (emoji, for example) so it can't print as garbage.
 */
export function toPdfText(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u00B7]/g, '')
    .trim();
}

function metaLine(memory: Memory): string {
  const parts = [formatDate(memory.memory_date)];
  if (memory.memory_time) parts[0] += ` at ${memory.memory_time.slice(0, 5)}`;
  if (memory.location) parts.push(memory.location);
  parts.push(memory.category);
  if (memory.mood) parts.push(`Feeling ${memory.mood.toLowerCase()}`);
  if (memory.is_favorite) parts.push('Favorite');
  return toPdfText(parts.join('  \u00B7  '));
}

/**
 * Lays out every memory as text in a PDF: title, date and details, then the description.
 * Photos and videos are not embedded.
 */
export function buildMemoriesPdf(memories: Memory[], spaceName: string, now: Date = new Date()): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const writeParagraph = (text: string, size: number, style: 'normal' | 'bold' | 'italic', gapAfter: number) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    const lineHeight = size * 1.4;
    for (const line of doc.splitTextToSize(text, maxWidth) as string[]) {
      ensureSpace(lineHeight);
      doc.text(line, MARGIN, y);
      y += lineHeight;
    }
    y += gapAfter;
  };

  const rule = () => {
    ensureSpace(16);
    doc.setDrawColor(220, 200, 200);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 18;
  };

  writeParagraph(toPdfText(`Our memories${spaceName ? ` · ${spaceName}` : ''}`), TITLE_SIZE, 'bold', 4);
  writeParagraph(
    toPdfText(`Exported ${formatDate(now.toISOString().slice(0, 10))} · ${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}`),
    META_SIZE,
    'italic',
    14,
  );

  if (memories.length === 0) {
    writeParagraph('No memories have been added yet.', BODY_SIZE, 'italic', 0);
  }

  for (const memory of memories) {
    rule();
    writeParagraph(toPdfText(memory.title), HEADING_SIZE, 'bold', 2);
    writeParagraph(metaLine(memory), META_SIZE, 'italic', 6);
    if (memory.description) {
      writeParagraph(toPdfText(memory.description), BODY_SIZE, 'normal', 4);
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`${page} / ${pageCount}`, pageWidth / 2, pageHeight - 24, { align: 'center' });
  }

  return doc;
}

/** Triggers a browser download of the PDF. */
export function downloadMemoriesPdf(doc: jsPDF, filename: string): void {
  doc.save(filename);
}
