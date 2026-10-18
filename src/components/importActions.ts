import { db } from '../db/db';
import { applyImportPlan, type ApplyResult } from '../db/repo';
import type { GoodreadsRow } from '../lib/goodreads';
import { planImport, type ImportPlan } from '../lib/importPlan';

export interface ImportOptions {
  includePhysicalSeed: boolean;
  includeWishlist: boolean;
}

export async function previewImport(rows: GoodreadsRow[], opts: ImportOptions): Promise<ImportPlan> {
  const [existing, reviews] = await Promise.all([db.books.toArray(), db.reviews.toArray()]);
  return planImport({
    rows,
    existing,
    existingReviewKeys: new Set(reviews.map((r) => r.key)),
    includePhysicalSeed: opts.includePhysicalSeed,
    includeWishlist: opts.includeWishlist,
    now: new Date().toISOString()
  });
}

/** Recalcula el plan contra el estado actual y lo aplica en una transacción. */
export async function applyImport(rows: GoodreadsRow[], opts: ImportOptions): Promise<ApplyResult> {
  return applyImportPlan(db, await previewImport(rows, opts));
}
