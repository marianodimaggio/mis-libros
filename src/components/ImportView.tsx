import { useEffect, useRef, useState, type DragEvent } from 'react';
import { parseGoodreadsCsv, type GoodreadsRow } from '../lib/goodreads';
import type { ImportPlan, ReportLine } from '../lib/importPlan';
import { formatNumber, plural } from '../lib/format';
import { applyImport, previewImport } from './importActions';
import { useToast } from './Toast';

interface Props {
  onDone: () => void;
  onGoReview: () => void;
}

const TONE_LABEL: Record<ReportLine['tone'], string> = {
  info: 'Cálculo',
  merge: 'Combinado',
  review: 'A revisar',
  warning: 'Aviso'
};

function Figure({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div className="border-t border-line pt-3">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className="font-display tabular mt-1 text-3xl font-medium">{formatNumber(value)}</dd>
      {hint && <dd className="text-muted mt-1 text-xs leading-snug">{hint}</dd>}
    </div>
  );
}

export function ImportView({ onDone, onGoReview }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<GoodreadsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeWishlist, setIncludeWishlist] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!rows) return;
    let cancelled = false;
    previewImport(rows, { includePhysicalSeed: true, includeWishlist }).then((p) => {
      if (!cancelled) setPlan(p);
    });
    return () => {
      cancelled = true;
    };
  }, [rows, includeWishlist]);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPlan(null);
    setRows(null);
    setFileName(file.name);
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      setError('El archivo tiene que ser el CSV que exporta Goodreads (goodreads_library_export.csv).');
      return;
    }
    const parsed = parseGoodreadsCsv(await file.text());
    if (parsed.missingColumns.length) {
      setError(`Al archivo le faltan columnas de Goodreads: ${parsed.missingColumns.join(', ')}. Exportalo de nuevo desde Goodreads › My Books › Import and export.`);
      return;
    }
    if (parsed.rows.length === 0) {
      setError('El archivo no tiene filas para importar.');
      return;
    }
    setRows(parsed.rows);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void readFile(e.dataTransfer.files[0]);
  };

  const confirm = async () => {
    if (!rows) return;
    setBusy(true);
    try {
      const r = await applyImport(rows, { includePhysicalSeed: true, includeWishlist });
      toast(`Importación lista: ${plural(r.created, 'libro nuevo', 'libros nuevos')}, ${plural(r.updated, 'actualizado', 'actualizados')}`);
      onDone();
    } catch (e) {
      toast(`No se pudo importar: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const s = plan?.summary;

  return (
    <section aria-labelledby="importar-titulo" className="max-w-4xl">
      <h2 id="importar-titulo" className="font-display text-4xl font-medium">
        Importar desde Goodreads
      </h2>
      <p className="text-muted mt-3 max-w-2xl leading-relaxed">
        Se importa tu historial de lectura y se combina con los 20 ejemplares fotografiados. La lista “to-read” no se agrega como biblioteca
        física: solo completa datos de esos ejemplares, salvo que elijas importarla aparte. Antes de guardar vas a ver el resultado. Importar el
        mismo archivo otra vez no duplica libros.
      </p>

      <div
        className={`mt-8 rounded-2xl border border-dashed p-8 text-center transition-colors ${dragging ? 'border-brass bg-raised' : 'border-line'}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          id="csv"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            void readFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p className="font-display text-xl">{fileName ?? 'Arrastrá acá goodreads_library_export.csv'}</p>
        <button type="button" className="btn mt-4" onClick={() => inputRef.current?.click()}>
          {fileName ? 'Elegir otro archivo' : 'Elegir archivo'}
        </button>
        <p className="text-muted mt-3 text-xs">El archivo se lee en este dispositivo y no se envía a ningún servidor.</p>
      </div>

      {error && (
        <p className="text-danger mt-4" role="alert">
          {error}
        </p>
      )}

      {rows && (
        <label className="mt-6 flex max-w-2xl items-start gap-3">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={includeWishlist} onChange={(e) => setIncludeWishlist(e.target.checked)} />
          <span>
            <span className="block">Importar también la lista “to-read” completa como “Lista de Goodreads”</span>
            <span className="text-muted block text-sm">Queda separada de tu biblioteca y sin marcar como poseída. Podés hacerlo ahora o más adelante.</span>
          </span>
        </label>
      )}

      {rows && !plan && !error && <p className="text-muted mt-8">Analizando {formatNumber(rows.length)} filas…</p>}

      {plan && s && (
        <div className="mt-10" aria-live="polite">
          <h3 className="font-display text-2xl font-medium">Antes de confirmar</h3>
          <p className="text-muted mt-2">
            {formatNumber(s.totalRows)} filas leídas: {formatNumber(s.readRows)} leídas, {formatNumber(s.toReadRows)} por leer
            {s.readingRows ? `, ${formatNumber(s.readingRows)} leyendo` : ''}.
            {s.physicalConsidered > 0 && ` ${plural(s.physicalConsidered - s.physicalAlreadyPresent, 'ejemplar fotografiado nuevo', 'ejemplares fotografiados nuevos')}.`}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            <Figure value={s.created} label="Nuevos" hint={s.createdWishlist ? `${formatNumber(s.createdWishlist)} en la lista de Goodreads` : undefined} />
            <Figure value={s.merged} label="Combinados" hint={s.physicalMatchedRead ? `${s.physicalMatchedRead} físicos con su lectura` : undefined} />
            <Figure value={s.ambiguous + s.possible} label="Ambiguos" hint="Van a la bandeja de revisión" />
            <Figure value={s.rejected} label="Rechazados" hint={s.rejected ? 'Detalle abajo' : 'Todas las filas son válidas'} />
            <Figure value={s.withoutIsbn} label="Sin ISBN" hint="De los nuevos; se muestran con lomo generado" />
          </dl>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            <Figure value={s.enriched} label="Físicos completados" hint="Con datos de la lista to-read" />
            <Figure value={s.unchanged} label="Sin cambios" hint="Ya estaban importados" />
            <Figure
              value={plan.reviews.filter((r) => r.status === 'open').length}
              label="Para revisar"
              hint={`${s.inconsistencies} inconsistencias y ediciones o variantes por confirmar`}
            />
            <Figure value={s.comics + s.possibleComics} label="Historietas excluidas" hint="Restaurables desde Revisión › Resueltas" />
            <Figure value={s.toReadNotImported} label="To-read no importados" hint="Lista de interés, no biblioteca física" />
          </dl>

          <p className="mt-8 rounded-xl border border-line bg-raised p-4">
            Tu biblioteca va a quedar con <strong className="tabular">{formatNumber(s.libraryTotalAfter)}</strong> libros
            {s.wishlistTotalAfter ? ` y ${formatNumber(s.wishlistTotalAfter)} en la lista de Goodreads` : ''}.
          </p>

          <details className="mt-6" open={plan.report.some((r) => r.tone === 'warning')}>
            <summary className="cursor-pointer select-none">Informe de importación ({plan.report.length})</summary>
            <ul className="mt-3 space-y-1.5 text-sm">
              {plan.report.map((r, i) => (
                <li key={i} className="grid grid-cols-[6.5rem_1fr] gap-3 border-t border-line pt-1.5">
                  <span className={r.tone === 'warning' ? 'text-danger' : 'text-muted'}>{TONE_LABEL[r.tone]}</span>
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
          </details>

          <div className="mt-8 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
              {busy ? 'Importando…' : 'Confirmar importación'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setRows(null);
                setPlan(null);
                setFileName(null);
              }}
            >
              Cancelar
            </button>
            {plan.reviews.some((r) => r.status === 'open') && (
              <button type="button" className="btn btn-quiet" onClick={onGoReview}>
                Ver la bandeja de revisión
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
