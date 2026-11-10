# Estado del código — Capybara Control

Guía para quien continúe el proyecto en otro entorno (VS Code, Cursor, Claude Code, un desarrollador).
Fecha de corte: 9 de noviembre de 2026.

## Qué está probado

| Parte | Cómo se probó | Resultado |
|---|---|---|
| Lógica compartida (`api/src/core/*`) | `npm test` (24 pruebas con `node:test`) | Pasa |
| Frontend en modo demostración | Navegador automatizado: todas las pantallas, escritorio y celular, claro y oscuro | Sin errores |
| Frontend en modo API | Navegador contra `tools/fake-api.mjs`: inicio de sesión, cajero emite factura, socio ve ingresos | Funciona |
| Rutas del backend | Arranque del servidor con Prisma simulado; permisos por rol (403/200) | Responden |
| Esquema de base de datos | Validador oficial de Prisma | Válido |
| Backend contra PostgreSQL real | **No probado** (el entorno donde se construyó no podía descargar los motores de Prisma) | Pendiente |
| Integraciones reales (WhatsApp, Google, Alegra, Claude) | **No probadas** con credenciales reales | Pendiente |

## Arquitectura

```
web/            Frontend sin framework (HTML + CSS + JS). Se compila en un solo archivo.
  shell.html    Estructura de la página. Carga Chart.js y SheetJS desde jsDelivr.
  styles.css    Estilos (tokens de color claro/oscuro, capa minimalista al final).
  app1.js       Utilidades, datos de ejemplo, acciones locales (act.*), WhatsApp y Sheets en demo.
  app2.js       Cliente de la API (remote.*), run(), menú, modal, Tablero y gráficas.
  app3.js       Inventario, Entradas, Marchados, WhatsApp.
  app4.js       Drive/Sheets, Conciliación, Proveedores, Gastos, Bitácora, Integraciones, boot().
  app5.js       Roles y permisos, Mi turno, Inteligencia, Alegra, Control de acceso.
  app6.js       Facturación (hoja tipo Google Sheets).
  app7.js       Importar productos desde Excel.
  supabase.js   Guardado en Supabase (tabla cc_records) y cambios en vivo. Va antes de app5.js.
  claude.js     Dentro de claude.ai: datos en la capacidad db, personas con la capacidad user, copia a Supabase.
  app8.js       Socios, caja del día, modo API de facturas/usuarios, inicio de sesión. Llama a boot().
  build.mjs     Une todo e incrusta api/src/core/*.js (quita import/export).
api/            Backend Node 20 + Express + Prisma (PostgreSQL).
  src/core/     Lógica pura compartida con el frontend (intérprete, conciliación, inteligencia, permisos, importación).
  src/routes*.js  Rutas REST /api/v1 (ver openapi.yaml).
  src/services/ inventory, whatsapp, sheets, ai, alegra, storage, insights.
  prisma/       schema.prisma, seed.js, seed-data.js (inventario manuscrito transcrito).
  public/       Frontend compilado que sirve el backend en "/" (pide iniciar sesión).
dist/           Frontend compilado independiente (modo demostración, abre con doble clic).
supabase/       schema.sql: tabla cc_records, RLS y Realtime (aplicado en el proyecto capybara-control).
tools/          fake-api.mjs: API en memoria para desarrollar el frontend sin base de datos.
```

Los archivos `web/app*.js` se cargan en orden en un mismo `<script>`. Los últimos amplían a los primeros
reasignando funciones (`render`, `renderNav`, `upgradeState`, `emitInvoice`…).
Si se migra a un framework (React/Vue/Svelte), `api/src/core/` se puede importar tal cual.

## Qué funciona con el backend y qué sigue en modo demostración

| Módulo | Con la API | Notas |
|---|---|---|
| Inicio de sesión y roles | Sí | El rol viene del token. El backend también oculta costos a quien no tiene `costos.ver` |
| Productos, movimientos, proveedores, compras, gastos | Sí | `remote.load()` + `remoteAct.*` |
| Marchados, aprobar/rechazar/anular | Sí | |
| Importar Excel | Sí | `POST /products/import` |
| Facturación: emitir | Sí | Los borradores viven en el navegador hasta emitir; al emitir se crea y emite en el servidor |
| Socios | Sí | Calcula con las facturas emitidas y los gastos que trae la API |
| Caja del día | Sí | Con las facturas cargadas. También existe `GET /cash/today` |
| Control de acceso: lista de usuarios | Lectura | Crear/editar usuarios en la interfaz todavía es local. Usa `POST/PATCH /users` |
| Conteos físicos | Sí | `POST /counts` |
| Conciliación | Parcial | La interfaz concilia con lo cargado; el botón principal llama a `POST /sync-and-reconcile` |
| Inteligencia | Parcial | Resumen IA por API; plan de reposición calculado en el navegador con los datos cargados |
| WhatsApp | Parcial | La bandeja se lee de la API; las acciones de estado van a la API. El simulador es solo demo |
| Drive / Sheets | Parcial | Vista previa y aplicar por API. La configuración de archivo/mapeo en la interfaz es local |
| Alegra | Parcial | "Sincronizar ahora" llama a la API; la lista de facturas y vínculos en la interfaz es de ejemplo |
| Solicitudes de compra, órdenes sugeridas | Local | Existen `POST /purchase-requests` y `POST /insights/orders`; falta conectarlos en la interfaz |

## Siguientes pasos recomendados

1. Levantar PostgreSQL y el backend (`npm run setup` en la raíz o `docker compose up` en `api/`), correr la semilla y probar el inicio de sesión real.
2. Conectar en la interfaz lo marcado como "Parcial" o "Local" (buscar `S.settings.mode === 'api'` para ver el patrón).
3. Guardar borradores de factura en el servidor (`PUT /invoices/:id`) en lugar del navegador.
4. Configurar credenciales reales y verificar con la cuenta de Alegra:
   - el cuerpo de `/purchase-orders`;
   - `identificationObject` al crear proveedores;
   - `paymentForm` y la numeración DIAN en `/invoices`;
   - el formato del cuerpo de los webhooks.
5. Cambiar contraseñas de la semilla y `JWT_SECRET`. Poner el servidor detrás de HTTPS (lo exige WhatsApp).
6. Reemplazar el catálogo de ejemplo con Importar Excel y ajustar la capacidad (`HOSTEL_DORM_BEDS`, `HOSTEL_PRIVATE_ROOMS`).
