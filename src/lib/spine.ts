import type { Book } from './types';

/** FNV-1a: hash estable entre sesiones y navegadores. */
export function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Paleta sobria de tela y cartoné. El orden define el orden "por color". */
export const SPINE_PALETTE = [
  { name: 'Lacre', bg: '#6e2a2a', ink: '#f3e6d8' },
  { name: 'Óxido', bg: '#8a4b2d', ink: '#f6e8da' },
  { name: 'Ocre', bg: '#a7803b', ink: '#1f1810' },
  { name: 'Arena', bg: '#c9b48e', ink: '#2a2116' },
  { name: 'Hueso', bg: '#ddd1b8', ink: '#2b241b' },
  { name: 'Oliva', bg: '#5e6038', ink: '#efe9d6' },
  { name: 'Bosque', bg: '#2f4b3c', ink: '#e8e4d2' },
  { name: 'Verde agua', bg: '#3d6461', ink: '#eef0e6' },
  { name: 'Pizarra', bg: '#4a5761', ink: '#eceae4' },
  { name: 'Azul tinta', bg: '#26364f', ink: '#e7e2d6' },
  { name: 'Azul gris', bg: '#566b80', ink: '#f1eee8' },
  { name: 'Ciruela', bg: '#4c3049', ink: '#efe2ea' },
  { name: 'Carbón', bg: '#2e2b29', ink: '#e6dfd2' }
] as const;

export interface SpineLook {
  bg: string;
  ink: string;
  paletteIndex: number;
  height: number;
  width: number;
  bands: 0 | 1 | 2;
  serif: boolean;
}

export function spineKey(b: Pick<Book, 'normalizedTitle' | 'normalizedAuthor'>): string {
  return `${b.normalizedTitle}|${b.normalizedAuthor}`;
}

export function paletteIndexFor(b: Pick<Book, 'normalizedTitle' | 'normalizedAuthor'>): number {
  return hash(spineKey(b)) % SPINE_PALETTE.length;
}

/** Aspecto determinista: depende del título y autor, nunca de la sesión. */
export function spineLook(b: Pick<Book, 'normalizedTitle' | 'normalizedAuthor' | 'pageCount'>): SpineLook {
  const h = hash(spineKey(b));
  const paletteIndex = h % SPINE_PALETTE.length;
  const color = SPINE_PALETTE[paletteIndex]!;
  const pages = b.pageCount ?? 180 + ((h >>> 8) % 220);
  const width = Math.round(Math.min(54, Math.max(24, 18 + pages / 16)));
  const height = 158 + ((h >>> 4) % 56);
  return {
    bg: color.bg,
    ink: color.ink,
    paletteIndex,
    height,
    width,
    bands: ((h >>> 12) % 3) as 0 | 1 | 2,
    serif: ((h >>> 16) & 1) === 1
  };
}
