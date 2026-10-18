import { useEffect, useRef, useState } from 'react';
import { db, SCHEMA_VERSION } from '../db/db';
import {
  createBackup,
  createCategory,
  createLocation,
  deleteCategory,
  deleteLocation,
  renameCategory,
  renameLocation,
  restoreBackup,
  validateBackup,
  type BackupFile
} from '../db/repo';
import { booksToCsv } from '../lib/exportCsv';
import { downloadText, formatDateTime, formatNumber, plural, today } from '../lib/format';
import type { Lookups } from '../lib/query';
import type { Book, Category, Location } from '../lib/types';
import type { Theme } from '../hooks/useLibrary';
import { ConfirmDialog } from './Modal';
import { useToast } from './Toast';

interface Props {
  books: Book[];
  locations: Location[];
  categories: Category[];
  lk: Lookups;
  autoCovers: boolean;
  setAutoCovers: (v: boolean) => Promise<void>;
  lastBackupAt: string | null;
  setLastBackupAt: (v: string | null) => Promise<void>;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line py-8 first:border-t-0 first:pt-0">
      <h3 id={id} className="font-display mb-3 text-2xl font-medium">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DataView(p: Props) {
  const toast = useToast();
  const restoreRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
    void navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB`);
    });
  }, [p.books.length]);

  const daysSinceBackup = p.lastBackupAt ? Math.floor((Date.now() - new Date(p.lastBackupAt).getTime()) / 86_400_000) : null;
  const backupStale = p.books.length > 0 && (daysSinceBackup === null || daysSinceBackup > 30);

  const download = async () => {
    const backup = await createBackup(db, SCHEMA_VERSION);
    downloadText(`mi-biblioteca-respaldo-${today()}.json`, JSON.stringify(backup, null, 2), 'application/json');
    await p.setLastBackupAt(backup.exportedAt);
    toast('Copia de seguridad descargada');
  };

  const pickRestore = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPending(validateBackup(JSON.parse(await file.text()), SCHEMA_VERSION));
    } catch (e) {
      toast(e instanceof SyntaxError ? 'El archivo no es un JSON válido.' : e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <section aria-labelledby="datos-titulo" className="max-w-3xl">
      <h2 id="datos-titulo" className="font-display text-4xl font-medium">
        Datos
      </h2>
      <p className="text-muted mt-3 mb-10 max-w-2xl leading-relaxed">
        Todo se guarda en este navegador. No hay cuenta ni servidor: la copia de seguridad es la única forma de pasar tus datos a otro
        dispositivo o recuperarlos si borrás el navegador.
      </p>

      <Section id="s-respaldo" title="Copia de seguridad">
        <p className={backupStale ? 'text-danger' : 'text-muted'}>
          {p.lastBackupAt
            ? `Último respaldo: ${formatDateTime(p.lastBackupAt)}${daysSinceBackup !== null && daysSinceBackup > 0 ? ` (hace ${plural(daysSinceBackup, 'día', 'días')})` : ''}.`
            : 'Todavía no descargaste ninguna copia de seguridad.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={download}>
            Descargar copia de seguridad
          </button>
          <input ref={restoreRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} onChange={(e) => {
            void pickRestore(e.target.files?.[0]);
            e.target.value = '';
          }} />
          <button type="button" className="btn" onClick={() => restoreRef.current?.click()}>
            Restaurar desde un respaldo
          </button>
        </div>
        <p className="text-muted mt-3 text-sm">El respaldo JSON incluye libros, revisiones, ubicaciones, categorías y la procedencia de cada dato.</p>
      </Section>

      <Section id="s-csv" title="Exportar catálogo">
        <p className="text-muted">Un CSV con una fila por libro, para abrir en una planilla.</p>
        <button
          type="button"
          className="btn mt-4"
          disabled={p.books.length === 0}
          onClick={() => {
            downloadText(`mi-biblioteca-${today()}.csv`, booksToCsv(p.books, p.lk), 'text/csv;charset=utf-8');
            toast('Catálogo exportado');
          }}
        >
          Exportar {plural(p.books.length, 'libro', 'libros')} en CSV
        </button>
      </Section>

      <Section id="s-ubic" title="Ubicaciones">
        <NamedList
          items={p.locations}
          counts={(id) => p.books.filter((b) => b.location === id).length}
          noun="ubicación"
          onCreate={(n) => createLocation(db, n)}
          onRename={(id, n) => renameLocation(db, id, n)}
          onDelete={(id) => deleteLocation(db, id)}
        />
      </Section>

      <Section id="s-cat" title="Categorías">
        <NamedList
          items={p.categories}
          counts={(id) => p.books.filter((b) => b.categories.includes(id)).length}
          noun="categoría"
          onCreate={(n) => createCategory(db, n)}
          onRename={(id, n) => renameCategory(db, id, n)}
          onDelete={(id) => deleteCategory(db, id)}
        />
      </Section>

      <Section id="s-tapas" title="Tapas">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={p.autoCovers} onChange={(e) => void p.setAutoCovers(e.target.checked)} />
          <span>
            <span className="block">Buscar tapas en Open Library a partir del ISBN</span>
            <span className="text-muted block text-sm">
              Para mostrar una tapa, el navegador le pide a covers.openlibrary.org la imagen de ese ISBN. No se envía ningún otro dato. Sin esta
              opción se muestran solo lomos generados y las tapas que subas.
            </span>
          </span>
        </label>
      </Section>

      <Section id="s-alm" title="Almacenamiento">
        <p className="text-muted">
          {persisted === null
            ? 'Este navegador no informa si el almacenamiento es persistente.'
            : persisted
              ? 'El navegador no va a borrar estos datos para liberar espacio.'
              : 'El navegador podría borrar estos datos si se queda sin espacio.'}
          {usage ? ` Espacio usado: ${usage}.` : ''}
        </p>
        {persisted === false && (
          <button
            type="button"
            className="btn mt-4"
            onClick={async () => {
              const ok = await navigator.storage.persist();
              setPersisted(ok);
              toast(ok ? 'Almacenamiento persistente activado' : 'El navegador no lo permitió. Instalá la aplicación y volvé a intentarlo.', ok ? 'ok' : 'error');
            }}
          >
            Pedir almacenamiento persistente
          </button>
        )}
      </Section>

      <Section id="s-apar" title="Apariencia">
        <div className="segmented" role="group" aria-label="Tema">
          <button type="button" aria-pressed={p.theme === 'dark'} onClick={() => p.setTheme('dark')}>
            Oscuro
          </button>
          <button type="button" aria-pressed={p.theme === 'light'} onClick={() => p.setTheme('light')}>
            Claro
          </button>
        </div>
      </Section>

      <ConfirmDialog
        open={pending !== null}
        title="¿Reemplazar todos los datos?"
        message={
          pending && (
            <>
              Vas a reemplazar {plural(p.books.length, 'libro actual', 'libros actuales')} por {plural(pending.books.length, 'libro', 'libros')} del
              respaldo del {formatDateTime(pending.exportedAt)}. Si no descargaste una copia de lo actual, se pierde.
            </>
          )
        }
        confirmLabel="Restaurar respaldo"
        danger
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          await restoreBackup(db, pending);
          toast(`Restauraste ${plural(pending.books.length, 'libro', 'libros')}`);
          setPending(null);
        }}
      />
    </section>
  );
}

interface NamedListProps {
  items: (Location | Category)[];
  counts: (id: string) => number;
  noun: string;
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

function NamedList({ items, counts, noun, onCreate, onRename, onDelete }: NamedListProps) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<Location | Category | null>(null);
  const toast = useToast();
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      return false;
    }
  };

  return (
    <>
      {items.length === 0 && <p className="text-muted mb-3">Todavía no hay ninguna {noun}.</p>}
      <ul>
        {items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-center gap-2 border-t border-line py-2">
            {editing?.id === it.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run(() => onRename(it.id, editing.name), 'Nombre actualizado')) setEditing(null);
                }}
              >
                <label className="sr-only" htmlFor={`ren-${it.id}`}>
                  Nuevo nombre
                </label>
                <input id={`ren-${it.id}`} className="field" value={editing.name} onChange={(e) => setEditing({ id: it.id, name: e.target.value })} autoFocus />
                <button type="submit" className="btn btn-primary">
                  Guardar
                </button>
                <button type="button" className="btn" onClick={() => setEditing(null)}>
                  Cancelar
                </button>
              </form>
            ) : (
              <>
                <span className="flex-1">
                  {it.name} <span className="text-muted tabular text-sm">{formatNumber(counts(it.id))}</span>
                </span>
                <button type="button" className="btn btn-quiet" onClick={() => setEditing({ id: it.id, name: it.name })} aria-label={`Renombrar ${it.name}`}>
                  Renombrar
                </button>
                <button type="button" className="btn btn-quiet text-danger" onClick={() => setRemoving(it)} aria-label={`Eliminar ${it.name}`}>
                  Eliminar
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => onCreate(draft), `Creaste “${draft.trim()}”`)) setDraft('');
        }}
      >
        <label className="sr-only" htmlFor={`nueva-${noun}`}>
          Nueva {noun}
        </label>
        <input id={`nueva-${noun}`} className="field" placeholder={`Nueva ${noun}`} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="btn" disabled={!draft.trim()}>
          Crear
        </button>
      </form>
      <ConfirmDialog
        open={removing !== null}
        title={`¿Eliminar “${removing?.name ?? ''}”?`}
        message={removing ? `${plural(counts(removing.id), 'libro queda', 'libros quedan')} sin esta ${noun}. Los libros no se borran.` : ''}
        confirmLabel={`Eliminar ${noun}`}
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing) await run(() => onDelete(removing.id), `Eliminaste “${removing.name}”`);
          setRemoving(null);
        }}
      />
    </>
  );
}
