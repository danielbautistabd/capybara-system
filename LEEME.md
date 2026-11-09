# Capybara Control con Supabase

## Archivos
- `index.html`: la app, con el panel **Base de datos en Supabase** en *Integraciones*.
- `supabase/schema.sql`: crea la tabla `cc_records`, su seguridad (RLS) y los cambios en vivo.
- `src/cloud.js`: el módulo de sincronización, ya incluido dentro de `index.html`.
- `original.html`: la versión anterior, sin cambios.

## Puesta en marcha
1. En Supabase, abre **SQL Editor** y ejecuta `supabase/schema.sql`.
2. En **Authentication › Providers › Email**, desactiva *Allow new users to sign up*. Así solo entra quien tú crees.
3. En **Authentication › Users › Add user**, crea un usuario por persona del equipo.
4. Abre la app y ve a **Integraciones › Base de datos en Supabase**. Escribe la URL del proyecto, la clave **anon** (Settings › API), tu correo y tu contraseña, y pulsa **Conectar con Supabase**.
5. La primera vez, la base de datos está vacía y la app ofrece subir los datos que muestra en ese momento.

## Cómo funciona
- La lógica de inventario, compras y conciliación sigue corriendo en el navegador.
- Cada colección (productos, movimientos, compras, gastos, proveedores, conteos, bitácora…) se guarda fila por fila en `cc_records`.
- Un cambio se guarda en menos de un segundo. Si falla, la app reintenta cada 15 s.
- Los cambios de otros usuarios llegan en vivo.
- Mientras Supabase está conectado, el botón **Restablecer datos de ejemplo** se oculta, para no borrar los datos reales.

## Límites
- Alegra, Google Sheets y WhatsApp siguen en modo de ejemplo. Necesitan un servidor con claves secretas.
- Si dos personas editan el mismo registro a la vez, queda guardado el último cambio.
