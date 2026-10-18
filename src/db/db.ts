import Dexie, { type EntityTable } from 'dexie';
import { INITIAL_CATEGORIES, INITIAL_LOCATIONS } from '../lib/seed';
import type { Book, Category, Location, MetaEntry, ReviewItem } from '../lib/types';

export const DB_NAME = 'mis-libros';
export const SCHEMA_VERSION = 2;

export type LibraryDB = Dexie & {
  books: EntityTable<Book, 'id'>;
  reviews: EntityTable<ReviewItem, 'id'>;
  locations: EntityTable<Location, 'id'>;
  categories: EntityTable<Category, 'id'>;
  meta: EntityTable<MetaEntry, 'key'>;
};

/**
 * Historial de esquema. Nunca editar una versión publicada: agregar una nueva.
 * v1: tablas base.
 * v2: índice por estante (biblioteca / lista de Goodreads) y por clave de semilla;
 *     completa `shelf`, `format` y `seedKey` en registros creados con v1.
 */
export function defineSchema(db: Dexie): void {
  db.version(1).stores({
    books: 'id, goodreadsBookId, isbn13, isbn10, normalizedTitle, normalizedAuthor, status, location, *categories, updatedAt',
    reviews: 'id, &key, kind, status',
    locations: 'id, name',
    categories: 'id, name',
    meta: 'key'
  });

  db.version(2)
    .stores({
      books:
        'id, goodreadsBookId, isbn13, isbn10, normalizedTitle, normalizedAuthor, status, location, *categories, updatedAt, shelf, seedKey'
    })
    .upgrade(async (tx) => {
      await tx
        .table('books')
        .toCollection()
        .modify((b: Partial<Book>) => {
          b.shelf ??= 'library';
          b.seedKey ??= null;
          b.format ??= null;
          b.review ??= null;
        });
    });

  db.on('populate', async (tx) => {
    await tx.table('locations').bulkAdd(INITIAL_LOCATIONS);
    if (INITIAL_CATEGORIES.length) await tx.table('categories').bulkAdd(INITIAL_CATEGORIES);
  });
}

export function openDatabase(name = DB_NAME): LibraryDB {
  const db = new Dexie(name) as LibraryDB;
  defineSchema(db);
  return db;
}

export const db = openDatabase();
