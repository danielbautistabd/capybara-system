/* Registro de pedidos en Google Drive: la pestaña "Pedidos" de una hoja de Google es un espejo de los pedidos
 * (abiertos y de los últimos 60 días) con su estado, factura y número de Alegra. Se reescribe completa en cada
 * sincronización, así nunca queda desalineada. Los valores van RAW: un nombre que empiece por "=" no se vuelve fórmula.
 * Driver: google (cuenta de servicio con permiso de edición en la hoja) | file (desarrollo: uploads/pedidos-drive.json) | none. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import { config } from '../config.js';
import { prisma, n } from '../db.js';

export const HEADER = ['Fecha', 'Hora', 'Cuenta', 'Huésped / cliente', 'Habitación / cama', 'Producto', 'Cantidad', 'Precio', 'Impuesto %', 'Total', 'Mesero', 'Estado', 'Forma de pago', 'N.º factura', 'N.º Alegra'];
const ESTADO = { pedido: 'Pedido', anulado: 'Anulado', facturado: 'Facturado' };
const tz = { timeZone: 'America/Bogota' };

export function driver() {
  const d = config.orders.driver;
  if (d === 'file') return 'file';
  if (d === 'none') return 'none';
  return config.orders.sheetId && config.google.email && config.google.key ? 'google' : 'none';
}

/** Filas de la hoja (sin encabezado), en orden de llegada. */
export async function buildRows({ days = 60 } = {}) {
  const since = new Date(Date.now() - days * 864e5);
  const tabs = await prisma.orderTab.findMany({
    where: { OR: [{ status: 'abierta' }, { openedAt: { gte: since } }, { closedAt: { gte: since } }] },
    include: { lines: { orderBy: { ts: 'asc' }, include: { product: { select: { name: true } } } } },
  });
  const invIds = tabs.map((t) => t.invoiceId).filter(Boolean);
  const invs = Object.fromEntries((await prisma.salesInvoice.findMany({ where: { id: { in: invIds } }, select: { id: true, number: true, alegraInvoiceId: true } })).map((i) => [i.id, i]));
  const rows = [];
  for (const t of tabs) for (const l of t.lines) {
    const sub = n(l.qty) * n(l.price); const total = sub + Math.round((sub * l.taxPct) / 100);
    const inv = invs[t.invoiceId];
    const estado = l.status === 'anulado' ? `Anulado: ${l.voidReason || ''}`.trim() : t.status === 'anulada' ? 'Cuenta anulada' : ESTADO[l.status] || l.status;
    rows.push({ ts: l.ts, cells: [
      l.ts.toLocaleDateString('es-CO', { ...tz, day: '2-digit', month: '2-digit', year: 'numeric' }), l.ts.toLocaleTimeString('es-CO', { ...tz, hour: '2-digit', minute: '2-digit' }),
      t.number, t.customerName, t.room || '', l.product?.name || '', n(l.qty), n(l.price), l.taxPct, total, l.waiter, estado,
      ...(l.status === 'anulado' ? ['', '', ''] : [t.payMethod || '', inv?.number || '', inv?.alegraInvoiceId || '']),
    ] });
  }
  return rows.sort((a, b) => a.ts - b.ts).map((r) => r.cells);
}

function sheetsClient() {
  const auth = new google.auth.JWT({ email: config.google.email, key: config.google.key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  return google.sheets({ version: 'v4', auth });
}
async function writeGoogle(values) {
  const sheets = sheetsClient(); const id = config.orders.sheetId, tab = config.orders.sheetTab;
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets(properties(sheetId,title))' });
  let sheet = meta.data.sheets.find((s) => s.properties.title === tab);
  if (!sheet) {
    const r = await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }] } });
    sheet = { properties: r.data.replies[0].addSheet.properties };
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [{ repeatCell: { range: { sheetId: sheet.properties.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } }] } });
  }
  await sheets.spreadsheets.values.clear({ spreadsheetId: id, range: `'${tab}'!A:Z` });
  await sheets.spreadsheets.values.update({ spreadsheetId: id, range: `'${tab}'!A1`, valueInputOption: 'RAW', requestBody: { values } });
}
async function writeFile(values) {
  const file = path.resolve(config.storage.dir, 'pedidos-drive.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ updatedAt: new Date().toISOString(), tab: config.orders.sheetTab, values }, null, 1));
}

/** Reescribe la pestaña de pedidos. trigger: manual | cierre | cron. Deja constancia en la bitácora. */
export async function syncOrdersSheet(trigger = 'manual', userId = null) {
  const d = driver();
  if (d === 'none') return { skipped: 'Falta configurar la hoja de Google (ORDERS_SHEET_ID y la cuenta de servicio)' };
  const rows = await buildRows();
  const values = [HEADER, ...rows];
  let error = null;
  try { await (d === 'google' ? writeGoogle(values) : writeFile(values)); } catch (e) { error = e.message; }
  await prisma.auditLog.create({ data: { action: 'drive.pedidos', entity: 'OrderTab', entityId: null, after: { trigger, driver: d, rows: rows.length, error }, userId } });
  if (error) throw Object.assign(new Error(`No se pudo escribir en Drive: ${error}`), { status: 502 });
  return { rows: rows.length, driver: d };
}

export async function sheetStatus() {
  const d = driver();
  const last = await prisma.auditLog.findFirst({ where: { action: 'drive.pedidos' }, orderBy: { ts: 'desc' } });
  return {
    driver: d, configured: d !== 'none', tab: config.orders.sheetTab,
    url: d === 'google' ? `https://docs.google.com/spreadsheets/d/${config.orders.sheetId}` : null,
    serviceAccount: config.google.email || null,
    last: last ? { at: last.ts, ...(last.after || {}) } : null,
  };
}
