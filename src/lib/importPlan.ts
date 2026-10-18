import {
  comicPublisherSignal,
  explicitComicClassification,
  readingInconsistency,
  rowLabel,
  rowToDraft,
  validateRow,
  type GoodreadsRow
} from './goodreads';
import { findMatch, type MatchType } from './match';
import { createBook, mergeInto } from './merge';
import { cleanIsbn } from './normalize';
import { physicalSeedDrafts } from './seed';
import type { Book, BookDraft, ReviewItem, ReviewKind } from './types';

export interface PlanInput {
  rows: GoodreadsRow[];
  existing: Book[];
  existingReviewKeys: ReadonlySet<string>;
  /** Agrega los 20 ejemplares fotografiados que todavía no existan. */
  includePhysicalSeed: boolean;
  /** Importa la lista "to-read" completa como lista de interés separada. */
  includeWishlist: boolean;
  now: string;
  newId?: () => string;
}

export interface PlannedUpdate {
  before: Book;
  after: Book;
  changed: string[];
}

export interface RejectedRow {
  line: number;
  label: string;
  reasons: string[];
}

export interface ImportSummary {
  totalRows: number;
  readRows: number;
  readingRows: number;
  toReadRows: number;
  physicalConsidered: number;
  physicalAlreadyPresent: number;
  created: number;
  createdLibrary: number;
  createdWishlist: number;
  merged: number;
  physicalMatchedRead: number;
  enriched: number;
  unchanged: number;
  ambiguous: number;
  possible: number;
  rejected: number;
  withoutIsbn: number;
  invalidIsbn: number;
  inconsistencies: number;
  comics: number;
  possibleComics: number;
  toReadNotImported: number;
  expectedLibraryTotal: number;
  libraryTotalAfter: number;
  wishlistTotalAfter: number;
}

export interface ReportLine {
  tone: 'info' | 'merge' | 'review' | 'warning';
  text: string;
}

export interface ImportPlan {
  creates: Book[];
  updates: PlannedUpdate[];
  reviews: ReviewItem[];
  rejected: RejectedRow[];
  summary: ImportSummary;
  report: ReportLine[];
}

export const COMIC_EXCLUDED = 'Excluida: historieta';

const MATCH_LABEL: Record<MatchType, string> = {
  'goodreads-id': 'id de Goodreads',
  isbn13: 'ISBN-13',
  isbn10: 'ISBN-10',
  'title-author': 'título y autor'
};

export function planImport(input: PlanInput): ImportPlan {
  const { now } = input;
  const newId = input.newId ?? (() => crypto.randomUUID());

  const working = new Map<string, Book>(input.existing.map((b) => [b.id, b]));
  const originals = new Map<string, Book>(input.existing.map((b) => [b.id, b]));
  const createdIds = new Set<string>();
  const changedFields = new Map<string, Set<string>>();
  const reviews: ReviewItem[] = [];
  const reviewKeys = new Set(input.existingReviewKeys);
  const report: ReportLine[] = [];
  const rejected: RejectedRow[] = [];

  const s: ImportSummary = {
    totalRows: input.rows.length,
    readRows: 0,
    readingRows: 0,
    toReadRows: 0,
    physicalConsidered: 0,
    physicalAlreadyPresent: 0,
    created: 0,
    createdLibrary: 0,
    createdWishlist: 0,
    merged: 0,
    physicalMatchedRead: 0,
    enriched: 0,
    unchanged: 0,
    ambiguous: 0,
    possible: 0,
    rejected: 0,
    withoutIsbn: 0,
    invalidIsbn: 0,
    inconsistencies: 0,
    comics: 0,
    possibleComics: 0,
    toReadNotImported: 0,
    expectedLibraryTotal: 0,
    libraryTotalAfter: 0,
    wishlistTotalAfter: 0
  };

  const addReview = (
    key: string,
    kind: ReviewKind,
    title: string,
    detail: string,
    extra: { bookId?: string | null; candidate?: BookDraft | null; proposal?: Partial<Book> | null; resolution?: string } = {}
  ): boolean => {
    if (reviewKeys.has(key)) return false;
    reviewKeys.add(key);
    reviews.push({
      id: newId(),
      key,
      kind,
      // Una decisión ya tomada por regla (excluir historietas) no queda pendiente.
      status: extra.resolution ? 'resolved' : 'open',
      title,
      detail,
      bookId: extra.bookId ?? null,
      candidate: extra.candidate ?? null,
      proposal: extra.proposal ?? null,
      createdAt: now,
      resolvedAt: extra.resolution ? now : null,
      resolution: extra.resolution ?? null
    });
    return true;
  };

  const create = (draft: BookDraft): Book => {
    const book = createBook(draft, now, newId());
    working.set(book.id, book);
    createdIds.add(book.id);
    return book;
  };

  const applyMerge = (target: Book, draft: BookDraft, acceptEdition: boolean) => {
    const out = mergeInto(target, draft, { now, acceptEdition });
    const touched = out.changed.length > 0 || out.book.seedKey !== target.seedKey;
    if (touched) {
      working.set(out.book.id, out.book);
      const set = changedFields.get(out.book.id) ?? new Set<string>();
      out.changed.forEach((f) => set.add(f));
      if (out.book.seedKey !== target.seedKey) set.add('seedKey');
      changedFields.set(out.book.id, set);
    }
    return { ...out, touched };
  };

  // 1. Validación y clasificación.
  const libraryRows: GoodreadsRow[] = [];
  const toReadRows: GoodreadsRow[] = [];
  const excludedIds = new Set<string>();
  let excludedLibraryRows = 0;

  input.rows.forEach((row, i) => {
    const shelf = row['Exclusive Shelf'];
    if (shelf === 'read') s.readRows++;
    else if (shelf === 'to-read') s.toReadRows++;
    else if (shelf === 'currently-reading') s.readingRows++;

    const v = validateRow(row);
    if (!v.ok) {
      rejected.push({ line: i + 2, label: rowLabel(row), reasons: v.reasons });
      return;
    }

    for (const col of ['ISBN', 'ISBN13'] as const) {
      const raw = (row[col] ?? '').replace(/[^0-9Xx]/g, '');
      if (raw && !cleanIsbn(row[col])) {
        s.invalidIsbn++;
        report.push({ tone: 'warning', text: `${rowLabel(row)}: ${col} "${raw}" no es válido y se descartó.` });
      }
    }

    // Las historietas no forman parte del catálogo: se excluyen, pero quedan en revisión para restaurarlas.
    const comic = explicitComicClassification(row);
    const publisher = comic ? null : comicPublisherSignal(row['Publisher']);
    if (comic || publisher) {
      excludedIds.add(row['Book Id']);
      if (comic) s.comics++;
      else s.possibleComics++;
      if (shelf !== 'to-read') excludedLibraryRows++;
      const draft = rowToDraft(row, shelf === 'to-read' ? 'wishlist' : 'library', now);
      addReview(
        `comic:${row['Book Id']}`,
        'comic',
        rowLabel(row),
        comic
          ? `Clasificado explícitamente como historieta (${comic}). No se importó.`
          : `La editorial (${row['Publisher'].trim()}) publica historieta o manga. No se importó; si es un libro, importalo igualmente.`,
        { candidate: draft, resolution: COMIC_EXCLUDED }
      );
      return;
    }

    if (shelf === 'to-read') toReadRows.push(row);
    else libraryRows.push(row);
  });
  s.rejected = rejected.length;

  const pool = () => [...working.values()];

  // Resultado común para registros que pueden crearse.
  const upsert = (draft: BookDraft, acceptEditionFor: (type: MatchType, target: Book) => boolean, label: string) => {
    const m = findMatch(draft, pool());
    if (m.kind === 'match') {
      const acceptEdition = acceptEditionFor(m.type, m.book);
      const out = applyMerge(m.book, draft, acceptEdition);
      return { kind: 'merged' as const, book: out.book, type: m.type, out, wasNew: createdIds.has(m.book.id) };
    }
    if (m.kind === 'ambiguous') {
      s.ambiguous++;
      addReview(
        `ambiguous:${draft.goodreadsBookId ?? draft.seedKey ?? label}`,
        'ambiguous',
        label,
        `${m.reason} Candidatos: ${m.candidates.map((c) => `"${c.title}" (${c.author})`).join(', ')}. No se creó ni se combinó.`,
        { candidate: draft }
      );
      report.push({ tone: 'review', text: `${label}: coincidencia ambigua, enviada a revisión.` });
      return { kind: 'held' as const };
    }
    const book = create(draft);
    if (m.kind === 'possible') {
      s.possible++;
      const cand = m.candidates[0]!;
      addReview(
        `possible:${book.goodreadsBookId ?? book.seedKey ?? book.id}:${cand.id}`,
        'possible-match',
        label,
        `${m.reason} Se creó como libro separado; podría ser "${cand.title}" (${cand.author}).`,
        { bookId: book.id, proposal: { id: cand.id } }
      );
    }
    return { kind: 'created' as const, book };
  };

  // 2. Historial de lectura (read / currently-reading).
  for (const row of libraryRows) {
    const r = upsert(rowToDraft(row, 'library', now), () => true, rowLabel(row));
    if (r.kind === 'merged') {
      if (r.wasNew) {
        s.merged++;
        report.push({ tone: 'merge', text: `${rowLabel(row)}: duplicado interno de Goodreads, combinado por ${MATCH_LABEL[r.type]}.` });
      } else if (r.out.touched) s.merged++;
      else s.unchanged++;
    }
  }

  // 3. Ejemplares fotografiados.
  if (input.includePhysicalSeed) {
    for (const draft of physicalSeedDrafts(now)) {
      s.physicalConsidered++;
      if (pool().some((b) => b.seedKey === draft.seedKey)) {
        s.physicalAlreadyPresent++;
        continue;
      }
      const label = `${draft.title} — ${draft.author}`;
      const r = upsert(draft, () => true, label);
      if (r.kind === 'merged') {
        s.merged++;
        if (r.book.status === 'read' && r.book.goodreadsBookId) s.physicalMatchedRead++;
        report.push({
          tone: 'merge',
          text: `${label}: ejemplar físico combinado con "${r.book.title}" por ${MATCH_LABEL[r.type]}. Estado: ${r.book.status === 'read' ? 'Leído' : r.book.status}.`
        });
      }
    }
  }

  // 4. Completar ejemplares físicos con la lista "to-read" (sin crear registros nuevos).
  const usableToRead = toReadRows.filter((r) => !readingInconsistency(r));
  const consumed = new Set<string>();
  const toReadCandidates = usableToRead.map((row) => {
    const draft = rowToDraft(row, 'wishlist', now);
    return { row, draft, pseudo: createBook(draft, now, `gr:${row['Book Id']}`) };
  });

  const physicalBooks = pool().filter((b) => b.owned === true && b.source === 'photo' && !b.goodreadsBookId);
  for (const book of physicalBooks) {
    const m = findMatch(
      book,
      toReadCandidates.filter((c) => !consumed.has(c.row['Book Id'])).map((c) => c.pseudo)
    );
    const label = `${book.title} — ${book.author}`;
    if (m.kind === 'match') {
      const cand = toReadCandidates.find((c) => c.pseudo.id === m.book.id)!;
      consumed.add(cand.row['Book Id']);
      const byIsbn = m.type !== 'title-author';
      const out = applyMerge(working.get(book.id)!, cand.draft, byIsbn);
      s.enriched++;
      if (byIsbn) {
        report.push({ tone: 'merge', text: `${label}: completado con la lista de Goodreads por ${MATCH_LABEL[m.type]}.` });
      } else {
        report.push({
          tone: 'review',
          text: `${label}: vinculado por título y autor. Los datos de edición de Goodreads quedan como propuesta.`
        });
        if (out.editionProposal) {
          addReview(
            `edition:${book.seedKey ?? book.id}:${cand.row['Book Id']}`,
            'edition-proposal',
            label,
            `Goodreads tiene este título en una edición concreta. Confirmá si coincide con tu ejemplar antes de usar su ISBN y su tapa.`,
            { bookId: book.id, proposal: out.editionProposal }
          );
        }
      }
    } else if (m.kind === 'possible' || m.kind === 'ambiguous') {
      const cand = toReadCandidates.find((c) => c.pseudo.id === m.candidates[0]!.id)!;
      consumed.add(cand.row['Book Id']);
      s.possible++;
      addReview(
        `possible:${book.seedKey ?? book.id}:${cand.row['Book Id']}`,
        'possible-match',
        label,
        `${m.reason} En Goodreads figura como "${cand.draft.title}". No se vinculó automáticamente.`,
        { bookId: book.id, candidate: cand.draft }
      );
      report.push({ tone: 'review', text: `${label}: posible variante "${cand.draft.title}", enviada a revisión.` });
    }
  }

  // 5. Inconsistencias: se informan, no se corrigen.
  for (const row of toReadRows) {
    const issue = readingInconsistency(row);
    if (!issue) continue;
    s.inconsistencies++;
    if (pool().some((b) => b.goodreadsBookId === row['Book Id'])) continue;
    const draft = rowToDraft(row, 'library', now);
    addReview(`inconsistency:${row['Book Id']}`, 'inconsistency', rowLabel(row), issue, { candidate: draft });
    report.push({ tone: 'review', text: `${rowLabel(row)}: ${issue}` });
  }

  // 6. Lista de interés opcional.
  for (const { row, draft } of toReadCandidates) {
    if (consumed.has(row['Book Id'])) continue;
    if (!input.includeWishlist) {
      s.toReadNotImported++;
      continue;
    }
    // Contra un libro de la biblioteca, solo un ISBN idéntico confirma la edición.
    const r = upsert(
      draft,
      (type, target) => target.shelf === 'wishlist' || type === 'isbn13' || type === 'isbn10',
      rowLabel(row)
    );
    if (r.kind === 'merged') {
      if (r.out.touched) s.merged++;
      else s.unchanged++;
      if (r.out.editionProposal && r.book.shelf === 'library') {
        addReview(
          `edition:${r.book.seedKey ?? r.book.id}:${row['Book Id']}`,
          'edition-proposal',
          `${r.book.title} — ${r.book.author}`,
          'La lista de Goodreads propone datos de edición para este libro.',
          { bookId: r.book.id, proposal: r.out.editionProposal }
        );
      }
    }
  }
  if (!input.includeWishlist) s.toReadNotImported += s.inconsistencies;

  // Resultado.
  const creates = [...createdIds].map((id) => working.get(id)!);
  const updates: PlannedUpdate[] = [];
  for (const [id, fields] of changedFields) {
    if (createdIds.has(id)) continue;
    updates.push({ before: originals.get(id)!, after: working.get(id)!, changed: [...fields] });
  }

  s.created = creates.length;
  s.createdLibrary = creates.filter((b) => b.shelf === 'library').length;
  s.createdWishlist = creates.filter((b) => b.shelf === 'wishlist').length;
  s.withoutIsbn = creates.filter((b) => !b.isbn13 && !b.isbn10).length;
  const all = [...working.values()];
  s.libraryTotalAfter = all.filter((b) => b.shelf === 'library').length;
  s.wishlistTotalAfter = all.filter((b) => b.shelf === 'wishlist').length;

  const existingLibrary = input.existing.filter((b) => b.shelf === 'library').length;
  const newPhysical = s.physicalConsidered - s.physicalAlreadyPresent;
  s.expectedLibraryTotal =
    input.existing.length === 0
      ? s.readRows + s.readingRows - excludedLibraryRows + newPhysical - s.physicalMatchedRead
      : existingLibrary + s.createdLibrary;

  const diff = s.libraryTotalAfter - s.expectedLibraryTotal;
  if (input.existing.length === 0) {
    report.unshift({
      tone: diff === 0 ? 'info' : 'warning',
      text:
        `Cálculo: ${s.readRows + s.readingRows} del historial − ${excludedLibraryRows} historietas + ${newPhysical} físicos − ${s.physicalMatchedRead} físicos ya leídos = ${s.expectedLibraryTotal}. ` +
        `Resultado: ${s.libraryTotalAfter}.` +
        (diff === 0
          ? ''
          : ` Diferencia de ${diff}: ${s.ambiguous} retenidos por ambigüedad, ${s.rejected} filas rechazadas, ${s.comics + s.possibleComics} historietas excluidas y duplicados internos combinados.`)
    });
  }

  for (const r of rejected) {
    report.push({ tone: 'warning', text: `Fila ${r.line} rechazada (${r.label}): ${r.reasons.join('; ')}.` });
  }

  return { creates, updates, reviews, rejected, summary: s, report };
}
