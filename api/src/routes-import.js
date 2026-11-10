/* Importación de productos desde Excel/CSV — POST /api/v1/products/import
 * multipart (campo "file") o JSON { rows, mapping? }.
 * Sin "apply" devuelve la vista previa; con apply: [números de fila] la aplica en una transacción. */
import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { prisma, n, toCoreProduct } from './db.js';
import { auth, audit, asyncH, HttpError } from './middleware.js';
import { perm } from './routes2.js';
import { guessMapping, findHeaderRow, buildImportPlan, nextCode, IMPORT_FIELDS, TEMPLATE_COLUMNS } from './core/productImport.js';
import { proposeMovement, approveMovement } from './services/inventory.js';

const r = Router();
const upload = multer({ limits: { fileSize: 15 * 1024 * 1024 } });
// auth por ruta: este router se monta antes que el principal (para que /products/export.xlsx no choque con /products/:id)

function rowsFromFile(buf, sheetName, headerRow) {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const name = sheetName || wb.SheetNames.find((s) => /product|invent|catalog/i.test(s)) || wb.SheetNames[0];
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: true });
  const h = headerRow ?? findHeaderRow(matrix);
  const headers = (matrix[h] || []).map((x, j) => String(x ?? '').trim() || `Columna ${XLSX.utils.encode_col(j)}`);
  const rows = matrix.slice(h + 1).map((row, k) => { const o = { __row: h + k + 2 }; headers.forEach((hd, j) => (o[hd] = row[j] ?? '')); return o; }).filter((o) => headers.some((hd) => String(o[hd]).trim() !== ''));
  return { sheet: name, sheets: wb.SheetNames, headers, rows };
}

r.post('/products/import', auth, perm('inventario.editar'), upload.single('file'), asyncH(async (req, res) => {
  const body = req.file ? JSON.parse(req.body.payload || '{}') : req.body;
  let parsed;
  if (req.file) parsed = rowsFromFile(req.file.buffer, body.sheet, body.headerRow);
  else if (Array.isArray(body.rows)) parsed = { rows: body.rows, headers: Object.keys(body.rows[0] || {}).filter((k) => k !== '__row') };
  else throw new HttpError(422, 'Envía un archivo en "file" o filas en "rows"');
  const mapping = body.mapping || guessMapping(parsed.headers);
  const products = (await prisma.product.findMany({ include: { category: true } })).map(toCoreProduct);
  const suppliers = await prisma.supplier.findMany();
  const plan = buildImportPlan({ rows: parsed.rows, mapping, products, suppliers, stockOf: (p) => p.stockCurrent, options: body.options || {} });
  if (!body.apply) return res.json({ ...parsed, rows: undefined, rowCount: parsed.rows.length, mapping, fields: IMPORT_FIELDS, plan });

  const pick = new Set(body.apply.map(Number));
  const items = plan.items.filter((x) => pick.has(x.row) && (x.action === 'nuevo' || x.action === 'actualizar'));
  const cats = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.name, c.id]));
  const summary = { nuevos: 0, actualizados: 0, stock: 0, omitidos: plan.items.length - items.length };
  const supIds = {};
  for (const name of plan.newSuppliers) if (body.options?.createSuppliers !== false && items.some((x) => x.data.newSupplier === name)) supIds[name] = (await prisma.supplier.create({ data: { name, notes: 'Creado al importar productos' } })).id;
  const catId = async (name) => (cats[name] ||= (await prisma.category.upsert({ where: { name }, update: {}, create: { name } })).id);
  const sessionId = `IMP-${Date.now()}`;
  for (const x of items) {
    const d = { ...x.data }; const supplierId = d.newSupplier ? supIds[d.newSupplier] : d.supplierId; const stock = d.stock;
    delete d.newSupplier; delete d.stock; delete d.supplierId;
    if (d.expiresAt) d.expiresAt = new Date(d.expiresAt + 'T12:00:00');
    if (x.action === 'nuevo') {
      const { category, ...rest } = d;
      const code = d.code || nextCode(category, products);
      await prisma.product.create({ data: { ...rest, code, categoryId: await catId(category), supplierId: supplierId || null, stockInit: stock || 0, stockCurrent: stock || 0, notes: d.notes || 'Importado desde Excel' } });
      products.push({ code });
      summary.nuevos++;
    } else {
      const data = {};
      for (const c of x.changes) { if (c.field === 'newSupplier' || c.field === 'supplierId') data.supplierId = supplierId; else if (c.field === 'category') data.categoryId = await catId(d.category); else data[c.field] = d[c.field]; }
      if (Object.keys(data).length) { const before = await prisma.product.findUnique({ where: { id: x.productId } }); await prisma.product.update({ where: { id: x.productId }, data }); await audit(req, 'product.import_update', 'Product', x.productId, before, data); }
      if (x.stock) {
        summary.stock++;
        if (x.stock.mode === 'conteo') await prisma.physicalCount.create({ data: { productId: x.productId, qty: x.stock.to, countedBy: `${req.user.name} (importación)`, sessionId } });
        else { const { movement } = await proposeMovement({ productId: x.productId, qty: Math.abs(x.stock.diff), type: x.stock.diff > 0 ? 'ajuste_pos' : 'ajuste_neg', source: 'sistema', reason: `Ajuste por importación (fila ${x.row})`, userId: req.user.sub }); if (['ADMIN', 'SUPERVISOR'].includes(req.user.role)) await approveMovement(movement.id, req.user.sub); }
      }
      summary.actualizados++;
    }
  }
  await audit(req, 'productos.importar', 'Product', sessionId, null, summary);
  res.json({ summary, plan: { totals: plan.totals } });
}));

/** Plantilla o catálogo actual en .xlsx (mismas columnas, se puede reimportar) */
r.get('/products/export.xlsx', auth, perm('inventario.ver'), asyncH(async (req, res) => {
  const ps = req.query.template ? [] : (await prisma.product.findMany({ include: { category: true, supplier: true }, orderBy: { code: 'asc' } })).map(toCoreProduct);
  const rows = ps.map((p) => TEMPLATE_COLUMNS.map((k) => (k === 'stock' ? p.stockCurrent : k === 'supplier' ? p.supplier?.name || '' : k === 'aliases' ? (p.aliases || []).join(', ') : k === 'expiresAt' ? p.expiresAt?.toISOString().slice(0, 10) || '' : p[k] ?? '')));
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS.map((k) => IMPORT_FIELDS[k]), ...rows]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${req.query.template ? 'plantilla-productos' : 'catalogo'}-capybara.xlsx"`);
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}));
export default r;
