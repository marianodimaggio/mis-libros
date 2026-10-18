import { normalizeAuthor, normalizeTitle } from './normalize';
import type { Book, BookDraft, FieldOrigin, Source, Status } from './types';

/** Datos propios de una edición concreta. No se copian si la edición no está confirmada. */
export const EDITION_FIELDS = [
  'isbn10',
  'isbn13',
  'publisher',
  'binding',
  'pageCount',
  'yearPublished',
  'additionalAuthors'
] as const satisfies readonly (keyof Book)[];

/** Datos que solo se completan si están vacíos. */
const FILL_FIELDS = [
  'goodreadsBookId',
  'originalPublicationYear',
  'series',
  'rating',
  'dateRead',
  'dateAdded',
  'review',
  'coverUrl',
  'coverSource'
] as const satisfies readonly (keyof Book)[];

/** Datos físicos: decide la fuente con más autoridad. */
const AUTHORITY_FIELDS = ['owned', 'location', 'format'] as const satisfies readonly (keyof Book)[];

const AUTHORITY: Record<Source, number> = { photo: 3, manual: 3, goodreads: 1 };
const STATUS_RANK: Record<Status, number> = { 'to-read': 1, reading: 2, read: 3 };

export function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createBook(draft: BookDraft, now: string, id: string = crypto.randomUUID()): Book {
  const provenance: Record<string, FieldOrigin> = { ...draft.provenance };
  for (const [k, v] of Object.entries(draft)) {
    if (k === 'provenance' || isEmpty(v) || provenance[k]) continue;
    provenance[k] = { source: draft.source, at: now };
  }
  return {
    ...draft,
    id,
    normalizedTitle: normalizeTitle(draft.title),
    normalizedAuthor: normalizeAuthor(draft.author),
    provenance,
    createdAt: now,
    updatedAt: now
  };
}

export interface MergeOutcome {
  book: Book;
  changed: string[];
  /** Campos de edición que no se aplicaron y requieren confirmación. */
  editionProposal: Partial<Book> | null;
  /** Diferencias que se conservaron del registro base. */
  conflicts: string[];
}

export interface MergeOptions {
  now: string;
  /** false cuando la coincidencia fue por título+autor contra una lista de interés. */
  acceptEdition: boolean;
}

/**
 * Combina `incoming` dentro de `base` sin borrar datos existentes.
 * Reglas: las ediciones manuales nunca se pisan con importaciones; fotografía y carga manual
 * prevalecen para propiedad, ubicación y formato; "Leído" prevalece sobre "Por leer";
 * el resto solo completa campos vacíos.
 */
export function mergeInto(base: Book, incoming: BookDraft, opts: MergeOptions): MergeOutcome {
  const next: Book = { ...base, provenance: { ...base.provenance } };
  const changed: string[] = [];
  const conflicts: string[] = [];
  const proposal: Partial<Book> = {};

  const originOf = (field: string): FieldOrigin =>
    incoming.provenance[field] ?? { source: incoming.source, at: opts.now };
  const lockedByUser = (field: string): boolean =>
    base.provenance[field]?.source === 'manual' && incoming.source !== 'manual';

  const set = <K extends keyof Book>(field: K, value: Book[K]) => {
    next[field] = value;
    next.provenance[field] = originOf(field);
    changed.push(field);
  };

  for (const field of AUTHORITY_FIELDS) {
    const value = incoming[field];
    if (isEmpty(value) || same(value, base[field]) || lockedByUser(field)) continue;
    const baseSource = base.provenance[field]?.source ?? base.source;
    if (isEmpty(base[field]) || AUTHORITY[incoming.source] >= AUTHORITY[baseSource]) {
      set(field, value as never);
    } else {
      conflicts.push(field);
    }
  }

  if (!lockedByUser('status') && STATUS_RANK[incoming.status] > STATUS_RANK[base.status]) {
    set('status', incoming.status);
  }

  if (incoming.shelf === 'library' && base.shelf === 'wishlist') set('shelf', 'library');

  if (incoming.readCount > base.readCount && !lockedByUser('readCount')) set('readCount', incoming.readCount);

  for (const field of FILL_FIELDS) {
    const value = incoming[field];
    if (isEmpty(value) || lockedByUser(field)) continue;
    if (isEmpty(base[field])) set(field, value as never);
    else if (!same(value, base[field])) conflicts.push(field);
  }

  for (const field of EDITION_FIELDS) {
    const value = incoming[field];
    if (isEmpty(value) || lockedByUser(field)) continue;
    if (!isEmpty(base[field])) {
      if (!same(value, base[field])) conflicts.push(field);
      continue;
    }
    if (opts.acceptEdition) set(field, value as never);
    else (proposal as Record<string, unknown>)[field] = value;
  }

  const mergedCategories = Array.from(new Set([...base.categories, ...incoming.categories]));
  if (mergedCategories.length !== base.categories.length) set('categories', mergedCategories);

  if (incoming.notes && incoming.notes !== base.notes && !base.notes?.includes(incoming.notes)) {
    set('notes', base.notes ? `${base.notes}\n\n${incoming.notes}` : incoming.notes);
  }

  if (incoming.seedKey && !base.seedKey) {
    next.seedKey = incoming.seedKey;
  }

  if (changed.length > 0 || next.seedKey !== base.seedKey) next.updatedAt = opts.now;

  return {
    book: next,
    changed,
    editionProposal: Object.keys(proposal).length > 0 ? proposal : null,
    conflicts
  };
}
