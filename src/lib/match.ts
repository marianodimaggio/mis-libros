import { normalizeAuthor, normalizeTitle, titleCore } from './normalize';
import type { Book, BookDraft } from './types';

export type MatchType = 'goodreads-id' | 'isbn13' | 'isbn10' | 'title-author';

export type MatchResult =
  | { kind: 'match'; type: MatchType; book: Book }
  | { kind: 'ambiguous'; reason: string; candidates: Book[] }
  | { kind: 'possible'; reason: string; candidates: Book[] }
  | { kind: 'none' };

type Comparable = Pick<BookDraft, 'title' | 'author' | 'isbn10' | 'isbn13' | 'goodreadsBookId'>;

/**
 * Orden: id de Goodreads (identidad del mismo registro, garantiza idempotencia),
 * ISBN-13, ISBN-10 y, solo si falta ISBN en alguno de los dos lados, título + autor normalizados.
 * Nunca combina mismo título con autores distintos.
 */
export function findMatch(draft: Comparable, pool: readonly Book[]): MatchResult {
  if (draft.goodreadsBookId) {
    const byId = pool.filter((b) => b.goodreadsBookId === draft.goodreadsBookId);
    if (byId.length === 1) return { kind: 'match', type: 'goodreads-id', book: byId[0]! };
    if (byId.length > 1)
      return { kind: 'ambiguous', reason: 'Más de un libro comparte el mismo id de Goodreads.', candidates: byId };
  }

  for (const key of ['isbn13', 'isbn10'] as const) {
    const value = draft[key];
    if (!value) continue;
    const hits = pool.filter((b) => b[key] === value);
    if (hits.length === 1) return { kind: 'match', type: key, book: hits[0]! };
    if (hits.length > 1)
      return { kind: 'ambiguous', reason: `Más de un libro comparte el ${key.toUpperCase()} ${value}.`, candidates: hits };
  }

  const nt = normalizeTitle(draft.title);
  const na = normalizeAuthor(draft.author);
  const sameWork = pool.filter((b) => b.normalizedTitle === nt && b.normalizedAuthor === na);

  if (sameWork.length > 1)
    return { kind: 'ambiguous', reason: 'Hay varios libros con el mismo título y autor.', candidates: sameWork };

  if (sameWork.length === 1) {
    const other = sameWork[0]!;
    const draftHasIsbn = Boolean(draft.isbn13 || draft.isbn10);
    const otherHasIsbn = Boolean(other.isbn13 || other.isbn10);
    if (draftHasIsbn && otherHasIsbn) {
      // Ambos tienen ISBN y no coincidieron: pueden ser dos ediciones o dos ejemplares.
      return {
        kind: 'ambiguous',
        reason: 'Mismo título y autor, pero con ISBN distintos: pueden ser ediciones diferentes.',
        candidates: sameWork
      };
    }
    return { kind: 'match', type: 'title-author', book: other };
  }

  // Coincidencia débil: mismo autor y uno de los títulos es el otro más un subtítulo.
  // "El infinito en un junco" ~ "El infinito en un junco: La invención…", pero no "Vol. 4" ~ "Vol. 5".
  const core = titleCore(draft.title);
  if (core.length >= 3) {
    const weak = pool.filter((b) => {
      if (b.normalizedAuthor !== na || titleCore(b.title) !== core) return false;
      const [shorter, longer] = nt.length <= b.normalizedTitle.length ? [nt, b.normalizedTitle] : [b.normalizedTitle, nt];
      return longer.startsWith(`${shorter} `);
    });
    if (weak.length > 0)
      return { kind: 'possible', reason: 'Mismo autor y mismo título sin el subtítulo.', candidates: weak };
  }

  return { kind: 'none' };
}
