# Capybara Control

Plataforma de inventario, productos marchados, compras, gastos, proveedores y conciliación de **Capybara Hostel**. Cruza registros manuales, Google Sheets/Excel en Drive y mensajes, fotos, notas de voz y facturas de WhatsApp.

```
capybara-control/
├── api/                    Backend Node.js + Express + PostgreSQL (Prisma)
│   ├── src/core/core.js    Intérprete "marchar", anti-duplicados, conciliación (compartido con el frontend)
│   ├── src/routes.js       REST /api/v1
│   ├── src/services/       inventory · whatsapp · sheets · ai · storage
│   ├── prisma/             schema.prisma · seed.js · seed-data.js (inventario manuscrito transcrito)
│   ├── public/index.html   Frontend compilado (lo sirve el backend en "/")
│   ├── openapi.yaml        Especificación de la API
│   ├── test/               Pruebas (node --test)
│   └── Dockerfile · docker-compose.yml · .env.example
├── web/                    Código fuente del frontend (HTML + CSS + JS sin framework)
└── dist/                   Frontend en un solo archivo (el artefacto)
```

## Inicio rápido

### Desarrollo local completo (recomendado)

```bash
npm run dev:local
```

Levanta PostgreSQL local (puerto 5433), carga la semilla, arranca un **Alegra simulado** (8098) y el backend con la interfaz en http://localhost:8099 (admin@capybarahostel.com / CambiaEsta2026!). Se puede repetir sin perder datos. Para detener: `npm run dev:stop`. Las llamadas que recibe el Alegra simulado quedan en `api/uploads/alegra-simulado.json`.


**1. Solo ver la aplicación (sin instalar nada):** abre `dist/index.html` en el navegador. Funciona en modo demostración con datos de ejemplo guardados en ese navegador.

**2. Probar el modo conectado sin base de datos:**
```bash
cd api && npm install && cd ..
npm run dev:fake        # http://localhost:8097 · admin@x.co / caja@x.co / socio@x.co · clave123
```

**3. Sistema completo (backend + PostgreSQL):**
```bash
cd api
cp .env.example .env          # completa claves y contraseñas
docker compose up -d db
npm install
npx prisma migrate dev --name init
npm run db:seed               # categorías, proveedores, productos, usuarios de ejemplo
npm run dev                   # http://localhost:8080 → pide iniciar sesión
```
O todo con Docker: `cd api && docker compose up -d --build`.

Usuarios de la semilla:
- `admin@capybarahostel.com` / `CambiaEsta2026!`
- Manager, cajeros, empleados y socios: `Capybara2026!`

Cámbialas al entrar.

**Desarrollo del frontend:** edita `web/*.js` o `web/styles.css` y corre `npm run build` desde la raíz.

Lee `ESTADO-DEL-CODIGO.md` para saber qué está probado, qué módulos ya usan la API y los siguientes pasos.

## Versión en Claude (así se usa hoy)

La app está publicada en claude.ai: https://claude.ai/artifact/JN79RgcfuBeY97n62XmCVR

- La interfaz y los datos viven en Claude (capacidad `db` del artefacto) y se actualizan en vivo para todas las personas con acceso. El módulo es `web/claude.js` y se activa solo cuando la página corre dentro de claude.ai.
- Cada persona entra con su cuenta de Claude. El dueño de la página es administrador. Quien la abre por primera vez pide ingreso y aparece en **Control de acceso** como empleado; ahí el administrador le asigna su perfil (Supervisor, Cajero, Empleado, Socio, Auditor).
- Compartir: menú **Compartir** de la página. Administradores como **Editor**; el resto del equipo como **Contributor**. Viewer y Commenter solo leen.
- Reglas de la base (en la publicación): `cca_users` y `cca_s` (usuarios y permisos) solo los escriben Editores y el dueño; `ccj/<persona>` lo escribe cada quien para pedir ingreso.
- **Guardar copia en Supabase** (Integraciones, solo administradores) copia todo a la tabla `cc_records` con el conector de Supabase de quien pulsa el botón.
- Los resúmenes de **Inteligencia** y **Socios** usan la IA de Claude (capacidad `sample`).
- Para publicar una versión nueva: `npm run build` y publicar `dist/capybara-control.html` con las mismas capacidades.

## Base de datos en Supabase (sin servidor)

La app también puede guardar todo en Supabase sin levantar el backend. Así se usa hoy.

- Proyecto: **capybara-control** (organización *capybara hostel*, región us-east-1), URL https://ghedaeyshfvlvvkafbyd.supabase.co
- `supabase/schema.sql` crea la tabla `cc_records` con RLS y Realtime. Ya está aplicado en el proyecto.
- `web/supabase.js` guarda cada colección del estado (productos, movimientos, compras, gastos, facturas…) fila por fila en `cc_records` y recibe en vivo los cambios del resto del equipo.
- La app trae la URL y la clave anon del proyecto. La clave anon es pública: sin sesión iniciada no da acceso a nada.

Antes de usarla con datos reales:
1. En Supabase › **Authentication › Sign In / Providers › Email**, desactiva **Allow new users to sign up**. Si queda activo, cualquiera podría crearse una cuenta y ver los datos.
2. En **Authentication › Users › Add user**, crea un usuario por persona del equipo, con *Auto Confirm User*.
3. Abre la app (`npm run build` y sirve `dist/`, por ejemplo con `python3 -m http.server 8080 -d dist`), ve a **Integraciones › Base de datos en Supabase**, escribe correo y contraseña y pulsa **Conectar con Supabase**. La primera vez ofrece subir los datos que muestra.

Con Supabase conectado se oculta **Restablecer datos de ejemplo**, para no borrar datos reales. Alegra, Sheets y WhatsApp siguen necesitando el backend.

## Reglas clave

- **Inventario teórico** = inicial + entradas aprobadas + devoluciones − salidas − marchados − daños − vencimientos − pérdidas (± ajustes). Solo cuentan movimientos **aprobados**.
- Los movimientos **no se eliminan**: `POST /movements/:id/void` crea un contramovimiento.
- Confianza < 85 %: nunca se aplica automáticamente. La aplicación automática ≥ 85 % está **apagada** por defecto (`AUTO_APPLY_ENABLED`).
- Anti-duplicados: huella (producto + tipo + cantidad + día + factura), cruce entre fuentes en una ventana de 12 h, misma factura, idempotencia por `waMessageId`, archivos por SHA-256 y filas de Sheets por hash de contenido.
- Clasificación: Coincide · Diferencia menor (±1 u o 5 %) · Diferencia importante · Movimiento duplicado · Movimiento sin respaldo · Producto no registrado · Sin conteo físico.

## WhatsApp Business (Cloud API)

1. developers.facebook.com → crear app → producto WhatsApp → número del hostel.
2. Token permanente de usuario del sistema (`whatsapp_business_messaging`) → `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`.
3. Webhook: `https://TU_DOMINIO/webhooks/whatsapp`, token `WHATSAPP_VERIFY_TOKEN`, campo `messages`.
4. Autoriza números en `WHATSAPP_ALLOWED_NUMBERS` o en `User.phone`; chats/grupos en `POST /api/v1/whatsapp/chats/:id/authorize`.

La API oficial entrega mensajes enviados **al número del negocio**. Si el personal reporta hoy en un grupo, la vía recomendada es que escriban directamente al número de Capybara Control (o que el grupo lo incluya, según disponibilidad de la API de grupos en tu cuenta).

Flujo: firma HMAC → idempotencia → autorización → descarga del medio → transcripción (voz) o lectura con Claude (foto/PDF) → intérprete → movimientos **pendientes** → respuesta de confirmación al remitente.

## Google Drive / Sheets

1. Google Cloud → cuenta de servicio → habilitar Sheets API, Drive API (y Speech-to-Text si usas notas de voz).
2. Copia correo y llave privada en `.env`.
3. Comparte el archivo con la cuenta de servicio como **Lector**.
4. `GET /api/v1/sheets/files` → `GET /files/:id/tabs` → `GET /files/:id/sample` → `POST /sheets/sources` con el mapeo de columnas y `cron` opcional.
5. **ACTUALIZAR DATOS DESDE DRIVE** = `POST /sheets/sources/:id/preview` (no aplica nada) → `POST /sheets/apply` con las decisiones.

Archivos .xlsx subidos a Drive: conviértelos a Google Sheets (Archivo → Guardar como Hojas de cálculo de Google) para leerlos por API.

## Inteligencia, punto de reorden y señales de compra

- **Consumo diario** = 60 % última semana + 40 % últimas 4 semanas. **Stock de seguridad** = z · σ · √(días de entrega) con nivel de servicio 95 % (z = 1,65, configurable). **Punto de reorden** = consumo diario × días de entrega + stock de seguridad (nunca menor al mínimo). **Cantidad sugerida** = objetivo − stock − en camino, redondeada al empaque (`packSize`).
- Señales: comprar ya, punto de reorden, sobrestock, alza/baja de precio, consumo inusual, riesgo de vencimiento y merma recurrente.
- `POST /api/v1/insights/summary` arma un resumen compacto (sin datos personales) y lo envía a Claude; si no hay `ANTHROPIC_API_KEY` o falla, responde con un resumen por reglas en el mismo formato. Resumen diario automático (`INSIGHTS_DAILY_CRON`) por WhatsApp a `INSIGHTS_WHATSAPP_TO`.
- En el artefacto de claude.ai el resumen usa Claude directamente con la cuenta de quien lo abre (pide permiso la primera vez).

## Alegra

1. En Alegra: Configuración → Integraciones → API. Copia correo y token a `ALEGRA_EMAIL` y `ALEGRA_TOKEN`.
2. Configura `ALEGRA_DEFAULT_CATEGORY_ID` (cuenta de compras), `ALEGRA_BANK_ACCOUNT_ID` (caja/banco de pagos), ids de impuestos y `ALEGRA_DEFAULT_CLIENT_ID` (consumidor final).
3. `POST /api/v1/alegra/sync` vincula proveedores por NIT o nombre e importa facturas de proveedor como **borrador**. Vincula ítems ↔ productos en `/alegra/items/links`.
4. Las compras aprobadas se envían con `POST /alegra/purchases/:id/push` (o automático con `ALEGRA_AUTO_PUSH=true`), creando la factura de proveedor y el pago si ya se pagó.
5. `POST /alegra/webhooks/subscribe` para recibir new-bill, edit-bill, delete-bill, new-item y edit-item en `/webhooks/alegra/:secret`.

Límite de Alegra: 150 solicitudes/min; el cliente lee `X-Rate-Limit-*` y reintenta tras un 429. Los IDs se guardan como texto (Alegra migra a UUID). **Por verificar con tu cuenta antes de producción:** el cuerpo de `/purchase-orders`, `identificationObject` al crear proveedores, y `paymentForm`/numeración DIAN en `/invoices` de venta.

## Facturación (hoja tipo Google Sheets)

Pestañas Ventas, Compras y Resumen. Flechas, Tab, Enter, Supr y pegar desde Excel o Sheets. Impuesto por defecto: INC 8 % en bar y restaurante, IVA 19 % en lo demás. **Emitir** descuenta el inventario como salida por venta y bloquea la factura; luego puede enviarse a Alegra (`POST /api/v1/invoices/:id/alegra`). En Compras, las filas nuevas se agrupan por proveedor y factura y crean entradas en borrador.

## Importar productos desde Excel

Pestaña **Importar Excel** (permiso `inventario.editar`). Acepta .xlsx, .xls, .csv y Google Sheets descargado como Excel.
- Detecta la fila de encabezados aunque haya títulos arriba y reconoce columnas en español (Código, Producto, Categoría, Existencia, Mínimo, Costo, Precio de venta, Proveedor, Vence…). La relación se puede corregir a mano.
- Reconoce productos existentes por código interno, código de barras o nombre. Vista previa con nuevos, actualizaciones (antes → después), sin cambios y errores (números inválidos, filas repetidas, sin nombre).
- Las celdas vacías no borran datos. El stock de productos existentes no se sobrescribe: se registra como **conteo físico** (va a Conciliación) o como **ajuste**; también se puede ignorar. El costo promedio solo se reemplaza si se activa.
- Crea proveedores y categorías que falten, y asigna códigos automáticos (BEB-011).
- **Descargar plantilla** y **Descargar catálogo actual** generan .xlsx con las mismas columnas, para editar en Excel y volver a subir.
- API: `POST /api/v1/products/import` (archivo en `file` o `rows` JSON; sin `apply` devuelve vista previa) y `GET /api/v1/products/export.xlsx?template=1`.

## Módulo de socios

Solo lectura. Periodos: este mes, mes anterior, 30 y 90 días, siempre comparados con el periodo equivalente anterior. Ingresos por línea (Hospedaje, Bar, Restaurante, Otros), estado de resultados estimado (ingresos − costo de lo vendido − gastos), ocupación (camas-noche vendidas ÷ disponibles), ADR, RevPAB, ticket promedio, impuestos recaudados, valor del inventario y pérdida por inventario. Informe Excel y lectura en lenguaje simple con IA. API: `GET /api/v1/partners/summary`. Capacidad en `HOSTEL_DORM_BEDS` y `HOSTEL_PRIVATE_ROOMS`. El hospedaje se factura con los productos HOS-001 (cama en dormitorio) y HOS-002 (habitación privada).

## Roles y permisos

| Rol | Qué hace |
|---|---|
| Administrador | Todo, incluidos usuarios, permisos, integraciones y el módulo de socios |
| Manager | Opera y aprueba; ve costos y la caja; sin usuarios, configuración ni socios |
| Cajero (2 accesos) | Factura y emite ventas, ve su caja del día (cuadre por forma de pago), marcha productos; sin costos |
| Socio | Solo el módulo Socios: ingresos, resultado operativo, ocupación, ADR, RevPAB, ticket, impuestos, gastos; informe en Excel. No puede modificar nada |
| Empleado | Mi turno: marchar, recibir mercancía, conteo ciego de su área, facturar borradores, solicitar compras. Todo queda pendiente. No ve costos ni valores |
| Auditor | Solo lectura, incluida la bitácora |

La matriz se edita en Control de acceso (`PUT /api/v1/roles/:role`). El backend oculta campos de dinero en las respuestas a quien no tiene `costos.ver`.

## Frontend

`node web/build.mjs` compila `web/` en `dist/capybara-control.html` y `api/public/index.html`. Funciona en modo demostración (datos de ejemplo en el navegador) o conectado a la API. Es responsive e incluye manifiesto para instalarse como app (PWA) y empaquetarse luego con Capacitor.

## Pruebas

```bash
cd api && npm test
```
