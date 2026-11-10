/* =====================================================================
 * Integración con Alegra (https://developer.alegra.com)
 *  Base: https://api.alegra.com/api/v1 · Auth: Basic base64(email:token)
 *  Límite: 150 solicitudes/min por usuario (429 + X-Rate-Limit-Reset)
 *  Paginación: start / limit (máx. 30)
 *  IDs: se tratan SIEMPRE como texto (Alegra migra de números a UUID)
 *
 *  Flujos:
 *   1) Importar facturas de proveedor (GET /bills) → compras en Capybara (borrador para revisar)
 *   2) Exportar compras aprobadas → POST /bills (+ POST /payments si ya se pagó)
 *   3) Sincronizar proveedores (contacts type=provider) e ítems (items)
 *   4) Órdenes de compra sugeridas → POST /purchase-orders
 *   5) Webhooks new-bill / edit-bill / delete-bill / new-item / edit-item
 * ===================================================================== */
import { config } from '../config.js';
import { prisma, n } from '../db.js';
import { matchProduct } from '../core/core.js';
import { toCoreProduct } from '../db.js';

const BASE = 'https://api.alegra.com/api/v1';
const PAY_MAP = { Efectivo: 'cash', Transferencia: 'transfer', Nequi: 'transfer', Daviplata: 'transfer', Tarjeta: 'debit-card', 'Tarjeta crédito': 'credit-card', Cheque: 'check' };

let remaining = 150, resetAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isConfigured() { return !!(config.alegra.email && config.alegra.token); }

async function call(path, { method = 'GET', body, query } = {}, retry = true) {
  if (!isConfigured()) throw Object.assign(new Error('Alegra no está configurado (ALEGRA_EMAIL / ALEGRA_TOKEN)'), { status: 503, expose: true });
  if (remaining <= 2 && Date.now() < resetAt) await sleep(resetAt - Date.now() + 200);
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
  const r = await fetch(BASE + path + qs, {
    method,
    headers: { Authorization: 'Basic ' + Buffer.from(`${config.alegra.email}:${config.alegra.token}`).toString('base64'), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  remaining = Number(r.headers.get('x-rate-limit-remaining') ?? remaining);
  const reset = Number(r.headers.get('x-rate-limit-reset'));
  if (reset) resetAt = Date.now() + reset * 1000;
  if (r.status === 429 && retry) { await sleep((reset || 60) * 1000 + 250); return call(path, { method, body, query }, false); }
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw Object.assign(new Error(`Alegra ${r.status}: ${data?.message || text.slice(0, 200)}`), { status: r.status === 401 ? 502 : 502, expose: true, alegra: data });
  return data;
}

/** Recorre todas las páginas (limit 30) */
async function* paginate(path, query = {}) {
  for (let start = 0; ; start += 30) {
    const page = await call(path, { query: { ...query, start, limit: 30 } });
    const rows = Array.isArray(page) ? page : page?.data || [];
    for (const x of rows) yield x;
    if (rows.length < 30) break;
  }
}

async function log(action, status, detail, ref = null) {
  await prisma.alegraSyncLog.create({ data: { action, status, detail: String(detail).slice(0, 1000), ref } });
}

/* ------------------------------ lectura ------------------------------ */
export const ping = () => call('/company');
export const listProviders = async () => { const out = []; for await (const c of paginate('/contacts', { type: 'provider', mode: 'simple' })) out.push(c); return out; };
export const listItems = async () => { const out = []; for await (const i of paginate('/items')) out.push(i); return out; };
export const listBills = async ({ date, status } = {}) => { const out = []; for await (const b of paginate('/bills', { date, status, order_field: 'date', order_direction: 'DESC' })) out.push(b); return out; };
export const getBill = (id) => call(`/bills/${encodeURIComponent(id)}`);

/* --------------------------- proveedores ---------------------------- */
const normNit = (s) => String(s || '').replace(/[^0-9]/g, '').slice(0, 9);
/** Vincula proveedores locales con contactos proveedores de Alegra por NIT o nombre; crea los que faltan si create=true */
export async function syncProviders({ create = false } = {}) {
  const remote = await listProviders();
  const local = await prisma.supplier.findMany();
  let linked = 0, created = 0, imported = 0;
  for (const s of local) {
    if (s.alegraId) continue;
    const hit = remote.find((c) => (s.taxId && normNit(c.identification || c.identificationObject?.number) === normNit(s.taxId)) || c.name?.toLowerCase().trim() === s.name.toLowerCase().trim());
    if (hit) { await prisma.supplier.update({ where: { id: s.id }, data: { alegraId: String(hit.id) } }); linked++; }
    else if (create) {
      const c = await call('/contacts', { method: 'POST', body: {
        name: s.name, type: ['provider'], email: s.email || undefined, phonePrimary: s.phone || undefined,
        // Colombia usa identificationObject; verifica el formato exacto con tu cuenta (tipo NIT/CC y dígito de verificación)
        identificationObject: s.taxId ? { type: 'NIT', number: normNit(s.taxId), dv: String(s.taxId).split('-')[1] || undefined } : undefined,
        ignoreRepeated: true,
      } });
      await prisma.supplier.update({ where: { id: s.id }, data: { alegraId: String(c.id) } }); created++;
    }
  }
  for (const c of remote) {
    if (local.some((s) => s.alegraId === String(c.id))) continue;
    if (await prisma.supplier.findFirst({ where: { alegraId: String(c.id) } })) continue;
    await prisma.supplier.create({ data: { name: c.name, taxId: c.identification || c.identificationObject?.number || null, phone: c.phonePrimary || null, email: c.email || null, alegraId: String(c.id), notes: 'Importado de Alegra' } }).catch(() => null);
    imported++;
  }
  await log('proveedores.sincronizar', 'ok', `${linked} vinculados, ${created} creados en Alegra, ${imported} importados`);
  return { linked, created, imported };
}

/* ------------------------------ ítems ------------------------------- */
/** Sugiere vínculos producto ↔ ítem de Alegra por referencia (= código interno) o nombre */
export async function suggestItemLinks() {
  const items = await listItems();
  const products = (await prisma.product.findMany({ include: { category: true } })).map(toCoreProduct);
  const out = [];
  for (const it of items) {
    const byRef = products.find((p) => it.reference && (p.code === it.reference || p.barcode === it.reference));
    const m = byRef ? { product: byRef, score: 1 } : matchProduct(it.name, products);
    out.push({ alegraItemId: String(it.id), alegraName: it.name, reference: it.reference || null, productId: m?.product.id || null, productName: m?.product.name || null, score: m ? Math.round(m.score * 100) / 100 : 0, linked: products.some((p) => p.alegraItemId === String(it.id)) });
  }
  return out;
}
export async function linkItem(productId, alegraItemId) { return prisma.product.update({ where: { id: productId }, data: { alegraItemId: alegraItemId ? String(alegraItemId) : null } }); }

/* -------------------- importar facturas de proveedor -------------------- */
/**
 * Trae facturas de proveedor de Alegra y las convierte en compras BORRADOR de Capybara.
 * Evita duplicados por alegraBillId y por (proveedor + número de factura).
 * Los ítems sin producto vinculado quedan marcados para revisión; las categorías contables
 * (servicios, mantenimiento) se registran como gasto pendiente de revisión.
 */
export async function importBills({ since } = {}) {
  const bills = await listBills({});
  const products = (await prisma.product.findMany({ include: { category: true } })).map(toCoreProduct);
  const res = { nuevas: 0, vinculadas: 0, actualizadas: 0, gastos: 0, revisar: 0, omitidas: 0 };
  for (const b of bills) {
    if (since && new Date(b.date) < new Date(since)) continue;
    const alegraBillId = String(b.id);
    const number = b.numberTemplate?.fullNumber || b.numberTemplate?.number || b.billNumber || alegraBillId;
    let supplier = await prisma.supplier.findFirst({ where: { alegraId: String(b.provider?.id ?? b.provider) } });
    if (!supplier && b.provider?.name) supplier = await prisma.supplier.create({ data: { name: b.provider.name, taxId: b.provider.identification || null, alegraId: String(b.provider.id), notes: 'Creado desde factura de Alegra' } }).catch(() => prisma.supplier.findFirst({ where: { name: b.provider.name } }));
    if (!supplier) { res.omitidas++; continue; }
    if (b.status === 'void') { await prisma.purchase.updateMany({ where: { alegraBillId }, data: { status: 'anulada' } }); continue; }

    const existing = await prisma.purchase.findFirst({ where: { OR: [{ alegraBillId }, { supplierId: supplier.id, invoice: number }] } });
    if (existing) {
      if (!existing.alegraBillId) { await prisma.purchase.update({ where: { id: existing.id }, data: { alegraBillId, alegraSyncedAt: new Date() } }); res.vinculadas++; }
      else res.omitidas++;
      continue;
    }
    const items = [], issues = [];
    for (const it of b.purchases?.items || []) {
      let p = products.find((x) => x.alegraItemId === String(it.id));
      if (!p) { const m = matchProduct(it.name || '', products); if (m && m.score >= 0.85) p = m.product; }
      if (!p) { issues.push(`Ítem sin vincular: ${it.name} (${it.id})`); continue; }
      items.push({ productId: p.id, qty: Number(it.quantity), unit: p.unit, unitCost: Number(it.price), subtotal: Number(it.quantity) * Number(it.price) });
    }
    for (const c of b.purchases?.categories || []) {
      await prisma.expense.create({ data: { date: new Date(b.date), category: 'Otros', description: `${c.name || 'Categoría Alegra'} — ${supplier.name} ${number}`, amount: Number(c.price) * Number(c.quantity || 1), supplierId: supplier.id, payMethod: 'Crédito proveedor', source: 'alegra', status: 'pendiente_revision', fingerprint: `alegra-${alegraBillId}-${c.id}` } }).catch(() => null);
      res.gastos++;
    }
    if (!items.length && !issues.length) continue;
    const subtotal = items.reduce((a, i) => a + i.subtotal, 0);
    await prisma.purchase.create({ data: {
      supplierId: supplier.id, invoice: number, purchasedAt: new Date(b.date), receivedAt: new Date(b.date), subtotal,
      tax: Math.max(0, Number(b.total || subtotal) - subtotal), discount: 0, total: Number(b.total || subtotal), payMethod: Number(b.balance) > 0 ? 'Crédito proveedor' : 'Transferencia',
      receivedBy: 'Alegra', status: 'borrador', source: 'alegra', alegraBillId, alegraSyncedAt: new Date(), notes: issues.join(' · ') || 'Importada de Alegra',
      items: { create: items },
    } });
    res.nuevas++; if (issues.length) res.revisar++;
  }
  await log('facturas.importar', 'ok', JSON.stringify(res));
  return res;
}

/* -------------------- exportar compras aprobadas -------------------- */
/** Crea la factura de proveedor en Alegra a partir de una compra aprobada de Capybara */
export async function pushPurchase(purchaseId, { pay = true } = {}) {
  const pu = await prisma.purchase.findUnique({ where: { id: purchaseId }, include: { items: true, supplier: true } });
  if (!pu) throw Object.assign(new Error('Compra no encontrada'), { status: 404, expose: true });
  if (pu.alegraBillId) return { alegraBillId: pu.alegraBillId, already: true };
  if (pu.status !== 'aprobada') throw Object.assign(new Error('Solo se envían compras aprobadas'), { status: 409, expose: true });
  if (!pu.supplier.alegraId) throw Object.assign(new Error(`El proveedor ${pu.supplier.name} no está vinculado con Alegra`), { status: 409, expose: true });
  const prods = await prisma.product.findMany({ where: { id: { in: pu.items.map((i) => i.productId) } } });
  const tax = config.alegra.taxIds;
  const rate = n(pu.subtotal) ? Math.round((n(pu.tax) / n(pu.subtotal)) * 100) : 0;
  const taxRef = tax[rate] ? [{ id: String(tax[rate]) }] : undefined;
  const items = [], categories = [];
  for (const it of pu.items) {
    const p = prods.find((x) => x.id === it.productId);
    const line = { price: n(it.unitCost), quantity: n(it.qty), tax: taxRef, observations: p?.name };
    if (p?.alegraItemId) items.push({ id: p.alegraItemId, ...line });
    else categories.push({ id: String(config.alegra.defaultCategoryId), ...line }); // cuenta contable de inventario/compras
  }
  if (categories.length && !config.alegra.defaultCategoryId) throw Object.assign(new Error('Hay productos sin ítem de Alegra y falta ALEGRA_DEFAULT_CATEGORY_ID'), { status: 409, expose: true });
  const date = pu.purchasedAt.toISOString().slice(0, 10);
  const due = new Date(pu.purchasedAt.getTime() + (pu.payMethod === 'Crédito proveedor' ? config.alegra.creditDays : 0) * 864e5).toISOString().slice(0, 10);
  const bill = await call('/bills', { method: 'POST', body: {
    date, dueDate: due, provider: pu.supplier.alegraId,
    numberTemplate: pu.invoice ? { number: pu.invoice } : undefined,
    purchases: { items, categories },
    warehouse: config.alegra.warehouseId ? String(config.alegra.warehouseId) : undefined,
    observations: `Capybara Control · compra ${pu.id}${pu.notes ? ' · ' + pu.notes : ''}`.slice(0, 500),
  } });
  await prisma.purchase.update({ where: { id: pu.id }, data: { alegraBillId: String(bill.id), alegraSyncedAt: new Date() } });
  let payment = null;
  if (pay && pu.payMethod !== 'Crédito proveedor' && config.alegra.bankAccountId) {
    payment = await call('/payments', { method: 'POST', body: {
      date, type: 'out', bankAccount: { id: String(config.alegra.bankAccountId) }, paymentMethod: PAY_MAP[pu.payMethod] || 'transfer',
      client: { id: pu.supplier.alegraId }, bills: [{ id: String(bill.id), amount: n(pu.total) }], observations: `Pago ${pu.payMethod} registrado en Capybara Control`,
    } }).catch(async (e) => { await log('pago.crear', 'error', e.message, String(bill.id)); return null; });
  }
  await log('factura.exportar', 'ok', `${pu.supplier.name} ${pu.invoice || ''} → Alegra ${bill.id}${payment ? ' + pago ' + payment.id : ''}`, String(bill.id));
  return { alegraBillId: String(bill.id), paymentId: payment ? String(payment.id) : null };
}

/** Envía todas las compras aprobadas pendientes */
export async function pushPending() {
  const list = await prisma.purchase.findMany({ where: { status: 'aprobada', alegraBillId: null, source: { not: 'alegra' } }, take: 50 });
  const out = [];
  for (const p of list) { try { out.push({ id: p.id, ...(await pushPurchase(p.id)) }); } catch (e) { out.push({ id: p.id, error: e.message }); await log('factura.exportar', 'error', e.message, p.id); } }
  return out;
}

/* ------------------------ órdenes de compra ------------------------ */
/**
 * Crea una orden de compra en Alegra a partir de una orden sugerida por Inteligencia.
 * Nota: los campos de /purchase-orders siguen el mismo patrón que /bills (provider, date, items);
 * valida el cuerpo exacto con tu cuenta antes de producción.
 */
export async function createPurchaseOrder({ supplierId, items, observations }) {
  const s = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!s?.alegraId) throw Object.assign(new Error('Proveedor sin vincular a Alegra'), { status: 409, expose: true });
  const prods = await prisma.product.findMany({ where: { id: { in: items.map((i) => i.productId) } } });
  const today = new Date().toISOString().slice(0, 10);
  const body = {
    date: today, dueDate: today, provider: s.alegraId, observations: (observations || 'Orden sugerida por Capybara Control').slice(0, 500),
    purchases: { items: items.filter((i) => prods.find((p) => p.id === i.productId)?.alegraItemId).map((i) => ({ id: prods.find((p) => p.id === i.productId).alegraItemId, price: i.unitCost, quantity: i.qty })) },
  };
  const po = await call('/purchase-orders', { method: 'POST', body });
  await log('orden.crear', 'ok', `${s.name}: ${items.length} ítems`, String(po.id));
  return po;
}

/* ----------------------------- webhooks ----------------------------- */
export const WEBHOOK_EVENTS = ['new-bill', 'edit-bill', 'delete-bill', 'new-item', 'edit-item'];
export async function subscribeWebhooks() {
  const url = `${config.publicUrl}/webhooks/alegra/${config.alegra.webhookSecret}`;
  const out = [];
  for (const event of WEBHOOK_EVENTS) {
    try { out.push({ event, ok: true, r: await call('/webhooks/subscriptions', { method: 'POST', body: { event, url } }) }); }
    catch (e) { out.push({ event, ok: false, error: e.message }); }
  }
  await log('webhooks.suscribir', 'ok', out.map((o) => `${o.event}:${o.ok ? 'ok' : o.error}`).join(', '));
  return out;
}
/** Procesa una notificación de Alegra. El formato del cuerpo no está documentado: se lee de forma tolerante. */
export async function handleWebhook(body) {
  const event = body?.event || body?.subject || '';
  const id = String(body?.message?.id ?? body?.id ?? body?.data?.id ?? '');
  await log('webhook.recibir', 'ok', `${event} ${id}`, id || null);
  if (/bill/.test(event)) {
    if (/delete/.test(event) && id) { await prisma.purchase.updateMany({ where: { alegraBillId: id, status: 'borrador' }, data: { status: 'anulada' } }); return { event, id }; }
    await importBills({ since: new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10) });
  }
  return { event, id };
}

/* ------------------------ facturas de venta ------------------------ */
/**
 * Crea la factura de venta en Alegra (POST /invoices) a partir de una factura emitida en Capybara.
 * Cliente: ALEGRA_DEFAULT_CLIENT_ID (consumidor final) o el contacto que coincida con customerDoc.
 * La factura electrónica ante la DIAN depende de la numeración y configuración de tu cuenta de Alegra;
 * valida el cuerpo (numberTemplate, stamp, paymentForm) con tu cuenta antes de producción.
 */
export async function pushSalesInvoice(invoiceId) {
  const inv = await prisma.salesInvoice.findUnique({ where: { id: invoiceId }, include: { lines: true } });
  if (!inv) throw Object.assign(new Error('Factura no encontrada'), { status: 404, expose: true });
  if (inv.alegraInvoiceId) return { alegraInvoiceId: inv.alegraInvoiceId, already: true };
  if (inv.status !== 'emitida') throw Object.assign(new Error('Solo se envían facturas emitidas'), { status: 409, expose: true });
  let clientId = config.alegra.defaultClientId;
  if (inv.customerDoc) { const c = await call('/contacts', { query: { identification: inv.customerDoc, limit: 1 } }); if (c?.[0]?.id) clientId = String(c[0].id); }
  if (!clientId) throw Object.assign(new Error('Falta ALEGRA_DEFAULT_CLIENT_ID (cliente consumidor final)'), { status: 409, expose: true });
  const prods = await prisma.product.findMany({ where: { id: { in: inv.lines.map((l) => l.productId) } } });
  const missing = prods.filter((p) => !p.alegraItemId).map((p) => p.name);
  if (missing.length) throw Object.assign(new Error(`Productos sin ítem en Alegra: ${missing.join(', ')}`), { status: 409, expose: true });
  const taxOf = (pct) => (config.alegra.taxIds[Math.round(n(pct))] ? [{ id: String(config.alegra.taxIds[Math.round(n(pct))]) }] : undefined);
  const date = inv.date.toISOString().slice(0, 10);
  const body = {
    date, dueDate: date, client: { id: clientId }, paymentForm: 'CASH',
    items: inv.lines.map((l) => ({ id: prods.find((p) => p.id === l.productId).alegraItemId, price: n(l.price), quantity: n(l.qty), tax: taxOf(l.taxPct) })),
    observations: `Capybara Control ${inv.number} · ${inv.customerName}${inv.room ? ' · hab. ' + inv.room : ''}`.slice(0, 500),
  };
  const a = await call('/invoices', { method: 'POST', body });
  await prisma.salesInvoice.update({ where: { id: inv.id }, data: { alegraInvoiceId: String(a.id) } });
  await log('venta.exportar', 'ok', `${inv.number} → Alegra ${a.id}`, String(a.id));
  return { alegraInvoiceId: String(a.id) };
}
