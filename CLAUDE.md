# Instrucciones para agentes de código (Claude Code, Cursor, Copilot)

Proyecto: Capybara Control, plataforma de inventario, facturación y socios de Capybara Hostel (Colombia, COP, español).

- Interfaz y textos en español de Colombia. Moneda COP sin decimales. Zona horaria America/Bogota.
- Lee `ESTADO-DEL-CODIGO.md` antes de cambiar algo: explica la arquitectura y qué está conectado a la API.
- Frontend: edita `web/*.js` y `web/styles.css`, luego `npm run build` (genera `dist/` y `api/public/index.html`). Nunca edites `dist/` ni `api/public/index.html` a mano.
- La lógica de negocio va en `api/src/core/` (sin dependencias, usada por backend y frontend). Agrega pruebas en `api/test/` y corre `npm test`.
- Reglas que no se rompen:
  - los movimientos nunca se borran, se anulan con contramovimiento;
  - nada descuenta inventario sin aprobación;
  - confianza menor a 85 % nunca se aplica sola;
  - las celdas vacías de una importación no borran datos;
  - el stock de productos existentes se registra como conteo o ajuste, no se sobrescribe.
- Permisos en `api/src/core/permissions.js`. Toda ruta nueva debe usar `perm('...')`, y las respuestas con dinero, `moneyGuard`.
- Para probar el frontend en modo API sin base de datos: `npm run dev:fake` y abre http://localhost:8097 (admin@x.co / caja@x.co / socio@x.co, clave123).
- Supabase: `web/supabase.js` guarda el estado en la tabla `cc_records` (ver `supabase/schema.sql`). Nunca pongas la clave `service_role` en el frontend.
- Claude: `web/claude.js` guarda en la base del artefacto (ccs, ccl_*, cca_*, ccj). Publicado en https://claude.ai/artifact/JN79RgcfuBeY97n62XmCVR desde `dist/capybara-control.html`; al republicar, conserva las capacidades db (con sus 4 reglas), user (profile, email), mcp (Supabase execute_sql), downloads y sample.
- Para trabajar con el backend: `npm run dev:local` (PostgreSQL 5433, Alegra simulado 8098, app y API en 8099). Prueba los cambios del modo API contra ese backend, no solo en modo demostración.
