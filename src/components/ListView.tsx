import type { Lookups } from '../lib/query';
import { formatDate } from '../lib/format';
import { STATUS_LABEL, type Book } from '../lib/types';
import { Cover } from './BookVisuals';

interface Props {
  books: Book[];
  lk: Lookups;
  autoCovers: boolean;
  selecting: boolean;
  selected: ReadonlySet<string>;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}

function Stars({ value }: { value: number | null }) {
  if (!value) return <span className="text-muted">—</span>;
  return (
    <span aria-label={`${value} de 5`} className="text-brass">
      {'★'.repeat(value)}
      <span className="opacity-25">{'★'.repeat(5 - value)}</span>
    </span>
  );
}

export function ListView({ books, lk, autoCovers, selecting, selected, onOpen, onToggle }: Props) {
  return (
    <div className="overflow-x-auto px-1">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Libros de la biblioteca</caption>
        <thead>
          <tr className="text-muted text-left text-xs">
            {selecting && (
              <th scope="col" className="w-10 py-2 pl-2 font-medium">
                <span className="sr-only">Seleccionar</span>
              </th>
            )}
            <th scope="col" className="py-2 pl-2 font-medium">
              Libro
            </th>
            <th scope="col" className="hidden py-2 font-medium sm:table-cell">
              Estado
            </th>
            <th scope="col" className="hidden py-2 font-medium md:table-cell">
              Ubicación
            </th>
            <th scope="col" className="hidden py-2 font-medium lg:table-cell">
              Valoración
            </th>
            <th scope="col" className="hidden py-2 pr-2 font-medium lg:table-cell">
              Leído
            </th>
          </tr>
        </thead>
        <tbody>
          {books.map((b) => {
            const isSel = selected.has(b.id);
            return (
              <tr key={b.id} className={`group ${isSel ? 'bg-raised' : ''}`} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 64px' }}>
                {selecting && (
                  <td className="border-t border-line py-2 pl-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={isSel}
                      onChange={() => onToggle(b.id)}
                      aria-label={`Seleccionar ${b.title}`}
                    />
                  </td>
                )}
                <td className="border-t border-line py-2 pl-2">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md text-left"
                    onClick={() => (selecting ? onToggle(b.id) : onOpen(b.id))}
                  >
                    <Cover book={b} autoCovers={autoCovers} size="sm" className="h-14 w-9 flex-none" />
                    <span className="min-w-0">
                      <span className="block truncate font-display text-[1.1rem] leading-snug font-medium">{b.title}</span>
                      <span className="text-muted block truncate">
                        {b.author}
                        <span className="ml-2 text-xs sm:hidden">({STATUS_LABEL[b.status].toLowerCase()})</span>
                      </span>
                    </span>
                  </button>
                </td>
                <td className="hidden border-t border-line py-2 sm:table-cell">
                  {STATUS_LABEL[b.status]}
                  {b.owned === true && <span className="text-muted block text-xs">Poseído</span>}
                </td>
                <td className="text-muted hidden border-t border-line py-2 md:table-cell">
                  {b.location ? lk.locations.get(b.location)?.name : '—'}
                </td>
                <td className="hidden border-t border-line py-2 lg:table-cell">
                  <Stars value={b.rating} />
                </td>
                <td className="text-muted tabular hidden border-t border-line py-2 pr-2 lg:table-cell">{formatDate(b.dateRead) || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
