/* ================= Capybara Control · app (7/7): Importar productos desde Excel ================= */
VIEW_PERM.importar = 'inventario.editar';
(() => { const e = Object.entries(VIEWS); for (const k in VIEWS) delete VIEWS[k]; for (const [k, v] of e) { VIEWS[k] = v; if (k === 'inventario') VIEWS.importar = { t: 'Importar productos desde Excel', short: 'Importar Excel', ic: 'upload', grp: 'Operación' }; } })();
ICON.upload = '<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>';

let IM = { file: null, sheets: [], sheet: '', matrix: [], headerRow: 0, headers: [], rows: [], mapping: {}, plan: null, sel: new Set(), filter: '', busy: false, done: null,
  opt: { matchBy: ['code', 'barcode', 'name'], stockMode: 'conteo', updateAvgCost: false, createSuppliers: true, defaultCategory: 'Otros' } };
let downloadsP = null;
// En claude.ai usa la capacidad "downloads"; fuera de claude.ai (servidor propio) descarga directo con un enlace.
const getDownloads = () => (downloadsP ||= (window.claude?.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null)).then((d) => d || (window.claude ? null : {
  save: async ({ filename, data }) => { const url = URL.createObjectURL(new Blob([data])); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000); },
})));
const IM_ACT = { nuevo: ['Nuevo', 'p-info'], actualizar: ['Actualizar', 'p-warn'], sin_cambios: ['Sin cambios', 'p-mut'], error: ['Con error', 'p-bad'] };

function imSetSheet(name) {
  const ws = IM.wb.Sheets[name];
  IM.sheet = name;
  IM.matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
  IM.headerRow = findHeaderRow(IM.matrix);
  imSetHeader(IM.headerRow);
}
function imSetHeader(i) {
  IM.headerRow = i;
  const hdr = (IM.matrix[i] || []).map((h, j) => String(h ?? '').trim() || `Columna ${XLSX.utils.encode_col(j)}`);
  const seen = {}; IM.headers = hdr.map((h) => (seen[h] = (seen[h] || 0) + 1) > 1 ? `${h} (${seen[h]})` : h);
  IM.rows = IM.matrix.slice(i + 1).map((r, k) => { const o = { __row: i + k + 2 }; IM.headers.forEach((h, j) => (o[h] = r[j] instanceof Date ? r[j] : r[j] ?? '')); return o; })
    .filter((o) => IM.headers.some((h) => String(o[h]).trim() !== ''));
  IM.mapping = guessMapping(IM.headers);
  imPlan();
}
function imPlan() {
  const st = stockMap();
  IM.plan = buildImportPlan({ rows: IM.rows, mapping: IM.mapping, products: S.products, suppliers: S.suppliers, stockOf: (p) => st[p.id] ?? 0, options: IM.opt });
  IM.sel = new Set(IM.plan.items.filter((x) => x.action === 'nuevo' || x.action === 'actualizar').map((x) => x.row));
}
async function imRead(file) {
  if (!window.XLSX) return toast('No se pudo cargar el lector de Excel. Revisa tu conexión y recarga.');
  if (file.size > 15 * 1024 * 1024) return toast('El archivo supera 15 MB. Divide la hoja o quita imágenes.');
  IM.busy = true; render();
  try {
    const buf = await file.arrayBuffer();
    IM.wb = XLSX.read(buf, { type: 'array', cellDates: true, codepage: 65001 });
    IM.file = { name: file.name, size: file.size };
    IM.sheets = IM.wb.SheetNames.filter((n) => { const ws = IM.wb.Sheets[n]; return ws && ws['!ref']; });
    if (!IM.sheets.length) throw new Error('El archivo no tiene hojas con datos');
    // prefiere una hoja que parezca de productos
    const pick = IM.sheets.find((n) => /product|invent|catalog|articul/i.test(normHeader(n))) || IM.sheets[0];
    IM.done = null; IM.filter = '';
    imSetSheet(pick);
  } catch (e) { toast('No se pudo leer el archivo: ' + (e.message || e)); IM.file = null; }
  IM.busy = false; render();
}
const fmtVal = (f, v) => (v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : ['avgCost', 'lastPrice', 'salePrice'].includes(f) ? money(v) : typeof v === 'number' ? num(v) : f === 'expiresAt' ? fdate(v + 'T12:00') : String(v));

RENDER.importar = () => {
  const P = IM.plan;
  if (IM.done) return `
    <div class="card im-done"><div class="im-check">${ic('check')}</div><h2>Importación aplicada</h2>
      <p class="muted">${esc(IM.done.file)} · hoja ${esc(IM.done.sheet)}</p>
      <div class="kpis" style="max-width:720px;margin:6px auto 0"><div class="kpi"><span class="k">Productos nuevos</span><span class="v">${IM.done.nuevos}</span></div><div class="kpi"><span class="k">Actualizados</span><span class="v">${IM.done.actualizados}</span></div><div class="kpi"><span class="k">Stock registrado</span><span class="v">${IM.done.stock}</span><span class="s">${{ conteo: 'como conteo físico', ajuste: 'como ajuste', ignorar: 'sin cambios' }[IM.done.stockMode]}</span></div><div class="kpi"><span class="k">Omitidos</span><span class="v">${IM.done.omitidos}</span></div></div>
      <div class="row" style="justify-content:center;margin-top:14px"><a class="btn pri" href="#inventario">Ver inventario</a>${IM.done.stock && IM.done.stockMode === 'conteo' && can('conciliacion.ver') ? '<a class="btn" href="#conciliacion">Ver conciliación</a>' : ''}<button class="btn" id="im-again">Importar otro archivo</button></div></div>
    ${imHistory()}`;
  if (!IM.file) return `
    <div class="im-intro">
      <label class="dropzone ${IM.busy ? 'busy' : ''}" id="im-drop" for="im-file">
        <span class="dz-ic">${ic('upload')}</span>
        <b>${IM.busy ? 'Leyendo archivo…' : 'Arrastra aquí tu Excel o haz clic para elegirlo'}</b>
        <span class="muted small">.xlsx, .xls o .csv · hasta 15 MB · también sirve un Google Sheets descargado como Excel</span>
        <input type="file" id="im-file" accept=".xlsx,.xls,.xlsm,.csv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" hidden>
      </label>
      <div class="card"><div class="card-h"><h2>Cómo funciona</h2></div>
        <ol class="steps"><li>Sube tu base de productos tal como la tienes. Reconozco columnas como <i>Código, Producto, Categoría, Existencia, Mínimo, Costo, Precio de venta, Proveedor</i>.</li><li>Revisa la relación de columnas y las opciones.</li><li>Mira la vista previa: qué productos son nuevos, cuáles cambian y qué filas tienen errores.</li><li>Aplica solo las filas que marques. Todo queda en la bitácora.</li></ol>
        <div class="row" style="margin-top:12px"><button class="btn" id="im-tpl">${ic('in')} Descargar plantilla</button><button class="btn" id="im-exp">${ic('in')} Descargar catálogo actual</button></div>
        <p class="muted small" style="margin:10px 0 0">Para actualizar en bloque: descarga el catálogo actual, edítalo en Excel y vuelve a subirlo. Las celdas vacías no borran datos.</p></div>
    </div>${imHistory()}`;

  const shown = P.items.filter((x) => !IM.filter || x.action === IM.filter);
  const mappedFields = Object.values(IM.mapping).filter(Boolean);
  const missingKey = !mappedFields.includes('name') && !mappedFields.includes('code') && !mappedFields.includes('barcode');
  const selCount = P.items.filter((x) => IM.sel.has(x.row)).length;
  return `
  <div class="card im-file"><div class="row">
    <span class="thumb" style="background:var(--ok-bg);color:var(--ok)">XLS</span>
    <span class="grow" style="min-width:0"><b>${esc(IM.file.name)}</b><span class="small muted" style="display:block">${num(IM.rows.length)} filas con datos · ${(IM.file.size / 1024).toFixed(0)} KB</span></span>
    ${IM.sheets.length > 1 ? `<label class="small row" style="gap:6px">Hoja <select class="in sm" id="im-sheet">${IM.sheets.map((s) => opt(s, s, IM.sheet)).join('')}</select></label>` : ''}
    <label class="small row" style="gap:6px">Encabezados en la fila <select class="in sm" id="im-hr">${IM.matrix.slice(0, 15).map((r, i) => opt(i, `${i + 1} · ${String(r.filter((x) => x !== '').slice(0, 2).join(', ')).slice(0, 28)}`, IM.headerRow)).join('')}</select></label>
    <button class="btn sm ghost" id="im-reset">${ic('x')} Cambiar archivo</button>
  </div></div>

  <div class="grid" style="grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);align-items:start" id="im-grid">
    <div class="card"><div class="card-h"><h2>Relación de columnas</h2><span class="spacer"></span><span class="muted small">${mappedFields.length} de ${IM.headers.length} reconocidas</span></div>
      <div class="tbl-wrap" style="max-height:420px;overflow:auto"><table><thead><tr><th>Columna en tu archivo</th><th>Ejemplo</th><th>Campo en Capybara</th></tr></thead><tbody>
      ${IM.headers.map((h) => { const ex = IM.rows.slice(0, 3).map((r) => r[h]).filter((v) => v !== '' && v != null).map((v) => (v instanceof Date ? iso(v) : String(v))).slice(0, 2).join(' · '); return `<tr class="${IM.mapping[h] ? '' : 'im-skip'}"><td><b>${esc(h)}</b></td><td class="small muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ex)}</td><td><select class="in sm" data-map="${esc(h)}" style="max-width:none;width:100%">${opt('', '— No importar —', IM.mapping[h])}${Object.entries(IMPORT_FIELDS).map(([k, l]) => opt(k, l + (Object.entries(IM.mapping).some(([hh, f]) => f === k && hh !== h) ? ' (ya usado)' : ''), IM.mapping[h])).join('')}</select></td></tr>`; }).join('')}
      </tbody></table></div>
      ${missingKey ? `<div class="banner" style="margin-top:10px;background:var(--bad-bg)">${ic('info')}<div>Relaciona al menos <b>Nombre</b> o <b>Código interno</b> para poder identificar los productos.</div></div>` : ''}
    </div>
    <div class="card"><div class="card-h"><h2>Opciones</h2></div>
      <div class="field"><label>Reconocer productos existentes por</label><div class="row">${[['code', 'Código interno'], ['barcode', 'Código de barras'], ['name', 'Nombre']].map(([k, l]) => `<label class="small row" style="gap:5px"><input type="checkbox" data-mb="${k}" ${IM.opt.matchBy.includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
      <div class="field" style="margin-top:12px"><label>Si el archivo trae stock de productos existentes</label>
        ${[['conteo', 'Registrarlo como conteo físico', 'Recomendado. No cambia el inventario: la diferencia aparece en Conciliación para revisarla.'], ['ajuste', 'Crear ajuste para igualar el inventario', can('movimientos.aprobar') ? 'Se aprueba de inmediato y queda en el historial.' : 'Quedará pendiente de aprobación.'], ['ignorar', 'No tocar el stock', 'Solo se actualizan datos del catálogo.']].map(([k, l, d]) => `<label class="im-radio"><input type="radio" name="im-sm" value="${k}" ${IM.opt.stockMode === k ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}
        <span class="muted small">Para productos nuevos, el stock del archivo es su stock inicial.</span></div>
      <label class="small row" style="margin-top:12px;gap:6px"><input type="checkbox" id="im-cost" ${IM.opt.updateAvgCost ? 'checked' : ''}> Reemplazar el costo promedio con el del archivo</label>
      <label class="small row" style="gap:6px"><input type="checkbox" id="im-sup" ${IM.opt.createSuppliers ? 'checked' : ''}> Crear los proveedores que no existan</label>
      <div class="field" style="margin-top:8px"><label for="im-cat">Categoría para filas sin categoría</label><select class="in sm" id="im-cat" style="max-width:none">${cats().map((c) => opt(c, c, IM.opt.defaultCategory)).join('')}</select></div>
    </div>
  </div>

  <div class="card"><div class="card-h"><h2>Vista previa</h2><span class="spacer"></span>
    <div class="row" style="gap:6px"><button class="btn sm ${!IM.filter ? 'pri' : ''}" data-imf="">Todas · ${P.items.length}</button>${Object.entries(IM_ACT).map(([k, [l]]) => (P.totals[k] ? `<button class="btn sm ${IM.filter === k ? 'pri' : ''}" data-imf="${k}">${l} · ${P.totals[k]}</button>` : '')).join('')}</div></div>
    ${P.newSuppliers.length ? `<p class="small" style="margin:0 0 10px">Proveedores nuevos: <b>${P.newSuppliers.map(esc).join(', ')}</b></p>` : ''}
    <div class="tbl-wrap" style="max-height:560px;overflow:auto"><table><thead><tr><th style="width:34px"><input type="checkbox" id="im-all" aria-label="Seleccionar todo" ${selCount && selCount === P.items.filter((x) => x.action === 'nuevo' || x.action === 'actualizar').length ? 'checked' : ''}></th><th>Fila</th><th>Acción</th><th>Producto</th><th>Cambios</th><th>Avisos</th></tr></thead><tbody>
    ${shown.slice(0, 400).map((x) => { const can_ = x.action === 'nuevo' || x.action === 'actualizar'; const name = x.productName || x.data.name || '(sin nombre)';
      const ch = x.action === 'nuevo' ? `<span class="small muted">${['category', 'unit', 'stock', 'avgCost', 'salePrice'].filter((f) => x.data[f] != null).map((f) => `${IMPORT_FIELDS[f].split(' ')[0]} ${esc(fmtVal(f, x.data[f]))}`).join(' · ')}</span>`
        : [...x.changes.map((c) => `<div class="chg"><span class="muted">${esc(c.label)}</span> <s>${esc(fmtVal(c.field, c.from))}</s> → <b>${esc(fmtVal(c.field, c.to))}</b></div>`), x.stock ? `<div class="chg"><span class="muted">Stock</span> <s>${num(x.stock.from)}</s> → <b>${num(x.stock.to)}</b> <span class="${x.stock.diff < 0 ? 'neg' : 'pos'} small">(${x.stock.diff > 0 ? '+' : ''}${num(x.stock.diff)} · ${x.stock.mode === 'conteo' ? 'conteo' : 'ajuste'})</span></div>` : ''].join('') || '<span class="muted small">—</span>';
      return `<tr class="sev ${x.action === 'error' ? 'sev-bad' : ''}"><td><input type="checkbox" data-ims="${x.row}" ${IM.sel.has(x.row) ? 'checked' : ''} ${can_ ? '' : 'disabled'} aria-label="Fila ${x.row}"></td><td class="num small">${x.row}</td><td>${pill(...IM_ACT[x.action])}${x.matchedBy ? `<span class="sub">por ${x.matchedBy}</span>` : ''}</td>
      <td><b>${esc(name)}</b><span class="sub mono">${esc(x.productCode || x.data.code || 'código automático')}</span></td><td style="min-width:240px">${ch}</td>
      <td class="small" style="min-width:180px">${x.errors.map((e) => `<div class="neg">${esc(e)}</div>`).join('')}${x.warnings.map((w) => `<div class="muted">${esc(w)}</div>`).join('')}</td></tr>`; }).join('') || '<tr><td colspan="6"><div class="empty">No hay filas en esta vista.</div></td></tr>'}
    </tbody></table></div>
    ${shown.length > 400 ? `<p class="muted small">Se muestran 400 de ${shown.length} filas; se aplican todas las seleccionadas.</p>` : ''}
    <div class="row" style="margin-top:14px"><span class="muted small">${selCount} filas seleccionadas · los errores no se pueden aplicar</span><span class="spacer"></span><button class="btn pri" id="im-apply" ${selCount && !missingKey ? '' : 'disabled'}>${ic('check')} Aplicar ${selCount} cambios</button></div>
  </div>`;
};
function imHistory() {
  const h = S.imports || [];
  if (!h.length) return '';
  return `<div class="card"><div class="card-h"><h2>Importaciones anteriores</h2></div><div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Archivo</th><th>Usuario</th><th class="n">Nuevos</th><th class="n">Actualizados</th><th class="n">Stock</th><th class="n">Omitidos</th></tr></thead><tbody>${h.slice(0, 15).map((x) => `<tr><td class="small">${fdt(x.ts)}</td><td>${esc(x.file)}<span class="sub">${esc(x.sheet)}</span></td><td class="small">${esc(x.user)}</td><td class="n num">${x.nuevos}</td><td class="n num">${x.actualizados}</td><td class="n num">${x.stock}</td><td class="n num">${x.omitidos}</td></tr>`).join('')}</tbody></table></div></div>`;
}
async function imApply() {
  const items = IM.plan.items.filter((x) => IM.sel.has(x.row) && (x.action === 'nuevo' || x.action === 'actualizar'));
  if (!items.length) return;
  const ok = await ask({ title: 'Aplicar importación', text: `Se crearán <b>${items.filter((x) => x.action === 'nuevo').length}</b> productos y se actualizarán <b>${items.filter((x) => x.action === 'actualizar').length}</b>.${items.some((x) => x.stock) ? ` ${items.filter((x) => x.stock).length} cambios de stock se registrarán como ${IM.opt.stockMode === 'conteo' ? 'conteo físico' : 'ajuste'}.` : ''}`, label: 'Aplicar' });
  if (!ok) return;
  if (S.settings.mode === 'api') {
    try { const r = await remote.req('/api/v1/products/import', { method: 'POST', body: { rows: IM.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? iso(v) : v]))), mapping: IM.mapping, options: IM.opt, apply: items.map((x) => x.row) } }); await remote.load(); IM.done = { ...r.summary, file: IM.file.name, sheet: IM.sheet, stockMode: IM.opt.stockMode }; render(); toast('Importación aplicada'); }
    catch (e) { toast('No se pudo importar: ' + e.message); }
    return;
  }
  const supMap = {};
  for (const name of IM.plan.newSuppliers) if (IM.opt.createSuppliers && items.some((x) => x.data.newSupplier === name)) { const s = act.saveSupplier({ name, taxId: '', phone: '', contact: '', notes: `Creado al importar ${IM.file.name}` }); s.leadDays = 2; supMap[name] = s.id; }
  let nuevos = 0, actualizados = 0, stock = 0;
  const counts = [], ts = new Date().toISOString();
  for (const x of items) {
    const d = { ...x.data }; const sid = d.newSupplier ? supMap[d.newSupplier] : d.supplierId; delete d.newSupplier; delete d.stock;
    if (x.action === 'nuevo') {
      const p = { code: d.code || nextCode(d.category, S.products), barcode: '', name: d.name, aliases: [], description: '', category: d.category, kind: d.kind, unit: d.unit, stockInit: x.data.stock || 0, stockMin: 0, stockMax: null, avgCost: 0, lastPrice: 0, salePrice: 0, supplierId: null, location: '', expiresAt: null, photo: null, notes: `Importado de ${IM.file.name}`, packSize: 1, ...d, supplierId: sid || null };
      act.saveProduct(p); nuevos++;
    } else {
      const cur = prodById(x.productId); const upd = { ...cur };
      for (const c of x.changes) { if (c.field === 'newSupplier') upd.supplierId = sid; else if (c.field !== 'supplierId') upd[c.field] = d[c.field]; else upd.supplierId = d.supplierId; }
      if (x.changes.length) { act.saveProduct(upd); actualizados++; }
      if (x.stock) {
        stock++;
        if (x.stock.mode === 'conteo') counts.push({ productId: x.productId, qty: x.stock.to });
        else act.addMovement({ productId: x.productId, qty: Math.abs(x.stock.diff), type: x.stock.diff > 0 ? 'ajuste_pos' : 'ajuste_neg', source: 'sistema', reason: `Ajuste por importación de ${IM.file.name} (fila ${x.row})`, evidence: IM.file.name }, { approve: can('movimientos.aprobar'), silent: true });
        if (!x.changes.length) actualizados++;
      }
    }
  }
  if (counts.length) { for (const c of counts) S.counts.push({ id: uid('cf'), productId: c.productId, qty: c.qty, ts, countedBy: `${me().name} (importación)`, sessionId: 'IMP-' + Date.now() }); runRecon(); }
  const rec = { ts, file: IM.file.name, sheet: IM.sheet, user: me().name, nuevos, actualizados, stock, omitidos: IM.plan.items.length - items.length, stockMode: IM.opt.stockMode };
  (S.imports ||= []).unshift(rec);
  log('productos.importar', `${IM.file.name}: ${nuevos} nuevos, ${actualizados} actualizados, ${stock} cambios de stock (${IM.opt.stockMode})`);
  IM.done = rec; save(); render(); toast('Importación aplicada');
}
function imWorkbook(kind) {
  const head = TEMPLATE_COLUMNS.map((k) => IMPORT_FIELDS[k]);
  const st = stockMap();
  const rowOf = (p) => TEMPLATE_COLUMNS.map((k) => k === 'stock' ? st[p.id] ?? 0 : k === 'supplier' ? supById(p.supplierId)?.name || '' : k === 'aliases' ? (p.aliases || []).join(', ') : k === 'expiresAt' ? p.expiresAt || '' : p[k] ?? '');
  const data = kind === 'catalogo' ? S.products.filter((p) => p.kind !== 'activo' || true).map(rowOf) : [
    ['BEB-010', '7702004003508', 'Agua con gas 600 ml', 'Bebidas', 'consumible', 'botella', 24, 12, 48, 1600, 1650, 4500, 'Coca-Cola FEMSA', 'Bar · nevera 2', '', 12, 'soda, agua con gas', 'activo', '', ''],
    ['ASE-010', '', 'Cloro 3,8 L', 'Productos de aseo', 'consumible', 'galón', 6, 2, 10, 14500, 14900, 0, 'Aseo Total SAS', 'Cuarto de aseo', '', 1, 'cloro, blanqueador', 'activo', '', 'Diluir 1:20'],
    ['ALI-020', '', 'Mermelada de mora 250 g', 'Alimentos', 'consumible', 'frasco', 10, 4, 20, 6200, 6200, 0, 'Mercados del Puerto', 'Cocina · despensa', '15/03/2027', 1, 'mermelada', 'activo', '', ''],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([head, ...data]);
  ws['!cols'] = head.map((h, i) => ({ wch: Math.max(10, Math.min(36, Math.max(h.length, ...data.slice(0, 50).map((r) => String(r[i] ?? '').length)) + 2)) }));
  ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(head.length - 1)}1` };
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  const help = [['Columna', 'Qué escribir'], ...TEMPLATE_COLUMNS.map((k) => [IMPORT_FIELDS[k], { code: 'Código único (ej. BEB-001). Vacío = se asigna uno.', name: 'Obligatorio para productos nuevos.', category: cats().join(', '), kind: 'consumible, menaje, activo o servicio', unit: 'unidad, botella, kg, L, caja, paquete…', stock: 'Cantidad que hay hoy. En productos existentes se registra como conteo o ajuste.', avgCost: 'Costo en pesos. En existentes solo se reemplaza si lo activas al importar.', salePrice: 'Precio al público en pesos (para Facturación).', supplier: 'Nombre del proveedor. Si no existe, se puede crear.', expiresAt: 'dd/mm/aaaa', aliases: 'Cómo lo llama el equipo por WhatsApp, separados por coma.', packSize: 'Unidades por empaque de compra (24 para una canasta).', status: 'activo o inactivo' }[k] || '']), [], ['Las celdas vacías no borran datos existentes.']];
  const wh = XLSX.utils.aoa_to_sheet(help); wh['!cols'] = [{ wch: 28 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wh, 'Instrucciones');
  return { wb, data };
}
async function imDownload(kind) {
  if (!window.XLSX) return toast('No se pudo cargar el generador de Excel.');
  const { wb } = imWorkbook(kind);
  const filename = kind === 'catalogo' ? `catalogo-capybara-${iso(Date.now())}.xlsx` : 'plantilla-productos-capybara.xlsx';
  const dl = await getDownloads();
  if (dl) {
    try { await dl.save({ filename, data: new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })) }); toast('Archivo listo'); return; }
    catch (e) { if (e.code === 'declined') return; if (!['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e.code)) return toast('No se pudo descargar: ' + (e.message || e.code)); }
  }
  // respaldo: copiar como tabla para pegar en Excel o Sheets
  const tsv = XLSX.utils.sheet_to_csv(wb.Sheets.Productos, { FS: '\t' });
  navigator.clipboard.writeText(tsv).then(() => toast('La descarga no está disponible aquí: copié la tabla, pégala en Excel o Google Sheets.'), () => toast('La descarga no está disponible en esta vista.'));
}
BIND.importar = (el) => {
  if (innerWidth < 1000) $('#im-grid', el)?.style.setProperty('grid-template-columns', '1fr');
  $('#im-again', el)?.addEventListener('click', () => { IM.file = null; IM.done = null; IM.plan = null; render(); });
  $('#im-tpl', el)?.addEventListener('click', () => imDownload('plantilla'));
  $('#im-exp', el)?.addEventListener('click', () => imDownload('catalogo'));
  const fi = $('#im-file', el); if (fi) fi.onchange = () => fi.files[0] && imRead(fi.files[0]);
  const dz = $('#im-drop', el);
  if (dz) {
    ['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) imRead(f); });
  }
  if (!IM.plan || IM.done || !IM.file) return;
  $('#im-reset', el).onclick = () => { IM.file = null; IM.plan = null; render(); };
  $('#im-sheet', el)?.addEventListener('change', (e) => { imSetSheet(e.target.value); render(); });
  $('#im-hr', el).onchange = (e) => { imSetHeader(+e.target.value); render(); };
  $$('[data-map]', el).forEach((s) => (s.onchange = () => { const f = s.value; if (f) for (const h in IM.mapping) if (IM.mapping[h] === f) IM.mapping[h] = ''; IM.mapping[s.dataset.map] = f; imPlan(); render(); }));
  $$('[data-mb]', el).forEach((c) => (c.onchange = () => { const k = c.dataset.mb; IM.opt.matchBy = ['code', 'barcode', 'name'].filter((x) => (x === k ? c.checked : IM.opt.matchBy.includes(x))); imPlan(); render(); }));
  $$('input[name="im-sm"]', el).forEach((r) => (r.onchange = () => { IM.opt.stockMode = r.value; imPlan(); render(); }));
  $('#im-cost', el).onchange = (e) => { IM.opt.updateAvgCost = e.target.checked; imPlan(); render(); };
  $('#im-sup', el).onchange = (e) => { IM.opt.createSuppliers = e.target.checked; imPlan(); render(); };
  $('#im-cat', el).onchange = (e) => { IM.opt.defaultCategory = e.target.value; imPlan(); render(); };
  $$('[data-imf]', el).forEach((b) => (b.onclick = () => { IM.filter = b.dataset.imf; render(); }));
  $$('[data-ims]', el).forEach((c) => (c.onchange = () => { c.checked ? IM.sel.add(+c.dataset.ims) : IM.sel.delete(+c.dataset.ims); render(); }));
  $('#im-all', el).onchange = (e) => { IM.sel = new Set(e.target.checked ? IM.plan.items.filter((x) => x.action === 'nuevo' || x.action === 'actualizar').map((x) => x.row) : []); render(); };
  $('#im-apply', el).onclick = imApply;
};

