import { useRef, useState, type ReactNode } from 'react';
import { db } from '../db/db';
import { deleteBook, updateBook } from '../db/repo';
import { fileToCoverDataUrl } from '../lib/covers';
import { formatDate, formatDateTime } from '../lib/format';
import type { Lookups } from '../lib/query';
import { FORMAT_LABEL, SOURCE_LABEL, STATUS_LABEL, ownedLabel, type Book, type Category, type Location, type Source } from '../lib/types';
import { BookForm } from './BookForm';
import { Cover } from './BookVisuals';
import { ConfirmDialog, Modal } from './Modal';
import { useToast } from './Toast';

interface Props {
  book: Book | null;
  lk: Lookups;
  locations: Location[];
  categories: Category[];
  autoCovers: boolean;
  onClose: () => void;
}

const FIELD_LABEL: Record<string, string> = {
  title: 'Título',
  author: 'Autor',
  additionalAuthors: 'Autores adicionales',
  isbn10: 'ISBN-10',
  isbn13: 'ISBN-13',
  publisher: 'Editorial',
  binding: 'Encuadernación',
  format: 'Formato',
  pageCount: 'Páginas',
  yearPublished: 'Año de la edición',
  originalPublicationYear: 'Año original',
  status: 'Estado',
  rating: 'Valoración',
  dateRead: 'Fecha de lectura',
  dateAdded: 'Fecha agregada',
  readCount: 'Lecturas',
  owned: 'Propiedad',
  location: 'Ubicación',
  categories: 'Categorías',
  series: 'Serie',
  coverUrl: 'Cubierta',
  coverSource: 'Origen de la cubierta',
  notes: 'Notas',
  review: 'Reseña',
  shelf: 'Lista',
  goodreadsBookId: 'Id de Goodreads',
  source: 'Origen',
  seedKey: 'Inventario fotográfico'
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '' || children === false) return null;
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 border-t border-line py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function BookPanel({ book, lk, locations, categories, autoCovers, onClose }: Props) {
  const [mode, setMode] = useState<'view' | 'edit' | 'cover'>('view');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [coverError, setCoverError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const close = () => {
    setMode('view');
    setCoverError('');
    onClose();
  };

  if (!book) return <Modal open={false} onClose={close} title="" variant="panel" children={null} />;

  const sources = Array.from(new Set<Source>([book.source, ...Object.values(book.provenance).map((p) => p.source)]));
  const categoryNames = book.categories.map((c) => lk.categories.get(c)?.name).filter(Boolean).join(', ');

  const saveCover = async (patch: Partial<Book>, message: string) => {
    await updateBook(db, book.id, patch);
    setMode('view');
    setCoverUrlInput('');
    setCoverError('');
    toast(message);
  };

  const onPasteUrl = async () => {
    try {
      const u = new URL(coverUrlInput.trim());
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      await saveCover({ coverUrl: u.toString(), coverSource: 'url' }, 'Cubierta actualizada');
    } catch {
      setCoverError('Pegá una dirección completa que empiece con https://');
    }
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setCoverError('El archivo tiene que ser una imagen.');
      return;
    }
    try {
      await saveCover({ coverUrl: await fileToCoverDataUrl(file), coverSource: 'upload' }, 'Cubierta actualizada');
    } catch {
      setCoverError('No se pudo leer la imagen. Probá con un JPG o PNG.');
    }
  };

  return (
    <>
      <Modal open onClose={close} title={mode === 'edit' ? `Editar “${book.title}”` : book.title} variant="panel" hideTitle={mode === 'view'}>
        {mode === 'edit' ? (
          <BookForm
            initial={book}
            locations={locations}
            categories={categories}
            submitLabel="Guardar cambios"
            onCancel={() => setMode('view')}
            onSubmit={async (values) => {
              await updateBook(db, book.id, values);
              setMode('view');
              toast('Cambios guardados');
            }}
          />
        ) : (
          <article>
            <div className="flex gap-5">
              <Cover book={book} autoCovers={autoCovers} className="aspect-[2/3] w-32 flex-none" />
              <div className="min-w-0 self-end">
                <p className="font-display text-[1.7rem] leading-[1.1] font-medium" aria-hidden="true">
                  {book.title}
                </p>
                <p className="text-muted mt-1">{book.author}</p>
                {book.series && <p className="text-muted mt-1 text-sm italic">{book.series}</p>}
                <p className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-sunken px-2.5 py-1">{STATUS_LABEL[book.status]}</span>
                  {book.owned === true && <span className="rounded-full bg-sunken px-2.5 py-1">Poseído</span>}
                  {book.shelf === 'wishlist' && <span className="rounded-full bg-sunken px-2.5 py-1">Lista de Goodreads</span>}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={() => setMode('edit')}>
                Editar
              </button>
              <button type="button" className="btn" onClick={() => setMode(mode === 'cover' ? 'view' : 'cover')} aria-expanded={mode === 'cover'}>
                Cambiar cubierta
              </button>
              <button type="button" className="btn btn-danger ml-auto" onClick={() => setConfirmDelete(true)}>
                Eliminar
              </button>
            </div>

            {mode === 'cover' && (
              <section className="mt-4 rounded-xl border border-line bg-sunken p-4" aria-label="Cambiar cubierta">
                <div className="flex gap-2">
                  <label className="sr-only" htmlFor="cover-url">
                    Dirección de la imagen
                  </label>
                  <input
                    id="cover-url"
                    className="field"
                    placeholder="https://…/tapa.jpg"
                    value={coverUrlInput}
                    onChange={(e) => setCoverUrlInput(e.target.value)}
                  />
                  <button type="button" className="btn" onClick={onPasteUrl} disabled={!coverUrlInput.trim()}>
                    Usar URL
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => onUpload(e.target.files?.[0])} tabIndex={-1} />
                  <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                    Subir imagen
                  </button>
                  {(book.isbn13 || book.isbn10) && (
                    <button type="button" className="btn" onClick={() => saveCover({ coverUrl: null, coverSource: null }, 'Se usa la tapa de Open Library')}>
                      Buscar por ISBN
                    </button>
                  )}
                  <button type="button" className="btn" onClick={() => saveCover({ coverUrl: null, coverSource: 'none' }, 'Se muestra el lomo generado')}>
                    Usar lomo generado
                  </button>
                </div>
                {coverError && (
                  <p className="text-danger mt-2 text-sm" role="alert">
                    {coverError}
                  </p>
                )}
                <p className="text-muted mt-3 text-xs">La imagen subida se guarda solo en este dispositivo.</p>
              </section>
            )}

            <dl className="mt-6">
              <Row label="Estado">{STATUS_LABEL[book.status]}</Row>
              <Row label="Propiedad">{ownedLabel(book.owned)}</Row>
              <Row label="Ubicación">{book.location ? lk.locations.get(book.location)?.name ?? 'Ubicación eliminada' : 'Sin ubicación'}</Row>
              <Row label="Categorías">{categoryNames || 'Sin categoría'}</Row>
              <Row label="Formato">{book.format ? FORMAT_LABEL[book.format] : 'Sin indicar'}</Row>
              <Row label="Encuadernación">{book.binding}</Row>
              <Row label="ISBN">{[book.isbn13, book.isbn10].filter(Boolean).join(' / ') || 'Sin ISBN'}</Row>
              <Row label="Editorial">{book.publisher}</Row>
              <Row label="Año">
                {book.yearPublished}
                {book.originalPublicationYear && book.originalPublicationYear !== book.yearPublished
                  ? ` (original: ${book.originalPublicationYear})`
                  : ''}
              </Row>
              <Row label="Páginas">{book.pageCount}</Row>
              <Row label="Autores adicionales">{book.additionalAuthors.join(', ')}</Row>
              <Row label="Valoración">{book.rating ? `${'★'.repeat(book.rating)} (${book.rating} de 5)` : 'Sin valorar'}</Row>
              <Row label="Fecha de lectura">{formatDate(book.dateRead) || 'Sin fecha'}</Row>
              <Row label="Lecturas">{book.readCount > 0 ? book.readCount : null}</Row>
              <Row label="Notas">{book.notes && <span className="whitespace-pre-line">{book.notes}</span>}</Row>
              <Row label="Reseña">{book.review && <span className="whitespace-pre-line">{book.review.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')}</span>}</Row>
              <Row label="Origen del registro">{sources.map((s) => SOURCE_LABEL[s]).join(' + ')}</Row>
            </dl>

            <details className="mt-4 text-sm">
              <summary className="text-muted cursor-pointer select-none">Ver de dónde viene cada dato</summary>
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {Object.entries(book.provenance)
                    .sort(([a], [b]) => (FIELD_LABEL[a] ?? a).localeCompare(FIELD_LABEL[b] ?? b, 'es'))
                    .map(([field, o]) => (
                      <tr key={field} className="border-t border-line align-top">
                        <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                          {FIELD_LABEL[field] ?? field}
                        </th>
                        <td className="text-muted py-1.5">
                          {SOURCE_LABEL[o.source]}
                          {o.note ? `: ${o.note}` : ''}
                          <span className="block opacity-80">{formatDateTime(o.at)}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </details>
          </article>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="¿Eliminar este libro?"
        message={
          <>
            Se borrará “{book.title}” de {book.author}. Solo vas a poder recuperarlo restaurando una copia de seguridad.
          </>
        }
        confirmLabel="Eliminar libro"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await deleteBook(db, book.id);
          toast(`Eliminaste “${book.title}”`);
          close();
        }}
      />
    </>
  );
}
