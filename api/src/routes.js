/* Rutas REST de Capybara Control — prefijo /api/v1 */
import { Router } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma, n, toCoreProduct, toCoreMovement } from './db.js';
import { config } from './config.js';
import { auth, can, audit, validate, asyncH, HttpError } from './middleware.js';
import { parseInstruction, reconcile, MOVEMENT_TYPES } from './core/core.js';
import { proposeMovement, approveMovement, voidMovement, approvePurchase } from './services/inventory.js';
import { saveAttachment } from './services/storage.js';
import { extractDocument } from './services/ai.js';
import * as sheets from './services/sheets.js';
import * as alegraSvc from './services/alegra.js';
import { perm, moneyGuard } from './routes2.js';

const r = Router();
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } });
const TYPES = Object.keys(MOVEMENT_TYPES);

/* ============ Autenticación ============ */
r.post('/auth/login', validate(z.object({ email: z.string().email(), password: z.string().min(6) })), asyncH(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (!u || !u.active || !(await bcrypt.compare(req.body.password, u.passwordHash))) throw new HttpError(401, 'Correo o contraseña incorrectos');
  const token = jwt.sign({ sub: u.id, role: u.role, name: u.name }, config.jwtSecret, { expiresIn: '12h' });
  res.json({ token, user: { id: u.id, name: u.name, role: u.role, area: u.area } });
}));

r.use(auth);
r.get('/auth/me', (req, res) => res.json(req.user));

/* ============ Dashboard ============ */
r.get('/dashboard', perm('tablero.ver'), asyncH(async (req, res) => {
  const now = new Date();
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const week = new Date(day); week.setDate(day.getDate() - 6);
  const month = new Date(day.getFullYear(), day.getMonth(), 1);
  const products = (await prisma.product.findMany({ where: { status: 'activo' } })).map(toCoreProduct);
  const sumBy = async (model, field, gte) => n((await prisma[model].aggregate({ _sum: { [field]: true }, where: { [model === 'purchase' ? 'purchasedAt' : 'date']: { gte }, status: { not: 'anulada' } } }))._sum[field]) || 0;
  const movToday = await prisma.movement.groupBy({ by: ['type'], where: { ts: { gte: day }, status: 'aprobado' }, _sum: { qty: true } });
  const in30 = new Date(+now + 30 * 864e5);
  res.json({
    productosActivos: products.length,
    unidadesDisponibles: products.reduce((a, p) => a + p.stockCurrent, 0),
    valorInventario: Math.round(products.reduce((a, p) => a + p.stockCurrent * p.avgCost, 0)),
    movimientosHoy: Object.fromEntries(movToday.map((g) => [g.type, n(g._sum.qty)])),
    compras: { dia: await sumBy('purchase', 'total', day), semana: await sumBy('purchase', 'total', week), mes: await sumBy('purchase', 'total', month) },
    gastos: { dia: await sumBy('expense', 'amount', day), semana: await sumBy('expense', 'amount', week), mes: await sumBy('expense', 'amount', month) },
    inventarioBajo: products.filter((p) => p.stockCurrent > 0 && p.stockCurrent <= p.stockMin).map((p) => ({ id: p.id, name: p.name, stock: p.stockCurrent, min: p.stockMin })),
    agotados: products.filter((p) => p.stockCurrent <= 0).map((p) => ({ id: p.id, name: p.name })),
    porVencer: products.filter((p) => p.expiresAt && new Date(p.expiresAt) <= in30).map((p) => ({ id: p.id, name: p.name, expiresAt: p.expiresAt })),
    pendientes: {
      whatsapp: await prisma.inboxItem.count({ where: { status: { in: ['pendiente_analisis', 'pendiente_aprobacion', 'requiere_info'] } } }),
      sheets: await prisma.importRow.count({ where: { status: { in: ['nuevo', 'modificado', 'error'] } } }),
      facturas: await prisma.purchase.count({ where: { status: 'borrador' } }),
      movimientos: await prisma.movement.count({ where: { status: { in: ['pendiente', 'duplicado', 'requiere_info'] } } }),
    },
  });
}));

/* Series para gráficos: /dashboard/series?metric=consumo_producto&from=...&to=...&group=day */
r.get('/dashboard/series', perm('tablero.ver'), asyncH(async (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 864e5);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const where = { ts: { gte: from, lte: to }, status: 'aprobado' };
  if (req.query.productId) where.productId = req.query.productId;
  if (req.query.source) where.source = req.query.source;
  const ms = await prisma.movement.findMany({ where, include: { product: { include: { category: true } } } });
  const g = req.query.group || 'day';
  const key = (d) => (g === 'month' ? d.toISOString().slice(0, 7) : g === 'week' ? `${d.getFullYear()}-S${Math.ceil(((d - new Date(d.getFullYear(), 0, 1)) / 864e5 + 1) / 7)}` : d.toISOString().slice(0, 10));
  const out = {};
  for (const m of ms) {
    const k = key(m.ts), s = MOVEMENT_TYPES[m.type].sign;
    out[k] ??= { entradas: 0, salidas: 0, valorSalidas: 0 };
    if (s > 0) out[k].entradas += n(m.qty); else { out[k].salidas += n(m.qty); out[k].valorSalidas += n(m.qty) * n(m.product.avgCost); }
  }
  const byProduct = {}, byCategory = {}, bySource = {};
  for (const m of ms) {
    bySource[m.source] = (bySource[m.source] || 0) + 1;
    if (MOVEMENT_TYPES[m.type].sign < 0) {
      byProduct[m.product.name] = (byProduct[m.product.name] || 0) + n(m.qty);
      byCategory[m.product.category.name] = (byCategory[m.product.category.name] || 0) + n(m.qty) * n(m.product.avgCost);
    }
  }
  res.json({ timeline: out, consumoPorProducto: byProduct, consumoPorCategoria: byCategory, movimientosPorFuente: bySource });
}));

/* ============ Productos ============ */
const productSchema = z.object({
  code: z.string().min(1), barcode: z.string().optional().nullable(), name: z.string().min(2), aliases: z.array(z.string()).default([]),
  description: z.string().optional().nullable(), categoryId: z.string(), kind: z.enum(['consumible', 'menaje', 'activo']).default('consumible'),
  unit: z.string().default('unidad'), stockInit: z.number().default(0), stockMin: z.number().default(0), stockMax: z.number().optional().nullable(),
  avgCost: z.number().default(0), supplierId: z.string().optional().nullable(), location: z.string().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(), photoUrl: z.string().optional().nullable(), notes: z.string().optional().nullable(),
});

r.get('/categories', asyncH(async (_q, res) => res.json(await prisma.category.findMany({ orderBy: { name: 'asc' } }))));
r.get('/products', moneyGuard, asyncH(async (req, res) => {
  const { q, categoryId, status = 'activo', low } = req.query;
  const where = { status: status === 'todos' ? undefined : status, categoryId: categoryId || undefined };
  if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q } }, { barcode: q }];
  let list = (await prisma.product.findMany({ where, include: { category: true, supplier: true }, orderBy: { name: 'asc' } })).map(toCoreProduct);
  if (low === 'true') list = list.filter((p) => p.stockCurrent <= p.stockMin);
  res.json(list.map((p) => ({ ...p, valorDisponible: Math.round(p.stockCurrent * p.avgCost) })));
}));
r.get('/products/:id', moneyGuard, asyncH(async (req, res) => res.json(toCoreProduct(await prisma.product.findUniqueOrThrow({ where: { id: req.params.id }, include: { category: true, supplier: true, prices: { orderBy: { ts: 'desc' }, take: 20 } } })))));
r.get('/products/:id/history', moneyGuard, asyncH(async (req, res) => res.json((await prisma.movement.findMany({ where: { productId: req.params.id }, orderBy: { ts: 'desc' }, take: 500, include: { user: { select: { name: true } }, evidence: true } })).map(toCoreMovement))));
r.post('/products', can('SUPERVISOR'), validate(productSchema), asyncH(async (req, res) => {
  const p = await prisma.product.create({ data: { ...req.body, stockCurrent: req.body.stockInit } });
  await audit(req, 'product.create', 'Product', p.id, null, p);
  res.status(201).json(toCoreProduct(p));
}));
r.patch('/products/:id', can('SUPERVISOR'), validate(productSchema.partial().omit({ stockInit: true })), asyncH(async (req, res) => {
  const before = await prisma.product.findUniqueOrThrow({ where: { id: req.params.id } });
  const p = await prisma.product.update({ where: { id: req.params.id }, data: req.body });
  await audit(req, 'product.update', 'Product', p.id, before, p);
  res.json(toCoreProduct(p));
}));
r.post('/products/:id/deactivate', can('SUPERVISOR'), asyncH(async (req, res) => {
  const p = await prisma.product.update({ where: { id: req.params.id }, data: { status: 'inactivo' } });
  await audit(req, 'product.deactivate', 'Product', p.id);
  res.json(toCoreProduct(p));
}));

/* ============ Movimientos ============ */
const movementSchema = z.object({
  productId: z.string(), qty: z.number().positive(), unit: z.string().optional(), type: z.enum(TYPES),
  area: z.string().optional(), reason: z.string().optional(), source: z.enum(['manual', 'whatsapp', 'whatsapp_foto', 'whatsapp_audio', 'factura', 'sheets', 'conteo', 'sistema']).default('manual'),
  evidenceId: z.string().optional(), notes: z.string().optional(), ts: z.coerce.date().optional(), unitCost: z.number().optional(),
  approve: z.boolean().default(false),
});
r.get('/movements', moneyGuard, asyncH(async (req, res) => {
  const { from, to, productId, type, source, status, userId, take = 200 } = req.query;
  const where = { productId, type, source, status, userId };
  if (from || to) where.ts = { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined };
  res.json((await prisma.movement.findMany({ where, orderBy: { ts: 'desc' }, take: Number(take), include: { product: { select: { name: true, unit: true } }, user: { select: { name: true } } } })).map(toCoreMovement));
}));
r.post('/movements', perm('movimientos.crear'), validate(movementSchema), asyncH(async (req, res) => {
  const { approve, ...data } = req.body;
  const out = await proposeMovement({ ...data, userId: req.user.sub });
  let movement = out.movement;
  if (approve && ['ADMIN', 'SUPERVISOR'].includes(req.user.role) && movement.status === 'pendiente') movement = await approveMovement(movement.id, req.user.sub);
  await audit(req, 'movement.create', 'Movement', movement.id, null, movement);
  res.status(201).json({ movement: toCoreMovement(movement), duplicates: out.duplicates });
}));
r.post('/movements/:id/approve', can('SUPERVISOR'), asyncH(async (req, res) => {
  const m = await approveMovement(req.params.id, req.user.sub, req.body?.edits || {});
  await audit(req, 'movement.approve', 'Movement', m.id, null, m);
  res.json(toCoreMovement(m));
}));
r.post('/movements/:id/reject', can('SUPERVISOR'), asyncH(async (req, res) => {
  const m = await prisma.movement.update({ where: { id: req.params.id }, data: { status: 'rechazado', notes: req.body?.reason } });
  await audit(req, 'movement.reject', 'Movement', m.id, null, { reason: req.body?.reason });
  res.json(toCoreMovement(m));
}));
r.post('/movements/:id/duplicate', can('SUPERVISOR'), asyncH(async (req, res) => {
  const m = await prisma.movement.update({ where: { id: req.params.id }, data: { status: 'duplicado', notes: `Duplicado de ${req.body?.of || '—'}` } });
  await audit(req, 'movement.duplicate', 'Movement', m.id, null, req.body);
  res.json(toCoreMovement(m));
}));
r.post('/movements/:id/request-info', perm('movimientos.aprobar'), asyncH(async (req, res) => {
  const m = await prisma.movement.update({ where: { id: req.params.id }, data: { status: 'requiere_info', notes: req.body?.question } });
  await audit(req, 'movement.request_info', 'Movement', m.id, null, req.body);
  res.json(toCoreMovement(m));
}));
r.post('/movements/:id/void', can('SUPERVISOR'), validate(z.object({ reason: z.string().min(3) })), asyncH(async (req, res) => {
  const rev = await voidMovement(req.params.id, req.user.sub, req.body.reason);
  await audit(req, 'movement.void', 'Movement', req.params.id, null, rev);
  res.json(toCoreMovement(rev));
}));
// No existe DELETE /movements/:id a propósito.

/* ============ Marchados (intérprete) ============ */
r.post('/marchados/interpret', perm('movimientos.crear'), validate(z.object({ text: z.string().min(2) })), asyncH(async (req, res) => {
  const catalog = (await prisma.product.findMany({ where: { status: 'activo' }, include: { category: true } })).map(toCoreProduct);
  const result = parseInstruction(req.body.text, catalog);
  res.json({ ...result, autoApplicable: result.confidence >= config.rules.autoApplyConfidence });
}));
r.post('/marchados', perm('movimientos.crear'), validate(z.object({ text: z.string(), items: z.array(z.object({ productId: z.string(), qty: z.number().positive(), unit: z.string().optional() })), type: z.enum(TYPES).default('marchado'), area: z.string().optional(), reason: z.string().optional() })), asyncH(async (req, res) => {
  const created = [];
  for (const it of req.body.items) created.push(await proposeMovement({ ...it, type: req.body.type, area: req.body.area, reason: req.body.reason, source: 'manual', userId: req.user.sub, notes: `Mensaje: "${req.body.text}"` }));
  res.status(201).json(created);
}));

/* ============ Conteos físicos ============ */
r.post('/counts', perm('conteos.crear'), validate(z.object({ items: z.array(z.object({ productId: z.string(), qty: z.number().min(0) })), notes: z.string().optional() })), asyncH(async (req, res) => {
  const sessionId = `CF-${Date.now()}`;
  const rows = await prisma.$transaction(req.body.items.map((i) => prisma.physicalCount.create({ data: { ...i, countedBy: req.user.name, sessionId, notes: req.body.notes } })));
  await audit(req, 'count.create', 'PhysicalCount', sessionId, null, { n: rows.length });
  res.status(201).json({ sessionId, rows });
}));

/* ============ Proveedores ============ */
const supplierSchema = z.object({ name: z.string().min(2), taxId: z.string().optional().nullable(), phone: z.string().optional().nullable(), email: z.string().email().optional().nullable(), contact: z.string().optional().nullable(), notes: z.string().optional().nullable(), alegraId: z.string().max(40).optional().nullable() });
r.get('/suppliers', asyncH(async (_q, res) => res.json(await prisma.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } }))));
r.post('/suppliers', perm('proveedores.gestionar'), validate(supplierSchema), asyncH(async (req, res) => res.status(201).json(await prisma.supplier.create({ data: req.body }))));
r.patch('/suppliers/:id', perm(['proveedores.gestionar', 'alegra.gestionar']), validate(supplierSchema.partial()), asyncH(async (req, res) => res.json(await prisma.supplier.update({ where: { id: req.params.id }, data: req.body }))));

/* ============ Compras / entradas ============ */
const purchaseSchema = z.object({
  supplierId: z.string(), invoice: z.string().optional(), purchasedAt: z.coerce.date(), receivedAt: z.coerce.date(),
  items: z.array(z.object({ productId: z.string(), qty: z.number().positive(), unit: z.string(), unitCost: z.number().min(0) })).min(1),
  tax: z.number().default(0), discount: z.number().default(0), payMethod: z.string(), receivedBy: z.string(),
  attachmentId: z.string().optional(), notes: z.string().optional(), approve: z.boolean().default(false),
});
r.get('/purchases', moneyGuard, asyncH(async (req, res) => res.json(await prisma.purchase.findMany({ where: { status: req.query.status }, orderBy: { purchasedAt: 'desc' }, include: { supplier: true, items: true }, take: 200 }))));
r.post('/purchases', perm('entradas.crear'), validate(purchaseSchema), asyncH(async (req, res) => {
  const { items, approve, ...h } = req.body;
  const subtotal = items.reduce((a, i) => a + i.qty * i.unitCost, 0);
  const pu = await prisma.purchase.create({ data: { ...h, subtotal, total: subtotal + h.tax - h.discount, items: { create: items.map((i) => ({ ...i, subtotal: i.qty * i.unitCost })) } }, include: { items: true } });
  await audit(req, 'purchase.create', 'Purchase', pu.id, null, pu);
  if (approve && ['ADMIN', 'SUPERVISOR'].includes(req.user.role)) {
    await approvePurchase(pu.id, req.user.sub);
    if (config.alegra.autoPush) alegraSvc.pushPurchase(pu.id).catch((e) => console.warn('[alegra]', e.message));
  }
  res.status(201).json(pu);
}));
r.post('/purchases/:id/approve', can('SUPERVISOR'), asyncH(async (req, res) => {
  const ms = await approvePurchase(req.params.id, req.user.sub);
  await audit(req, 'purchase.approve', 'Purchase', req.params.id, null, { movements: ms.map((m) => m.id) });
  if (config.alegra.autoPush) alegraSvc.pushPurchase(req.params.id).catch((e) => console.warn('[alegra]', e.message));
  res.json({ movements: ms.map(toCoreMovement) });
}));

/* ============ Gastos ============ */
const expenseSchema = z.object({ date: z.coerce.date(), category: z.string(), description: z.string(), amount: z.number().positive(), supplierId: z.string().optional(), payMethod: z.string(), attachmentId: z.string().optional() });
r.get('/expenses', perm('gastos.gestionar'), asyncH(async (req, res) => res.json(await prisma.expense.findMany({ orderBy: { date: 'desc' }, take: 300, include: { supplier: true } }))));
r.post('/expenses', perm('gastos.gestionar'), validate(expenseSchema), asyncH(async (req, res) => {
  const e = await prisma.expense.create({ data: req.body });
  await audit(req, 'expense.create', 'Expense', e.id, null, e);
  res.status(201).json(e);
}));

/* ============ Archivos y lectura de facturas ============ */
r.post('/attachments', perm(['entradas.crear', 'movimientos.crear', 'gastos.gestionar', 'whatsapp.revisar']), upload.single('file'), asyncH(async (req, res) => {
  if (!req.file) throw new HttpError(422, 'Adjunta un archivo en el campo "file"');
  const { attachment, reused } = await saveAttachment(req.file.buffer, req.file.mimetype, req.body.kind || 'factura');
  let extracted = null;
  if (req.query.extract === 'true' && !reused && /image|pdf/.test(req.file.mimetype)) {
    extracted = await extractDocument(req.file.buffer, req.file.mimetype);
    await prisma.attachment.update({ where: { id: attachment.id }, data: { extracted } });
  }
  res.status(201).json({ attachment, reused, extracted });
}));

/* ============ Bandeja WhatsApp ============ */
r.get('/whatsapp/inbox', perm('whatsapp.revisar'), asyncH(async (req, res) => res.json(await prisma.inboxItem.findMany({ where: { status: req.query.status }, orderBy: { ts: 'desc' }, take: 200, include: { movements: { include: { product: { select: { name: true } } } }, attachment: true } }))));
r.post('/whatsapp/inbox/:id/status', can('SUPERVISOR'), validate(z.object({ status: z.enum(['pendiente_analisis', 'pendiente_aprobacion', 'aprobado', 'rechazado', 'duplicado', 'procesado', 'requiere_info']), note: z.string().optional() })), asyncH(async (req, res) => {
  const it = await prisma.inboxItem.update({ where: { id: req.params.id }, data: { status: req.body.status, reviewNote: req.body.note } });
  if (req.body.status === 'aprobado') {
    const ms = await prisma.movement.findMany({ where: { inboxItemId: it.id, status: 'pendiente' } });
    for (const m of ms) await approveMovement(m.id, req.user.sub);
    await prisma.inboxItem.update({ where: { id: it.id }, data: { status: 'procesado' } });
  }
  if (req.body.status === 'rechazado' || req.body.status === 'duplicado') {
    await prisma.movement.updateMany({ where: { inboxItemId: it.id, status: 'pendiente' }, data: { status: req.body.status === 'rechazado' ? 'rechazado' : 'duplicado' } });
  }
  await audit(req, 'whatsapp.status', 'InboxItem', it.id, null, req.body);
  res.json(it);
}));
r.get('/whatsapp/chats', perm('whatsapp.revisar'), asyncH(async (_q, res) => res.json(await prisma.whatsAppChat.findMany())));
r.post('/whatsapp/chats/:id/authorize', can('ADMIN'), validate(z.object({ authorized: z.boolean(), name: z.string().optional() })), asyncH(async (req, res) => {
  res.json(await prisma.whatsAppChat.upsert({ where: { id: req.params.id }, update: req.body, create: { id: req.params.id, name: req.body.name || req.params.id, authorized: req.body.authorized } }));
}));

/* ============ Google Drive / Sheets ============ */
r.get('/sheets/files', perm('sheets.sincronizar'), asyncH(async (req, res) => res.json(await sheets.listFiles(req.query.q))));
r.get('/sheets/files/:id/tabs', perm('sheets.sincronizar'), asyncH(async (req, res) => res.json(await sheets.listSheets(req.params.id))));
r.get('/sheets/files/:id/sample', perm('sheets.sincronizar'), asyncH(async (req, res) => res.json(await sheets.sampleSheet(req.params.id, req.query.sheet, Number(req.query.headerRow || 1)))));
r.get('/sheets/sources', perm('sheets.sincronizar'), asyncH(async (_q, res) => res.json(await prisma.sheetSource.findMany({ include: { runs: { orderBy: { startedAt: 'desc' }, take: 5 } } }))));
r.post('/sheets/sources', can('ADMIN'), validate(z.object({ name: z.string(), spreadsheetId: z.string(), sheetName: z.string(), kind: z.enum(['productos', 'entradas', 'salidas', 'compras', 'gastos', 'conteos']), headerRow: z.number().default(1), mapping: z.record(z.string().nullable()), keyColumns: z.array(z.string()).default([]), cron: z.string().optional() })), asyncH(async (req, res) => res.status(201).json(await prisma.sheetSource.create({ data: req.body }))));
r.post('/sheets/sources/:id/preview', perm('sheets.sincronizar'), asyncH(async (req, res) => res.json(await sheets.previewSync(req.params.id, 'manual'))));
r.post('/sheets/apply', can('SUPERVISOR'), validate(z.object({ decisions: z.array(z.object({ importRowId: z.string(), action: z.enum(['crear', 'vincular_existente', 'ignorar']), movementId: z.string().optional(), productId: z.string().optional(), approve: z.boolean().default(false) })) })), asyncH(async (req, res) => {
  const out = await sheets.applySync(req.body.decisions, req.user.sub);
  await audit(req, 'sheets.apply', 'ImportRow', null, null, { n: out.length });
  res.json(out);
}));
r.get('/sheets/rows', perm('sheets.sincronizar'), asyncH(async (req, res) => res.json(await prisma.importRow.findMany({ where: { sourceId: req.query.sourceId, status: req.query.status }, orderBy: { importedAt: 'desc' }, take: 300 }))));

/* ============ Conciliación ============ */
async function runReconciliation(userId) {
  const products = (await prisma.product.findMany({ include: { category: true } })).map(toCoreProduct);
  const movements = (await prisma.movement.findMany({ where: { status: 'aprobado' } })).map(toCoreMovement);
  const counts = (await prisma.physicalCount.findMany()).map((c) => ({ ...c, qty: n(c.qty) }));
  const unmatchedInbox = await prisma.inboxItem.findMany({ where: { status: 'requiere_info' }, take: 50 });
  const unmatched = unmatchedInbox.flatMap((i) => (i.analysis?.items || []).filter((x) => !x.productId).map((x) => ({ rawText: x.rawText, source: 'whatsapp' })));
  const result = reconcile({ products, movements, counts, unmatched, minorPct: config.rules.minorPct, minorAbs: config.rules.minorAbs });
  const run = await prisma.reconciliationRun.create({ data: { byUserId: userId, totals: result.totals, rows: result.rows } });
  return { runId: run.id, ...result };
}
r.post('/reconciliation/run', perm('conciliacion.ver'), asyncH(async (req, res) => {
  const out = await runReconciliation(req.user.sub);
  await audit(req, 'reconciliation.run', 'ReconciliationRun', out.runId, null, out.totals);
  res.json(out);
}));
r.get('/reconciliation/runs', perm('conciliacion.ver'), asyncH(async (_q, res) => res.json(await prisma.reconciliationRun.findMany({ orderBy: { ts: 'desc' }, take: 30, select: { id: true, ts: true, totals: true } }))));
r.get('/reconciliation/runs/:id', perm('conciliacion.ver'), asyncH(async (req, res) => res.json(await prisma.reconciliationRun.findUniqueOrThrow({ where: { id: req.params.id } }))));

/* Botón "ACTUALIZAR Y CONCILIAR INFORMACIÓN": sincroniza todas las fuentes y concilia */
r.post('/sync-and-reconcile', perm('conciliacion.ver'), asyncH(async (req, res) => {
  const sources = await prisma.sheetSource.findMany({ where: { active: true } });
  const sheetsResult = [];
  for (const s of sources) {
    try { const p = await sheets.previewSync(s.id, 'conciliar'); sheetsResult.push({ sourceId: s.id, name: s.name, stats: p.stats, pendientes: p.preview.length }); }
    catch (e) { sheetsResult.push({ sourceId: s.id, name: s.name, error: e.message }); }
  }
  const whatsappPending = await prisma.inboxItem.count({ where: { status: { in: ['pendiente_aprobacion', 'requiere_info'] } } });
  const recon = await runReconciliation(req.user.sub);
  await audit(req, 'sync_and_reconcile', 'System', recon.runId, null, { sheets: sheetsResult.length, whatsappPending, totals: recon.totals });
  res.json({ sheets: sheetsResult, whatsappPending, reconciliation: recon });
}));

/* ============ Reportes ============ */
r.post('/reports/export', can('SUPERVISOR'), validate(z.object({ report: z.enum(['inventario', 'conciliacion', 'movimientos']) })), asyncH(async (req, res) => {
  let headers, rows;
  if (req.body.report === 'inventario') {
    const ps = (await prisma.product.findMany({ include: { category: true } })).map(toCoreProduct);
    headers = ['Código', 'Producto', 'Categoría', 'Unidad', 'Stock', 'Mínimo', 'Costo promedio', 'Valor'];
    rows = ps.map((p) => [p.code, p.name, p.category, p.unit, p.stockCurrent, p.stockMin, p.avgCost, p.stockCurrent * p.avgCost]);
  } else if (req.body.report === 'conciliacion') {
    const last = await prisma.reconciliationRun.findFirst({ orderBy: { ts: 'desc' } });
    headers = ['Producto', 'Teórico', 'Físico', 'Diferencia', 'Valor', 'Estado'];
    rows = (last?.rows || []).map((x) => [x.name, x.teorico, x.fisico, x.diferencia, x.valor, x.status]);
  } else {
    const ms = await prisma.movement.findMany({ take: 5000, orderBy: { ts: 'desc' }, include: { product: true } });
    headers = ['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Fuente', 'Estado', 'Área'];
    rows = ms.map((m) => [m.ts.toISOString(), m.product.name, m.type, n(m.qty), m.source, m.status, m.area || '']);
  }
  res.json(await sheets.exportReport(`Capybara Control — ${req.body.report} ${new Date().toISOString().slice(0, 10)}`, headers, rows));
}));

/* ============ Bitácora ============ */
r.get('/audit', can('AUDITOR', 'SUPERVISOR'), asyncH(async (req, res) => res.json(await prisma.auditLog.findMany({ where: { entity: req.query.entity, entityId: req.query.entityId }, orderBy: { ts: 'desc' }, take: 500, include: { user: { select: { name: true } } } }))));

export default r;
