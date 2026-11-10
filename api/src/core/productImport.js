/* =====================================================================
 * Capybara Control — importación de productos desde Excel / CSV / Sheets
 * (compartido por backend y frontend)
 *  guessMapping(headers)        → relaciona columnas del archivo con campos
 *  findHeaderRow(matrix)        → detecta la fila de encabezados
 *  buildImportPlan({...})       → vista previa: nuevos, actualizaciones, sin cambios, errores
 * Reglas: las celdas vacías NUNCA borran datos; el stock de productos existentes no se
 * sobrescribe: se registra como conteo físico o como ajuste (trazabilidad).
 * ===================================================================== */

export const IMPORT_FIELDS = {
  code: 'Código interno', barcode: 'Código de barras', name: 'Nombre', description: 'Descripción', category: 'Categoría',
  kind: 'Tipo', unit: 'Unidad de medida', stock: 'Stock / existencia', stockMin: 'Stock mínimo', stockMax: 'Stock máximo',
  avgCost: 'Costo promedio', lastPrice: 'Último precio de compra', salePrice: 'Precio de venta', supplier: 'Proveedor principal',
  location: 'Ubicación', expiresAt: 'Fecha de vencimiento', aliases: 'Alias (separados por coma)', packSize: 'Empaque de compra',
  status: 'Estado', notes: 'Observaciones',
};

const SYN = {
  code: ['codigo', 'codigo interno', 'cod', 'sku', 'referencia', 'ref', 'id producto', 'cod interno', 'item code'],
  barcode: ['codigo de barras', 'cod barras', 'barras', 'ean', 'upc', 'barcode'],
  name: ['nombre', 'producto', 'nombre producto', 'nombre del producto', 'articulo', 'item', 'insumo'],
  description: ['descripcion', 'detalle', 'descripcion larga'],
  category: ['categoria', 'grupo', 'familia', 'linea', 'clasificacion'],
  kind: ['tipo', 'tipo de producto', 'clase'],
  unit: ['unidad', 'unidad de medida', 'um', 'u m', 'medida', 'presentacion unidad'],
  stock: ['stock', 'stock actual', 'existencia', 'existencias', 'cantidad', 'saldo', 'inventario', 'cant', 'conteo', 'cantidad actual'],
  stockMin: ['minimo', 'stock minimo', 'min', 'cantidad minima'],
  stockMax: ['maximo', 'stock maximo', 'max', 'cantidad maxima'],
  avgCost: ['costo promedio', 'costo', 'costo unitario', 'valor unitario', 'costo prom'],
  lastPrice: ['ultimo precio', 'ultimo precio de compra', 'precio compra', 'precio de compra', 'ultimo costo'],
  salePrice: ['precio venta', 'precio de venta', 'pvp', 'precio publico', 'precio'],
  supplier: ['proveedor', 'proveedor principal', 'distribuidor'],
  location: ['ubicacion', 'ubicacion fisica', 'bodega', 'lugar', 'almacen'],
  expiresAt: ['vencimiento', 'fecha vencimiento', 'fecha de vencimiento', 'vence', 'caducidad'],
  aliases: ['alias', 'sinonimos', 'otros nombres', 'nombres whatsapp'],
  packSize: ['empaque', 'empaque de compra', 'unidades por caja', 'pack', 'presentacion'],
  status: ['estado', 'activo'],
  notes: ['observaciones', 'notas', 'comentarios', 'obs'],
};

export const normHeader = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function guessMapping(headers) {
  const out = {}, used = new Set();
  // 1) coincidencia exacta; 2) el encabezado contiene un sinónimo largo
  for (const pass of [1, 2]) {
    for (const h of headers) {
      if (out[h] !== undefined) continue;
      const n = normHeader(h); if (!n) { out[h] = ''; continue; }
      let hit = '';
      for (const [f, list] of Object.entries(SYN)) {
        if (used.has(f)) continue;
        if (pass === 1 ? list.includes(n) : list.some((x) => x.length >= 5 && n.includes(x))) { hit = f; break; }
      }
      if (hit) { out[h] = hit; used.add(hit); } else if (pass === 2) out[h] = '';
    }
  }
  return out;
}

/** Primera fila con al menos 2 encabezados reconocibles (o la primera no vacía) */
export function findHeaderRow(matrix) {
  let firstNonEmpty = -1;
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const r = (matrix[i] || []).map((x) => String(x ?? '').trim());
    if (r.filter(Boolean).length === 0) continue;
    if (firstNonEmpty < 0) firstNonEmpty = i;
    const m = guessMapping(r.filter(Boolean));
    if (Object.values(m).filter(Boolean).length >= 2) return i;
  }
  return Math.max(0, firstNonEmpty);
}

/** "$ 3.200", "3.200,50", "3,200.50", 3200 → número. Formato colombiano por defecto. */
export function parseNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let s = String(v).trim().replace(/[$\sCOP]/gi, '');
  if (!s) return null;
  const hasDot = s.includes('.'), hasComma = s.includes(',');
  if (hasDot && hasComma) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (hasComma) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Date, número serial de Excel, dd/mm/aaaa o aaaa-mm-dd → "aaaa-mm-dd" */
export function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return 'invalid';
}
const KIND = { consumible: 'consumible', insumo: 'consumible', menaje: 'menaje', lenceria: 'menaje', utensilio: 'menaje', activo: 'activo', equipo: 'activo', mobiliario: 'activo', mueble: 'activo', servicio: 'servicio' };
const STATUS = { activo: 'activo', si: 'activo', 'sí': 'activo', '1': 'activo', true: 'activo', inactivo: 'inactivo', no: 'inactivo', '0': 'inactivo', false: 'inactivo' };

function normalizeRow(raw, mapping) {
  const d = {}, errors = [], warnings = [];
  for (const [col, field] of Object.entries(mapping)) {
    if (!field) continue;
    const v = raw[col];
    if (v === '' || v === null || v === undefined) continue;
    if (['stock', 'stockMin', 'stockMax', 'avgCost', 'lastPrice', 'salePrice', 'packSize'].includes(field)) {
      const n = parseNumber(v);
      if (Number.isNaN(n)) errors.push(`${IMPORT_FIELDS[field]} no es un número: "${v}"`);
      else if (n < 0) errors.push(`${IMPORT_FIELDS[field]} no puede ser negativo`);
      else if (n !== null) d[field] = n;
    } else if (field === 'expiresAt') {
      const dt = parseDate(v); if (dt === 'invalid') errors.push(`Fecha de vencimiento no válida: "${v}"`); else if (dt) d[field] = dt;
    } else if (field === 'kind') {
      const k = KIND[normHeader(v).split(' ')[0]]; if (k) d.kind = k; else warnings.push(`Tipo "${v}" no reconocido: se usa consumible`);
    } else if (field === 'status') {
      const s = STATUS[normHeader(v)] ?? STATUS[String(v).toLowerCase()]; if (s) d.status = s; else warnings.push(`Estado "${v}" no reconocido`);
    } else if (field === 'aliases') d.aliases = String(v).split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
    else d[field] = String(v).trim();
  }
  if (d.code) d.code = d.code.toUpperCase();
  if (d.barcode) d.barcode = String(d.barcode).replace(/\.0$/, '');
  return { d, errors, warnings };
}

const CMP_FIELDS = ['barcode', 'name', 'description', 'category', 'kind', 'unit', 'stockMin', 'stockMax', 'avgCost', 'lastPrice', 'salePrice', 'supplierId', 'location', 'expiresAt', 'aliases', 'packSize', 'status', 'notes'];
const same = (a, b) => (Array.isArray(a) || Array.isArray(b) ? JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort()) : String(a ?? '') === String(b ?? '') || (typeof a === 'number' && Number(b) === a));

/**
 * @param o.rows        [{__row: n, <encabezado>: valor}]
 * @param o.mapping     {encabezado: campo}
 * @param o.products    catálogo actual
 * @param o.suppliers   proveedores actuales
 * @param o.stockOf     (p) => stock teórico
 * @param o.options     { matchBy: ['code','barcode','name'], stockMode: 'ignorar'|'conteo'|'ajuste', updateAvgCost: false, createSuppliers: true, defaultCategory: 'Otros' }
 */
export function buildImportPlan({ rows, mapping, products, suppliers = [], stockOf = () => 0, options = {} }) {
  const opt = { matchBy: ['code', 'barcode', 'name'], stockMode: 'conteo', updateAvgCost: false, createSuppliers: true, defaultCategory: 'Otros', ...options };
  const norm = (s) => normHeader(s);
  const byCode = new Map(products.filter((p) => p.code).map((p) => [String(p.code).toUpperCase(), p]));
  const byBar = new Map(products.filter((p) => p.barcode).map((p) => [String(p.barcode), p]));
  const byName = new Map(products.map((p) => [norm(p.name), p]));
  const supByName = new Map(suppliers.map((s) => [norm(s.name), s]));
  const seen = new Map();
  const items = [];
  const newSuppliers = new Set();
  for (const raw of rows) {
    const { d, errors, warnings } = normalizeRow(raw, mapping);
    if (!Object.keys(d).length) continue; // fila vacía
    let p = null, matchedBy = null;
    for (const k of opt.matchBy) {
      if (k === 'code' && d.code && byCode.get(d.code)) { p = byCode.get(d.code); matchedBy = 'código'; break; }
      if (k === 'barcode' && d.barcode && byBar.get(d.barcode)) { p = byBar.get(d.barcode); matchedBy = 'código de barras'; break; }
      if (k === 'name' && d.name && byName.get(norm(d.name))) { p = byName.get(norm(d.name)); matchedBy = 'nombre'; break; }
    }
    const key = p?.id || d.code || norm(d.name || '');
    if (key && seen.has(key)) errors.push(`Repetido: también está en la fila ${seen.get(key)}`);
    else if (key) seen.set(key, raw.__row);
    if (d.supplier) {
      const s = supByName.get(norm(d.supplier));
      if (s) d.supplierId = s.id;
      else if (opt.createSuppliers) { d.newSupplier = d.supplier; newSuppliers.add(d.supplier); warnings.push(`Se creará el proveedor "${d.supplier}"`); }
      else warnings.push(`Proveedor "${d.supplier}" no existe: se deja sin proveedor`);
    }
    delete d.supplier;
    if (d.code && p && p.code && String(p.code).toUpperCase() !== d.code && matchedBy !== 'código') warnings.push(`El código del archivo (${d.code}) es distinto al del sistema (${p.code}); se conserva el del sistema`);

    if (!p) {
      if (!d.name) errors.push('Falta el nombre del producto');
      if (!d.code) warnings.push('Sin código interno: se asignará uno');
      if (!d.category) { d.category = opt.defaultCategory; warnings.push(`Sin categoría: se usa "${opt.defaultCategory}"`); }
      if (!d.unit) d.unit = 'unidad';
      if (!d.kind) d.kind = 'consumible';
      if (d.avgCost == null && d.lastPrice != null) d.avgCost = d.lastPrice;
      if (d.lastPrice == null && d.avgCost != null) d.lastPrice = d.avgCost;
      items.push({ row: raw.__row, action: errors.length ? 'error' : 'nuevo', productId: null, data: d, changes: Object.entries(d).filter(([k]) => IMPORT_FIELDS[k] || k === 'supplierId').map(([k, v]) => ({ field: k, label: IMPORT_FIELDS[k] || 'Proveedor', from: null, to: v })), stock: d.stock != null ? { from: null, to: d.stock } : null, errors, warnings, matchedBy: null });
      continue;
    }
    const changes = [];
    for (const f of CMP_FIELDS) {
      if (d[f] === undefined) continue;
      if (f === 'avgCost' && !opt.updateAvgCost) { if (!same(p[f], d[f])) warnings.push('Costo promedio distinto: no se cambia (actívalo en opciones si es intencional)'); continue; }
      if (f === 'name' && norm(p.name) === norm(d.name)) continue; // mismo nombre con otras mayúsculas o tildes
      if (!same(p[f], d[f])) changes.push({ field: f, label: IMPORT_FIELDS[f] || 'Proveedor', from: f === 'supplierId' ? suppliers.find((s) => s.id === p[f])?.name || null : p[f] ?? null, to: f === 'supplierId' ? suppliers.find((s) => s.id === d[f])?.name : d[f] });
    }
    if (d.newSupplier) changes.push({ field: 'newSupplier', label: 'Proveedor', from: suppliers.find((s) => s.id === p.supplierId)?.name || null, to: d.newSupplier + ' (nuevo)' });
    let stock = null;
    if (d.stock != null && opt.stockMode !== 'ignorar') {
      const cur = stockOf(p);
      if (Math.abs(cur - d.stock) > 1e-9) stock = { from: cur, to: d.stock, diff: d.stock - cur, mode: opt.stockMode };
    }
    const action = errors.length ? 'error' : changes.length || stock ? 'actualizar' : 'sin_cambios';
    items.push({ row: raw.__row, action, productId: p.id, productName: p.name, productCode: p.code, data: d, changes, stock, errors, warnings, matchedBy });
  }
  const totals = items.reduce((a, i) => ((a[i.action] = (a[i.action] || 0) + 1), a), { nuevo: 0, actualizar: 0, sin_cambios: 0, error: 0 });
  return { items, totals, newSuppliers: [...newSuppliers] };
}

/** Siguiente código libre para una categoría: ALI-007, BEB-012… */
export function nextCode(category, products) {
  const pre = normHeader(category).replace(/\s/g, '').slice(0, 3).toUpperCase() || 'PRD';
  let max = 0;
  for (const p of products) { const m = String(p.code || '').match(new RegExp(`^${pre}-(\\d+)$`)); if (m) max = Math.max(max, +m[1]); }
  return `${pre}-${String(max + 1).padStart(3, '0')}`;
}

/** Columnas de la plantilla y del catálogo exportado (mismo orden para poder reimportar) */
export const TEMPLATE_COLUMNS = ['code', 'barcode', 'name', 'category', 'kind', 'unit', 'stock', 'stockMin', 'stockMax', 'avgCost', 'lastPrice', 'salePrice', 'supplier', 'location', 'expiresAt', 'packSize', 'aliases', 'status', 'description', 'notes'];
