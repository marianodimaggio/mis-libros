import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, SCHEMA_VERSION, type LibraryDB } from '../../src/db/db';
import {
  addBook,
  applyImportPlan,
  bulkUpdate,
  createBackup,
  createLocation,
  deleteLocation,
  renameLocation,
  resolveReview,
  restoreBackup,
  updateBook,
  validateBackup
} from '../../src/db/repo';
import { planImport } from '../../src/lib/importPlan';
import { LOCATION_CROMBIE, LOCATION_LIVING } from '../../src/lib/seed';
import { draft, hasRealCsv, NOW, realRows } from './helpers';

let counter = 0;
const dbs: Dexie[] = [];
function freshDb(): LibraryDB {
  const db = openDatabase(`test-${++counter}-${Math.random()}`);
  dbs.push(db);
  return db;
}
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((d) => d.delete()));
});

async function importReal(db: LibraryDB) {
  const plan = planImport({
    rows: realRows(),
    existing: await db.books.toArray(),
    existingReviewKeys: new Set((await db.reviews.toArray()).map((r) => r.key)),
    includePhysicalSeed: true,
    includeWishlist: false,
    now: NOW
  });
  return applyImportPlan(db, plan);
}

describe('base de datos', () => {
  it('crea las ubicaciones iniciales', async () => {
    const db = freshDb();
    const names = (await db.locations.toArray()).sort((a, b) => a.order - b.order).map((l) => l.name);
    expect(names).toEqual(['Biblioteca del Living', 'Biblioteca Crombie']);
  });

  it.skipIf(!hasRealCsv)('importar dos veces no duplica', async () => {
    const db = freshDb();
    const first = await importReal(db);
    expect(first.created).toBe(175);
    const second = await importReal(db);
    expect(second).toEqual({ created: 0, updated: 0, reviews: 0 });
    expect(await db.books.count()).toBe(175);
  });

  it('migra un registro de la versión 1', async () => {
    const name = `migracion-${Math.random()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
      books: 'id, goodreadsBookId, isbn13, isbn10, normalizedTitle, normalizedAuthor, status, location, *categories, updatedAt',
      reviews: 'id, &key, kind, status',
      locations: 'id, name',
      categories: 'id, name',
      meta: 'key'
    });
    await v1.table('books').add({ id: 'viejo', title: 'Viejo', author: 'A', categories: [] });
    v1.close();
    const db = openDatabase(name);
    dbs.push(db);
    const b = await db.books.get('viejo');
    expect(db.verno).toBe(SCHEMA_VERSION);
    expect(b?.shelf).toBe('library');
    expect(b?.seedKey).toBeNull();
    expect(await db.books.where('shelf').equals('library').count()).toBe(1);
  });

  it('la edición múltiple cambia la ubicación de cualquier cantidad de libros', async () => {
    const db = freshDb();
    const ids: string[] = [];
    for (let i = 0; i < 250; i++) ids.push((await addBook(db, draft({ title: `Libro ${i}`, author: 'A', location: LOCATION_LIVING }))).id);
    expect(await bulkUpdate(db, ids, { location: LOCATION_CROMBIE, owned: true, categories: { mode: 'add', ids: ['c1'] } })).toBe(250);
    const all = await db.books.toArray();
    expect(all.every((b) => b.location === LOCATION_CROMBIE && b.owned === true && b.categories.includes('c1'))).toBe(true);
    expect(all[0]!.provenance.location?.source).toBe('manual');
  });

  it('registra las ediciones manuales y renombra ubicaciones sin tocar libros', async () => {
    const db = freshDb();
    const b = await addBook(db, draft({ title: 'X', author: 'Y', location: LOCATION_LIVING }));
    const u = await updateBook(db, b.id, { title: 'X: segunda edición' });
    expect(u.provenance.title?.source).toBe('manual');
    expect(u.normalizedTitle).toBe('x segunda edicion');
    await renameLocation(db, LOCATION_LIVING, 'Living');
    expect((await db.locations.get(LOCATION_LIVING))?.name).toBe('Living');
    const loc = await createLocation(db, 'Mesa de luz');
    await updateBook(db, b.id, { location: loc.id });
    expect(await deleteLocation(db, loc.id)).toBe(1);
    expect((await db.books.get(b.id))?.location).toBeNull();
    await expect(createLocation(db, 'living')).rejects.toThrow('Ya existe');
  });

  it.skipIf(!hasRealCsv)('resuelve revisiones: acepta edición, restaura una historieta e importa una lectura', async () => {
    const db = freshDb();
    await importReal(db);
    const reviews = await db.reviews.toArray();
    const dune = (await db.books.toArray()).find((b) => b.title === 'Dune')!;
    const ed = reviews.find((r) => r.kind === 'edition-proposal' && r.bookId === dune.id)!;
    await resolveReview(db, ed.id, 'accept');
    expect((await db.books.get(dune.id))?.isbn13).toBe('9780425266540');

    const comic = reviews.find((r) => r.kind === 'comic' && r.title.startsWith('Batman: Year One'))!;
    await resolveReview(db, comic.id, 'import');
    expect((await db.books.toArray()).some((b) => b.title === 'Batman: Year One')).toBe(true);
    expect((await db.reviews.get(comic.id))?.status).toBe('resolved');

    const inc = reviews.find((r) => r.kind === 'inconsistency' && r.title.startsWith('Stoner'))!;
    await resolveReview(db, inc.id, 'import-read');
    expect((await db.books.toArray()).find((b) => b.title === 'Stoner')?.status).toBe('read');
  });

  it('respalda y restaura todos los datos', async () => {
    const db = freshDb();
    await addBook(db, draft({ title: 'Respaldo', author: 'A', notes: 'nota' }));
    await createLocation(db, 'Estudio');
    const backup = await createBackup(db, SCHEMA_VERSION);
    const json = JSON.parse(JSON.stringify(backup));

    const other = freshDb();
    await addBook(other, draft({ title: 'Se borra', author: 'B' }));
    await restoreBackup(other, validateBackup(json, SCHEMA_VERSION));
    expect((await other.books.toArray()).map((b) => b.title)).toEqual(['Respaldo']);
    expect((await other.locations.toArray()).map((l) => l.name)).toContain('Estudio');
    expect(() => validateBackup({ app: 'otra' }, SCHEMA_VERSION)).toThrow();
    expect(() => validateBackup({ ...json, schemaVersion: 99 }, SCHEMA_VERSION)).toThrow('más nueva');
  });
});
