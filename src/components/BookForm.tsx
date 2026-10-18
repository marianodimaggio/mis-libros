import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { cleanIsbn } from '../lib/normalize';
import { FORMAT_LABEL, STATUS_LABEL, type Book, type BookDraft, type Category, type Format, type Location, type Shelf, type Status } from '../lib/types';

type Editable = Pick<
  BookDraft,
  | 'title'
  | 'author'
  | 'additionalAuthors'
  | 'series'
  | 'status'
  | 'owned'
  | 'location'
  | 'categories'
  | 'format'
  | 'binding'
  | 'isbn13'
  | 'isbn10'
  | 'publisher'
  | 'yearPublished'
  | 'originalPublicationYear'
  | 'pageCount'
  | 'rating'
  | 'dateRead'
  | 'readCount'
  | 'notes'
  | 'shelf'
>;

interface Props {
  initial: Editable;
  locations: Location[];
  categories: Category[];
  submitLabel: string;
  onSubmit: (values: Partial<Book>) => void | Promise<void>;
  onCancel: () => void;
}

function Field({ label, children, hint, error, wide }: { label: string; children: (id: string) => ReactNode; hint?: string; error?: string; wide?: boolean }) {
  const id = useId();
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label htmlFor={id} className="text-muted mb-1 block text-xs font-medium">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-muted mt-1 text-xs">{hint}</p>}
      {error && (
        <p className="text-danger mt-1 text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const int = (v: string): number | null => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

export function BookForm({ initial, locations, categories, submitLabel, onSubmit, onCancel }: Props) {
  const [v, setV] = useState(() => ({
    title: initial.title,
    author: initial.author,
    additionalAuthors: initial.additionalAuthors.join(', '),
    series: str(initial.series),
    status: initial.status,
    owned: initial.owned === null ? 'unknown' : initial.owned ? 'yes' : 'no',
    location: str(initial.location),
    categories: initial.categories,
    format: str(initial.format),
    binding: str(initial.binding),
    isbn13: str(initial.isbn13),
    isbn10: str(initial.isbn10),
    publisher: str(initial.publisher),
    yearPublished: str(initial.yearPublished),
    originalPublicationYear: str(initial.originalPublicationYear),
    pageCount: str(initial.pageCount),
    rating: str(initial.rating ?? ''),
    dateRead: str(initial.dateRead),
    readCount: str(initial.readCount),
    notes: str(initial.notes),
    shelf: initial.shelf
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!v.title.trim()) errs.title = 'Escribí el título.';
    if (!v.author.trim()) errs.author = 'Escribí el autor.';
    const i13 = v.isbn13.trim() ? cleanIsbn(v.isbn13) : null;
    const i10 = v.isbn10.trim() ? cleanIsbn(v.isbn10) : null;
    if (v.isbn13.trim() && (!i13 || i13.length !== 13)) errs.isbn13 = 'El ISBN-13 no es válido: revisá los 13 dígitos.';
    if (v.isbn10.trim() && (!i10 || i10.length !== 10)) errs.isbn10 = 'El ISBN-10 no es válido: revisá los 10 caracteres.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await onSubmit({
        title: v.title.trim(),
        author: v.author.replace(/\s+/g, ' ').trim(),
        additionalAuthors: v.additionalAuthors.split(',').map((s) => s.trim()).filter(Boolean),
        series: v.series.trim() || null,
        status: v.status as Status,
        owned: v.owned === 'unknown' ? null : v.owned === 'yes',
        location: v.location || null,
        categories: v.categories,
        format: (v.format || null) as Format | null,
        binding: v.binding.trim() || null,
        isbn13: i13,
        isbn10: i10,
        publisher: v.publisher.trim() || null,
        yearPublished: int(v.yearPublished),
        originalPublicationYear: int(v.originalPublicationYear),
        pageCount: int(v.pageCount),
        rating: int(v.rating) || null,
        dateRead: v.dateRead || null,
        readCount: int(v.readCount) ?? 0,
        notes: v.notes.trim() || null,
        shelf: v.shelf as Shelf
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label="Título *" error={errors.title} wide>
        {(id) => <input id={id} className="field" value={v.title} onChange={set('title')} required autoComplete="off" />}
      </Field>
      <Field label="Autor *" error={errors.author}>
        {(id) => <input id={id} className="field" value={v.author} onChange={set('author')} required autoComplete="off" />}
      </Field>
      <Field label="Autores adicionales" hint="Separados por comas">
        {(id) => <input id={id} className="field" value={v.additionalAuthors} onChange={set('additionalAuthors')} />}
      </Field>
      <Field label="Estado">
        {(id) => (
          <select id={id} className="field" value={v.status} onChange={set('status')}>
            {Object.entries(STATUS_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Propiedad">
        {(id) => (
          <select id={id} className="field" value={v.owned} onChange={set('owned')}>
            <option value="yes">Poseído</option>
            <option value="no">No poseído</option>
            <option value="unknown">Desconocido</option>
          </select>
        )}
      </Field>
      <Field label="Ubicación">
        {(id) => (
          <select id={id} className="field" value={v.location} onChange={set('location')}>
            <option value="">Sin ubicación</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Formato">
        {(id) => (
          <select id={id} className="field" value={v.format} onChange={set('format')}>
            <option value="">Sin indicar</option>
            {Object.entries(FORMAT_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        )}
      </Field>
      {categories.length > 0 && (
        <fieldset className="sm:col-span-2">
          <legend className="text-muted mb-2 text-xs font-medium">Categorías</legend>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const on = v.categories.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="chip"
                  aria-pressed={on}
                  onClick={() => setV((s) => ({ ...s, categories: on ? s.categories.filter((x) => x !== c.id) : [...s.categories, c.id] }))}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <Field label="Serie">
        {(id) => <input id={id} className="field" value={v.series} onChange={set('series')} />}
      </Field>
      <Field label="Lista">
        {(id) => (
          <select id={id} className="field" value={v.shelf} onChange={set('shelf')}>
            <option value="library">Mi biblioteca</option>
            <option value="wishlist">Lista de Goodreads</option>
          </select>
        )}
      </Field>
      <Field label="ISBN-13" error={errors.isbn13} hint="Solo si lo leíste en tu ejemplar">
        {(id) => <input id={id} className="field tabular" inputMode="numeric" value={v.isbn13} onChange={set('isbn13')} />}
      </Field>
      <Field label="ISBN-10" error={errors.isbn10}>
        {(id) => <input id={id} className="field tabular" value={v.isbn10} onChange={set('isbn10')} />}
      </Field>
      <Field label="Editorial">
        {(id) => <input id={id} className="field" value={v.publisher} onChange={set('publisher')} />}
      </Field>
      <Field label="Encuadernación">
        {(id) => <input id={id} className="field" value={v.binding} onChange={set('binding')} placeholder="Rústica, tapa dura…" />}
      </Field>
      <Field label="Año de la edición">
        {(id) => <input id={id} className="field tabular" inputMode="numeric" value={v.yearPublished} onChange={set('yearPublished')} />}
      </Field>
      <Field label="Año original">
        {(id) => <input id={id} className="field tabular" inputMode="numeric" value={v.originalPublicationYear} onChange={set('originalPublicationYear')} />}
      </Field>
      <Field label="Páginas">
        {(id) => <input id={id} className="field tabular" inputMode="numeric" value={v.pageCount} onChange={set('pageCount')} />}
      </Field>
      <Field label="Valoración">
        {(id) => (
          <select id={id} className="field" value={v.rating} onChange={set('rating')}>
            <option value="">Sin valorar</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {'★'.repeat(n)} ({n})
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Fecha de lectura">
        {(id) => <input id={id} type="date" className="field" value={v.dateRead} onChange={set('dateRead')} />}
      </Field>
      <Field label="Cantidad de lecturas">
        {(id) => <input id={id} type="number" min={0} className="field tabular" value={v.readCount} onChange={set('readCount')} />}
      </Field>
      <Field label="Notas" wide>
        {(id) => <textarea id={id} className="field min-h-24" value={v.notes} onChange={set('notes')} />}
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
