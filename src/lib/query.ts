import { normalizeText } from './normalize';
import { paletteIndexFor } from './spine';
import { STATUS_LABEL, type Book, type Category, type Location, type Shelf, type Status } from './types';

export interface Filters {
  shelf: Shelf;
  status: Status | null;
  ownedOnly: boolean;
  location: string | null;
  category: string | null;
  missingIsbn: boolean;
}

export const DEFAULT_FILTERS: Filters = { shelf: 'library', status: null, ownedOnly: false, location: null, category: null, missingIsbn: false };

export const hasIsbn = (b: Book) => Boolean(b.isbn13 || b.isbn10);

export type SortKey = 'title' | 'author' | 'dateAdded' | 'dateRead' | 'rating' | 'color' | 'category' | 'location';
export type GroupKey = 'none' | 'status' | 'author' | 'category' | 'location';

export const SORT_LABEL: Record<SortKey, string> = {
  title: 'Título',
  author: 'Autor',
  dateAdded: 'Fecha agregada',
  dateRead: 'Fecha leída',
  rating: 'Valoración',
  color: 'Color',
  category: 'Categoría',
  location: 'Ubicación'
};

export const GROUP_LABEL: Record<GroupKey, string> = {
  none: 'Sin separar',
  status: 'Por estado',
  author: 'Por autor',
  category: 'Por categoría',
  location: 'Por ubicación'
};

/** Dirección natural: alfabético ascendente; fechas y valoración, lo más reciente o alto primero. */
export const DEFAULT_DESC: Record<SortKey, boolean> = {
  title: false,
  author: false,
  dateAdded: true,
  dateRead: true,
  rating: true,
  color: false,
  category: false,
  location: false
};

export interface Lookups {
  locations: Map<string, Location>;
  categories: Map<string, Category>;
}

export function makeLookups(locations: Location[], categories: Category[]): Lookups {
  return {
    locations: new Map(locations.map((l) => [l.id, l])),
    categories: new Map(categories.map((c) => [c.id, c]))
  };
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** "Julio Cortázar" → "Cortázar, Julio": el estante se ordena por apellido, como el lomo. */
export function authorSurname(author: string): string {
  const parts = author.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/);
  return parts[parts.length - 1] ?? author;
}

export function authorSortKey(author: string): string {
  const parts = author.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? author;
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`;
}

export function matchesSearch(book: Book, query: string, lk: Lookups): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const digits = query.replace(/[^0-9Xx]/g, '');
  if (digits.length >= 4 && (book.isbn13?.includes(digits) || book.isbn10?.includes(digits.toUpperCase()))) return true;
  const haystack = [
    book.normalizedTitle,
    book.normalizedAuthor,
    ...book.additionalAuthors.map(normalizeText),
    book.series ? normalizeText(book.series) : '',
    ...book.categories.map((id) => normalizeText(lk.categories.get(id)?.name ?? ''))
  ].join(' | ');
  return q.split(' ').every((word) => haystack.includes(word));
}

export function applyFilters(books: Book[], f: Filters, query: string, lk: Lookups): Book[] {
  return books.filter(
    (b) =>
      b.shelf === f.shelf &&
      (f.status === null || b.status === f.status) &&
      (!f.ownedOnly || b.owned === true) &&
      (f.location === null || b.location === f.location) &&
      (f.category === null || b.categories.includes(f.category)) &&
      (!f.missingIsbn || !hasIsbn(b)) &&
      matchesSearch(b, query, lk)
  );
}

export interface Counts {
  all: number;
  read: number;
  toRead: number;
  reading: number;
  owned: number;
  missingIsbn: number;
  byLocation: Map<string, number>;
  byCategory: Map<string, number>;
}

export function countBooks(books: Book[]): Counts {
  const c: Counts = { all: 0, read: 0, toRead: 0, reading: 0, owned: 0, missingIsbn: 0, byLocation: new Map(), byCategory: new Map() };
  for (const b of books) {
    c.all++;
    if (b.status === 'read') c.read++;
    else if (b.status === 'to-read') c.toRead++;
    else c.reading++;
    if (b.owned === true) c.owned++;
    if (!hasIsbn(b)) c.missingIsbn++;
    if (b.location) c.byLocation.set(b.location, (c.byLocation.get(b.location) ?? 0) + 1);
    for (const cat of b.categories) c.byCategory.set(cat, (c.byCategory.get(cat) ?? 0) + 1);
  }
  return c;
}

function firstCategoryName(b: Book, lk: Lookups): string {
  const names = b.categories.map((id) => lk.categories.get(id)?.name ?? '').filter(Boolean).sort(collator.compare);
  return names[0] ?? '';
}

export function sortBooks(books: Book[], key: SortKey, desc: boolean, lk: Lookups): Book[] {
  const dir = desc ? -1 : 1;
  const emptyLast = (a: string | number | null, b: string | number | null): number | null => {
    const ea = a === null || a === '';
    const eb = b === null || b === '';
    if (ea && eb) return 0;
    if (ea) return 1;
    if (eb) return -1;
    return null;
  };
  const cmp = (a: Book, b: Book): number => {
    let va: string | number | null;
    let vb: string | number | null;
    switch (key) {
      case 'title':
        return dir * collator.compare(a.title, b.title);
      case 'author':
        return dir * collator.compare(authorSortKey(a.author), authorSortKey(b.author)) || collator.compare(a.title, b.title);
      case 'color':
        return dir * (paletteIndexFor(a) - paletteIndexFor(b)) || collator.compare(a.title, b.title);
      case 'dateAdded':
        [va, vb] = [a.dateAdded, b.dateAdded];
        break;
      case 'dateRead':
        [va, vb] = [a.dateRead, b.dateRead];
        break;
      case 'rating':
        [va, vb] = [a.rating, b.rating];
        break;
      case 'category':
        [va, vb] = [firstCategoryName(a, lk), firstCategoryName(b, lk)];
        break;
      case 'location':
        [va, vb] = [lk.locations.get(a.location ?? '')?.name ?? '', lk.locations.get(b.location ?? '')?.name ?? ''];
        break;
    }
    const e = emptyLast(va, vb);
    if (e !== null) return e || collator.compare(a.title, b.title);
    const base = typeof va === 'number' && typeof vb === 'number' ? va - vb : collator.compare(String(va), String(vb));
    return dir * base || collator.compare(a.title, b.title);
  };
  return [...books].sort(cmp);
}

export interface Group {
  key: string;
  label: string;
  books: Book[];
}

const STATUS_ORDER: Status[] = ['reading', 'to-read', 'read'];

export function groupBooks(books: Book[], by: GroupKey, lk: Lookups): Group[] {
  if (by === 'none') return [{ key: 'all', label: '', books }];
  const map = new Map<string, Group>();
  const push = (key: string, label: string, b: Book) => {
    const g = map.get(key) ?? { key, label, books: [] };
    g.books.push(b);
    map.set(key, g);
  };
  for (const b of books) {
    if (by === 'status') push(b.status, STATUS_LABEL[b.status], b);
    else if (by === 'author') push(b.normalizedAuthor, b.author, b);
    else if (by === 'location') {
      const loc = b.location ? lk.locations.get(b.location) : undefined;
      push(loc?.id ?? '∅', loc?.name ?? 'Sin ubicación', b);
    } else {
      if (b.categories.length === 0) push('∅', 'Sin categoría', b);
      for (const id of b.categories) push(id, lk.categories.get(id)?.name ?? 'Categoría eliminada', b);
    }
  }
  const groups = [...map.values()];
  if (by === 'status') return groups.sort((a, b) => STATUS_ORDER.indexOf(a.key as Status) - STATUS_ORDER.indexOf(b.key as Status));
  const label = (g: Group) => (by === 'author' ? authorSortKey(g.label) : g.label);
  return groups.sort((a, b) => (a.key === '∅' ? 1 : b.key === '∅' ? -1 : collator.compare(label(a), label(b))));
}
