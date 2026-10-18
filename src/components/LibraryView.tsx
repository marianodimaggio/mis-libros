import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import { addBook, emptyDraft, findDuplicate } from '../db/repo';
import { applyImport } from './importActions';
import { useMediaQuery } from '../hooks/useLibrary';
import { formatNumber, plural } from '../lib/format';
import {
  DEFAULT_DESC,
  DEFAULT_FILTERS,
  GROUP_LABEL,
  SORT_LABEL,
  applyFilters,
  countBooks,
  groupBooks,
  sortBooks,
  type Filters,
  type GroupKey,
  type Lookups,
  type SortKey
} from '../lib/query';
import type { Book, BookDraft, Category, Location, Status } from '../lib/types';
import { BookForm } from './BookForm';
import { BookPanel } from './BookPanel';
import { BulkEditDialog } from './BulkEditDialog';
import { EmptyShelfIllustration } from './Decor';
import { ListView } from './ListView';
import { Modal } from './Modal';
import { ShelfView } from './ShelfView';
import { useToast } from './Toast';

interface Props {
  books: Book[];
  locations: Location[];
  categories: Category[];
  lk: Lookups;
  autoCovers: boolean;
  onGoImport: () => void;
}

interface ViewPrefs {
  view: 'shelf' | 'list';
  sort: SortKey;
  desc: boolean;
  group: GroupKey;
}

const PREFS_KEY = 'preferencias-vista';

function loadPrefs(): ViewPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { view: 'shelf', sort: 'author', desc: false, group: 'none', ...JSON.parse(raw) };
  } catch {
    /* sin preferencias guardadas */
  }
  return { view: 'shelf', sort: 'author', desc: false, group: 'none' };
}

export function LibraryView({ books, locations, categories, lk, autoCovers, onGoImport }: Props) {
  const [prefs, setPrefs] = useState<ViewPrefs>(loadPrefs);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [duplicate, setDuplicate] = useState<{ draft: BookDraft; existing: Book } | null>(null);
  const narrow = useMediaQuery('(max-width: 640px)');
  const toast = useToast();

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignorar */
    }
  }, [prefs]);

  const shelfBooks = useMemo(() => books.filter((b) => b.shelf === filters.shelf), [books, filters.shelf]);
  const hasWishlist = useMemo(() => books.some((b) => b.shelf === 'wishlist'), [books]);
  const searchBase = useMemo(
    () => applyFilters(books, { ...DEFAULT_FILTERS, shelf: filters.shelf }, deferredQuery, lk),
    [books, filters.shelf, deferredQuery, lk]
  );
  const counts = useMemo(() => countBooks(searchBase), [searchBase]);
  const totals = useMemo(() => countBooks(shelfBooks), [shelfBooks]);
  const visible = useMemo(
    () => sortBooks(applyFilters(books, filters, deferredQuery, lk), prefs.sort, prefs.desc, lk),
    [books, filters, deferredQuery, lk, prefs.sort, prefs.desc]
  );
  const groups = useMemo(() => groupBooks(visible, prefs.group, lk), [visible, prefs.group, lk]);
  const openBook = openId ? books.find((b) => b.id === openId) ?? null : null;

  const noFilter =
    filters.status === null && !filters.ownedOnly && !filters.missingIsbn && filters.location === null && filters.category === null;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const endSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) endSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting]);

  const setStatus = (s: Status | null) => setFilters((f) => ({ ...f, status: f.status === s ? null : s }));

  const createDraft = async (draft: BookDraft) => {
    const b = await addBook(db, draft);
    setAdding(false);
    setDuplicate(null);
    toast(`Agregaste “${b.title}”`);
  };

  if (books.length === 0) {
    return (
      <section className="mx-auto max-w-xl py-16 text-center" aria-labelledby="vacio">
        <EmptyShelfIllustration />
        <h2 id="vacio" className="font-display mt-8 text-3xl font-medium">
          Los estantes están vacíos
        </h2>
        <p className="text-muted mx-auto mt-3 max-w-md leading-relaxed">
          Importá tu exportación de Goodreads: los 20 ejemplares fotografiados se combinan solos con tu historial. También podés empezar
          solo con esos 20 o cargar un libro a mano.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={onGoImport}>
            Importar desde Goodreads
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const r = await applyImport([], { includePhysicalSeed: true, includeWishlist: false });
              toast(`Cargaste ${plural(r.created, 'libro físico', 'libros físicos')}`);
            }}
          >
            Cargar los 20 libros fotografiados
          </button>
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            Agregar un libro
          </button>
        </div>
        <AddDialog open={adding} locations={locations} categories={categories} onClose={() => setAdding(false)} onSubmit={createDraft} />
      </section>
    );
  }

  return (
    <>
      <p className="text-muted mb-8 max-w-3xl text-[0.95rem] leading-relaxed" aria-label="Resumen">
        <span className="text-ink tabular">{formatNumber(totals.all)}</span> {totals.all === 1 ? 'libro' : 'libros'}
        {filters.shelf === 'wishlist' ? ' en tu lista de Goodreads' : ''}.{' '}
        <span className="text-ink tabular">{formatNumber(totals.read)}</span> leídos,{' '}
        <span className="text-ink tabular">{formatNumber(totals.toRead)}</span> por leer y{' '}
        <span className="text-ink tabular">{formatNumber(totals.reading)}</span> en lectura.{' '}
        <span className="text-ink tabular">{formatNumber(totals.owned)}</span> {totals.owned === 1 ? 'poseído' : 'poseídos'}.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_100%] sm:flex-[1_1_16rem]">
          <label htmlFor="buscar" className="sr-only">
            Buscar por título, autor, ISBN, serie o categoría
          </label>
          <svg className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            id="buscar"
            type="search"
            className="field !rounded-full pl-9"
            placeholder="Título, autor, ISBN, serie o categoría"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="sr-only" htmlFor="orden">
          Ordenar por
        </label>
        <select
          id="orden"
          className="field min-w-0 flex-[1_1_9rem] !rounded-full sm:!w-auto sm:flex-none"
          value={prefs.sort}
          onChange={(e) => {
            const sort = e.target.value as SortKey;
            setPrefs((p) => ({ ...p, sort, desc: DEFAULT_DESC[sort] }));
          }}
        >
          {Object.entries(SORT_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              Ordenar: {l}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn px-3"
          onClick={() => setPrefs((p) => ({ ...p, desc: !p.desc }))}
          aria-label={prefs.desc ? 'Orden descendente. Cambiar a ascendente' : 'Orden ascendente. Cambiar a descendente'}
          title={prefs.desc ? 'Descendente' : 'Ascendente'}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ transform: prefs.desc ? 'scaleY(-1)' : undefined }}>
            <path d="M7 2v10M3 6l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        {prefs.view === 'shelf' && (
          <>
            <label className="sr-only" htmlFor="separar">
              Separar estantes
            </label>
            <select id="separar" className="field min-w-0 flex-[1_1_9rem] !rounded-full sm:!w-auto sm:flex-none" value={prefs.group} onChange={(e) => setPrefs((p) => ({ ...p, group: e.target.value as GroupKey }))}>
              {Object.entries(GROUP_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="segmented" role="group" aria-label="Vista">
          <button type="button" aria-pressed={prefs.view === 'shelf'} onClick={() => setPrefs((p) => ({ ...p, view: 'shelf' }))}>
            Estante
          </button>
          <button type="button" aria-pressed={prefs.view === 'list'} onClick={() => setPrefs((p) => ({ ...p, view: 'list' }))}>
            Lista
          </button>
        </div>
        <button type="button" className="btn" aria-pressed={selecting} onClick={() => (selecting ? endSelection() : setSelecting(true))}>
          {selecting ? 'Terminar selección' : 'Seleccionar'}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          Agregar libro
        </button>
      </div>

      <div className="-mx-4 mb-8 overflow-x-auto px-4 [scrollbar-width:none]">
        <div className="flex w-max gap-2 pb-1" role="group" aria-label="Filtros">
          {hasWishlist && (
            <div className="segmented mr-2" role="group" aria-label="Colección">
              <button type="button" aria-pressed={filters.shelf === 'library'} onClick={() => setFilters({ ...DEFAULT_FILTERS, shelf: 'library' })}>
                Mi biblioteca
              </button>
              <button type="button" aria-pressed={filters.shelf === 'wishlist'} onClick={() => setFilters({ ...DEFAULT_FILTERS, shelf: 'wishlist' })}>
                Lista de Goodreads
              </button>
            </div>
          )}
          <Chip pressed={noFilter} count={counts.all} onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, shelf: f.shelf }))}>
            Todos
          </Chip>
          <Chip pressed={filters.status === 'read'} count={counts.read} onClick={() => setStatus('read')}>
            Leídos
          </Chip>
          <Chip pressed={filters.status === 'to-read'} count={counts.toRead} onClick={() => setStatus('to-read')}>
            Por leer
          </Chip>
          <Chip pressed={filters.status === 'reading'} count={counts.reading} onClick={() => setStatus('reading')}>
            Leyendo
          </Chip>
          <Chip pressed={filters.ownedOnly} count={counts.owned} onClick={() => setFilters((f) => ({ ...f, ownedOnly: !f.ownedOnly }))}>
            Poseídos
          </Chip>
          <Chip pressed={filters.missingIsbn} count={counts.missingIsbn} onClick={() => setFilters((f) => ({ ...f, missingIsbn: !f.missingIsbn }))}>
            Sin ISBN
          </Chip>
          {locations.map((l) => (
            <Chip
              key={l.id}
              pressed={filters.location === l.id}
              count={counts.byLocation.get(l.id) ?? 0}
              onClick={() => setFilters((f) => ({ ...f, location: f.location === l.id ? null : l.id }))}
            >
              {l.name}
            </Chip>
          ))}
          {categories.map((c) => (
            <Chip
              key={c.id}
              pressed={filters.category === c.id}
              count={counts.byCategory.get(c.id) ?? 0}
              onClick={() => setFilters((f) => ({ ...f, category: f.category === c.id ? null : c.id }))}
            >
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {plural(visible.length, 'libro visible', 'libros visibles')}
      </p>

      {visible.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-display text-2xl">Ningún libro coincide{deferredQuery ? ` con “${deferredQuery}”` : ' con estos filtros'}.</p>
          <p className="text-muted mt-2">Probá con otra palabra o quitá algún filtro.</p>
          <button
            type="button"
            className="btn mt-6"
            onClick={() => {
              setQuery('');
              setFilters((f) => ({ ...DEFAULT_FILTERS, shelf: f.shelf }));
            }}
          >
            Quitar búsqueda y filtros
          </button>
        </div>
      ) : prefs.view === 'shelf' ? (
        <ShelfView groups={groups} selecting={selecting} selected={selected} scroll={narrow} onOpen={setOpenId} onToggle={toggle} />
      ) : (
        <ListView books={visible} lk={lk} autoCovers={autoCovers} selecting={selecting} selected={selected} onOpen={setOpenId} onToggle={toggle} />
      )}

      {selecting && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-raised/95 px-4 py-3 backdrop-blur-sm"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          role="region"
          aria-label="Selección"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
            <p className="mr-auto text-sm" aria-live="polite">
              <span className="tabular font-medium">{plural(selected.size, 'libro seleccionado', 'libros seleccionados')}</span>
            </p>
            <button type="button" className="btn" onClick={() => setSelected(new Set(visible.map((b) => b.id)))}>
              Seleccionar los {formatNumber(visible.length)} visibles
            </button>
            <button type="button" className="btn" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
              Vaciar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setBulkOpen(true)} disabled={selected.size === 0}>
              Editar selección
            </button>
          </div>
        </div>
      )}
      {selecting && <div className="h-24" aria-hidden="true" />}

      <BookPanel book={openBook} lk={lk} locations={locations} categories={categories} autoCovers={autoCovers} onClose={() => setOpenId(null)} />
      <BulkEditDialog
        open={bulkOpen}
        ids={[...selected]}
        locations={locations}
        categories={categories}
        onClose={() => setBulkOpen(false)}
        onDone={() => {
          setBulkOpen(false);
          endSelection();
        }}
      />
      <AddDialog
        open={adding}
        locations={locations}
        categories={categories}
        onClose={() => setAdding(false)}
        onSubmit={async (draft) => {
          const existing = await findDuplicate(db, draft);
          if (existing) setDuplicate({ draft, existing });
          else await createDraft(draft);
        }}
      />
      <Modal
        open={duplicate !== null}
        onClose={() => setDuplicate(null)}
        title="Este libro ya parece estar cargado"
        footer={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (duplicate) {
                  setAdding(false);
                  setOpenId(duplicate.existing.id);
                }
                setDuplicate(null);
              }}
            >
              Ver el existente
            </button>
            <button type="button" className="btn btn-primary" onClick={() => duplicate && createDraft(duplicate.draft)}>
              Agregar igual
            </button>
          </>
        }
      >
        {duplicate && (
          <p className="text-muted leading-relaxed">
            Ya existe “{duplicate.existing.title}” de {duplicate.existing.author}
            {duplicate.existing.isbn13 ? ` (ISBN ${duplicate.existing.isbn13})` : ''}. Si es otro ejemplar u otra edición, podés agregarlo igual.
          </p>
        )}
      </Modal>
    </>
  );
}

function Chip({ pressed, count, onClick, children }: { pressed: boolean; count: number; onClick: () => void; children: string }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {children}
      <span className="count tabular">
        {formatNumber(count)}
      </span>
    </button>
  );
}

function AddDialog({
  open,
  locations,
  categories,
  onClose,
  onSubmit
}: {
  open: boolean;
  locations: Location[];
  categories: Category[];
  onClose: () => void;
  onSubmit: (d: BookDraft) => void | Promise<void>;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Agregar un libro">
      <BookForm
        initial={emptyDraft('manual')}
        locations={locations}
        categories={categories}
        submitLabel="Agregar libro"
        onCancel={onClose}
        onSubmit={(values) => onSubmit({ ...emptyDraft('manual'), ...values })}
      />
    </Modal>
  );
}
