import type { Book } from './types';

/**
 * Solo se busca tapa con un ISBN presente en el registro (cargado por vos, por foto
 * o por Goodreads con edición confirmada). Nunca se busca por título.
 */
export function coverUrlFor(book: Pick<Book, 'coverSource' | 'coverUrl' | 'isbn13' | 'isbn10'>, autoCovers: boolean): string | null {
  if (book.coverSource === 'none') return null;
  if ((book.coverSource === 'url' || book.coverSource === 'upload') && book.coverUrl) return book.coverUrl;
  if (!autoCovers) return null;
  const isbn = book.isbn13 ?? book.isbn10;
  if (!isbn) return null;
  // default=false hace que Open Library responda 404 en vez de una imagen vacía.
  return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
}

/** Reduce una imagen subida a un data URL liviano para guardarla localmente. */
export async function fileToCoverDataUrl(file: File, maxSide = 600): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}
