import { useRef, useState, type KeyboardEvent } from 'react';
import type { Group } from '../lib/query';
import { plural } from '../lib/format';
import { BookStack, Plant } from './Decor';
import { Spine } from './BookVisuals';

interface Props {
  groups: Group[];
  selecting: boolean;
  selected: ReadonlySet<string>;
  /** En teléfonos: filas desplazables horizontalmente. */
  scroll: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}

const ROW_SIZE_SCROLL = 24;

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export function ShelfView({ groups, selecting, selected, scroll, onOpen, onToggle }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const allIds = groups.flatMap((g) => g.books.map((b) => b.id));
  const [active, setActive] = useState<string | null>(null);
  const activeId = active && allIds.includes(active) ? active : allIds[0];

  // Un solo punto de tabulación para todo el estante; las flechas recorren los lomos.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key) || !activeId) return;
    e.preventDefault();
    const i = allIds.indexOf(activeId);
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? allIds.length - 1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? Math.min(i + 1, allIds.length - 1) : Math.max(i - 1, 0);
    const id = allIds[next]!;
    setActive(id);
    const el = container.current?.querySelector<HTMLButtonElement>(`[data-spine="${CSS.escape(id)}"]`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <div
      ref={container}
      className="bookcase"
      role="group"
      aria-label="Estante de libros. Usá las flechas para recorrerlo."
      onKeyDown={onKeyDown}
    >
      {groups.map((g, gi) => {
        const rows = scroll ? chunk(g.books, ROW_SIZE_SCROLL) : [g.books];
        const isFirst = gi === 0;
        const isLast = gi === groups.length - 1;
        return (
          <section key={g.key} aria-label={g.label || 'Todos los libros'} className="mb-2" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 600px' }}>
            {g.label && (
              <h3 className="mb-3 flex items-baseline gap-3 px-4">
                <span className="font-display text-xl font-medium">{g.label}</span>
                <span className="text-muted tabular text-sm">{plural(g.books.length, 'libro', 'libros')}</span>
              </h3>
            )}
            {rows.map((row, ri) => (
              <div key={ri} className={`shelf-row ${scroll ? 'scroll' : ''}`}>
                {isFirst && ri === 0 && (
                  <div className="slot pr-2" aria-hidden="true">
                    <BookStack />
                  </div>
                )}
                {row.map((b) => (
                  <div className="slot" key={b.id}>
                    <Spine
                      book={b}
                      selectable={selecting}
                      selected={selected.has(b.id)}
                      tabIndex={b.id === activeId ? 0 : -1}
                      onFocus={() => setActive(b.id)}
                      onClick={() => (selecting ? onToggle(b.id) : onOpen(b.id))}
                      title={`${b.title} — ${b.author}`}
                    />
                  </div>
                ))}
                {isLast && ri === rows.length - 1 && (
                  <div className="slot ml-auto pl-4" aria-hidden="true">
                    <Plant />
                  </div>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
