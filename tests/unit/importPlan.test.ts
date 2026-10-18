import { describe, expect, it } from 'vitest';
import { parseGoodreadsCsv } from '../../src/lib/goodreads';
import { planImport, type ImportPlan } from '../../src/lib/importPlan';
import { coverUrlFor } from '../../src/lib/covers';
import { LOCATION_LIVING, PHYSICAL_SEED } from '../../src/lib/seed';
import type { Book } from '../../src/lib/types';
import { csv, hasRealCsv, line, NOW, realRows, seqId } from './helpers';

function after(plan: ImportPlan, existing: Book[] = []): Book[] {
  const map = new Map(existing.map((b) => [b.id, b]));
  plan.creates.forEach((b) => map.set(b.id, b));
  plan.updates.forEach((u) => map.set(u.after.id, u.after));
  return [...map.values()];
}

const run = (existing: Book[], keys: Set<string>, includeWishlist = false) =>
  planImport({ rows: realRows(), existing, existingReviewKeys: keys, includePhysicalSeed: true, includeWishlist, now: NOW, newId: seqId });

describe.skipIf(!hasRealCsv)('importación inicial con el CSV real', () => {
  const plan = run([], new Set());
  const books = after(plan);
  const find = (title: string) => books.find((b) => b.title === title)!;

  it('valida el archivo completo', () => {
    expect(plan.summary.totalRows).toBe(1574);
    expect(plan.summary.readRows).toBe(277);
    expect(plan.summary.toReadRows).toBe(1297);
    expect(plan.summary.rejected).toBe(0);
  });

  it('produce 175 libros únicos sin historietas y lo explica', () => {
    expect(plan.summary.libraryTotalAfter).toBe(175);
    expect(plan.summary.expectedLibraryTotal).toBe(175);
    expect(plan.summary.physicalMatchedRead).toBe(5);
    expect(plan.report[0]?.text).toContain('− 117 historietas');
    expect(plan.report[0]?.text).toContain('= 175');
    expect(books.filter((b) => b.status === 'read')).toHaveLength(160);
  });

  it('combina los cinco físicos leídos sin perder datos físicos', () => {
    for (const title of ['El camino de los reyes', 'La música del silencio', 'Ready Player One', 'Los reventados', 'El temor de un hombre sabio']) {
      const b = find(title);
      expect(b.status).toBe('read');
      expect(b.owned).toBe(true);
      expect(b.location).toBe(LOCATION_LIVING);
      expect(b.goodreadsBookId).toBeTruthy();
      expect(b.seedKey).toBeTruthy();
    }
  });

  it('agrega los quince físicos como poseídos y por leer', () => {
    const physical = books.filter((b) => b.seedKey && b.status === 'to-read');
    expect(physical).toHaveLength(15);
    expect(physical.every((b) => b.owned === true && b.location === LOCATION_LIVING)).toBe(true);
    expect(books.filter((b) => b.seedKey)).toHaveLength(PHYSICAL_SEED.length);
  });

  it('no interpreta Owned Copies = 0 como no poseído', () => {
    const grOnly = books.filter((b) => !b.seedKey);
    expect(grOnly.every((b) => b.owned === null)).toBe(true);
  });

  it('no importa la lista to-read como libros físicos', () => {
    expect(books.every((b) => b.shelf === 'library')).toBe(true);
    expect(books.filter((b) => b.status === 'to-read')).toHaveLength(15);
  });

  it('envía las tres inconsistencias a revisión sin corregirlas', () => {
    const inc = plan.reviews.filter((r) => r.kind === 'inconsistency').map((r) => r.title);
    expect(inc).toHaveLength(3);
    expect(inc.join()).toMatch(/Los sorrentinos/);
    expect(inc.join()).toMatch(/Stoner/);
    expect(inc.join()).toMatch(/Cenital/);
    expect(books.some((b) => /sorrentinos|stoner|cenital/i.test(b.title))).toBe(false);
  });

  it('completa por ISBN y deja como propuesta la edición coincidente solo por título', () => {
    expect(find('Hyperion').publisher).toBeTruthy();
    const dune = find('Dune');
    expect(dune.isbn13).toBeNull();
    const proposal = plan.reviews.find((r) => r.kind === 'edition-proposal' && r.bookId === dune.id);
    expect(proposal?.proposal?.isbn13).toBe('9780425266540');
  });

  it('no inventa tapa para Trilogía de la Fundación ni Cuentos reunidos', () => {
    expect(coverUrlFor(find('Trilogía de la Fundación'), true)).toBeNull();
    expect(coverUrlFor(find('Cuentos reunidos'), true)).toBeNull();
    expect(coverUrlFor(find('Hyperion'), true)).toContain('9788466658034');
  });

  it('excluye historietas por editorial y las deja restaurables en revisión', () => {
    expect(books.some((b) => /Attack on Titan|Death Note|Sandman/.test(b.title))).toBe(false);
    const comics = plan.reviews.filter((r) => r.kind === 'comic');
    expect(comics.length).toBe(plan.summary.possibleComics);
    expect(comics.every((r) => r.candidate && !r.bookId)).toBe(true);
    expect(books.some((b) => b.title.startsWith('Los viernes'))).toBe(true); // "tomo" en el título no es señal
  });

  it('es idempotente', () => {
    const keys = new Set(plan.reviews.map((r) => r.key));
    const second = run(books, keys);
    expect(second.creates).toHaveLength(0);
    expect(second.updates).toHaveLength(0);
    expect(second.reviews).toHaveLength(0);
    expect(second.summary.libraryTotalAfter).toBe(175);
  });

  it('importa la lista completa por separado y sin tocar la edición de los físicos', () => {
    const keys = new Set(plan.reviews.map((r) => r.key));
    const wl = run(books, keys, true);
    const all = after(wl, books);
    expect(all.filter((b) => b.shelf === 'library')).toHaveLength(175);
    expect(wl.summary.createdWishlist).toBeGreaterThan(1200);
    expect(all.find((b) => b.title === 'Dune' && b.shelf === 'library')?.isbn13).toBeNull();
    const again = run(all, new Set([...keys, ...wl.reviews.map((r) => r.key)]), true);
    expect(again.creates).toHaveLength(0);
  });
});

describe('reglas con datos sintéticos', () => {
  const plan = (text: string) =>
    planImport({ rows: parseGoodreadsCsv(text).rows, existing: [], existingReviewKeys: new Set(), includePhysicalSeed: false, includeWishlist: false, now: NOW, newId: seqId });

  it('envía a revisión una clasificación explícita de historieta y no la crea', () => {
    const p = plan(csv([line('1', 'Watchmen', 'Alan Moore', '', 'read', { shelves: 'comics' }), line('2', 'Rayuela', 'Julio Cortázar', '', 'read')]));
    expect(p.creates.map((b) => b.title)).toEqual(['Rayuela']);
    expect(p.reviews.find((r) => r.kind === 'comic')?.title).toContain('Watchmen');
  });

  it('rechaza filas inválidas y las informa', () => {
    const p = plan(csv([line('1', '', 'Alguien', '', 'read'), line('2', 'Algo', 'Alguien', '', 'abandonados')]));
    expect(p.summary.rejected).toBe(2);
    expect(p.report.filter((r) => r.text.startsWith('Fila '))).toHaveLength(2);
  });

  it('combina duplicados internos del mismo ISBN', () => {
    const p = plan(csv([line('1', 'Rayuela', 'Julio Cortázar', '9788437604572', 'read'), line('2', 'Rayuela (edición)', 'J. Cortázar', '9788437604572', 'read')]));
    expect(p.creates).toHaveLength(1);
    expect(p.summary.merged).toBe(1);
  });
});

import { applyFilters, DEFAULT_FILTERS, makeLookups } from '../../src/lib/query';
describe.skipIf(!hasRealCsv)('ejemplares físicos a verificar', () => {
  it('el filtro Sin ISBN + Poseídos lista los físicos sin ISBN', () => {
    const plan = run([], new Set());
    const books = after(plan);
    const pending = applyFilters(books, { ...DEFAULT_FILTERS, ownedOnly: true, missingIsbn: true }, '', makeLookups([], []));
    expect(pending.map((b) => b.title).sort()).toEqual(
      [
        'Anticonferencias',
        'Cuentos completos I',
        'Cuentos completos II',
        'Cuentos reunidos',
        'Dune',
        'El espectáculo del tiempo',
        'El infinito en un junco',
        'El mesías de Dune',
        'El nombre del viento',
        'La caída de Hyperion',
        'La conjura de los necios',
        'Trilogía de la Fundación'
      ].sort()
    );
    expect(plan.reviews.filter((r) => r.status === 'open')).toHaveLength(9);
  });
});
