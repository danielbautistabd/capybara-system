import { test } from 'node:test';
import assert from 'node:assert/strict';

// Importa la app como lo hace Vercel (sin escuchar ni programar tareas) y revisa que todo quede montado al arrancar.
process.env.VERCEL = '1';
process.env.DATABASE_URL ||= 'postgresql://x@localhost:1/x';
const { default: app } = await import('../src/server.js');

test('la app exporta Express con el API montado desde el arranque', () => {
  const stack = app._router.stack;
  assert.equal(typeof app.handle, 'function');
  assert.equal(stack.filter((l) => l.name === 'router').length, 4, 'los 4 grupos de rutas de /api/v1');
  const routes = stack.filter((l) => l.route).map((l) => l.route.path);
  for (const p of ['/health', '/api/v1/jobs/:job', '/files/:file']) assert.ok(routes.includes(p), p);
});
