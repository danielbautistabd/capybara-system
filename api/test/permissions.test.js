import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasPerm, PERMISSIONS, DEFAULT_ROLE_PERMS } from '../src/core/permissions.js';

test('cajero: ingresa productos, factura, verifica y envía a Alegra, sin indicadores', () => {
  for (const p of ['inventario.ver', 'entradas.crear', 'facturacion.crear', 'facturacion.emitir', 'caja.ver', 'alegra.enviar']) assert.equal(hasPerm('CAJERO', p), true, p);
  for (const p of ['tablero.ver', 'inteligencia.ver', 'socios.ver', 'costos.ver', 'conciliacion.ver', 'entradas.aprobar', 'alegra.gestionar', 'movimientos.crear', 'usuarios.gestionar']) assert.equal(hasPerm('CAJERO', p), false, p);
});

test('todos los permisos por defecto existen', () => {
  for (const [r, ps] of Object.entries(DEFAULT_ROLE_PERMS)) for (const p of ps) assert.ok(PERMISSIONS[p], `${r}: ${p}`);
});
