import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInstruction, reconcile, findDuplicates, weightedAvgCost, theoreticalStock, AUTO_APPLY_CONFIDENCE } from '../src/core/core.js';

const catalog = [
  { id: 'p1', name: 'Cerveza Club Colombia', aliases: ['cerveza', 'club colombia', 'pola'], unit: 'botella' },
  { id: 'p2', name: 'Agua en botella 600 ml', aliases: ['agua', 'aguas'], unit: 'botella' },
  { id: 'p3', name: 'Toalla de baño', aliases: ['toalla'], unit: 'unidad' },
  { id: 'p4', name: 'Bolsa de hielo 2 kg', aliases: ['hielo', 'bolsa de hielo'], unit: 'bolsa' },
  { id: 'p5', name: 'Vaso de vidrio', aliases: ['vaso'], unit: 'unidad' },
  { id: 'p6', name: 'Desayuno', aliases: ['desayuno'], unit: 'porción' },
  { id: 'p7', name: 'Ron Medellín 750 ml', aliases: ['ron', 'botella de ron'], unit: 'botella' },
  { id: 'p8', name: 'Desengrasante multiusos', aliases: ['producto de aseo', 'productos de aseo', 'desengrasante'], unit: 'unidad' },
];

const cases = [
  ['Marchar 3 cervezas y 2 aguas', 'marchado', [['p1', 3], ['p2', 2]]],
  ['Enviar 4 toallas a la habitación 203', 'marchado', [['p3', 4]], 'Habitación 203'],
  ['Se utilizaron 2 bolsas de hielo', 'consumo_interno', [['p4', 2]]],
  ['Sacar 3 productos de aseo para limpieza', 'marchado', [['p8', 3]], 'Limpieza'],
  ['Entregar 5 desayunos', 'marchado', [['p6', 5]]],
  ['Se dañaron 2 vasos', 'danado', [['p5', 2]]],
  ['Entregar una botella de ron como cortesía', 'cortesia', [['p7', 1]]],
  ['marchame dos polas pal bar', 'marchado', [['p1', 2]], 'Bar'],
];

for (const [msg, type, items, area] of cases) {
  test(`parse: ${msg}`, () => {
    const r = parseInstruction(msg, catalog);
    assert.equal(r.type, type);
    assert.deepEqual(r.items.filter((i) => i.matched).map((i) => [i.productId, i.qty]), items);
    if (area) assert.equal(r.area, area);
  });
}

test('mensaje ambiguo queda por debajo del umbral', () => {
  const r = parseInstruction('manden eso que pidieron arriba', catalog);
  assert.ok(r.confidence < AUTO_APPLY_CONFIDENCE);
});

test('duplicado entre WhatsApp y Sheets', () => {
  const a = { id: 'a', productId: 'p1', type: 'marchado', qty: 3, ts: '2026-11-06T10:00:00Z', source: 'whatsapp' };
  const b = { id: 'b', productId: 'p1', type: 'marchado', qty: 3, ts: '2026-11-06T14:00:00Z', source: 'sheets', status: 'aprobado' };
  const d = findDuplicates(a, [b]);
  assert.equal(d.length, 1);
  assert.ok(d[0].score > 0.8);
});

test('costo promedio ponderado', () => {
  assert.equal(weightedAvgCost(10, 1000, 10, 2000), 1500);
});

test('conciliación con fórmula oficial', () => {
  const p = { id: 'p1', name: 'Cerveza', stockInit: 48, avgCost: 3200 };
  const mv = [
    { productId: 'p1', type: 'entrada', qty: 24, status: 'aprobado', ts: '2026-11-05T09:00:00Z', source: 'manual' },
    { productId: 'p1', type: 'marchado', qty: 30, status: 'aprobado', ts: '2026-11-05T20:00:00Z', source: 'manual' },
    { productId: 'p1', type: 'danado', qty: 2, status: 'aprobado', ts: '2026-11-05T21:00:00Z', source: 'manual' },
    { productId: 'p1', type: 'marchado', qty: 99, status: 'pendiente', ts: '2026-11-05T21:00:00Z', source: 'whatsapp' },
  ];
  assert.equal(theoreticalStock(p, mv).teorico, 40);
  const r = reconcile({ products: [p], movements: mv, counts: [{ productId: 'p1', qty: 36, ts: '2026-11-06T08:00:00Z' }] });
  assert.equal(r.rows[0].diferencia, -4);
  assert.equal(r.rows[0].valor, -12800);
  assert.equal(r.rows[0].status, 'importante');
  assert.equal(r.totals.perdida, 12800);
});
