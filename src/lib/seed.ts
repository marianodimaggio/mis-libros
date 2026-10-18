import type { BookDraft, Category, Location, Status } from './types';

export const LOCATION_LIVING = 'loc-living';
export const LOCATION_CROMBIE = 'loc-crombie';

export const INITIAL_LOCATIONS: Location[] = [
  { id: LOCATION_LIVING, name: 'Biblioteca del Living', order: 0 },
  { id: LOCATION_CROMBIE, name: 'Biblioteca Crombie', order: 1 }
];

export const INITIAL_CATEGORIES: Category[] = [];

interface PhysicalSeed {
  key: string;
  title: string;
  author: string;
  status: Status;
  isbn13?: string;
  /** Observación del inventario fotográfico. No se usa como dato de edición. */
  note?: string;
}

/** Ejemplares confirmados por fotografía. Sin ISBN inventados. */
export const PHYSICAL_SEED: readonly PhysicalSeed[] = [
  { key: 'foto-01', title: 'El camino de los reyes', author: 'Brandon Sanderson', status: 'read' },
  { key: 'foto-02', title: 'La música del silencio', author: 'Patrick Rothfuss', status: 'read' },
  { key: 'foto-03', title: 'Ready Player One', author: 'Ernest Cline', status: 'read' },
  { key: 'foto-04', title: 'Los reventados', author: 'Jorge Asís', status: 'read' },
  { key: 'foto-05', title: 'El temor de un hombre sabio', author: 'Patrick Rothfuss', status: 'read' },
  { key: 'foto-06', title: 'Anticonferencias', author: 'Isidoro Blaisten', status: 'to-read' },
  { key: 'foto-07', title: 'Cuentos completos I', author: 'Julio Cortázar', status: 'to-read' },
  { key: 'foto-08', title: 'El espectáculo del tiempo', author: 'Juan José Becerra', status: 'to-read' },
  {
    key: 'foto-09',
    title: 'Trilogía de la Fundación',
    author: 'Isaac Asimov',
    status: 'to-read',
    note: 'Un solo volumen físico. Edición e ISBN sin verificar.'
  },
  { key: 'foto-10', title: 'Cuando falla la gravedad', author: 'George Alec Effinger', status: 'to-read', isbn13: '9788427013698' },
  { key: 'foto-11', title: 'El beso del exilio', author: 'George Alec Effinger', status: 'to-read', isbn13: '9788427015555' },
  {
    key: 'foto-12',
    title: 'Cuentos reunidos',
    author: 'Juan Sasturain',
    status: 'to-read',
    note: 'Edición e ISBN sin verificar.'
  },
  { key: 'foto-13', title: 'Hyperion', author: 'Dan Simmons', status: 'to-read', isbn13: '9788466658034' },
  { key: 'foto-14', title: 'Cuentos completos II', author: 'Julio Cortázar', status: 'to-read' },
  { key: 'foto-15', title: 'La caída de Hyperion', author: 'Dan Simmons', status: 'to-read' },
  { key: 'foto-16', title: 'Dune', author: 'Frank Herbert', status: 'to-read' },
  { key: 'foto-17', title: 'El mesías de Dune', author: 'Frank Herbert', status: 'to-read' },
  { key: 'foto-18', title: 'El nombre del viento', author: 'Patrick Rothfuss', status: 'to-read' },
  { key: 'foto-19', title: 'El infinito en un junco', author: 'Irene Vallejo', status: 'to-read' },
  { key: 'foto-20', title: 'La conjura de los necios', author: 'John Kennedy Toole', status: 'to-read' }
];

export function physicalSeedDrafts(now: string): BookDraft[] {
  return PHYSICAL_SEED.map((s) => {
    const origin = { source: 'photo' as const, ref: `semilla:${s.key}`, at: now };
    const draft: BookDraft = {
      goodreadsBookId: null,
      title: s.title,
      author: s.author,
      additionalAuthors: [],
      isbn10: null,
      isbn13: s.isbn13 ?? null,
      publisher: null,
      binding: null,
      format: 'print',
      pageCount: null,
      yearPublished: null,
      originalPublicationYear: null,
      status: s.status,
      rating: null,
      dateRead: null,
      dateAdded: null,
      readCount: 0,
      owned: true,
      location: LOCATION_LIVING,
      categories: [],
      series: null,
      coverUrl: null,
      coverSource: null,
      notes: s.note ?? null,
      review: null,
      shelf: 'library',
      source: 'photo',
      seedKey: s.key,
      provenance: {}
    };
    for (const field of ['title', 'author', 'status', 'owned', 'location', 'format', 'isbn13', 'notes'] as const) {
      if (draft[field] !== null) draft.provenance[field] = origin;
    }
    return draft;
  });
}
