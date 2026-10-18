import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { REVIEW_ACTION_LABEL, actionsFor, resolveReview, type ReviewAction } from '../db/repo';
import { coverUrlFor } from '../lib/covers';
import { formatDateTime, formatNumber, plural } from '../lib/format';
import type { ReviewItem, ReviewKind } from '../lib/types';
import { ConfirmDialog } from './Modal';
import { useToast } from './Toast';

const KIND_INFO: Record<ReviewKind, { title: string; text: string }> = {
  inconsistency: {
    title: 'Lecturas registradas en libros “por leer”',
    text: 'Goodreads los tiene en “to-read”, pero con lecturas o fecha de lectura. No se importaron hasta que decidas.'
  },
  'edition-proposal': {
    title: 'Ediciones por confirmar',
    text: 'Coinciden por título y autor con un registro de Goodreads, pero esa edición puede no ser la de tu ejemplar. Su ISBN y su tapa solo se usan si lo confirmás.'
  },
  'possible-match': {
    title: 'Posibles variantes',
    text: 'Títulos parecidos del mismo autor. Se mantienen separados hasta que los vincules.'
  },
  ambiguous: {
    title: 'Coincidencias ambiguas',
    text: 'Más de un candidato posible. No se creó ni se combinó nada.'
  },
  comic: {
    title: 'Historietas excluidas',
    text: 'No forman parte del catálogo: Goodreads las clasifica como historieta o su editorial publica historieta o manga. Si alguna es un libro, importala igualmente.'
  },
  'possible-comic': {
    title: 'Posibles historietas',
    text: 'Goodreads no los clasifica, pero la editorial publica historieta o manga. Están en tu catálogo; si los excluís, podés restaurarlos desde “Resueltas”.'
  }
};

const ORDER: ReviewKind[] = ['inconsistency', 'edition-proposal', 'possible-match', 'ambiguous', 'comic', 'possible-comic'];

const PROPOSAL_LABEL: Record<string, string> = {
  isbn13: 'ISBN-13',
  isbn10: 'ISBN-10',
  publisher: 'Editorial',
  binding: 'Encuadernación',
  pageCount: 'Páginas',
  yearPublished: 'Año',
  additionalAuthors: 'Autores adicionales'
};

interface Props {
  autoCovers: boolean;
}

export function ReviewView({ autoCovers }: Props) {
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [bulk, setBulk] = useState<{ kind: ReviewKind; action: ReviewAction; items: ReviewItem[] } | null>(null);
  const reviews = useLiveQuery(() => db.reviews.toArray(), []) ?? [];
  const toast = useToast();

  const open = reviews.filter((r) => r.status === 'open');
  const done = reviews.filter((r) => r.status !== 'open').sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''));
  const list = tab === 'open' ? open : done;

  const act = async (r: ReviewItem, action: ReviewAction) => {
    await resolveReview(db, r.id, action);
    toast(`${REVIEW_ACTION_LABEL[action]}: ${r.title}`);
  };

  const runBulk = async () => {
    if (!bulk) return;
    for (const r of bulk.items) await resolveReview(db, r.id, bulk.action);
    toast(`${REVIEW_ACTION_LABEL[bulk.action]}: ${plural(bulk.items.length, 'elemento', 'elementos')}`);
    setBulk(null);
  };

  return (
    <section aria-labelledby="revision-titulo" className="max-w-4xl">
      <h2 id="revision-titulo" className="font-display text-4xl font-medium">
        Revisión
      </h2>
      <p className="text-muted mt-3 max-w-2xl leading-relaxed">
        Lo que la importación no pudo decidir sin inventar datos. Nada de esto se corrigió automáticamente.
      </p>

      <div className="segmented mt-6" role="group" aria-label="Estado de la revisión">
        <button type="button" aria-pressed={tab === 'open'} onClick={() => setTab('open')}>
          Pendientes ({formatNumber(open.length)})
        </button>
        <button type="button" aria-pressed={tab === 'done'} onClick={() => setTab('done')}>
          Resueltas ({formatNumber(done.length)})
        </button>
      </div>

      {list.length === 0 && (
        <p className="font-display mt-12 text-2xl">{tab === 'open' ? 'No hay nada pendiente de revisar.' : 'Todavía no resolviste nada.'}</p>
      )}

      {ORDER.map((kind) => {
        const items = list.filter((r) => r.kind === kind);
        if (items.length === 0) return null;
        const bulkActions: ReviewAction[] =
          tab !== 'open' || items.length < 2 ? [] : kind === 'possible-comic' ? ['exclude', 'keep'] : kind === 'edition-proposal' ? ['dismiss'] : [];
        return (
          <section key={kind} className="mt-10" aria-labelledby={`k-${kind}`}>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <h3 id={`k-${kind}`} className="font-display text-2xl font-medium">
                {KIND_INFO[kind].title} <span className="text-muted tabular text-lg">{formatNumber(items.length)}</span>
              </h3>
              <div className="ml-auto flex gap-2">
                {bulkActions.map((a) => (
                  <button key={a} type="button" className="btn" onClick={() => setBulk({ kind, action: a, items })}>
                    {REVIEW_ACTION_LABEL[a]} ({formatNumber(items.length)})
                  </button>
                ))}
              </div>
            </div>
            <p className="text-muted mt-1 max-w-2xl text-sm">{KIND_INFO[kind].text}</p>
            <ul className="mt-4">
              {items.map((r) => (
                <ReviewRow key={r.id} r={r} autoCovers={autoCovers} onAct={act} />
              ))}
            </ul>
          </section>
        );
      })}

      <ConfirmDialog
        open={bulk !== null}
        title={bulk ? `${REVIEW_ACTION_LABEL[bulk.action]}: ${plural(bulk.items.length, 'elemento', 'elementos')}` : ''}
        message={
          bulk?.action === 'exclude'
            ? 'Se quitan del catálogo. Quedan en “Resueltas” con una copia, para restaurarlos uno por uno si te equivocás.'
            : 'Se aplica la misma decisión a todos los elementos de este grupo.'
        }
        confirmLabel={bulk ? REVIEW_ACTION_LABEL[bulk.action] : ''}
        danger={bulk?.action === 'exclude'}
        onCancel={() => setBulk(null)}
        onConfirm={runBulk}
      />
    </section>
  );
}

function ReviewRow({ r, autoCovers, onAct }: { r: ReviewItem; autoCovers: boolean; onAct: (r: ReviewItem, a: ReviewAction) => void }) {
  const proposalCover =
    r.proposal && (r.proposal.isbn13 || r.proposal.isbn10)
      ? coverUrlFor({ coverSource: null, coverUrl: null, isbn13: r.proposal.isbn13 ?? null, isbn10: r.proposal.isbn10 ?? null }, autoCovers)
      : null;
  const editionRows = r.kind === 'edition-proposal' && r.proposal ? Object.entries(r.proposal) : [];
  return (
    <li className="border-t border-line py-4">
      <div className="flex gap-4">
        {proposalCover && (
          <img src={proposalCover} alt="Tapa de la edición propuesta" className="h-24 w-16 flex-none rounded-[2px] object-cover" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{r.title}</p>
          <p className="text-muted mt-1 text-sm leading-relaxed">{r.detail}</p>
          {editionRows.length > 0 && (
            <dl className="mt-2 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-0.5 text-sm">
              {editionRows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{PROPOSAL_LABEL[k] ?? k}</dt>
                  <dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {r.status !== 'open' && (
            <p className="text-muted mt-2 text-xs">
              {r.resolution}, {formatDateTime(r.resolvedAt)}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {actionsFor(r).map((a, i) => (
              <button key={a} type="button" className={i === 0 && r.kind !== 'possible-comic' ? 'btn btn-primary' : 'btn'} onClick={() => onAct(r, a)}>
                {REVIEW_ACTION_LABEL[a]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}
