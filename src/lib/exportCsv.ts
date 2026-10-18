import Papa from 'papaparse';
import { FORMAT_LABEL, STATUS_LABEL, ownedLabel, type Book } from './types';
import type { Lookups } from './query';

export function booksToCsv(books: Book[], lk: Lookups): string {
  const rows = books.map((b) => ({
    id: b.id,
    titulo: b.title,
    autor: b.author,
    autores_adicionales: b.additionalAuthors.join('; '),
    estado: STATUS_LABEL[b.status],
    propiedad: ownedLabel(b.owned),
    ubicacion: b.location ? lk.locations.get(b.location)?.name ?? '' : '',
    categorias: b.categories.map((c) => lk.categories.get(c)?.name ?? '').filter(Boolean).join('; '),
    formato: b.format ? FORMAT_LABEL[b.format] : '',
    encuadernacion: b.binding ?? '',
    serie: b.series ?? '',
    isbn10: b.isbn10 ?? '',
    isbn13: b.isbn13 ?? '',
    editorial: b.publisher ?? '',
    paginas: b.pageCount ?? '',
    anio_edicion: b.yearPublished ?? '',
    anio_original: b.originalPublicationYear ?? '',
    valoracion: b.rating ?? '',
    fecha_leido: b.dateRead ?? '',
    fecha_agregado: b.dateAdded ?? '',
    lecturas: b.readCount,
    lista: b.shelf === 'library' ? 'Biblioteca' : 'Lista de Goodreads',
    origen: b.source,
    goodreads_id: b.goodreadsBookId ?? '',
    notas: b.notes ?? ''
  }));
  // BOM para que Excel reconozca UTF-8 y las tildes.
  return '\uFEFF' + Papa.unparse(rows);
}
