import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessMapping, findHeaderRow, parseNumber, parseDate, buildImportPlan, nextCode } from '../src/core/productImport.js';

test('reconoce encabezados en español con tildes y variantes', () => {
  const m = guessMapping(['Código', 'Nombre del producto', 'Categoría', 'Existencia', 'Stock mínimo', 'Precio de venta', 'Costo unitario', 'Proveedor', 'Fecha de vencimiento', 'Columna rara']);
  assert.deepEqual(m, { 'Código': 'code', 'Nombre del producto': 'name', 'Categoría': 'category', 'Existencia': 'stock', 'Stock mínimo': 'stockMin', 'Precio de venta': 'salePrice', 'Costo unitario': 'avgCost', 'Proveedor': 'supplier', 'Fecha de vencimiento': 'expiresAt', 'Columna rara': '' });
});

test('detecta la fila de encabezados aunque haya un título arriba', () => {
  assert.equal(findHeaderRow([['INVENTARIO CAPYBARA NOV 2026'], [], ['Código', 'Producto', 'Cantidad'], ['BEB-001', 'Cerveza', 10]]), 2);
});

test('números en formato colombiano y fechas', () => {
  assert.equal(parseNumber('$ 3.200'), 3200);
  assert.equal(parseNumber('3.200,50'), 3200.5);
  assert.equal(parseNumber('3,200.50'), 3200.5);
  assert.equal(parseNumber('2,5'), 2.5);
  assert.equal(parseNumber(1200), 1200);
  assert.ok(Number.isNaN(parseNumber('doce')));
  assert.equal(parseDate('15/12/2026'), '2026-12-15');
  assert.equal(parseDate(46371), '2026-12-15');
  assert.equal(parseDate('mañana'), 'invalid');
});

const products = [
  { id: 'p1', code: 'BEB-001', name: 'Cerveza Club Colombia 330 ml', category: 'Bebidas', unit: 'botella', stockMin: 36, stockMax: 120, avgCost: 3200, lastPrice: 3200, salePrice: 7000, supplierId: 's1', kind: 'consumible', status: 'activo' },
  { id: 'p2', code: 'ALI-001', name: 'Huevos AA', category: 'Alimentos', unit: 'unidad', stockMin: 60, avgCost: 550, kind: 'consumible', status: 'activo' },
];
const suppliers = [{ id: 's1', name: 'Distribuidora Bavaria' }];
const mapping = { Codigo: 'code', Nombre: 'name', Categoria: 'category', Stock: 'stock', Minimo: 'stockMin', Costo: 'avgCost', PrecioVenta: 'salePrice', Proveedor: 'supplier' };

test('plan: actualiza, crea, sin cambios, errores, duplicados y proveedor nuevo', () => {
  const rows = [
    { __row: 2, Codigo: 'BEB-001', Nombre: 'Cerveza Club Colombia 330 ml', Stock: 50, Minimo: 48, PrecioVenta: '7.500', Proveedor: 'Distribuidora Bavaria' },
    { __row: 3, Codigo: '', Nombre: 'huevos aa', Minimo: 60, Costo: 600 },
    { __row: 4, Codigo: 'LIC-010', Nombre: 'Ginebra Gordon 700 ml', Categoria: 'Licores', Stock: 4, Costo: '68.000', Proveedor: 'Licores del Caribe' },
    { __row: 5, Codigo: 'LIC-011', Nombre: '', Stock: 'tres' },
    { __row: 6, Codigo: 'BEB-001', Nombre: 'Cerveza Club', Stock: 1 },
    { __row: 7 },
  ];
  const plan = buildImportPlan({ rows, mapping, products, suppliers, stockOf: (p) => (p.id === 'p1' ? 40 : 100), options: { stockMode: 'conteo' } });
  const by = Object.fromEntries(plan.items.map((i) => [i.row, i]));
  assert.equal(by[2].action, 'actualizar');
  assert.deepEqual(by[2].changes.map((c) => c.field).sort(), ['salePrice', 'stockMin']);
  assert.deepEqual(by[2].stock, { from: 40, to: 50, diff: 10, mode: 'conteo' });
  assert.equal(by[3].action, 'sin_cambios'); // costo promedio no se cambia por defecto
  assert.ok(by[3].warnings.some((w) => w.includes('Costo promedio')));
  assert.equal(by[4].action, 'nuevo');
  assert.equal(by[4].data.avgCost, 68000);
  assert.equal(by[4].data.newSupplier, 'Licores del Caribe');
  assert.equal(by[5].action, 'error');
  assert.equal(by[6].action, 'error');
  assert.ok(by[6].errors[0].includes('fila 2'));
  assert.equal(by[7], undefined);
  assert.deepEqual(plan.newSuppliers, ['Licores del Caribe']);
  assert.equal(plan.totals.nuevo, 1);
});

test('código siguiente por categoría', () => {
  assert.equal(nextCode('Bebidas', [{ code: 'BEB-001' }, { code: 'BEB-009' }]), 'BEB-010');
  assert.equal(nextCode('Licores', []), 'LIC-001');
});
