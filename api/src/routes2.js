/* Rutas de Inteligencia, Alegra y Control de acceso — prefijo /api/v1 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, n, toCoreProduct, toCoreMovement } from './db.js';
import { auth, audit, validate, asyncH, HttpError } from './middleware.js';
import { PERMISSIONS, ROLES, DEFAULT_ROLE_PERMS, hasPerm, maskMoney } from './core/permissions.js';
import * as insights from './services/insights.js';
import * as alegra from './services/alegra.js';
import { sendText } from './services/whatsapp.js';

const r = Router();
r.use(auth);

/* ---------- permisos (matriz editable, con caché de 60 s) ---------- */
let cache = { at: 0, map: null };
export async function permMap() {
  if (Date.now() - cache.at < 60_000 && cache.map) return cache.map;
  const rows = await prisma.rolePermission.findMany();
  cache = { at: Date.now(), map: { ...DEFAULT_ROLE_PERMS, ...Object.fromEntries(rows.map((x) => [x.role, x.perms])) } };
  return cache.map;
}
/** perm('x') o perm(['x', 'y']): basta con tener uno de los permisos. */
export const perm = (p) => { const ps = [].concat(p); return asyncH(async (req, res, next) => { const m = await permMap(); return ps.some((x) => hasPerm(req.user.role, x, m)) ? next() : res.status(403).json({ error: `Tu rol no tiene permiso: ${PERMISSIONS[ps[0]] || ps[0]}` }); }); };
/** Quita costos y valores de la respuesta si el rol no tiene costos.ver */
export const moneyGuard = asyncH(async (req, res, next) => {
  if (hasPerm(req.user.role, 'costos.ver', await permMap())) return next();
  const json = res.json.bind(res);
  res.json = (body) => json(maskMoney(body));
  next();
});

r.get('/me/permissions', asyncH(async (req, res) => {
  const map = await permMap();
  res.json({ role: req.user.role, roleName: ROLES[req.user.role], perms: Object.keys(PERMISSIONS).filter((p) => hasPerm(req.user.role, p, map)) });
}));

/* ---------- módulo empleado: Mi turno ---------- */
r.get('/me/home', moneyGuard, asyncH(async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!me) throw new HttpError(404, 'Usuario no encontrado');
  const areas = [me.area, ...(me.areas || [])].filter(Boolean);
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const [mine, pending, low, requests] = await Promise.all([
    prisma.movement.findMany({ where: { userId: me.id }, orderBy: { ts: 'desc' }, take: 30, include: { product: { select: { name: true, unit: true } } } }),
    prisma.movement.count({ where: { userId: me.id, status: { in: ['pendiente', 'requiere_info'] } } }),
    prisma.product.findMany({ where: { status: 'activo', kind: 'consumible', ...(areas.length ? { OR: areas.map((a) => ({ location: { contains: a, mode: 'insensitive' } })) } : {}) } }),
    prisma.purchaseRequest.findMany({ where: { requestedBy: me.name }, orderBy: { ts: 'desc' }, take: 10 }),
  ]);
  res.json({
    user: { name: me.name, role: me.role, area: me.area, areas },
    hoy: mine.filter((m) => m.ts >= since).length, pendientes: pending,
    movimientos: mine.map(toCoreMovement),
    bajos: low.map(toCoreProduct).filter((p) => p.stockCurrent <= p.stockMin).map((p) => ({ id: p.id, name: p.name, stock: p.stockCurrent, min: p.stockMin, unit: p.unit, location: p.location })),
    solicitudes: requests,
  });
}));

/* ---------- solicitudes de compra (empleados) ---------- */
r.post('/purchase-requests', perm('solicitudes.crear'), validate(z.object({ productId: z.string(), qty: z.number().positive(), reason: z.string().optional() })), asyncH(async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.user.sub } });
  const pr = await prisma.purchaseRequest.create({ data: { ...req.body, requestedBy: me.name, area: me.area } });
  await audit(req, 'solicitud.crear', 'PurchaseRequest', pr.id, null, pr);
  res.status(201).json(pr);
}));
r.get('/purchase-requests', perm('inteligencia.ver'), asyncH(async (req, res) => res.json(await prisma.purchaseRequest.findMany({ where: { status: req.query.status }, orderBy: { ts: 'desc' }, take: 200 }))));
r.post('/purchase-requests/:id/status', perm('entradas.aprobar'), validate(z.object({ status: z.enum(['abierta', 'en_orden', 'atendida', 'rechazada']) })), asyncH(async (req, res) => res.json(await prisma.purchaseRequest.update({ where: { id: req.params.id }, data: { status: req.body.status } }))));

/* ---------- Inteligencia ---------- */
r.get('/insights/reorder', perm('inteligencia.ver'), moneyGuard, asyncH(async (_q, res) => res.json(await insights.getReorder())));
r.get('/insights/signals', perm('inteligencia.ver'), moneyGuard, asyncH(async (_q, res) => res.json(await insights.getSignals())));
r.post('/insights/summary', perm('inteligencia.ver'), validate(z.object({ period: z.enum(['day', 'week', 'month']).default('day'), question: z.string().max(500).optional() })), asyncH(async (req, res) => {
  const out = await insights.summarize(req.body.period, req.body.question);
  await audit(req, 'inteligencia.resumen', 'InsightReport', out.id, null, { period: req.body.period, by: out.generatedBy });
  res.json(out);
}));
r.get('/insights/reports', perm('inteligencia.ver'), asyncH(async (_q, res) => res.json(await prisma.insightReport.findMany({ orderBy: { ts: 'desc' }, take: 30, select: { id: true, ts: true, period: true, generatedBy: true, summary: true } }))));
/** Convierte una orden sugerida en una orden de compra (borrador, kind=orden); opcionalmente la crea en Alegra */
r.post('/insights/orders', perm('entradas.aprobar'), validate(z.object({ supplierId: z.string(), items: z.array(z.object({ productId: z.string(), qty: z.number().positive(), unit: z.string(), unitCost: z.number().min(0) })).min(1), toAlegra: z.boolean().default(false) })), asyncH(async (req, res) => {
  const subtotal = req.body.items.reduce((a, i) => a + i.qty * i.unitCost, 0);
  const po = await prisma.purchase.create({ data: { supplierId: req.body.supplierId, invoice: `OC-${Date.now().toString(36).toUpperCase()}`, purchasedAt: new Date(), receivedAt: new Date(), subtotal, total: subtotal, payMethod: 'Crédito proveedor', receivedBy: '—', status: 'borrador', kind: 'orden', source: 'sistema', notes: 'Orden sugerida por punto de reorden', items: { create: req.body.items.map((i) => ({ ...i, subtotal: i.qty * i.unitCost })) } } });
  let alegraPO = null;
  if (req.body.toAlegra) alegraPO = await alegra.createPurchaseOrder({ supplierId: req.body.supplierId, items: req.body.items, observations: `Capybara Control ${po.invoice}` });
  await audit(req, 'orden.crear', 'Purchase', po.id, null, { total: subtotal, alegra: alegraPO?.id });
  res.status(201).json({ order: po, alegra: alegraPO });
}));

/* ---------- Alegra ---------- */
r.get('/alegra/status', perm('alegra.gestionar'), asyncH(async (_q, res) => {
  const [log, pendingPush, linkedSup, linkedItems, imported] = await Promise.all([
    prisma.alegraSyncLog.findMany({ orderBy: { ts: 'desc' }, take: 30 }),
    prisma.purchase.count({ where: { status: 'aprobada', alegraBillId: null, source: { not: 'alegra' } } }),
    prisma.supplier.count({ where: { alegraId: { not: null } } }),
    prisma.product.count({ where: { alegraItemId: { not: null } } }),
    prisma.purchase.count({ where: { source: 'alegra' } }),
  ]);
  let company = null, error = null;
  if (alegra.isConfigured()) { try { company = await alegra.ping(); } catch (e) { error = e.message; } }
  res.json({ configured: alegra.isConfigured(), company: company ? { name: company.name, identification: company.identification } : null, error, pendingPush, linkedSuppliers: linkedSup, linkedItems, importedBills: imported, log });
}));
r.post('/alegra/sync', perm('alegra.gestionar'), asyncH(async (req, res) => {
  const providers = await alegra.syncProviders({ create: !!req.body?.createProviders });
  const bills = await alegra.importBills({ since: req.body?.since });
  const pushed = req.body?.push ? await alegra.pushPending() : [];
  await audit(req, 'alegra.sincronizar', 'Alegra', null, null, { providers, bills, pushed: pushed.length });
  res.json({ providers, bills, pushed });
}));
r.get('/alegra/bills', perm('alegra.gestionar'), asyncH(async (req, res) => res.json(await alegra.listBills({ date: req.query.date, status: req.query.status }))));
r.post('/alegra/bills/import', perm('alegra.gestionar'), asyncH(async (req, res) => res.json(await alegra.importBills({ since: req.body?.since }))));
r.post('/alegra/purchases/:id/push', perm(['alegra.gestionar', 'alegra.enviar']), asyncH(async (req, res) => { const out = await alegra.pushPurchase(req.params.id, { pay: req.body?.pay !== false }); await audit(req, 'alegra.exportar', 'Purchase', req.params.id, null, out); res.json(out); }));
r.post('/alegra/push-pending', perm(['alegra.gestionar', 'alegra.enviar']), asyncH(async (_q, res) => res.json(await alegra.pushPending())));
r.get('/alegra/items/links', perm('alegra.gestionar'), asyncH(async (_q, res) => res.json(await alegra.suggestItemLinks())));
r.post('/alegra/items/link', perm('alegra.gestionar'), validate(z.object({ productId: z.string(), alegraItemId: z.string().nullable() })), asyncH(async (req, res) => res.json(await alegra.linkItem(req.body.productId, req.body.alegraItemId))));
r.post('/alegra/providers/sync', perm('alegra.gestionar'), asyncH(async (req, res) => res.json(await alegra.syncProviders({ create: !!req.body?.create }))));
r.post('/alegra/webhooks/subscribe', perm('integraciones.configurar'), asyncH(async (_q, res) => res.json(await alegra.subscribeWebhooks())));

/* ---------- Usuarios y permisos (solo ADMIN) ---------- */
const userSchema = z.object({ name: z.string().min(2), email: z.string().email(), phone: z.string().regex(/^\d{10,15}$/).optional().nullable(), role: z.enum(Object.keys(ROLES)), area: z.string().optional().nullable(), areas: z.array(z.string()).default([]), active: z.boolean().default(true), password: z.string().min(8).optional() });
r.get('/users', perm('usuarios.gestionar'), asyncH(async (_q, res) => res.json(await prisma.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, phone: true, role: true, area: true, areas: true, active: true, createdAt: true } }))));
r.post('/users', perm('usuarios.gestionar'), validate(userSchema.required({ password: true })), asyncH(async (req, res) => {
  const { password, ...data } = req.body;
  const u = await prisma.user.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 10) } });
  await audit(req, 'usuario.crear', 'User', u.id, null, { ...data });
  res.status(201).json({ id: u.id });
}));
r.patch('/users/:id', perm('usuarios.gestionar'), validate(userSchema.partial()), asyncH(async (req, res) => {
  const { password, ...data } = req.body;
  if (req.params.id === req.user.sub && (data.role && data.role !== 'ADMIN' || data.active === false)) throw new HttpError(409, 'No puedes quitarte el rol de administrador ni desactivarte');
  const u = await prisma.user.update({ where: { id: req.params.id }, data: { ...data, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) } });
  await audit(req, 'usuario.editar', 'User', u.id, null, data);
  res.json({ id: u.id });
}));
r.get('/roles', perm('usuarios.gestionar'), asyncH(async (_q, res) => res.json({ roles: ROLES, permissions: PERMISSIONS, matrix: await permMap() })));
r.put('/roles/:role', perm('usuarios.gestionar'), validate(z.object({ perms: z.array(z.enum(Object.keys(PERMISSIONS))) })), asyncH(async (req, res) => {
  if (req.params.role === 'ADMIN') throw new HttpError(409, 'El administrador siempre tiene todos los permisos');
  const row = await prisma.rolePermission.upsert({ where: { role: req.params.role }, update: { perms: req.body.perms }, create: { role: req.params.role, perms: req.body.perms } });
  cache.at = 0;
  await audit(req, 'rol.permisos', 'Role', req.params.role, null, req.body);
  res.json(row);
}));
/** Actividad por empleado: movimientos, rechazos, diferencias en sus áreas */
r.get('/users/activity', perm('usuarios.gestionar'), asyncH(async (req, res) => {
  const since = new Date(Date.now() - Number(req.query.days || 30) * 864e5);
  const g = await prisma.movement.groupBy({ by: ['userId', 'status'], where: { ts: { gte: since }, userId: { not: null } }, _count: true });
  const users = await prisma.user.findMany({ select: { id: true, name: true, role: true, area: true } });
  res.json(users.map((u) => { const mine = g.filter((x) => x.userId === u.id); const c = (s) => mine.find((x) => x.status === s)?._count || 0; return { ...u, total: mine.reduce((a, x) => a + x._count, 0), aprobados: c('aprobado'), pendientes: c('pendiente'), rechazados: c('rechazado'), duplicados: c('duplicado') }; }));
}));

export default r;

/* ---------- tareas programadas ---------- */
export async function dailyInsightJob() {
  const out = await insights.summarize('day');
  for (const to of (await import('./config.js')).config.insights.sendToWhatsApp) await sendText(to, insights.toWhatsAppText(out.summary)).catch(() => null);
  return out;
}

/* ---------- Socios: ingresos, resultados y KPIs (solo lectura) ---------- */
const LINE_OF = (cat) => (cat === 'Hospedaje' ? 'Hospedaje' : ['Bebidas', 'Licores'].includes(cat) ? 'Bar' : ['Alimentos', 'Servicios'].includes(cat) ? 'Restaurante' : 'Otros');
async function partnerBook(from, to) {
  const beds = Number(process.env.HOSTEL_DORM_BEDS || 30) + Number(process.env.HOSTEL_PRIVATE_ROOMS || 6);
  const invs = await prisma.salesInvoice.findMany({ where: { status: 'emitida', date: { gte: from, lte: to } }, include: { lines: true } });
  const prods = Object.fromEntries((await prisma.product.findMany({ include: { category: true } })).map((p) => [p.id, p]));
  const exps = await prisma.expense.findMany({ where: { date: { gte: from, lte: to }, status: { not: 'anulado' } } });
  const t = { ing: { Hospedaje: 0, Bar: 0, Restaurante: 0, Otros: 0 }, imp: 0, nights: 0, facturas: invs.length, pagos: {}, costo: 0, gastos: {}, diario: {} };
  for (const i of invs) {
    const day = i.date.toISOString().slice(0, 10); t.diario[day] ||= 0;
    t.pagos[i.payMethod] = (t.pagos[i.payMethod] || 0) + n(i.total);
    for (const l of i.lines) {
      const p = prods[l.productId]; const sub = n(l.qty) * n(l.price); const line = LINE_OF(p?.category?.name);
      t.ing[line] += sub; t.imp += Math.round((sub * n(l.taxPct)) / 100); t.costo += n(l.qty) * n(p?.avgCost || 0); t.diario[day] += sub;
      if (line === 'Hospedaje') t.nights += n(l.qty);
    }
  }
  for (const e of exps) t.gastos[e.category] = (t.gastos[e.category] || 0) + n(e.amount);
  const days = Math.max(1, Math.round((to - from) / 864e5) + 1);
  t.ingresos = Object.values(t.ing).reduce((a, b) => a + b, 0);
  t.gastosTotal = Object.values(t.gastos).reduce((a, b) => a + b, 0);
  t.margenBruto = t.ingresos - t.costo; t.resultado = t.margenBruto - t.gastosTotal; t.margenPct = t.ingresos ? t.resultado / t.ingresos : 0;
  t.ocupacion = t.nights / (beds * days); t.adr = t.nights ? t.ing.Hospedaje / t.nights : 0; t.revpab = t.ing.Hospedaje / (beds * days);
  t.ticket = t.facturas ? (t.ingresos + t.imp) / t.facturas : 0;
  return t;
}
r.get('/partners/summary', perm('socios.ver'), asyncH(async (req, res) => {
  const to = req.query.to ? new Date(req.query.to + 'T23:59:59') : new Date();
  const from = req.query.from ? new Date(req.query.from + 'T00:00:00') : new Date(to.getFullYear(), to.getMonth(), 1);
  const len = to - from;
  const pTo = new Date(from - 1), pFrom = new Date(pTo - len);
  const [cur, prev] = await Promise.all([partnerBook(from, to), partnerBook(pFrom, pTo)]);
  res.json({ period: { from, to }, comparison: { from: pFrom, to: pTo }, current: cur, previous: prev });
}));

/* ---------- Caja del día (cajero ve solo la suya) ---------- */
r.get('/cash/today', perm('caja.ver'), asyncH(async (req, res) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const where = { status: 'emitida', issuedAt: { gte: start } };
  if (req.user.role === 'CAJERO') where.issuedBy = req.user.name;
  const invs = await prisma.salesInvoice.findMany({ where, select: { number: true, total: true, payMethod: true, issuedBy: true } });
  const byPay = {}, byCashier = {};
  for (const i of invs) { byPay[i.payMethod] = (byPay[i.payMethod] || 0) + n(i.total); byCashier[i.issuedBy] = (byCashier[i.issuedBy] || 0) + n(i.total); }
  res.json({ facturas: invs.length, total: invs.reduce((a, i) => a + n(i.total), 0), porFormaDePago: byPay, porCajero: req.user.role === 'CAJERO' ? undefined : byCashier });
}));
