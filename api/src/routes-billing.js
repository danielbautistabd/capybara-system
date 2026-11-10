/* Facturación de ventas — prefijo /api/v1/invoices
 * La hoja del frontend envía filas; aquí se agrupan en facturas con líneas.
 * Emitir = validar, descontar inventario (salida por venta) y bloquear. */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, n } from './db.js';
import { auth, audit, validate, asyncH, HttpError } from './middleware.js';
import { perm } from './routes2.js';
import { proposeMovement, approveMovement } from './services/inventory.js';
import * as alegra from './services/alegra.js';

const r = Router();
r.use(auth);

const lineSchema = z.object({ productId: z.string(), qty: z.number().positive(), price: z.number().min(0), taxPct: z.union([z.literal(0), z.literal(5), z.literal(8), z.literal(19)]) });
const invSchema = z.object({ date: z.coerce.date(), customerName: z.string().min(2), customerDoc: z.string().optional(), room: z.string().optional(), payMethod: z.string(), notes: z.string().optional(), lines: z.array(lineSchema).min(1) });
const totals = (lines) => { let sub = 0, tax = 0; for (const l of lines) { const s = l.qty * l.price; sub += s; tax += Math.round((s * l.taxPct) / 100); } return { subtotal: sub, tax, total: sub + tax }; };

async function nextNumber() {
  const s = await prisma.sequence.upsert({ where: { key: 'FV' }, update: { value: { increment: 1 } }, create: { key: 'FV', value: 1 } });
  return 'FV-' + String(s.value).padStart(4, '0');
}

/** Filas planas para la hoja (una por línea), como las muestra el frontend */
r.get('/invoices', perm('facturacion.crear'), asyncH(async (req, res) => {
  const where = {};
  if (req.query.from || req.query.to) where.date = { gte: req.query.from ? new Date(req.query.from) : undefined, lte: req.query.to ? new Date(req.query.to) : undefined };
  if (req.query.status) where.status = req.query.status;
  const list = await prisma.salesInvoice.findMany({ where, orderBy: { number: 'asc' }, take: 500, include: { lines: { orderBy: { position: 'asc' } } } });
  if (req.query.format === 'rows') return res.json(list.flatMap((i) => i.lines.map((l) => ({ id: l.id, inv: i.number, invoiceId: i.id, date: i.date.toISOString().slice(0, 10), customer: i.customerName, room: i.room, productId: l.productId, qty: n(l.qty), price: n(l.price), taxPct: n(l.taxPct), pay: i.payMethod, status: i.status, issuedBy: i.issuedBy, alegra: i.alegraInvoiceId }))));
  res.json(list);
}));
r.post('/invoices', perm('facturacion.crear'), validate(invSchema), asyncH(async (req, res) => {
  const { lines, ...h } = req.body;
  const inv = await prisma.salesInvoice.create({ data: { ...h, number: await nextNumber(), createdBy: req.user.name, ...totals(lines), lines: { create: lines.map((l, i) => ({ ...l, position: i })) } }, include: { lines: true } });
  await audit(req, 'factura.crear', 'SalesInvoice', inv.id, null, { number: inv.number });
  res.status(201).json(inv);
}));
/** Reemplaza encabezado y líneas de un borrador (lo que la hoja tenga en ese momento) */
r.put('/invoices/:id', perm('facturacion.crear'), validate(invSchema), asyncH(async (req, res) => {
  const cur = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
  if (cur.status !== 'borrador') throw new HttpError(409, `La factura ${cur.number} ya fue emitida`);
  const { lines, ...h } = req.body;
  const inv = await prisma.$transaction(async (tx) => {
    await tx.salesInvoiceLine.deleteMany({ where: { invoiceId: cur.id } });
    return tx.salesInvoice.update({ where: { id: cur.id }, data: { ...h, ...totals(lines), lines: { create: lines.map((l, i) => ({ ...l, position: i })) } }, include: { lines: true } });
  });
  res.json(inv);
}));
r.post('/invoices/:id/issue', perm('facturacion.emitir'), asyncH(async (req, res) => {
  const inv = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: req.params.id }, include: { lines: true } });
  if (inv.status !== 'borrador') throw new HttpError(409, `La factura ${inv.number} ya está ${inv.status}`);
  const prods = await prisma.product.findMany({ where: { id: { in: inv.lines.map((l) => l.productId) } } });
  const warnings = [];
  for (const l of inv.lines) {
    const p = prods.find((x) => x.id === l.productId);
    if (!p || p.kind === 'servicio') continue;
    if (n(p.stockCurrent) < n(l.qty)) warnings.push(`${p.name}: stock ${n(p.stockCurrent)}, se venden ${n(l.qty)}`);
    const { movement } = await proposeMovement({ productId: p.id, qty: n(l.qty), unit: p.unit, type: 'salida', source: 'manual', area: inv.room || 'Recepción', reason: `Venta ${inv.number} · ${inv.customerName}`, userId: req.user.sub, notes: `Factura ${inv.number}` });
    const m = ['ADMIN', 'SUPERVISOR'].includes(req.user.role) ? await approveMovement(movement.id, req.user.sub) : movement;
    await prisma.salesInvoiceLine.update({ where: { id: l.id }, data: { movementId: m.id } });
  }
  const out = await prisma.salesInvoice.update({ where: { id: inv.id }, data: { status: 'emitida', issuedBy: req.user.name, issuedAt: new Date() } });
  await audit(req, 'factura.emitir', 'SalesInvoice', inv.id, null, { number: inv.number, total: n(inv.total), warnings });
  res.json({ invoice: out, warnings });
}));
r.post('/invoices/:id/void', perm('facturacion.emitir'), validate(z.object({ reason: z.string().min(3) })), asyncH(async (req, res) => {
  const inv = await prisma.salesInvoice.update({ where: { id: req.params.id }, data: { status: 'anulada', notes: `Anulada: ${req.body.reason}` } });
  await audit(req, 'factura.anular', 'SalesInvoice', inv.id, null, req.body);
  res.json({ invoice: inv, note: 'Para devolver los productos al inventario, anula las salidas desde el historial del producto.' });
}));
r.post('/invoices/:id/alegra', perm('alegra.gestionar'), asyncH(async (req, res) => {
  const out = await alegra.pushSalesInvoice(req.params.id);
  await audit(req, 'alegra.venta', 'SalesInvoice', req.params.id, null, out);
  res.json(out);
}));
export default r;
