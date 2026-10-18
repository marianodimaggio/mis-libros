/** Minúsculas, sin tildes, sin puntuación, espacios colapsados. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Paréntesis que describen serie ("(Saga, #2)") o edición ("(Spanish Edition)"). */
const SERIES_OR_EDITION = /\s*\(([^()]*#[^()]*|[^()]*\b(edition|edici[oó]n)\b[^()]*)\)\s*/gi;

const TRAILING_ARTICLE = /^(.*),\s*(el|la|los|las|lo|un|una|unos|unas|the|a|an)$/i;

/** Título visible: sin paréntesis de serie o edición. */
export function cleanTitle(title: string): string {
  return title.replace(SERIES_OR_EDITION, ' ').replace(/\s+/g, ' ').trim();
}

/** Extrae la serie de "Título (Serie, #2)". */
export function extractSeries(title: string): string | null {
  const m = title.match(/\(([^()]*#[^()]*)\)/);
  return m?.[1]?.trim() ?? null;
}

export function normalizeTitle(title: string): string {
  let t = cleanTitle(title);
  // "Reventados, Los" → "Los reventados"
  const art = t.match(TRAILING_ARTICLE);
  if (art?.[1] && art[2]) t = `${art[2]} ${art[1]}`;
  return normalizeText(t);
}

/** Parte del título anterior a ":" (subtítulo), para coincidencias débiles. */
export function titleCore(title: string): string {
  const base = cleanTitle(title).split(':')[0] ?? '';
  return normalizeTitle(base);
}

export function normalizeAuthor(author: string): string {
  return normalizeText(author);
}

/** Limpia el formato de Goodreads (="978...") y valida longitud y dígito de control. */
export function cleanIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/^="?|"$/g, '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (s.length === 13 && isValidIsbn13(s)) return s;
  if (s.length === 10 && isValidIsbn10(s)) return s;
  return null;
}

export function isValidIsbn13(s: string): boolean {
  if (!/^\d{13}$/.test(s)) return false;
  const sum = s
    .slice(0, 12)
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(s[12]);
}

export function isValidIsbn10(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  const sum = s
    .split('')
    .reduce((acc, c, i) => acc + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
  return sum % 11 === 0;
}

/** Fecha de Goodreads "2017/08/27" → "2017-08-27". */
export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
}

export function toIntOrNull(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}
