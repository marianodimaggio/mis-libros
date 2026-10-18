import Papa from 'papaparse';
import { cleanIsbn, cleanTitle, extractSeries, normalizeDate, toIntOrNull } from './normalize';
import type { BookDraft, Format, Status } from './types';

export const REQUIRED_COLUMNS = [
  'Book Id',
  'Title',
  'Author',
  'Additional Authors',
  'ISBN',
  'ISBN13',
  'My Rating',
  'Publisher',
  'Binding',
  'Number of Pages',
  'Year Published',
  'Original Publication Year',
  'Date Read',
  'Date Added',
  'Bookshelves',
  'Exclusive Shelf',
  'My Review',
  'Private Notes',
  'Read Count',
  'Owned Copies'
] as const;

export type GoodreadsRow = Record<(typeof REQUIRED_COLUMNS)[number], string> & Record<string, string>;

export interface ParsedCsv {
  rows: GoodreadsRow[];
  missingColumns: string[];
  parseErrors: string[];
}

export function parseGoodreadsCsv(text: string): ParsedCsv {
  const result = Papa.parse<GoodreadsRow>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy'
  });
  const fields = result.meta.fields ?? [];
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !fields.includes(c));
  const parseErrors = result.errors.map((e) => `Fila ${(e.row ?? 0) + 2}: ${e.message}`);
  return { rows: result.data, missingColumns, parseErrors };
}

export function shelfToStatus(shelf: string): Status | null {
  switch (shelf.trim()) {
    case 'read':
      return 'read';
    case 'to-read':
      return 'to-read';
    case 'currently-reading':
      return 'reading';
    default:
      return null;
  }
}

export function bindingToFormat(binding: string | null): Format | null {
  if (!binding) return null;
  const b = binding.toLowerCase();
  if (/kindle|ebook|e-book|digital|nook/.test(b)) return 'digital';
  if (/audio/.test(b)) return 'audio';
  if (/unknown/.test(b)) return null;
  return 'print';
}

const COMIC_PATTERN = /\b(comics?|c[oó]mics?|manga|graphic[ -]novels?|novelas?[ -]gr[aá]ficas?|historietas?)\b/i;

/** Solo clasificación explícita (estantes o encuadernación). El título no cuenta. */
export function explicitComicClassification(row: GoodreadsRow): string | null {
  const shelves = row['Bookshelves'] ?? '';
  const binding = row['Binding'] ?? '';
  const shelfHit = shelves.split(',').map((s) => s.trim()).find((s) => COMIC_PATTERN.test(s.replace(/-/g, ' ')));
  if (shelfHit) return `estante "${shelfHit}"`;
  if (COMIC_PATTERN.test(binding)) return `encuadernación "${binding}"`;
  return null;
}

/**
 * Editoriales dedicadas a historieta o manga. Es una señal, no una clasificación:
 * los libros se importan igual y quedan en revisión.
 */
const COMIC_PUBLISHERS =
  /\b(image comics|dc comics|vertigo|marvel|dark horse|ivrea|norma editorial|ovni press|ecc|panini|planeta c[oó]mic|gl[eé]nat|utop[ií]a editorial|tokyopop|viz media|shueisha|kodansha|valiant|boom!?box|boom! studios|la c[uú]pula|comic\.ar|entelequia|amigo comics|elex media|idw)\b/i;

export function comicPublisherSignal(publisher: string | null | undefined): string | null {
  if (!publisher) return null;
  const m = publisher.match(COMIC_PUBLISHERS);
  return m ? m[0] : null;
}

export interface RowValidation {
  ok: boolean;
  reasons: string[];
}

export function validateRow(row: GoodreadsRow): RowValidation {
  const reasons: string[] = [];
  if (!row['Book Id']?.trim()) reasons.push('Falta Book Id');
  if (!row['Title']?.trim()) reasons.push('Falta el título');
  if (!row['Author']?.trim()) reasons.push('Falta el autor');
  if (!shelfToStatus(row['Exclusive Shelf'] ?? '')) reasons.push(`Estante exclusivo desconocido: "${row['Exclusive Shelf']}"`);
  return { ok: reasons.length === 0, reasons };
}

/** Lectura registrada en un libro marcado como "to-read". */
export function readingInconsistency(row: GoodreadsRow): string | null {
  if (row['Exclusive Shelf'] !== 'to-read') return null;
  const count = toIntOrNull(row['Read Count']) ?? 0;
  const date = normalizeDate(row['Date Read']);
  if (count > 0 && date) return `Figura como "Por leer", pero tiene ${count} lectura y fecha de lectura ${date}.`;
  if (count > 0) return `Figura como "Por leer", pero tiene ${count} lectura registrada.`;
  if (date) return `Figura como "Por leer", pero tiene fecha de lectura ${date}.`;
  return null;
}

export function rowLabel(row: GoodreadsRow): string {
  return `${cleanTitle(row['Title'] ?? '')} — ${(row['Author'] ?? '').replace(/\s+/g, ' ').trim()}`;
}

/** Convierte una fila en borrador. Owned Copies se ignora a propósito: no refleja la propiedad real. */
export function rowToDraft(row: GoodreadsRow, shelf: 'library' | 'wishlist', now: string): BookDraft {
  const status = shelfToStatus(row['Exclusive Shelf']) ?? 'to-read';
  const ref = `goodreads:${row['Book Id']}`;
  const rating = toIntOrNull(row['My Rating']);
  const binding = row['Binding']?.trim() || null;
  const notes = row['Private Notes']?.trim() || null;
  const review = row['My Review']?.trim() || null;
  const additional = (row['Additional Authors'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const draft: BookDraft = {
    goodreadsBookId: row['Book Id'].trim(),
    title: cleanTitle(row['Title']),
    author: row['Author'].replace(/\s+/g, ' ').trim(),
    additionalAuthors: additional,
    isbn10: cleanIsbn(row['ISBN']),
    isbn13: cleanIsbn(row['ISBN13']),
    publisher: row['Publisher']?.trim() || null,
    binding,
    format: bindingToFormat(binding),
    pageCount: toIntOrNull(row['Number of Pages']),
    yearPublished: toIntOrNull(row['Year Published']),
    originalPublicationYear: toIntOrNull(row['Original Publication Year']),
    status,
    rating: rating && rating > 0 ? rating : null,
    dateRead: normalizeDate(row['Date Read']),
    dateAdded: normalizeDate(row['Date Added']),
    readCount: toIntOrNull(row['Read Count']) ?? 0,
    owned: null,
    location: null,
    categories: [],
    series: extractSeries(row['Title']),
    coverUrl: null,
    coverSource: null,
    notes,
    review,
    shelf,
    source: 'goodreads',
    seedKey: null,
    provenance: {}
  };
  for (const [k, v] of Object.entries(draft)) {
    if (k === 'provenance' || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    draft.provenance[k] = { source: 'goodreads', ref, at: now };
  }
  return draft;
}
