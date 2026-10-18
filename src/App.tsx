import { useMemo } from 'react';
import { DataView } from './components/DataView';
import { ImportView } from './components/ImportView';
import { LibraryView } from './components/LibraryView';
import { ReviewView } from './components/ReviewView';
import { ToastProvider } from './components/Toast';
import { useHashRoute, useLibraryData, useMeta, useTheme, type Route } from './hooks/useLibrary';
import { formatNumber } from './lib/format';
import { makeLookups } from './lib/query';

const NAV: { route: Route; label: string }[] = [
  { route: 'biblioteca', label: 'Biblioteca' },
  { route: 'revision', label: 'Revisión' },
  { route: 'importar', label: 'Importar' },
  { route: 'datos', label: 'Datos' }
];

export default function App() {
  const data = useLibraryData();
  const [route, go] = useHashRoute();
  const [theme, setTheme] = useTheme();
  const [autoCovers, setAutoCovers] = useMeta<boolean>('autoCovers', true);
  const [lastBackupAt, setLastBackupAt] = useMeta<string | null>('lastBackupAt', null);
  const lk = useMemo(() => makeLookups(data.locations, data.categories), [data.locations, data.categories]);
  const isLibrary = route === 'biblioteca';

  return (
    <ToastProvider>
      <a href="#contenido" className="sr-only-focusable btn btn-primary fixed top-3 left-3 z-50">
        Saltar al contenido
      </a>
      <div className="mx-auto max-w-[88rem] px-4 pt-6 pb-16 sm:px-8 sm:pt-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <h1 className={`font-display leading-[0.9] font-medium tracking-[-0.01em] ${isLibrary ? 'text-[clamp(3.2rem,9vw,6.5rem)]' : 'text-4xl'}`}>
            <a href="#/" className="rounded-sm">
              Mi biblioteca
            </a>
          </h1>
          <nav aria-label="Secciones" className="-mx-1 flex max-w-full items-center gap-0.5 overflow-x-auto pb-2 [scrollbar-width:none] sm:gap-1">
            {NAV.map((n) => (
              <a
                key={n.route}
                href={n.route === 'biblioteca' ? '#/' : `#/${n.route}`}
                aria-current={route === n.route ? 'page' : undefined}
                className={`flex-none rounded-full px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors sm:px-3 ${route === n.route ? 'bg-raised text-ink' : 'text-muted hover:text-ink'}`}
              >
                {n.label}
                {n.route === 'revision' && data.openReviews > 0 && (
                  <span className="tabular ml-1.5 rounded-full bg-brass px-1.5 py-0.5 text-[0.7rem] font-semibold text-on-brass">
                    {formatNumber(data.openReviews)}
                    <span className="sr-only"> pendientes</span>
                  </span>
                )}
              </a>
            ))}
            <button
              type="button"
              className="text-muted hover:text-ink ml-1 rounded-full p-2"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                {theme === 'dark' ? (
                  <path d="M14.5 11.2A6 6 0 0 1 6.8 3.5a6 6 0 1 0 7.7 7.7Z" fill="currentColor" />
                ) : (
                  <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="9" cy="9" r="3.2" fill="none" />
                    <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" />
                  </g>
                )}
              </svg>
            </button>
          </nav>
        </header>

        <main id="contenido" tabIndex={-1} className="outline-none">
          {data.loading ? (
            <p className="text-muted py-16">Abriendo la biblioteca…</p>
          ) : route === 'biblioteca' ? (
            <LibraryView
              books={data.books}
              locations={data.locations}
              categories={data.categories}
              lk={lk}
              autoCovers={autoCovers}
              onGoImport={() => go('importar')}
            />
          ) : route === 'revision' ? (
            <ReviewView autoCovers={autoCovers} />
          ) : route === 'importar' ? (
            <ImportView onDone={() => go('biblioteca')} onGoReview={() => go('revision')} />
          ) : (
            <DataView
              books={data.books}
              locations={data.locations}
              categories={data.categories}
              lk={lk}
              autoCovers={autoCovers}
              setAutoCovers={setAutoCovers}
              lastBackupAt={lastBackupAt}
              setLastBackupAt={setLastBackupAt}
              theme={theme}
              setTheme={setTheme}
            />
          )}
        </main>
      </div>
    </ToastProvider>
  );
}
