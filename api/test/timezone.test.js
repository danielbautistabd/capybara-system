import { test } from 'node:test';
import assert from 'node:assert/strict';

// En Vercel el servidor corre en UTC; config.js fija la hora de Colombia para los cortes del día.
test('el día se corta a la medianoche de Bogotá aunque el servidor esté en UTC', async () => {
  process.env.TZ = 'UTC';
  await import('../src/config.js?tz');
  const venta = new Date('2026-11-13T01:30:00Z'); // 12 nov, 8:30 p. m. en Bogotá
  const inicio = new Date(venta); inicio.setHours(0, 0, 0, 0);
  assert.equal(inicio.toISOString(), '2026-11-12T05:00:00.000Z');
});
