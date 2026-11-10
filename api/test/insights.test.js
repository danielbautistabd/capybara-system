import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reorderPlan, purchaseSignals, suggestedOrders, consumptionStats, buildDigest, ruleSummary } from '../src/core/insights.js';
import { hasPerm, maskMoney } from '../src/core/permissions.js';

const now = new Date('2026-11-06T15:00:00').getTime();
const day = (d, h = 12) => new Date(now - d * 864e5).setHours(h, 0, 0, 0);
const P = { id: 'b', name: 'Cerveza', kind: 'consumible', unit: 'botella', stockMin: 24, stockMax: 120, avgCost: 3200, lastPrice: 3200, supplierId: 's1', packSize: 24 };
const mv = [];
for (let d = 0; d < 28; d++) mv.push({ productId: 'b', type: 'marchado', qty: 10, status: 'aprobado', ts: new Date(day(d)).toISOString() });

test('consumo diario estable = 10', () => {
  const s = consumptionStats('b', mv, { now });
  assert.equal(Math.round(s.avgDaily), 10);
  assert.ok(s.sd < 0.5);
});

test('punto de reorden y cantidad sugerida redondeada al empaque', () => {
  const [r] = reorderPlan({ products: [P], movements: mv, stockOf: () => 22, leadDays: () => 2, now });
  assert.equal(r.reorderPoint, 24); // max(stockMin 24, 10·2 + SS)
  assert.equal(r.level, 'comprar_pronto');
  assert.equal(r.suggestedQty % 24, 0);
  assert.ok(r.suggestedQty >= 90);
  assert.equal(r.estCost, r.suggestedQty * 3200);
});

test('comprar ya cuando la cobertura es menor que el tiempo de entrega', () => {
  const [r] = reorderPlan({ products: [P], movements: mv, stockOf: () => 12, leadDays: () => 2, now });
  assert.equal(r.level, 'comprar_ya');
  const sig = purchaseSignals({ products: [P], movements: mv, plan: [r], now });
  assert.equal(sig[0].type, 'comprar_ya');
  assert.equal(sig[0].severity, 'alta');
});

test('lo que está en camino evita pedir de más', () => {
  const [r] = reorderPlan({ products: [P], movements: mv, stockOf: () => 20, onOrder: { b: 120 }, now });
  assert.equal(r.suggestedQty, 0);
});

test('alza de precio detectada', () => {
  const m2 = [...mv, ...[3000, 3000, 3050, 3500].map((c, i) => ({ productId: 'b', type: 'entrada', qty: 24, unitCost: c, status: 'aprobado', ts: new Date(day(20 - i * 5)).toISOString() }))];
  const plan = reorderPlan({ products: [P], movements: m2, stockOf: () => 200, now });
  const sig = purchaseSignals({ products: [P], movements: m2, plan, now });
  assert.ok(sig.some((s) => s.type === 'alza_precio'));
});

test('órdenes sugeridas por proveedor y resumen sin IA', () => {
  const plan = reorderPlan({ products: [P], movements: mv, stockOf: () => 5, now });
  const o = suggestedOrders(plan, [{ id: 's1', name: 'Bavaria' }]);
  assert.equal(o[0].supplierName, 'Bavaria');
  assert.equal(o[0].urgent, true);
  const d = buildDigest({ period: 'week', products: [P], movements: mv, plan, signals: purchaseSignals({ products: [P], movements: mv, plan, now }), now });
  assert.equal(d.operacion.actual.marchados, 70);
  const s = ruleSummary(d);
  assert.ok(s.recomendaciones.length >= 1);
  assert.equal(s.recomendaciones[0].modulo, 'compras');
});

test('permisos y ocultamiento de costos', () => {
  assert.equal(hasPerm('EMPLEADO', 'movimientos.aprobar'), false);
  assert.equal(hasPerm('EMPLEADO', 'movimientos.crear'), true);
  assert.equal(hasPerm('ADMIN', 'usuarios.gestionar'), true);
  assert.deepEqual(maskMoney({ name: 'x', avgCost: 1, items: [{ qty: 1, unitCost: 2 }] }), { name: 'x', items: [{ qty: 1 }] });
});
