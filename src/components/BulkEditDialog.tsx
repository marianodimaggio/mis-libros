import { useState } from 'react';
import { db } from '../db/db';
import { bulkUpdate, type BulkPatch } from '../db/repo';
import { plural } from '../lib/format';
import { FORMAT_LABEL, STATUS_LABEL, type Category, type Format, type Location, type Status } from '../lib/types';
import { Modal } from './Modal';
import { useToast } from './Toast';

interface Props {
  open: boolean;
  ids: string[];
  locations: Location[];
  categories: Category[];
  onClose: () => void;
  onDone: () => void;
}

const KEEP = '__keep__';

export function BulkEditDialog({ open, ids, locations, categories, onClose, onDone }: Props) {
  const [status, setStatus] = useState(KEEP);
  const [owned, setOwned] = useState(KEEP);
  const [location, setLocation] = useState(KEEP);
  const [format, setFormat] = useState(KEEP);
  const [shelf, setShelf] = useState(KEEP);
  const [catMode, setCatMode] = useState<'keep' | 'add' | 'remove' | 'replace'>('keep');
  const [cats, setCats] = useState<string[]>([]);
  const toast = useToast();

  const reset = () => {
    setStatus(KEEP);
    setOwned(KEEP);
    setLocation(KEEP);
    setFormat(KEEP);
    setShelf(KEEP);
    setCatMode('keep');
    setCats([]);
  };

  const patch: BulkPatch = {};
  if (status !== KEEP) patch.status = status as Status;
  if (owned !== KEEP) patch.owned = owned === 'unknown' ? null : owned === 'yes';
  if (location !== KEEP) patch.location = location || null;
  if (format !== KEEP) patch.format = (format || null) as Format | null;
  if (shelf !== KEEP) patch.shelf = shelf as 'library' | 'wishlist';
  if (catMode !== 'keep' && (cats.length > 0 || catMode === 'replace')) patch.categories = { mode: catMode, ids: cats };
  const changes = Object.keys(patch).length;

  const apply = async () => {
    const n = await bulkUpdate(db, ids, patch);
    toast(`Se actualizaron ${plural(n, 'libro', 'libros')}`);
    reset();
    onDone();
  };

  const select = (label: string, value: string, onChange: (v: string) => void, options: [string, string][]) => (
    <label className="block">
      <span className="text-muted mb-1 block text-xs font-medium">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={KEEP}>Sin cambios</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={`Editar ${plural(ids.length, 'libro', 'libros')}`}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={changes === 0} onClick={apply}>
            Aplicar a {plural(ids.length, 'libro', 'libros')}
          </button>
        </>
      }
    >
      <p className="text-muted mb-4 text-sm">Solo cambian los campos que elijas. El resto queda como está en cada libro.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {select('Estado', status, setStatus, Object.entries(STATUS_LABEL))}
        {select('Propiedad', owned, setOwned, [
          ['yes', 'Poseído'],
          ['no', 'No poseído'],
          ['unknown', 'Desconocido']
        ])}
        {select('Ubicación', location, setLocation, [['', 'Sin ubicación'], ...locations.map((l): [string, string] => [l.id, l.name])])}
        {select('Formato', format, setFormat, [['', 'Sin indicar'], ...Object.entries(FORMAT_LABEL)])}
        {select('Lista', shelf, setShelf, [
          ['library', 'Mi biblioteca'],
          ['wishlist', 'Lista de Goodreads']
        ])}
      </div>
      <fieldset className="mt-5">
        <legend className="text-muted mb-2 text-xs font-medium">Categorías</legend>
        <div className="segmented mb-3" role="group" aria-label="Cómo aplicar las categorías">
          {(
            [
              ['keep', 'Sin cambios'],
              ['add', 'Agregar'],
              ['remove', 'Quitar'],
              ['replace', 'Reemplazar']
            ] as const
          ).map(([m, l]) => (
            <button key={m} type="button" aria-pressed={catMode === m} onClick={() => setCatMode(m)}>
              {l}
            </button>
          ))}
        </div>
        {catMode !== 'keep' &&
          (categories.length === 0 ? (
            <p className="text-muted text-sm">Todavía no creaste categorías. Podés hacerlo en Datos.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = cats.includes(c.id);
                return (
                  <button key={c.id} type="button" className="chip" aria-pressed={on} onClick={() => setCats((xs) => (on ? xs.filter((x) => x !== c.id) : [...xs, c.id]))}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          ))}
        {catMode === 'replace' && cats.length === 0 && categories.length > 0 && (
          <p className="text-muted mt-2 text-xs">Sin categorías elegidas, “Reemplazar” deja los libros sin categoría.</p>
        )}
      </fieldset>
    </Modal>
  );
}
