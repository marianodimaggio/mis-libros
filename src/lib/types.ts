export type Status = 'read' | 'to-read' | 'reading';
export type Source = 'goodreads' | 'photo' | 'manual';
export type Format = 'print' | 'digital' | 'audio';
/** library = biblioteca personal (historial + ejemplares); wishlist = lista de interés de Goodreads. */
export type Shelf = 'library' | 'wishlist';
export type CoverSource = 'openlibrary' | 'url' | 'upload' | 'none';

export interface FieldOrigin {
  source: Source;
  /** Referencia al dato de origen: id de Goodreads, clave de semilla, etc. */
  ref?: string;
  at: string;
  note?: string;
}

export interface Book {
  id: string;
  goodreadsBookId: string | null;
  title: string;
  normalizedTitle: string;
  author: string;
  normalizedAuthor: string;
  additionalAuthors: string[];
  isbn10: string | null;
  isbn13: string | null;
  publisher: string | null;
  binding: string | null;
  format: Format | null;
  pageCount: number | null;
  yearPublished: number | null;
  originalPublicationYear: number | null;
  status: Status;
  rating: number | null;
  dateRead: string | null;
  dateAdded: string | null;
  readCount: number;
  /** true = poseído, false = no poseído, null = desconocido. */
  owned: boolean | null;
  /** id de ubicación */
  location: string | null;
  /** ids de categorías */
  categories: string[];
  series: string | null;
  coverUrl: string | null;
  /** null = automática (Open Library si hay ISBN). */
  coverSource: CoverSource | null;
  notes: string | null;
  review: string | null;
  shelf: Shelf;
  source: Source;
  /** Clave estable de la semilla de fotografías, para idempotencia. */
  seedKey: string | null;
  provenance: Record<string, FieldOrigin>;
  createdAt: string;
  updatedAt: string;
}

/** Libro aún no persistido, producido por un importador o el alta manual. */
export type BookDraft = Omit<Book, 'id' | 'createdAt' | 'updatedAt' | 'normalizedTitle' | 'normalizedAuthor'>;

export interface Location {
  id: string;
  name: string;
  order: number;
}

export interface Category {
  id: string;
  name: string;
  order: number;
}

export type ReviewKind =
  | 'inconsistency'
  | 'comic'
  | 'possible-comic'
  | 'edition-proposal'
  | 'possible-match'
  | 'ambiguous';

export type ReviewStatus = 'open' | 'resolved' | 'dismissed';

export interface ReviewItem {
  id: string;
  /** Clave determinista para no duplicar revisiones al reimportar. */
  key: string;
  kind: ReviewKind;
  status: ReviewStatus;
  title: string;
  detail: string;
  /** Libro existente afectado. */
  bookId: string | null;
  /** Registro candidato que todavía no se creó. */
  candidate: BookDraft | null;
  /** Campos propuestos para completar bookId. */
  proposal: Partial<Book> | null;
  /** Copia del libro excluido, para poder restaurarlo. */
  snapshot?: Book | null;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export const STATUS_LABEL: Record<Status, string> = {
  read: 'Leído',
  'to-read': 'Por leer',
  reading: 'Leyendo'
};

export const FORMAT_LABEL: Record<Format, string> = {
  print: 'Impreso',
  digital: 'Digital',
  audio: 'Audiolibro'
};

export const SOURCE_LABEL: Record<Source, string> = {
  goodreads: 'Goodreads',
  photo: 'Fotografía',
  manual: 'Carga manual'
};

export function ownedLabel(owned: boolean | null): string {
  if (owned === true) return 'Poseído';
  if (owned === false) return 'No poseído';
  return 'Desconocido';
}
