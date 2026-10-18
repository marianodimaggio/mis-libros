import { describe, expect, it } from 'vitest';
import { findMatch } from '../../src/lib/match';
import { book, draft } from './helpers';

describe('coincidencias', () => {
  it('prioriza ISBN-13 sobre título', () => {
    const a = book({ title: 'Otro título', author: 'X', isbn13: '9788466658034' });
    const b = book({ title: 'Hyperion', author: 'Dan Simmons' });
    const r = findMatch(draft({ title: 'Hyperion', author: 'Dan Simmons', isbn13: '9788466658034' }), [a, b]);
    expect(r.kind === 'match' && r.type).toBe('isbn13');
    expect(r.kind === 'match' && r.book.id).toBe(a.id);
  });

  it('usa ISBN-10 cuando no hay ISBN-13', () => {
    const a = book({ title: 'Bomarzo', author: 'Manuel Mujica Lainez', isbn10: '8432243302' });
    const r = findMatch(draft({ title: 'Bomarzo', author: 'M. Mujica Lainez', isbn10: '8432243302' }), [a]);
    expect(r.kind === 'match' && r.type).toBe('isbn10');
  });

  it('cae en título + autor normalizados si falta ISBN', () => {
    const a = book({ title: 'El temor de un hombre sabio (Crónica del asesino de reyes, #2)', author: 'Patrick Rothfuss', isbn13: '9786073105941' });
    const r = findMatch(draft({ title: 'El temor de un hombre sabio', author: 'Patrick Rothfuss' }), [a]);
    expect(r.kind === 'match' && r.type).toBe('title-author');
  });

  it('nunca combina mismo título con autores distintos', () => {
    const a = book({ title: 'Dune', author: 'Frank Herbert' });
    expect(findMatch(draft({ title: 'Dune', author: 'Brian Herbert' }), [a]).kind).toBe('none');
  });

  it('envía a revisión si hay más de un candidato', () => {
    const a = book({ title: 'Dune', author: 'Frank Herbert' });
    const b = book({ title: 'Dune', author: 'Frank Herbert' });
    expect(findMatch(draft({ title: 'Dune', author: 'Frank Herbert' }), [a, b]).kind).toBe('ambiguous');
  });

  it('mismo título y autor con ISBN distintos es ambiguo', () => {
    const a = book({ title: 'Dune', author: 'Frank Herbert', isbn13: '9780425266540' });
    expect(findMatch(draft({ title: 'Dune', author: 'Frank Herbert', isbn13: '9788497596824' }), [a]).kind).toBe('ambiguous');
  });

  it('detecta variantes por subtítulo como posibles, sin combinarlas', () => {
    const a = book({ title: 'El infinito en un junco: La invención de los libros en el mundo antiguo', author: 'Irene Vallejo' });
    expect(findMatch(draft({ title: 'El infinito en un junco', author: 'Irene Vallejo' }), [a]).kind).toBe('possible');
  });

  it('no considera variantes a volúmenes distintos', () => {
    const a = book({ title: 'Death Note: Black Edition, Vol. 4', author: 'Tsugumi Ohba' });
    expect(findMatch(draft({ title: 'Death Note: Black Edition, Vol. 5', author: 'Tsugumi Ohba' }), [a]).kind).toBe('none');
  });
});

import { authorSortKey } from '../../src/lib/query';
describe('orden por autor', () => {
  it('ordena por apellido', () => {
    expect(authorSortKey('Julio Cortázar')).toBe('Cortázar, Julio');
    expect(authorSortKey('Homero')).toBe('Homero');
    expect(authorSortKey('Leo (Luiz Eduardo de Oliveira)')).toBe('Leo');
  });
});
