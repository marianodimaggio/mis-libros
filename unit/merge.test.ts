import { describe, expect, it } from 'vitest';
import { mergeInto } from '../../src/lib/merge';
import { book, draft, NOW } from './helpers';

describe('combinación', () => {
  it('la fotografía prevalece en propiedad y ubicación; Goodreads completa metadatos', () => {
    const photo = book({ title: 'Hyperion', author: 'Dan Simmons', source: 'photo', owned: true, location: 'loc-living', format: 'print' });
    const gr = draft({ title: 'Hyperion', author: 'Dan Simmons', isbn13: '9788466658034', publisher: 'Ediciones B', format: 'digital', goodreadsBookId: '1' });
    const out = mergeInto(photo, gr, { now: NOW, acceptEdition: true });
    expect(out.book.owned).toBe(true);
    expect(out.book.location).toBe('loc-living');
    expect(out.book.format).toBe('print');
    expect(out.book.publisher).toBe('Ediciones B');
    expect(out.book.provenance.publisher?.source).toBe('goodreads');
    expect(out.book.provenance.location?.source).toBe('photo');
  });

  it('"Leído" prevalece sobre "Por leer"', () => {
    const photo = book({ title: 'X', author: 'Y', source: 'photo', status: 'to-read' });
    const out = mergeInto(photo, draft({ title: 'X', author: 'Y', status: 'read' }), { now: NOW, acceptEdition: true });
    expect(out.book.status).toBe('read');
    const back = mergeInto(out.book, draft({ title: 'X', author: 'Y', status: 'to-read' }), { now: NOW, acceptEdition: true });
    expect(back.book.status).toBe('read');
  });

  it('no pisa ediciones manuales con una reimportación', () => {
    const b = book({ title: 'X', author: 'Y', status: 'to-read' });
    b.provenance.status = { source: 'manual', at: NOW };
    const out = mergeInto(b, draft({ title: 'X', author: 'Y', status: 'read' }), { now: NOW, acceptEdition: true });
    expect(out.book.status).toBe('to-read');
  });

  it('sin edición confirmada, los datos de edición quedan como propuesta', () => {
    const photo = book({ title: 'Dune', author: 'Frank Herbert', source: 'photo', owned: true });
    const out = mergeInto(photo, draft({ title: 'Dune', author: 'Frank Herbert', isbn13: '9780425266540', publisher: 'Ace Books', goodreadsBookId: '7' }), { now: NOW, acceptEdition: false });
    expect(out.book.isbn13).toBeNull();
    expect(out.book.publisher).toBeNull();
    expect(out.book.goodreadsBookId).toBe('7');
    expect(out.editionProposal).toMatchObject({ isbn13: '9780425266540', publisher: 'Ace Books' });
  });

  it('no borra datos existentes', () => {
    const b = book({ title: 'X', author: 'Y', publisher: 'Uno', notes: 'mía' });
    const out = mergeInto(b, draft({ title: 'X', author: 'Y', publisher: 'Dos', notes: 'otra' }), { now: NOW, acceptEdition: true });
    expect(out.book.publisher).toBe('Uno');
    expect(out.conflicts).toContain('publisher');
    expect(out.book.notes).toBe('mía\n\notra');
  });
});
