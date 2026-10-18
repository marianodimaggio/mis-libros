import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseGoodreadsCsv, type GoodreadsRow } from '../../src/lib/goodreads';
import { createBook } from '../../src/lib/merge';
import type { Book, BookDraft } from '../../src/lib/types';
import { emptyDraft } from '../../src/db/repo';

export const NOW = '2026-10-15T12:00:00.000Z';
export const CSV_PATH = fileURLToPath(new URL('../fixtures/goodreads_library_export.csv', import.meta.url));
export const hasRealCsv = existsSync(CSV_PATH);

export function realRows(): GoodreadsRow[] {
  return parseGoodreadsCsv(readFileSync(CSV_PATH, 'utf8')).rows;
}

let n = 0;
export const seqId = () => `id-${++n}`;

export function draft(p: Partial<BookDraft>): BookDraft {
  return { ...emptyDraft('goodreads'), dateAdded: null, ...p };
}

export function book(p: Partial<BookDraft>): Book {
  return createBook(draft(p), NOW, seqId());
}

const HEADER =
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies';

export function csv(lines: string[]): string {
  return [HEADER, ...lines].join('\n');
}

/** Fila mínima: id, título, autor, isbn13, estante, extras. */
export function line(id: string, title: string, author: string, isbn13: string, shelf: string, o: { shelves?: string; readCount?: number; dateRead?: string; publisher?: string } = {}): string {
  const isbn = isbn13 ? `"=""${isbn13}"""` : '"="""""';
  return [id, `"${title}"`, `"${author}"`, '""', '""', '"="""""', isbn, '0', `"${o.publisher ?? ''}"`, 'Paperback', '200', '2020', '2019', o.dateRead ?? '', '2024/01/01', `"${o.shelves ?? ''}"`, '""', shelf, '""', '', '""', String(o.readCount ?? (shelf === 'read' ? 1 : 0)), '0'].join(',');
}
