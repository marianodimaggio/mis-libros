import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const CSV = fileURLToPath(new URL('../fixtures/goodreads_library_export.csv', import.meta.url));
test.skip(!existsSync(CSV), 'Falta tests/fixtures/goodreads_library_export.csv');

/** Errores de consola propios. Se ignoran solo las tapas no encontradas o sin red de Open Library. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (m.location().url.includes('covers.openlibrary.org')) return;
    errors.push(m.text());
  });
  return errors;
}

async function importCsv(page: Page) {
  await page.goto('/#/importar');
  await page.locator('#csv').setInputFiles(CSV);
  await expect(page.getByText('Antes de confirmar')).toBeVisible();
  await expect(page.getByText(/va a quedar con\s*175\s*libros/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar importación' }).click();
  await expect(page.getByLabel('Resumen')).toContainText('175');
}

test.beforeEach(async ({ page }) => {
  // Sin red hacia Open Library: la app debe caer en el lomo generado.
  await page.route('https://covers.openlibrary.org/**', (r) => r.fulfill({ status: 404, body: '' }));
});

test('importa, muestra el resumen y no duplica al reimportar', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Los estantes están vacíos' })).toBeVisible();
  await importCsv(page);

  const summary = page.getByLabel('Resumen');
  await expect(summary).toContainText('160 leídos');
  await expect(summary).toContainText('15 por leer');
  await expect(summary).toContainText('20 poseídos');
  await expect(page.getByRole('button', { name: /Biblioteca del Living\s*20/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Revisión/ })).toContainText('pendientes');

  await page.goto('/#/importar');
  await page.locator('#csv').setInputFiles(CSV);
  await expect(page.getByText('Antes de confirmar')).toBeVisible();
  const nuevos = page.locator('dt', { hasText: /^Nuevos$/ }).locator('xpath=following-sibling::dd[1]');
  await expect(nuevos).toHaveText('0');
  expect(errors).toEqual([]);
});

test('busca, abre la ficha y edita en lote la ubicación', async ({ page }) => {
  const errors = trackErrors(page);
  await importCsv(page);

  await page.getByRole('searchbox').fill('Hyperion');
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByRole('button', { name: /^Hyperion\b/ }).first().click();
  const panel = page.getByRole('dialog', { name: 'Hyperion' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('9788466658034');
  await expect(panel).toContainText('Fotografía');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  await page.getByRole('button', { name: 'Seleccionar', exact: true }).click();
  await page.getByRole('button', { name: /Seleccionar los 2 visibles/ }).click();
  await page.getByRole('button', { name: 'Editar selección' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar 2 libros' });
  await dialog.getByLabel('Ubicación').selectOption({ label: 'Biblioteca Crombie' });
  await dialog.getByRole('button', { name: 'Aplicar a 2 libros' }).click();
  await expect(page.getByText('Se actualizaron 2 libros')).toBeVisible();

  await page.getByRole('searchbox').fill('');
  await expect(page.getByRole('button', { name: /Biblioteca Crombie\s*2/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Biblioteca del Living\s*18/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('el estante se recorre con el teclado', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Prueba de teclado físico');
  await importCsv(page);
  const first = page.locator('[data-spine][tabindex="0"]');
  await first.focus();
  const firstId = await first.getAttribute('data-spine');
  await page.keyboard.press('ArrowRight');
  const focused = page.locator('[data-spine]:focus');
  await expect(focused).not.toHaveAttribute('data-spine', firstId!);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('agrega un libro manual y avisa si está duplicado', async ({ page }) => {
  await importCsv(page);
  await page.getByRole('button', { name: 'Agregar libro' }).click();
  const form = page.getByRole('dialog', { name: 'Agregar un libro' });
  await form.getByLabel('Título *').fill('Dune');
  await form.getByLabel('Autor *').fill('Frank Herbert');
  await form.getByRole('button', { name: 'Agregar libro' }).click();
  await expect(page.getByRole('dialog', { name: 'Este libro ya parece estar cargado' })).toBeVisible();
});

test('descarga la copia de seguridad y registra la fecha', async ({ page }) => {
  await importCsv(page);
  await page.goto('/#/datos');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar copia de seguridad' }).click()
  ]);
  expect(download.suggestedFilename()).toMatch(/^mi-biblioteca-respaldo-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.getByText(/Último respaldo:/)).toBeVisible();
});
