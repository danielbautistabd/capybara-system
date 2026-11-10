/* =====================================================================
 * Capybara Control — inteligencia de inventario (backend + frontend)
 *  - consumptionStats(): consumo diario promedio y variabilidad
 *  - reorderPlan(): stock de seguridad, punto de reorden, cobertura y cantidad sugerida
 *  - purchaseSignals(): señales de compra y de riesgo
 *  - suggestedOrders(): órdenes sugeridas agrupadas por proveedor
 *  - buildDigest() / ruleSummary(): datos compactos para la IA y resumen sin IA
 * Depende de core.js (MOVEMENT_TYPES). Sin otras dependencias.
 * ===================================================================== */
import { MOVEMENT_TYPES } from './core.js';

const DAYMS = 864e5;
const OUT_TYPES = new Set(['salida', 'marchado', 'consumo_interno', 'cortesia', 'danado', 'vencido', 'perdida']);
const LOSS_TYPES = new Set(['danado', 'vencido', 'perdida']);
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Nivel de servicio → z (probabilidad de no quedarse sin stock durante la reposición) */
export const SERVICE_Z = { 0.9: 1.28, 0.95: 1.65, 0.98: 2.05, 0.99: 2.33 };

/**
 * Consumo diario del producto en los últimos `days` días.
 * avgDaily combina la última semana (60 %) con el periodo completo (40 %) para reaccionar a cambios
 * de temporada sin perder estabilidad.
 */
export function consumptionStats(productId, movements, { days = 28, now = Date.now() } = {}) {
  const end = startOfDay(now) + DAYMS;
  const start = end - days * DAYMS;
  const daily = new Array(days).fill(0);
  let losses = 0, lossQty = 0;
  for (const m of movements) {
    if (m.productId !== productId || m.status !== 'aprobado' || !OUT_TYPES.has(m.type)) continue;
    const t = new Date(m.ts).getTime();
    if (t < start || t >= end) continue;
    daily[Math.floor((t - start) / DAYMS)] += Number(m.qty) || 0;
    if (LOSS_TYPES.has(m.type)) { lossQty += Number(m.qty) || 0; losses++; }
  }
  const sum = daily.reduce((a, b) => a + b, 0);
  const avgAll = sum / days;
  const last7 = daily.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const avgDaily = 0.6 * last7 + 0.4 * avgAll;
  const sd = Math.sqrt(daily.reduce((a, v) => a + (v - avgAll) ** 2, 0) / Math.max(1, days - 1));
  const last2 = daily.slice(-2).reduce((a, b) => a + b, 0) / 2;
  return { avgDaily, avgAll, last7, last2, sd, total: sum, activeDays: daily.filter(Boolean).length, lossQty, losses, daily };
}

/**
 * Plan de reposición por producto.
 * Stock de seguridad  SS  = z · σ · √L
 * Punto de reorden    ROP = consumo diario · L + SS   (nunca menor que el stock mínimo)
 * Cobertura                = stock ÷ consumo diario (días)
 * Cantidad sugerida        = objetivo − stock − en camino, redondeada al empaque
 *   objetivo = max(stock máximo, ROP + consumo diario · días de revisión)
 * @param {object} o
 *   products, movements, stockOf(p), leadDays(p) (días de entrega del proveedor),
 *   onOrder {productId: qty}, service (0.95), reviewDays (7), now
 */
export function reorderPlan({ products, movements, stockOf, leadDays = () => 2, onOrder = {}, service = 0.95, reviewDays = 7, now = Date.now() }) {
  const z = SERVICE_Z[service] ?? 1.65;
  const rows = [];
  for (const p of products) {
    if (p.status === 'inactivo' || p.kind !== 'consumible') continue;
    const st = consumptionStats(p.id, movements, { now });
    const stock = stockOf(p);
    const L = Math.max(0.5, Number(leadDays(p)) || 2);
    const ss = Math.ceil(z * st.sd * Math.sqrt(L));
    const rop = Math.max(Number(p.stockMin) || 0, Math.ceil(st.avgDaily * L + ss));
    const cover = st.avgDaily > 0 ? stock / st.avgDaily : Infinity;
    const target = Math.max(Number(p.stockMax) || 0, Math.ceil(rop + st.avgDaily * reviewDays));
    const pending = Number(onOrder[p.id]) || 0;
    const pack = Math.max(1, Number(p.packSize) || 1);
    let qty = stock + pending <= rop ? Math.max(0, target - stock - pending) : 0;
    qty = qty ? Math.ceil(qty / pack) * pack : 0;
    const unitCost = Number(p.lastPrice) || Number(p.avgCost) || 0;
    let level = 'ok';
    if (stock <= 0) level = 'agotado';
    else if (stock <= ss || cover < L) level = 'comprar_ya';
    else if (stock + pending <= rop) level = 'comprar_pronto';
    else if (cover > 45 && stock * unitCost > 200000) level = 'sobrestock';
    rows.push({
      productId: p.id, name: p.name, unit: p.unit, category: p.category, supplierId: p.supplierId || null,
      stock, avgDaily: round(st.avgDaily, 2), sd: round(st.sd, 2), leadDays: L, safetyStock: ss, reorderPoint: rop,
      cover: Number.isFinite(cover) ? round(cover, 1) : null, target, onOrder: pending, suggestedQty: qty,
      estCost: Math.round(qty * unitCost), unitCost, level,
      stockoutDate: Number.isFinite(cover) && st.avgDaily > 0 ? new Date(now + cover * DAYMS).toISOString().slice(0, 10) : null,
    });
  }
  const order = { agotado: 0, comprar_ya: 1, comprar_pronto: 2, sobrestock: 3, ok: 4 };
  return rows.sort((a, b) => order[a.level] - order[b.level] || (a.cover ?? 1e9) - (b.cover ?? 1e9));
}

/** Historial de precios de compra (entradas aprobadas con costo) */
function priceHistory(productId, movements) {
  return movements.filter((m) => m.productId === productId && m.type === 'entrada' && m.status === 'aprobado' && Number(m.unitCost) > 0)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts)).map((m) => ({ ts: m.ts, price: Number(m.unitCost) }));
}

/**
 * Señales de compra y riesgo. Cada señal: {type, severity: alta|media|baja, productId, title, detail, value}
 */
export function purchaseSignals({ products, movements, plan, recon = null, now = Date.now() }) {
  const out = [];
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  for (const r of plan) {
    const p = byId[r.productId];
    if (r.level === 'agotado') out.push({ type: 'comprar_ya', severity: 'alta', productId: r.productId, title: `${r.name}: agotado`, detail: `Se consumen ${r.avgDaily} ${r.unit}/día. Pedir ${r.suggestedQty} ${r.unit}.`, value: r.estCost });
    else if (r.level === 'comprar_ya') out.push({ type: 'comprar_ya', severity: 'alta', productId: r.productId, title: `${r.name}: comprar hoy`, detail: `Quedan ${r.stock} ${r.unit} (≈${r.cover} días) y el proveedor tarda ${r.leadDays} días. Pedir ${r.suggestedQty} ${r.unit}.`, value: r.estCost });
    else if (r.level === 'comprar_pronto') out.push({ type: 'comprar_pronto', severity: 'media', productId: r.productId, title: `${r.name}: llegó al punto de reorden`, detail: `Stock ${r.stock} ≤ punto de reorden ${r.reorderPoint}. Se agotaría el ${r.stockoutDate}.`, value: r.estCost });
    else if (r.level === 'sobrestock') out.push({ type: 'sobrestock', severity: 'baja', productId: r.productId, title: `${r.name}: sobrestock`, detail: `Cubre ${r.cover} días de consumo. Evita comprar hasta bajar de ${r.reorderPoint}.`, value: Math.round(r.stock * r.unitCost) });

    // precio
    const ph = priceHistory(r.productId, movements);
    if (ph.length >= 3) {
      const last = ph[ph.length - 1].price;
      const prev = ph.slice(0, -1).slice(-5);
      const avg = prev.reduce((a, x) => a + x.price, 0) / prev.length;
      if (last > avg * 1.08) out.push({ type: 'alza_precio', severity: 'media', productId: r.productId, title: `${r.name}: subió ${Math.round((last / avg - 1) * 100)} %`, detail: `Última compra a $${Math.round(last)} vs. promedio $${Math.round(avg)}. Compara con otro proveedor.`, value: Math.round((last - avg) * (r.suggestedQty || r.avgDaily * 7)) });
      else if (last < avg * 0.93) out.push({ type: 'baja_precio', severity: 'baja', productId: r.productId, title: `${r.name}: precio a la baja`, detail: `Última compra ${Math.round((1 - last / avg) * 100)} % más barata. Buen momento para abastecer.`, value: 0 });
    }
    // consumo anómalo
    const st = consumptionStats(r.productId, movements, { now });
    if (st.avgAll >= 1 && st.last2 > st.avgAll + 2.5 * st.sd && st.last2 > st.avgAll * 1.8) out.push({ type: 'consumo_anomalo', severity: 'media', productId: r.productId, title: `${r.name}: consumo inusual`, detail: `${round(st.last2, 1)} ${r.unit}/día en los últimos 2 días frente a ${round(st.avgAll, 1)} habitual. Verifica si hay evento o fuga.`, value: 0 });
    // vencimiento
    if (p?.expiresAt && r.avgDaily > 0) {
      const daysLeft = (new Date(p.expiresAt) - now) / DAYMS;
      if (daysLeft > 0 && r.cover && r.cover > daysLeft) {
        const waste = Math.round(r.stock - r.avgDaily * daysLeft);
        if (waste > 0) out.push({ type: 'riesgo_vencimiento', severity: 'media', productId: r.productId, title: `${r.name}: ${waste} ${r.unit} podrían vencerse`, detail: `Vence el ${String(p.expiresAt).slice(0, 10)} y al ritmo actual no se alcanza a usar. Prioriza su salida.`, value: Math.round(waste * r.unitCost) });
      }
    }
  }
  // mermas (incluye menaje)
  for (const p of products) {
    if (p.status === 'inactivo') continue;
    const st = consumptionStats(p.id, movements, { days: 30, now });
    const rr = recon?.rows?.find((x) => x.productId === p.id);
    const missing = rr && rr.diferencia < 0 && ['importante', 'sin_respaldo'].includes(rr.status) ? -rr.diferencia : 0;
    if (st.losses >= 2 || missing) {
      const cost = Number(p.avgCost) || 0;
      out.push({ type: 'merma', severity: missing ? 'alta' : 'media', productId: p.id, title: missing && !st.losses ? `${p.name}: faltante en el conteo` : `${p.name}: merma recurrente`, detail: `${[st.lossQty ? `${st.lossQty} ${p.unit} dañados, perdidos o vencidos en 30 días` : '', missing ? `faltan ${missing} ${p.unit} en el último conteo` : ''].filter(Boolean).join(' y ').replace(/^./, (c) => c.toUpperCase())}. Revisa manipulación y responsables.`, value: Math.round((st.lossQty + missing) * cost) });
    }
  }
  const sev = { alta: 0, media: 1, baja: 2 };
  return out.sort((a, b) => sev[a.severity] - sev[b.severity] || (b.value || 0) - (a.value || 0));
}

/** Agrupa las cantidades sugeridas por proveedor para crear órdenes de compra */
export function suggestedOrders(plan, suppliers = []) {
  const by = {};
  for (const r of plan) {
    if (!r.suggestedQty) continue;
    const k = r.supplierId || 'sin_proveedor';
    by[k] ||= { supplierId: r.supplierId, supplierName: suppliers.find((s) => s.id === r.supplierId)?.name || 'Sin proveedor asignado', items: [], total: 0, urgent: false };
    by[k].items.push({ productId: r.productId, name: r.name, qty: r.suggestedQty, unit: r.unit, unitCost: r.unitCost, subtotal: r.estCost, level: r.level });
    by[k].total += r.estCost;
    if (r.level === 'agotado' || r.level === 'comprar_ya') by[k].urgent = true;
  }
  return Object.values(by).sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.total - a.total);
}

/**
 * Resumen compacto del estado para enviar a la IA (no incluye datos personales).
 * period: 'day' | 'week' | 'month'
 */
export function buildDigest({ period = 'day', products, movements, purchases = [], expenses = [], recon = null, plan, signals, inbox = [], now = Date.now() }) {
  const days = { day: 1, week: 7, month: 30 }[period] || 1;
  const from = startOfDay(now) - (days - 1) * DAYMS;
  const prevFrom = from - days * DAYMS;
  const inRange = (t, a, b) => { const x = new Date(t).getTime(); return x >= a && x < b; };
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const agg = (a, b) => {
    const o = { entradas: 0, salidasValor: 0, marchados: 0, perdidasValor: 0, porProducto: {}, porArea: {}, porFuente: {} };
    for (const m of movements) {
      if (m.status !== 'aprobado' || !inRange(m.ts, a, b)) continue;
      const p = byId[m.productId]; if (!p) continue;
      const q = Number(m.qty) || 0, v = q * (Number(p.avgCost) || 0);
      o.porFuente[m.source] = (o.porFuente[m.source] || 0) + 1;
      if (MOVEMENT_TYPES[m.type]?.sign > 0 && m.type === 'entrada') o.entradas += v;
      if (OUT_TYPES.has(m.type)) {
        o.salidasValor += v;
        o.porProducto[p.name] = (o.porProducto[p.name] || 0) + q;
        if (m.area) o.porArea[m.area] = (o.porArea[m.area] || 0) + v;
        if (m.type === 'marchado' || m.type === 'cortesia') o.marchados += q;
        if (LOSS_TYPES.has(m.type)) o.perdidasValor += v;
      }
    }
    o.topProductos = Object.entries(o.porProducto).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([n, q]) => ({ producto: n, unidades: round(q, 1) }));
    o.porArea = Object.fromEntries(Object.entries(o.porArea).map(([k, v]) => [k, Math.round(v)]));
    delete o.porProducto; o.entradas = Math.round(o.entradas); o.salidasValor = Math.round(o.salidasValor); o.perdidasValor = Math.round(o.perdidasValor);
    return o;
  };
  const end = startOfDay(now) + DAYMS;
  const cur = agg(from, end), prev = agg(prevFrom, from);
  const comp = purchases.filter((p) => p.status !== 'anulada' && inRange(p.purchasedAt, from, end));
  const gast = expenses.filter((e) => e.status !== 'anulado' && inRange(e.date, from, end));
  const gastCat = {}; for (const e of gast) gastCat[e.category] = (gastCat[e.category] || 0) + Number(e.amount);
  return {
    periodo: { tipo: period, desde: new Date(from).toISOString().slice(0, 10), hasta: new Date(end - 1).toISOString().slice(0, 10), moneda: 'COP' },
    operacion: { actual: cur, anterior: { salidasValor: prev.salidasValor, marchados: prev.marchados, perdidasValor: prev.perdidasValor } },
    compras: { total: Math.round(comp.reduce((a, p) => a + Number(p.total), 0)), facturas: comp.length, borradores: purchases.filter((p) => p.status === 'borrador').length },
    gastos: { total: Math.round(gast.reduce((a, e) => a + Number(e.amount), 0)), porCategoria: gastCat },
    inventario: {
      valor: Math.round(products.filter((p) => p.status !== 'inactivo').reduce((a, p) => a + Math.max(0, Number(p.stockCurrent ?? 0)) * (Number(p.avgCost) || 0), 0)) || undefined,
      agotados: plan.filter((r) => r.level === 'agotado').map((r) => r.name),
      comprarYa: plan.filter((r) => r.level === 'comprar_ya').map((r) => ({ producto: r.name, stock: r.stock, coberturaDias: r.cover, sugerido: r.suggestedQty })),
      puntoReorden: plan.filter((r) => r.level === 'comprar_pronto').map((r) => ({ producto: r.name, stock: r.stock, rop: r.reorderPoint })),
      sobrestock: plan.filter((r) => r.level === 'sobrestock').map((r) => ({ producto: r.name, coberturaDias: r.cover })),
      costoReposicionSugerida: plan.reduce((a, r) => a + r.estCost, 0),
    },
    conciliacion: recon ? { perdidaEstimada: recon.totals.perdida, sobrante: recon.totals.sobrante, conteos: recon.totals, peores: recon.rows.filter((r) => r.valor < 0).sort((a, b) => a.valor - b.valor).slice(0, 5).map((r) => ({ producto: r.name, diferencia: r.diferencia, valor: r.valor, estado: r.status })) } : null,
    senales: signals.slice(0, 15).map((s) => ({ tipo: s.type, severidad: s.severity, titulo: s.title, detalle: s.detail, valor: s.value })),
    whatsapp: { recibidos: inbox.filter((i) => inRange(i.ts, from, end)).length, pendientes: inbox.filter((i) => ['pendiente_aprobacion', 'requiere_info', 'pendiente_analisis'].includes(i.status)).length },
  };
}

/** Instrucción para la IA. La salida es JSON con forma fija. */
export function summaryPrompt(digest, question = '') {
  return `Eres el analista de operaciones de Capybara Hostel (Colombia). "Marchar" significa entregar o consumir un producto del inventario.
Con los datos JSON de abajo escribe un resumen ejecutivo para el administrador, en español claro, sin jerga, cifras en pesos colombianos redondeadas.
No inventes datos que no estén en el JSON. Prioriza dinero en riesgo y acciones concretas para hoy.
${question ? `Además responde esta pregunta del administrador en "respuesta": ${question}\n` : ''}
Responde SOLO con JSON con esta forma:
{"titular": string (máx. 90 caracteres),
 "resumen": string (3-5 frases),
 "puntos_clave": [string] (3-5),
 "alertas": [{"titulo": string, "detalle": string, "prioridad": "alta"|"media"|"baja"}],
 "recomendaciones": [{"titulo": string, "detalle": string, "accion": string, "impacto_cop": number|null, "prioridad": "alta"|"media"|"baja", "modulo": "compras"|"inventario"|"conciliacion"|"marchados"|"gastos"|"personal"}],
 "compras": string (qué comprar y a quién, en 1-2 frases),
 "preguntas_para_el_equipo": [string] (0-3)${question ? ',\n "respuesta": string' : ''}}

DATOS:
${JSON.stringify(digest)}`;
}

/** Resumen determinista (cuando no hay IA disponible). Misma forma que la respuesta de la IA. */
export function ruleSummary(d) {
  const fmt = (v) => '$' + Math.round(v || 0).toLocaleString('es-CO');
  const a = d.operacion.actual, p = d.operacion.anterior;
  const var_ = p.salidasValor ? Math.round((a.salidasValor / p.salidasValor - 1) * 100) : null;
  const alta = d.senales.filter((s) => s.severidad === 'alta');
  const recs = [];
  if (d.inventario.comprarYa.length || d.inventario.agotados.length) recs.push({ titulo: 'Hacer pedido hoy', detalle: [...d.inventario.agotados, ...d.inventario.comprarYa.map((x) => x.producto)].slice(0, 6).join(', '), accion: 'Crear órdenes sugeridas en Inteligencia', impacto_cop: d.inventario.costoReposicionSugerida, prioridad: 'alta', modulo: 'compras' });
  if (d.conciliacion?.perdidaEstimada) recs.push({ titulo: 'Revisar faltantes del conteo', detalle: d.conciliacion.peores.map((x) => `${x.producto} (${x.diferencia})`).join(', '), accion: 'Abrir Conciliación y validar duplicados antes de ajustar', impacto_cop: d.conciliacion.perdidaEstimada, prioridad: 'alta', modulo: 'conciliacion' });
  for (const s of d.senales.filter((x) => x.tipo === 'alza_precio').slice(0, 2)) recs.push({ titulo: s.titulo, detalle: s.detalle, accion: 'Cotizar con otro proveedor', impacto_cop: s.valor, prioridad: 'media', modulo: 'compras' });
  for (const s of d.senales.filter((x) => x.tipo === 'merma').slice(0, 2)) recs.push({ titulo: s.titulo, detalle: s.detalle, accion: 'Hablar con el área responsable', impacto_cop: s.valor, prioridad: 'media', modulo: 'personal' });
  if (d.whatsapp.pendientes) recs.push({ titulo: `${d.whatsapp.pendientes} mensajes de WhatsApp sin revisar`, detalle: 'Hasta aprobarlos no afectan el inventario.', accion: 'Revisar la bandeja de WhatsApp', impacto_cop: null, prioridad: 'media', modulo: 'marchados' });
  return {
    titular: alta.length ? `${alta.length} alertas de alta prioridad · pérdida estimada ${fmt(d.conciliacion?.perdidaEstimada)}` : 'Operación estable en el periodo',
    resumen: `Salidas del periodo por ${fmt(a.salidasValor)} al costo${var_ !== null ? ` (${var_ >= 0 ? '+' : ''}${var_} % frente al periodo anterior)` : ''}. Compras por ${fmt(d.compras.total)} en ${d.compras.facturas} facturas y gastos por ${fmt(d.gastos.total)}. ${d.inventario.agotados.length} productos agotados y ${d.inventario.comprarYa.length} por comprar hoy; reponer cuesta cerca de ${fmt(d.inventario.costoReposicionSugerida)}.`,
    puntos_clave: [
      a.topProductos[0] ? `Lo más marchado: ${a.topProductos.slice(0, 3).map((x) => `${x.producto} (${x.unidades})`).join(', ')}` : 'Sin salidas registradas',
      `Mermas por ${fmt(a.perdidasValor)}`,
      d.conciliacion ? `Diferencias de conteo: ${fmt(d.conciliacion.perdidaEstimada)} en faltantes` : 'Sin conciliación reciente',
    ],
    alertas: alta.slice(0, 5).map((s) => ({ titulo: s.titulo, detalle: s.detalle, prioridad: 'alta' })),
    recomendaciones: recs,
    compras: d.inventario.comprarYa.length || d.inventario.agotados.length ? `Prioriza ${[...d.inventario.agotados.map((x) => `${x} (agotado)`), ...d.inventario.comprarYa.map((x) => `${x.sugerido} de ${x.producto}`)].slice(0, 5).join(', ')}.` : 'No hay compras urgentes.',
    preguntas_para_el_equipo: [],
    generadoPor: 'reglas',
  };
}

function round(v, d = 0) { const k = 10 ** d; return Math.round(v * k) / k; }
