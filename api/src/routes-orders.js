/* Pedidos con cuenta abierta — prefijo /api/v1/orders
 * Cada pedido es una fila (OrderLine) dentro de la cuenta de un huésped, habitación o punto (OrderTab).
 * Los pedidos no tocan el inventario: al CERRAR la cuenta se genera una sola factura y se emite
 * (salida por venta, aprobada solo si cierra un ADMIN o SUPERVISOR). Nada se borra: se anula con motivo.
 * Después, un administrador o manager revisa las facturas del día y las envía a Alegra en bloque. */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, n } from './db.js';
import { auth, audit, validate, asyncH, HttpError } from './middleware.js';
import { perm } from './routes2.js';
import { issueInvoice, nextNumber, totals } from './routes-billing.js';
import { syncOrdersSheet, sheetStatus } from './services/orders-sheet.js';

const r = Router();
r.use(auth);

const TAX = [0, 5, 8, 19];
/** Impuesto por defecto: el del producto o, si no tiene, INC 8 % en bar y restaurante e IVA 19 % en lo demás. */
export const defaultTaxPct = (p) => (p?.saleTaxPct != null ? Number(p.saleTaxPct) : ['Bebidas', 'Licores', 'Alimentos', 'Servicios'].includes(p?.category?.name) ? 8 : 19);
/** Fecha de hoy en Colombia (AAAA-MM-DD) para la factura. */
const todayCO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

async function nextTabNumber() {
  const s = await prisma.sequence.upsert({ where: { key: 'CTA' }, update: { value: { increment: 1 } }, create: { key: 'CTA', value: 1 } });
  return 'CTA-' + String(s.value).padStart(4, '0');
}
const lineOut = (l) => ({ id: l.id, tabId: l.tabId, ts: l.ts, productId: l.productId, product: l.product?.name, qty: n(l.qty), price: n(l.price), taxPct: l.taxPct, waiter: l.waiter, status: l.status, voidReason: l.voidReason, notes: l.notes });
function tabOut(t) {
  const act = t.lines.filter((l) => l.status !== 'anulado');
  const tt = totals(act.map((l) => ({ qty: n(l.qty), price: n(l.price), taxPct: l.taxPct })));
  return { ...t, lines: t.lines.map(lineOut), ...tt, pedidos: act.length };
}
async function openTab(id) {
  const t = await prisma.orderTab.findUnique({ where: { id } });
  if (!t) throw new HttpError(404, 'La cuenta no existe');
  if (t.status !== 'abierta') throw new HttpError(409, `La cuenta ${t.number} ya está ${t.status}`);
  return t;
}
const LINES = { lines: { orderBy: { ts: 'asc' }, include: { product: { select: { name: true } } } } };

/** Cuentas abiertas (por defecto) o las cerradas/anuladas de los últimos `days` días. */
r.get('/orders/tabs', perm(['facturacion.crear', 'facturacion.emitir']), asyncH(async (req, res) => {
  const days = Math.min(400, Number(req.query.days) || 7);
  const since = new Date(Date.now() - days * 864e5);
  const where = req.query.status === 'todas' ? { OR: [{ status: 'abierta' }, { closedAt: { gte: since } }, { openedAt: { gte: since } }] } : { status: 'abierta' };
  const tabs = await prisma.orderTab.findMany({ where, orderBy: { openedAt: 'asc' }, include: LINES });
  res.json(tabs.map(tabOut));
}));

const tabSchema = z.object({ customerName: z.string().trim().min(2, 'Escribe el nombre del huésped o cliente'), room: z.string().trim().max(40).optional().nullable(), customerDoc: z.string().trim().max(30).optional().nullable(), notes: z.string().max(500).optional().nullable() });
r.post('/orders/tabs', perm('facturacion.crear'), validate(tabSchema), asyncH(async (req, res) => {
  const t = await prisma.orderTab.create({ data: { ...req.body, number: await nextTabNumber(), openedBy: req.user.name }, include: LINES });
  await audit(req, 'cuenta.abrir', 'OrderTab', t.id, null, { number: t.number, cliente: t.customerName, room: t.room });
  res.status(201).json(tabOut(t));
}));
r.patch('/orders/tabs/:id', perm('facturacion.crear'), validate(tabSchema.partial()), asyncH(async (req, res) => {
  await openTab(req.params.id);
  const t = await prisma.orderTab.update({ where: { id: req.params.id }, data: req.body, include: LINES });
  res.json(tabOut(t));
}));

const lineSchema = z.object({ productId: z.string(), qty: z.number().positive().max(10000), price: z.number().min(0).optional(), taxPct: z.number().refine((x) => TAX.includes(x), 'Impuesto no válido').optional(), notes: z.string().max(300).optional().nullable() });
r.post('/orders/tabs/:id/lines', perm('facturacion.crear'), validate(lineSchema), asyncH(async (req, res) => {
  const t = await openTab(req.params.id);
  const p = await prisma.product.findUnique({ where: { id: req.body.productId }, include: { category: true } });
  if (!p || p.status === 'inactivo') throw new HttpError(400, 'Ese producto no existe o está inactivo');
  const l = await prisma.orderLine.create({ data: { tabId: t.id, productId: p.id, qty: req.body.qty, price: req.body.price ?? n(p.salePrice), taxPct: req.body.taxPct ?? defaultTaxPct(p), waiter: req.user.name, notes: req.body.notes }, include: { product: { select: { name: true } } } });
  res.status(201).json(lineOut(l));
}));
r.patch('/orders/lines/:id', perm('facturacion.crear'), validate(lineSchema.partial()), asyncH(async (req, res) => {
  const l = await prisma.orderLine.findUnique({ where: { id: req.params.id } });
  if (!l) throw new HttpError(404, 'El pedido no existe');
  if (l.status !== 'pedido') throw new HttpError(409, `El pedido está ${l.status}: no se puede editar`);
  await openTab(l.tabId);
  const data = { ...req.body };
  if (data.productId && data.productId !== l.productId) {
    const p = await prisma.product.findUnique({ where: { id: data.productId }, include: { category: true } });
    if (!p || p.status === 'inactivo') throw new HttpError(400, 'Ese producto no existe o está inactivo');
    if (data.price === undefined) data.price = n(p.salePrice);
    if (data.taxPct === undefined) data.taxPct = defaultTaxPct(p);
  }
  const out = await prisma.orderLine.update({ where: { id: l.id }, data, include: { product: { select: { name: true } } } });
  res.json(lineOut(out));
}));
/** Anular un pedido (no se borra). Solo mientras la cuenta esté abierta: todavía no tocó el inventario. */
r.post('/orders/lines/:id/void', perm('facturacion.crear'), validate(z.object({ reason: z.string().trim().min(3, 'Escribe el motivo') })), asyncH(async (req, res) => {
  const l = await prisma.orderLine.findUnique({ where: { id: req.params.id } });
  if (!l) throw new HttpError(404, 'El pedido no existe');
  if (l.status !== 'pedido') throw new HttpError(409, `El pedido ya está ${l.status}`);
  await openTab(l.tabId);
  const out = await prisma.orderLine.update({ where: { id: l.id }, data: { status: 'anulado', voidReason: req.body.reason, voidedBy: req.user.name }, include: { product: { select: { name: true } } } });
  await audit(req, 'pedido.anular', 'OrderLine', l.id, { qty: n(l.qty), price: n(l.price) }, { reason: req.body.reason });
  res.json(lineOut(out));
}));
/** Anular una cuenta completa (p. ej. abierta por error). Sus pedidos quedan anulados. */
r.post('/orders/tabs/:id/void', perm('facturacion.emitir'), validate(z.object({ reason: z.string().trim().min(3, 'Escribe el motivo') })), asyncH(async (req, res) => {
  const t = await openTab(req.params.id);
  await prisma.$transaction([
    prisma.orderLine.updateMany({ where: { tabId: t.id, status: 'pedido' }, data: { status: 'anulado', voidReason: `Cuenta anulada: ${req.body.reason}`, voidedBy: req.user.name } }),
    prisma.orderTab.update({ where: { id: t.id }, data: { status: 'anulada', voidReason: req.body.reason, closedAt: new Date(), closedBy: req.user.name } }),
  ]);
  await audit(req, 'cuenta.anular', 'OrderTab', t.id, null, { number: t.number, reason: req.body.reason });
  res.json({ ok: true });
}));

/** Cerrar la cuenta: UNA factura con todos los pedidos vigentes, emitida en el acto (descuenta inventario).
 *  Queda lista para la revisión de Alegra. */
r.post('/orders/tabs/:id/close', perm('facturacion.emitir'), validate(z.object({ payMethod: z.string().trim().min(2, 'Elige la forma de pago'), customerDoc: z.string().trim().max(30).optional().nullable(), customerName: z.string().trim().min(2).optional() })), asyncH(async (req, res) => {
  // Bloqueo optimista: solo una persona puede cerrar la cuenta a la vez.
  const lock = await prisma.orderTab.updateMany({ where: { id: req.params.id, status: 'abierta' }, data: { status: 'cerrando' } });
  if (!lock.count) { const t = await prisma.orderTab.findUnique({ where: { id: req.params.id } }); throw new HttpError(t ? 409 : 404, t ? `La cuenta ${t.number} ya está ${t.status}` : 'La cuenta no existe'); }
  try {
    const t = await prisma.orderTab.findUniqueOrThrow({ where: { id: req.params.id }, include: { lines: { where: { status: 'pedido' }, orderBy: { ts: 'asc' } } } });
    if (!t.lines.length) throw new HttpError(400, `La cuenta ${t.number} no tiene pedidos para facturar`);
    const lines = t.lines.map((l, i) => ({ productId: l.productId, qty: n(l.qty), price: n(l.price), taxPct: l.taxPct, position: i }));
    const inv = await prisma.salesInvoice.create({ data: {
      number: await nextNumber(), date: new Date(todayCO()), customerName: req.body.customerName || t.customerName, customerDoc: req.body.customerDoc ?? t.customerDoc, room: t.room,
      payMethod: req.body.payMethod, notes: `Cuenta ${t.number}`, createdBy: req.user.name, ...totals(lines), lines: { create: lines },
    } });
    const out = await issueInvoice(inv.id, req.user);
    await prisma.$transaction([
      prisma.orderLine.updateMany({ where: { tabId: t.id, status: 'pedido' }, data: { status: 'facturado' } }),
      prisma.orderTab.update({ where: { id: t.id }, data: { status: 'cerrada', closedAt: new Date(), closedBy: req.user.name, payMethod: req.body.payMethod, invoiceId: inv.id, ...(req.body.customerDoc ? { customerDoc: req.body.customerDoc } : {}) } }),
    ]);
    await audit(req, 'cuenta.cerrar', 'OrderTab', t.id, null, { number: t.number, factura: inv.number, total: out.total, pedidos: lines.length });
    syncOrdersSheet('cierre', req.user.sub).catch(() => {}); // el registro en Drive no frena el cobro; la tarea cada 15 min lo repone
    res.json({ tab: t.number, invoice: { id: inv.id, number: inv.number, total: out.total }, warnings: out.warnings });
  } catch (e) {
    await prisma.orderTab.updateMany({ where: { id: req.params.id, status: 'cerrando' }, data: { status: 'abierta' } });
    throw e;
  }
}));

/* ---------- registro en Google Drive ---------- */
r.get('/orders/sheet', perm(['facturacion.crear', 'facturacion.emitir', 'sheets.sincronizar']), asyncH(async (_q, res) => res.json(await sheetStatus())));
r.post('/orders/sheet/sync', perm(['facturacion.emitir', 'sheets.sincronizar']), asyncH(async (req, res) => res.json(await syncOrdersSheet('manual', req.user.sub))));

export default r;
