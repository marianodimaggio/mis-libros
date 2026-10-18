import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { db } from '../db/db';
import { getMeta, setMeta } from '../db/repo';
import type { Book, Category, Location } from '../lib/types';

const EMPTY_BOOKS: Book[] = [];

export function useLibraryData() {
  const books = useLiveQuery(() => db.books.toArray(), []);
  const locations = useLiveQuery(async () => (await db.locations.toArray()).sort((a, b) => a.order - b.order), []);
  const categories = useLiveQuery(
    async () => (await db.categories.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    []
  );
  const openReviews = useLiveQuery(() => db.reviews.where('status').equals('open').count(), []);
  return {
    loading: books === undefined || locations === undefined || categories === undefined,
    books: books ?? EMPTY_BOOKS,
    locations: locations ?? ([] as Location[]),
    categories: categories ?? ([] as Category[]),
    openReviews: openReviews ?? 0
  };
}

export function useMeta<T>(key: string, fallback: T): [T, (v: T) => Promise<void>] {
  const value = useLiveQuery(() => getMeta(db, key, fallback), [key]);
  const set = useCallback((v: T) => setMeta(db, key, v), [key]);
  return [value ?? fallback, set];
}

export type Theme = 'dark' | 'light';

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ebe4d8' : '#1a1511');
    try {
      localStorage.setItem('tema', theme);
    } catch {
      /* almacenamiento no disponible: el tema dura la sesión */
    }
  }, [theme]);
  return [theme, setTheme];
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export type Route = 'biblioteca' | 'revision' | 'importar' | 'datos';
const ROUTES: Route[] = ['biblioteca', 'revision', 'importar', 'datos'];

function readRoute(): Route {
  const r = window.location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(r) ? r : 'biblioteca';
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const route = useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    readRoute,
    () => 'biblioteca' as Route
  );
  const go = useCallback((r: Route) => {
    window.location.hash = r === 'biblioteca' ? '/' : `/${r}`;
  }, []);
  return [route, go];
}
