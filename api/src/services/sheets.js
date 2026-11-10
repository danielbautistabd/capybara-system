/* Google Drive / Sheets: lectura con cuenta de servicio, mapeo de columnas,
 * detección de filas nuevas y modificadas, vista previa y aplicación. */
import crypto from 'node:crypto';
import { google } from 'googleapis';
import { config } from '../config.js';
import { prisma, toCoreProduct, toCoreMovement } from '../db.js';
import { matchProduct, findDuplicates, fingerprint } from '../core/core.js';
import { proposeMovement, approveMovement } from './inventory.js';

function clients() {
  const auth = new google.auth.JWT({
    email: config.google.email, key: config.google.key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'],
  });
  return { sheets: google.sheets({ version: 'v4', auth }), drive: google.drive({ version: 'v3', auth }) };
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24);

/** Lista hojas de cálculo compartidas con la cuenta de servicio (incluye .xlsx en Drive) */
export async function listFiles(q = '') {
  const { drive } = clients();
  const { data } = await drive.files.list({
    q: `(mimeType='application/vnd.google-apps.spreadsheet' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') and trashed=false${q ? ` and name contains '${q.replace(/'/g, "\\'")}'` : ''}`,
    fields: 'files(id,name,mimeType,modifiedTime,owners(displayName))', pageSize: 50, orderBy: 'modifiedTime desc',
  });
  return data.files;
}

export async function listSheets(spreadsheetId) {
  const { sheets } = clients();
  const { data } = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(title,gridProperties))' });
  return data.sheets.map((s) => ({ title: s.properties.title, rows: s.properties.gridProperties.rowCount }));
}

/** Encabezados + primeras filas para que el usuario mapee columnas */
export async function sampleSheet(spreadsheetId, sheetName, headerRow = 1) {
  const { sheets } = clients();
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetName}'!A${headerRow}:Z${headerRow + 10}` });
  const [headers = [], ...rows] = data.values || [];
  return { headers, rows };
}

async function readAll(src) {
  const { sheets } = clients();
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: src.spreadsheetId, range: `'${src.sheetName}'!A${src.headerRow}:Z`, valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' });
  const [headers = [], ...rows] = data.values || [];
  return rows.map((r, i) => ({ rowNumber: src.headerRow + 1 + i, raw: Object.fromEntries(headers.map((h, j) => [h, r[j] ?? null])) }));
}

function mapRow(raw, mapping) {
  const o = {};
  for (const [col, field] of Object.entries(mapping)) if (field) o[field] = raw[col];
  if (o.qty !== undefined) o.qty = Number(String(o.qty).replace(',', '.'));
  if (o.unitCost !== undefined) o.unitCost = Number(String(o.unitCost).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  return o;
}

/**
 * Paso 1–6 del botón "ACTUALIZAR DATOS DESDE DRIVE": lee, detecta nuevas/modificadas,
 * compara con BD y WhatsApp, y devuelve VISTA PREVIA (no aplica nada).
 */
export async function previewSync(sourceId, trigger = 'manual') {
  const src = await prisma.sheetSource.findUniqueOrThrow({ where: { id: sourceId } });
  const run = await prisma.syncRun.create({ data: { sourceId, trigger } });
  const rows = await readAll(src);
  const catalog = (await prisma.product.findMany({ include: { category: true } })).map(toCoreProduct);
  const preview = [];
  const stats = { leidas: rows.length, nuevas: 0, modificadas: 0, sinCambios: 0, errores: 0, coincidenWhatsApp: 0, duplicadas: 0 };

  for (const r of rows) {
    if (Object.values(r.raw).every((v) => v === null || v === '')) continue;
    const keySrc = (src.keyColumns.length ? src.keyColumns : Object.keys(r.raw)).map((k) => r.raw[k]).join('|');
    const rowKey = sha(keySrc);
    const contentHash = sha(JSON.stringify(r.raw));
    const prev = await prisma.importRow.findUnique({ where: { sourceId_rowKey: { sourceId, rowKey } } });
    if (prev && prev.contentHash === contentHash) { stats.sinCambios++; continue; }
    const state = prev ? 'modificado' : 'nuevo';
    stats[prev ? 'modificadas' : 'nuevas']++;

    const mapped = mapRow(r.raw, src.mapping);
    const issues = [];
    const match = mapped.product ? matchProduct(String(mapped.product), catalog) : null;
    if (!match) issues.push(`Producto no reconocido: "${mapped.product ?? ''}"`);
    if (!Number.isFinite(mapped.qty)) issues.push('Cantidad inválida');
    const ts = mapped.ts ? new Date(mapped.ts) : new Date();
    if (Number.isNaN(ts.getTime())) issues.push('Fecha inválida');

    let duplicates = [];
    if (match && Number.isFinite(mapped.qty)) {
      const type = mapped.type || ({ entradas: 'entrada', compras: 'entrada', salidas: 'marchado' }[src.kind] ?? 'marchado');
      const near = await prisma.movement.findMany({ where: { productId: match.product.id, ts: { gte: new Date(ts - 864e5), lte: new Date(+ts + 864e5) }, status: { in: ['pendiente', 'aprobado'] } } });
      duplicates = findDuplicates({ productId: match.product.id, type, qty: mapped.qty, ts, source: 'sheets', invoice: mapped.invoice }, near.map(toCoreMovement), config.rules.duplicateWindowHours);
      if (duplicates.some((d) => String(d.b.source).startsWith('whatsapp'))) stats.coincidenWhatsApp++;
      if (duplicates.length && duplicates[0].score >= 0.9) stats.duplicadas++;
      mapped.type = type;
    }
    if (issues.length) stats.errores++;

    const saved = await prisma.importRow.upsert({
      where: { sourceId_rowKey: { sourceId, rowKey } },
      update: { contentHash, raw: r.raw, mapped, rowNumber: r.rowNumber, status: issues.length ? 'error' : state, error: issues.join('; ') || null },
      create: { sourceId, rowKey, contentHash, raw: r.raw, mapped, rowNumber: r.rowNumber, status: issues.length ? 'error' : state, error: issues.join('; ') || null },
    });
    preview.push({
      importRowId: saved.id, rowNumber: r.rowNumber, state, raw: r.raw, mapped,
      product: match ? { id: match.product.id, name: match.product.name, score: match.score } : null,
      issues, duplicates: duplicates.slice(0, 3).map((d) => ({ movementId: d.b.id, source: d.b.source, reason: d.reason, score: d.score })),
      suggestion: issues.length ? 'revisar' : duplicates[0]?.score >= 0.9 ? 'vincular_existente' : 'crear',
    });
  }
  await prisma.syncRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), stats } });
  await prisma.sheetSource.update({ where: { id: sourceId }, data: { lastSyncAt: new Date() } });
  return { runId: run.id, stats, preview };
}

/**
 * Paso 7–8: aplica las decisiones del usuario.
 * decisions: [{ importRowId, action: 'crear'|'vincular_existente'|'ignorar', movementId?, approve?:boolean }]
 */
export async function applySync(decisions, userId) {
  const out = [];
  for (const d of decisions) {
    const row = await prisma.importRow.findUniqueOrThrow({ where: { id: d.importRowId } });
    if (d.action === 'ignorar') { await prisma.importRow.update({ where: { id: row.id }, data: { status: 'ignorado' } }); continue; }
    if (d.action === 'vincular_existente') {
      await prisma.movement.update({ where: { id: d.movementId }, data: { importRowId: row.id } });
      await prisma.importRow.update({ where: { id: row.id }, data: { status: 'duplicado' } });
      out.push({ importRowId: row.id, linked: d.movementId }); continue;
    }
    const m = row.mapped;
    const catalog = (await prisma.product.findMany()).map(toCoreProduct);
    const match = d.productId ? { product: { id: d.productId } } : matchProduct(String(m.product), catalog);
    const { movement } = await proposeMovement({
      productId: match.product.id, qty: m.qty, unit: m.unit, type: m.type, unitCost: m.unitCost || undefined,
      source: 'sheets', importRowId: row.id, invoice: m.invoice, ts: m.ts ? new Date(m.ts) : new Date(),
      reportedBy: m.responsible, area: m.area, reason: m.reason, userId, notes: `Fila ${row.rowNumber}`,
    });
    const final = d.approve ? await approveMovement(movement.id, userId) : movement;
    await prisma.importRow.update({ where: { id: row.id }, data: { status: 'aplicado' } });
    out.push({ importRowId: row.id, movementId: final.id, status: final.status, fp: fingerprint(final) });
  }
  return out;
}

/** Exporta un reporte (filas) a una nueva hoja en la carpeta de exportación */
export async function exportReport(title, headers, rows) {
  const { sheets, drive } = clients();
  const { data } = await sheets.spreadsheets.create({ requestBody: { properties: { title } } });
  await sheets.spreadsheets.values.update({ spreadsheetId: data.spreadsheetId, range: 'A1', valueInputOption: 'RAW', requestBody: { values: [headers, ...rows] } });
  if (config.google.exportFolder) await drive.files.update({ fileId: data.spreadsheetId, addParents: config.google.exportFolder, fields: 'id' });
  return { spreadsheetId: data.spreadsheetId, url: data.spreadsheetUrl };
}
