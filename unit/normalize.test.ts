import { describe, expect, it } from 'vitest';
import { cleanIsbn, cleanTitle, extractSeries, normalizeAuthor, normalizeDate, normalizeTitle, titleCore } from '../../src/lib/normalize';

describe('normalización', () => {
  it('ignora mayúsculas, tildes y puntuación', () => {
    expect(normalizeTitle('La Música del Silencio!')).toBe('la musica del silencio');
    expect(normalizeAuthor('Julio  Cortázar')).toBe('julio cortazar');
    expect(normalizeAuthor('J.R.R. Tolkien')).toBe(normalizeAuthor('J. R. R. Tolkien'));
  });

  it('quita paréntesis de serie y de edición, pero no otros', () => {
    expect(normalizeTitle('El camino de los reyes (El archivo de las tormentas, #1)')).toBe('el camino de los reyes');
    expect(normalizeTitle('Cuentos completos I (Spanish Edition)')).toBe('cuentos completos i');
    expect(cleanTitle('SFSX (Safe Sex) #4')).toBe('SFSX (Safe Sex) #4');
    expect(extractSeries('Hyperion (Los cantos de Hyperion, #1)')).toBe('Los cantos de Hyperion, #1');
  });

  it('no confunde volúmenes distintos', () => {
    expect(normalizeTitle('Cuentos completos I')).not.toBe(normalizeTitle('Cuentos completos II'));
  });

  it('reordena artículos finales', () => {
    expect(normalizeTitle('Reventados, Los')).toBe(normalizeTitle('Los reventados'));
  });

  it('obtiene el núcleo antes del subtítulo', () => {
    expect(titleCore('El infinito en un junco: La invención de los libros')).toBe('el infinito en un junco');
  });

  it('limpia y valida ISBN', () => {
    expect(cleanIsbn('="9788466657662"')).toBe('9788466657662');
    expect(cleanIsbn('="8432243302"')).toBe('8432243302');
    expect(cleanIsbn('=""')).toBeNull();
    expect(cleanIsbn('9788466657663')).toBeNull(); // dígito de control incorrecto
    expect(cleanIsbn('9788496834')).toBeNull(); // longitud inválida
  });

  it('normaliza fechas de Goodreads', () => {
    expect(normalizeDate('2017/8/7')).toBe('2017-08-07');
    expect(normalizeDate('')).toBeNull();
  });
});
