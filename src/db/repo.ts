import { COMIC_EXCLUDED, type ImportPlan } from '../lib/importPlan';
import { findMatch } from '../lib/match';
import { createBook, isEmpty, mergeInto } from '../lib/merge';
import { normalizeAuthor, normalizeTitle } from '../lib/normalize';
import type { Book, BookDraft, Category, Format, Location, ReviewItem, Status } from '../lib/types';
import type { LibraryDB } from './db';

const nowIso = () => new Date().toISOString();

/* ---------- Meta ---------- */

export async function getMeta<T>(db: LibraryDB, key: string, fallback: T): Promise<T> {
  const entry = await db.meta.get(key);
  return entry ? (entry.value as T) : fallback;
}

export async function setMeta(db: LibraryDB, key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/* ---------- Importación ---------- */

export interface ApplyResult {
  created: number;
  updated: number;
  reviews: number;
}

export async function applyImportPlan(db: LibraryDB, plan: ImportPlan): Promise<ApplyResult> {
  return db.transaction('rw', db.books, db.reviews, db.meta, async () => {
    await db.books.bulkPut(plan.creates);
    await db.books.bulkPut(plan.updates.map((u) => u.after));
    const existingKeys = new Set((await db.reviews.toArray()).map((r) => r.key));
    const fresh = plan.reviews.filter((r) => !existingKeys.has(r.key));
    await db.reviews.bulkAdd(fresh);
    await db.meta.put({ key: 'lastImportAt', value: nowIso() });
    return { created: plan.creates.length, updated: plan.updates.length, reviews: fresh.length };
  });
}

/* ---------- Libros ---------- */

export function emptyDraft(source: Book['source'] = 'manual'): BookDraft {
  return {
    goodreadsBookId: null,
    title: '',
    author: '',
    additionalAuthors: [],
    isbn10: null,
    isbn13: null,
    publisher: null,
    binding: null,
    format: null,
    pageCount: null,
    yearPublished: null,
    originalPublicationYear: null,
    status: 'to-read',
    rating: null,
    dateRead: null,
    dateAdded: new Date().toISOString().slice(0, 10),
    readCount: 0,
    owned: null,
    location: null,
    categories: [],
    series: null,
    coverUrl: null,
    coverSource: null,
    notes: null,
    review: null,
    shelf: 'library',
    source,
    seedKey: null,
    provenance: {}
  };
}

/** Devuelve el libro existente que coincidiría, para avisar antes de crear un duplicado. */
export async function findDuplicate(db: LibraryDB, draft: BookDraft): Promise<Book | null> {
  const m = findMatch(draft, await db.books.toArray());
  if (m.kind === 'match') return m.book;
  if (m.kind === 'ambiguous') return m.candidates[0] ?? null;
  return null;
}

export async function addBook(db: LibraryDB, draft: BookDraft): Promise<Book> {
  const book = createBook({ ...draft, source: draft.source ?? 'manual' }, nowIso());
  await db.books.add(book);
  return book;
}

/** Edición del usuario: cada campo modificado queda registrado como carga manual. */
export async function updateBook(db: LibraryDB, id: string, patch: Partial<Book>): Promise<Book> {
  return db.transaction('rw', db.books, async () => {
    const current = await db.books.get(id);
    if (!current) throw new Error('El libro ya no existe.');
    const at = nowIso();
    const next: Book = { ...current, ...patch, provenance: { ...current.provenance } };
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'provenance') continue;
      if (JSON.stringify(v) !== JSON.stringify(current[k as keyof Book])) {
        next.provenance[k] = { source: 'manual', at };
      }
    }
    next.normalizedTitle = normalizeTitle(next.title);
    next.normalizedAuthor = normalizeAuthor(next.author);
    next.updatedAt = at;
    await db.books.put(next);
    return next;
  });
}

export interface BulkPatch {
  status?: Status;
  owned?: boolean | null;
  location?: string | null;
  format?: Format | null;
  shelf?: Book['shelf'];
  categories?: { mode: 'add' | 'remove' | 'replace'; ids: string[] };
}

/** Edición en lote sin límite de cantidad. */
export async function bulkUpdate(db: LibraryDB, ids: string[], patch: BulkPatch): Promise<number> {
  return db.transaction('rw', db.books, async () => {
    const books = (await db.books.bulkGet(ids)).filter((b): b is Book => Boolean(b));
    const at = nowIso();
    const updated = books.map((b) => {
      const next: Book = { ...b, provenance: { ...b.provenance } };
      const touch = <K extends keyof Book>(field: K, value: Book[K]) => {
        if (JSON.stringify(next[field]) === JSON.stringify(value)) return;
        next[field] = value;
        next.provenance[field] = { source: 'manual', at, note: 'Edición múltiple' };
      };
      if (patch.status !== undefined) touch('status', patch.status);
      if (patch.owned !== undefined) touch('owned', patch.owned);
      if (patch.location !== undefined) touch('location', patch.location);
      if (patch.format !== undefined) touch('format', patch.format);
      if (patch.shelf !== undefined) touch('shelf', patch.shelf);
      if (patch.categories) {
        const { mode, ids: cats } = patch.categories;
        const value =
          mode === 'replace'
            ? [...cats]
            : mode === 'add'
              ? Array.from(new Set([...b.categories, ...cats]))
              : b.categories.filter((c) => !cats.includes(c));
        touch('categories', value);
      }
      next.updatedAt = at;
      return next;
    });
    await db.books.bulkPut(updated);
    return updated.length;
  });
}

export async function deleteBook(db: LibraryDB, id: string): Promise<void> {
  await db.transaction('rw', db.books, db.reviews, async () => {
    await db.books.delete(id);
    await db.reviews
      .where('status')
      .equals('open')
      .filter((r) => r.bookId === id)
      .modify({ status: 'dismissed', resolvedAt: nowIso(), resolution: 'Libro eliminado' });
  });
}

/* ---------- Ubicaciones y categorías ---------- */

type Named = Location | Category;

async function createNamed(table: LibraryDB['locations'] | LibraryDB['categories'], name: string): Promise<Named> {
  const clean = name.trim();
  if (!clean) throw new Error('El nombre no puede quedar vacío.');
  const all: Named[] = await table.toArray();
  if (all.some((x) => x.name.toLowerCase() === clean.toLowerCase())) throw new Error(`Ya existe "${clean}".`);
  const item = { id: crypto.randomUUID(), name: clean, order: all.length };
  await table.add(item);
  return item;
}

async function renameNamed(table: LibraryDB['locations'] | LibraryDB['categories'], id: string, name: string) {
  const clean = name.trim();
  if (!clean) throw new Error('El nombre no puede quedar vacío.');
  const all: Named[] = await table.toArray();
  if (all.some((x) => x.id !== id && x.name.toLowerCase() === clean.toLowerCase())) throw new Error(`Ya existe "${clean}".`);
  await table.update(id, { name: clean });
}

export const createLocation = (db: LibraryDB, name: string) => createNamed(db.locations, name);
export const renameLocation = (db: LibraryDB, id: string, name: string) => renameNamed(db.locations, id, name);
export const createCategory = (db: LibraryDB, name: string) => createNamed(db.categories, name);
export const renameCategory = (db: LibraryDB, id: string, name: string) => renameNamed(db.categories, id, name);

export async function deleteLocation(db: LibraryDB, id: string): Promise<number> {
  return db.transaction('rw', db.books, db.locations, async () => {
    const n = await db.books.where('location').equals(id).modify({ location: null });
    await db.locations.delete(id);
    return n;
  });
}

export async function deleteCategory(db: LibraryDB, id: string): Promise<number> {
  return db.transaction('rw', db.books, db.categories, async () => {
    const n = await db.books
      .where('categories')
      .equals(id)
      .modify((b: Book) => {
        b.categories = b.categories.filter((c) => c !== id);
      });
    await db.categories.delete(id);
    return n;
  });
}

/* ---------- Bandeja de revisión ---------- */

export type ReviewAction =
  | 'import-read'
  | 'import-wishlist'
  | 'import'
  | 'create'
  | 'accept'
  | 'link'
  | 'link-with-edition'
  | 'merge'
  | 'keep'
  | 'exclude'
  | 'restore'
  | 'dismiss';

export const REVIEW_ACTION_LABEL: Record<ReviewAction, string> = {
  'import-read': 'Importar como leído',
  'import-wishlist': 'Pasar a la lista de Goodreads',
  import: 'Importar igualmente',
  create: 'Crear como libro nuevo',
  accept: 'Usar esta edición',
  link: 'Vincular sin datos de edición',
  'link-with-edition': 'Vincular y usar su edición',
  merge: 'Combinar',
  keep: 'Mantener en el catálogo',
  exclude: 'Excluir del catálogo',
  restore: 'Restaurar',
  dismiss: 'Descartar'
};

export function actionsFor(r: ReviewItem): ReviewAction[] {
  if (r.kind === 'comic' && r.status === 'resolved' && r.resolution === COMIC_EXCLUDED && r.candidate) return ['import'];
  if (r.status !== 'open') return r.kind === 'possible-comic' && r.snapshot ? ['restore'] : [];
  switch (r.kind) {
    case 'inconsistency':
      return ['import-read', 'import-wishlist', 'dismiss'];
    case 'comic':
      return ['import', 'dismiss'];
    case 'possible-comic':
      return ['keep', 'exclude'];
    case 'edition-proposal':
      return ['accept', 'dismiss'];
    case 'possible-match':
      return r.candidate ? ['link', 'link-with-edition', 'dismiss'] : ['merge', 'dismiss'];
    case 'ambiguous':
      return ['create', 'dismiss'];
  }
}

async function upsertDraft(db: LibraryDB, draft: BookDraft): Promise<Book> {
  const existing = await db.books.toArray();
  const m = findMatch(draft, existing);
  if (m.kind === 'match') {
    const out = mergeInto(m.book, draft, { now: nowIso(), acceptEdition: m.type !== 'title-author' });
    await db.books.put(out.book);
    return out.book;
  }
  const book = createBook(draft, nowIso());
  await db.books.add(book);
  return book;
}

export async function resolveReview(db: LibraryDB, reviewId: string, action: ReviewAction): Promise<void> {
  await db.transaction('rw', db.books, db.reviews, async () => {
    const r = await db.reviews.get(reviewId);
    if (!r) return;
    const at = nowIso();
    let resolution: string = REVIEW_ACTION_LABEL[action];
    let status: ReviewItem['status'] = action === 'dismiss' ? 'dismissed' : 'resolved';
    const patchReview: Partial<ReviewItem> = {};

    switch (action) {
      case 'import-read': {
        if (!r.candidate) break;
        const draft: BookDraft = {
          ...r.candidate,
          status: 'read',
          shelf: 'library',
          provenance: { ...r.candidate.provenance, status: { source: 'manual', at, note: 'Confirmado en revisión' } }
        };
        await upsertDraft(db, draft);
        break;
      }
      case 'import-wishlist':
        if (r.candidate) await upsertDraft(db, { ...r.candidate, status: 'to-read', shelf: 'wishlist' });
        break;
      case 'import':
      case 'create':
        if (r.candidate) await upsertDraft(db, r.candidate);
        break;
      case 'accept': {
        const book = r.bookId ? await db.books.get(r.bookId) : undefined;
        if (!book || !r.proposal) break;
        const next: Book = { ...book, provenance: { ...book.provenance }, updatedAt: at };
        for (const [k, v] of Object.entries(r.proposal)) {
          // Lo que cargaste a mano desde tu ejemplar prevalece sobre la propuesta de Goodreads.
          if (isEmpty(v) || book.provenance[k]?.source === 'manual') continue;
          (next as unknown as Record<string, unknown>)[k] = v;
          next.provenance[k] = { source: 'goodreads', at, note: 'Edición confirmada en revisión' };
        }
        await db.books.put(next);
        break;
      }
      case 'link':
      case 'link-with-edition': {
        const book = r.bookId ? await db.books.get(r.bookId) : undefined;
        if (!book || !r.candidate) break;
        const out = mergeInto(book, r.candidate, { now: at, acceptEdition: action === 'link-with-edition' });
        await db.books.put(out.book);
        break;
      }
      case 'merge': {
        const from = r.bookId ? await db.books.get(r.bookId) : undefined;
        const intoId = r.proposal?.id;
        const into = intoId ? await db.books.get(intoId) : undefined;
        if (!from || !into) break;
        const { id: _id, createdAt: _c, updatedAt: _u, normalizedTitle: _t, normalizedAuthor: _a, ...draft } = from;
        const out = mergeInto(into, draft, { now: at, acceptEdition: true });
        await db.books.put(out.book);
        await db.books.delete(from.id);
        break;
      }
      case 'exclude': {
        const book = r.bookId ? await db.books.get(r.bookId) : undefined;
        if (book) {
          patchReview.snapshot = book;
          await db.books.delete(book.id);
        }
        resolution = 'Excluido del catálogo';
        break;
      }
      case 'restore': {
        if (r.snapshot) await db.books.put({ ...r.snapshot, updatedAt: at });
        status = 'open';
        patchReview.snapshot = null;
        break;
      }
      case 'keep':
      case 'dismiss':
        break;
    }

    await db.reviews.update(r.id, {
      ...patchReview,
      status,
      resolvedAt: status === 'open' ? null : at,
      resolution: status === 'open' ? null : resolution
    });
  });
}

/* ---------- Respaldo ---------- */

export interface BackupFile {
  app: 'mis-libros';
  schemaVersion: number;
  exportedAt: string;
  books: Book[];
  reviews: ReviewItem[];
  locations: Location[];
  categories: Category[];
  meta: { key: string; value: unknown }[];
}

export async function createBackup(db: LibraryDB, schemaVersion: number): Promise<BackupFile> {
  return db.transaction('r', [db.books, db.reviews, db.locations, db.categories, db.meta], async () => ({
    app: 'mis-libros' as const,
    schemaVersion,
    exportedAt: nowIso(),
    books: await db.books.toArray(),
    reviews: await db.reviews.toArray(),
    locations: await db.locations.toArray(),
    categories: await db.categories.toArray(),
    meta: (await db.meta.toArray()).filter((m) => m.key !== 'lastBackupAt')
  }));
}

export function validateBackup(data: unknown, maxSchema: number): BackupFile {
  if (typeof data !== 'object' || data === null) throw new Error('El archivo no contiene un respaldo válido.');
  const d = data as Partial<BackupFile>;
  if (d.app !== 'mis-libros') throw new Error('El archivo no es un respaldo de Mi biblioteca.');
  if (typeof d.schemaVersion !== 'number' || d.schemaVersion > maxSchema)
    throw new Error('El respaldo proviene de una versión más nueva de la aplicación.');
  for (const key of ['books', 'reviews', 'locations', 'categories', 'meta'] as const) {
    if (!Array.isArray(d[key])) throw new Error(`Al respaldo le falta la sección "${key}".`);
  }
  const bad = d.books!.find((b) => !b || typeof b.id !== 'string' || typeof b.title !== 'string' || typeof b.author !== 'string');
  if (bad) throw new Error('Hay libros sin id, título o autor en el respaldo.');
  return d as BackupFile;
}

/** Reemplaza todos los datos por los del respaldo, en una sola transacción. */
export async function restoreBackup(db: LibraryDB, backup: BackupFile): Promise<void> {
  await db.transaction('rw', [db.books, db.reviews, db.locations, db.categories, db.meta], async () => {
    await Promise.all([db.books.clear(), db.reviews.clear(), db.locations.clear(), db.categories.clear()]);
    const lastBackup = await db.meta.get('lastBackupAt');
    await db.meta.clear();
    await db.books.bulkAdd(
      backup.books.map((b) => ({
        ...b,
        shelf: b.shelf ?? 'library',
        seedKey: b.seedKey ?? null,
        format: b.format ?? null,
        review: b.review ?? null,
        normalizedTitle: normalizeTitle(b.title),
        normalizedAuthor: normalizeAuthor(b.author)
      }))
    );
    await db.reviews.bulkAdd(backup.reviews);
    await db.locations.bulkAdd(backup.locations);
    await db.categories.bulkAdd(backup.categories);
    await db.meta.bulkPut(backup.meta);
    if (lastBackup) await db.meta.put(lastBackup);
  });
}
