# Mi biblioteca

Aplicación web personal para la biblioteca física y el historial de lectura. Es una PWA local-first: los datos viven en IndexedDB, en tu navegador. No tiene servidor, cuentas, analítica ni claves.

## Requisitos

- Node.js 20 o superior y npm.

## Instalar y ejecutar

```bash
npm install
npm run dev          # http://localhost:5173
```

## Probar

```bash
npm run typecheck    # TypeScript estricto
npm test             # pruebas unitarias (Vitest + fake-indexeddb)
npx playwright install chromium   # solo la primera vez
npm run build && npm run test:e2e # flujo principal en escritorio y teléfono
npm run test:all     # todo lo anterior en orden
```

Las pruebas que usan tu exportación real leen `tests/fixtures/goodreads_library_export.csv`. Ese archivo está en `.gitignore` para no publicar datos personales. Si falta, esas pruebas se omiten y las demás corren igual.

## Versión de producción

```bash
npm run build        # genera dist/ con service worker y manifiesto
npm run preview      # sirve dist/ en http://localhost:4173
```

`dist/` es estático y no necesita servidor propio.

## Publicar en GitHub Pages

1. Creá un repositorio (por ejemplo `mis-libros`) y subí el proyecto a la rama `main`. El CSV de Goodreads no se sube porque está en `.gitignore`.
2. En el repositorio, entrá a **Settings › Pages › Build and deployment** y elegí **Source: GitHub Actions**.
3. Cada push a `main` ejecuta `.github/workflows/deploy.yml`, que verifica tipos, corre las pruebas unitarias, compila y publica. Queda en `https://<usuario>.github.io/mis-libros/`.

Tus datos no viajan a GitHub: siguen en el navegador de cada dispositivo. Lo que sí queda público, si el repositorio es público, es el código, incluido `src/lib/seed.ts` con los títulos de tus 20 libros físicos. GitHub Pages desde un repositorio privado requiere un plan pago.

## Primer uso

1. Abrí **Importar** y elegí `goodreads_library_export.csv`.
2. Revisá el resumen (nuevos, combinados, ambiguos, rechazados, sin ISBN, historietas excluidas) y el informe. Recién después, confirmá.
3. Resolvé la bandeja de **Revisión**.
4. En **Datos**, descargá una copia de seguridad.

Los 20 ejemplares fotografiados están en `src/lib/seed.ts` y se combinan solos en la primera importación.

## Estructura

- `src/lib/`: dominio puro y testeable. Contiene la normalización, las coincidencias, la combinación con procedencia, el planificador de importación, las consultas y la exportación.
- `src/db/`: el esquema Dexie con migraciones versionadas (`db.ts`) y las operaciones de datos (`repo.ts`).
- `src/components/`: la interfaz.
- `tests/unit` y `tests/e2e`: las pruebas.

## Decisiones técnicas

- **Importación en dos pasos.** `planImport` calcula todo sin tocar la base, y `applyImportPlan` lo guarda en una sola transacción. La vista previa y lo que se guarda salen del mismo cálculo.
- **Orden de coincidencia.** Primero el id de Goodreads, que garantiza que reimportar no duplique. Después ISBN-13, ISBN-10 y, solo si a alguno le falta el ISBN, título + autor normalizados. Mismo título con otro autor nunca se combina. Mismo título y autor con ISBN distintos va a revisión.
- **Procedencia por campo.** Cada dato guarda su fuente: Goodreads, fotografía o carga manual. Una reimportación nunca pisa lo que editaste a mano.
- **Edición no confirmada.** Si un físico coincide con la lista to-read solo por título, ISBN, editorial, páginas y tapa quedan como propuesta en Revisión. Ejemplo: Goodreads tiene *Dune* en una edición en inglés.
- **Historietas fuera del catálogo.** Goodreads no clasifica tus cómics, así que se detectan por editorial (Image, Ivrea, Norma, ECC, Ovni Press…) o por una clasificación explícita. No se importan: quedan en Revisión › Resueltas, desde donde se puede importar cualquiera que sea un libro. Con tu exportación se excluyen 117 lecturas y la biblioteca queda en 175 libros (160 leídos y 15 por leer).
- **Ejemplares por verificar.** Los filtros "Poseídos" + "Sin ISBN" muestran los 12 físicos a los que les falta el ISBN. Un ISBN cargado a mano desde el ejemplar prevalece sobre cualquier propuesta de Goodreads y activa la tapa.
- **Datos persistentes.** Ubicaciones y categorías se guardan por id, así que renombrarlas no toca los libros.
- **Tapas.** Solo se piden a Open Library con un ISBN del registro, nunca por título. Si falla, se dibuja un lomo de color determinista.

## Limitaciones reales

- Los datos están en un solo navegador. Para pasarlos a otro dispositivo, descargá el respaldo y restauralo allá. No hay sincronización.
- El navegador puede borrar IndexedDB si se queda sin espacio. En Datos podés pedir almacenamiento persistente, pero cada navegador decide si lo concede.
- Open Library limita las búsquedas de tapas por ISBN. Algunas tapas pueden no aparecer hasta más tarde. Las que cargan quedan en caché para usar sin conexión.
- Pedir una tapa le muestra a openlibrary.org el ISBN y tu IP. Se puede desactivar en Datos.
- La detección de historietas por editorial es heurística: puede omitir alguna (por ejemplo, *Fun Home*, de Reservoir Books). En ese caso, eliminala desde su ficha.
- Los 5 físicos leídos toman el ISBN de tu registro de lectura en Goodreads. No está verificado que sea la edición de tu ejemplar.
