# Capybara Control

Control de inventario, marchados, compras, gastos y conciliación de **Capybara Hostel**, con los datos guardados en Supabase.

## Estructura
| Ruta | Qué es |
| --- | --- |
| `index.html` | La app completa (una sola página). |
| `src/cloud.js` | Módulo de sincronización con Supabase (ya incluido dentro de `index.html`). |
| `supabase/schema.sql` | Tabla `cc_records`, seguridad (RLS) y cambios en vivo. |
| `original.html` | Versión anterior, sin Supabase, como referencia. |

## Ejecutar la app
La app no se puede abrir con doble clic: necesita servirse por http.

```bash
python3 -m http.server 8080
```

Luego abre http://localhost:8080.

## Supabase
- Proyecto: **capybara-control** (organización *capybara hostel*, región us-east-1)
- URL: https://ghedaeyshfvlvvkafbyd.supabase.co
- La tabla `cc_records` ya está instalada (`supabase/schema.sql`), con RLS y Realtime.
- La app ya trae la URL y la clave anon. La clave anon es pública: sin sesión iniciada no da acceso a nada.

### Antes de usarla con datos reales
1. En Supabase › **Authentication › Sign In / Providers › Email**, desactiva **Allow new users to sign up**. Si queda activo, cualquiera con la clave podría crearse una cuenta y ver los datos.
2. En **Authentication › Users › Add user**, crea un usuario (correo y contraseña) por persona del equipo. Marca *Auto Confirm User*.
3. En la app, ve a **Integraciones › Base de datos en Supabase**, escribe tu correo y contraseña y pulsa **Conectar con Supabase**.
4. La primera vez, la app ofrece subir los datos que muestra en ese momento.

Usa siempre la clave anon, nunca la `service_role`.

## Cómo funciona
- La lógica de inventario, compras y conciliación corre en el navegador.
- Cada colección (productos, movimientos, compras, gastos, proveedores, conteos, bitácora…) se guarda fila por fila en `cc_records`.
- Un cambio se guarda en menos de un segundo; si falla, la app reintenta cada 15 s.
- Los cambios de otros usuarios llegan en vivo (Supabase Realtime).
- Con Supabase conectado, el botón **Restablecer datos de ejemplo** se oculta para no borrar datos reales.

## Pendiente
- Alegra, Google Sheets y WhatsApp siguen con datos de ejemplo: necesitan un servidor con claves secretas (Supabase Edge Functions).
- Si dos personas editan el mismo registro a la vez, queda el último cambio.
