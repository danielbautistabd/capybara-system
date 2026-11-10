/* ================= Capybara Control · app (4/4): Drive, conciliación, proveedores, gastos, bitácora, API ================= */

/* ---------------- Google Drive / Sheets ---------------- */
const FIELDS = { '': '— No importar —', ts: 'Fecha', product: 'Producto', qty: 'Cantidad', unit: 'Unidad', type: 'Tipo de movimiento', responsible: 'Responsable', area: 'Área', invoice: 'Número de factura', unitCost: 'Costo unitario', reason: 'Motivo', supplier: 'Proveedor' };
const DEC = {};
RENDER.drive = () => {
  const sh = S.sheet, pv = sh.preview;
  return `
  <div class="grid g2" style="align-items:start">
    <div class="card"><div class="card-h"><h2>Archivo conectado</h2><span class="spacer"></span>${pill(S.settings.mode === 'api' ? 'Cuenta de servicio' : 'Ejemplo', S.settings.mode === 'api' ? 'p-ok' : 'p-warn')}</div>
      <div class="li"><span class="thumb" style="background:var(--ok-bg);color:var(--ok)">${ic('drive').replace('<svg', '<svg style="width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.7"')}</span><span class="grow"><b>${esc(sh.file.name)}</b><span class="small muted">${esc(sh.file.type)} · modificado ${fdt(sh.file.modified)}</span></span></div>
      <div class="grid g3" style="margin-top:10px">
        <div class="field"><label for="dr-tab">Hoja</label><select class="in" id="dr-tab">${['Movimientos', 'Productos', 'Compras', 'Gastos', 'Conteos'].map((t) => opt(t, t, sh.tab)).join('')}</select></div>
        <div class="field"><label for="dr-hr">Fila de encabezados</label><input class="in" type="number" min="1" id="dr-hr" value="${sh.headerRow}"></div>
        <div class="field"><label for="dr-cron">Sincronización automática</label><select class="in" id="dr-cron">${[['manual', 'Solo manual'], ['*/30 * * * *', 'Cada 30 minutos'], ['0 * * * *', 'Cada hora'], ['0 7,15,23 * * *', '3 veces al día (cambio de turno)'], ['0 23 * * *', 'Diaria, 11 p. m.']].map(([v, l]) => opt(v, l, sh.cron)).join('')}</select></div>
      </div>
      <button class="btn hero" id="dr-sync" style="margin-top:14px;width:100%">${ic('sync')} ACTUALIZAR DATOS DESDE DRIVE</button>
      <ol class="steps muted" style="margin-top:12px"><li>Consulta el archivo autorizado</li><li>Detecta filas nuevas o modificadas</li><li>Las compara con la base de datos y con WhatsApp</li><li>Muestra la vista previa y pide aprobación si hay inconsistencias</li><li>Actualiza el inventario solo después de validar</li></ol>
    </div>
    <div class="card"><div class="card-h"><h2>Relación de columnas</h2><span class="muted small">columna del archivo → campo del sistema</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Columna</th><th>Campo</th><th>Ejemplo</th></tr></thead><tbody>${sh.headers.map((h, j) => `<tr><td><b>${esc(h)}</b></td><td><select class="in" data-map="${esc(h)}">${Object.entries(FIELDS).map(([k, l]) => opt(k, l, sh.mapping[h] || '')).join('')}</select></td><td class="small muted">${esc(sh.rows[1]?.[j] ?? '')}</td></tr>`).join('')}</tbody></table></div>
    </div>
  </div>
  ${pv ? `<div class="card"><div class="card-h"><h2>Vista previa · ${fdt(pv.ts)}</h2><span class="spacer"></span>
      ${pill(`${pv.stats.nuevas} nuevas`, 'p-info')} ${pill(`${pv.stats.modificadas} modificadas`, 'p-warn')} ${pill(`${pv.stats.sinCambios} sin cambios`, 'p-mut')} ${pill(`${pv.stats.coincidenWhatsApp} coinciden con WhatsApp`, 'p-ok')} ${pill(`${pv.stats.errores} con error`, 'p-bad')}</div>
    ${pv.rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Fila</th><th>Estado</th><th>Dato original</th><th>Producto en el sistema</th><th class="n">Cant.</th><th>Cruce con otras fuentes</th><th>Decisión</th></tr></thead><tbody>
      ${pv.rows.map((r) => { DEC[r.i] ||= { action: r.action === 'revisar' ? 'ignorar' : r.action, productId: r.product?.id || '', approve: true };
        return `<tr class="sev ${r.issues.length ? 'sev-bad' : r.dups.length ? 'sev-warn' : 'sev-ok'}"><td class="mono">${r.rowNumber}</td><td>${pill(r.state === 'nuevo' ? 'Nueva' : 'Modificada', r.state === 'nuevo' ? 'p-info' : 'p-warn')}</td>
        <td class="small" style="max-width:280px">${Object.entries(r.raw).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `<span class="muted">${esc(k)}:</span> ${esc(v)}`).join(' · ')}</td>
        <td>${r.product ? `<b>${esc(r.product.name)}</b><span class="sub">${MOVEMENT_TYPES[r.mapped.type]?.label} · coincidencia ${Math.round(r.product.score * 100)} %</span>` : `<select class="in" data-dp="${r.i}" style="min-width:180px">${opt('', 'Elegir producto…')}${prodOptions(DEC[r.i].productId)}</select>`}${r.issues.map((x) => `<span class="sub neg">${esc(x)}</span>`).join('')}</td>
        <td class="n num">${Number.isFinite(r.mapped.qty) ? num(r.mapped.qty) : '—'}</td>
        <td class="small">${r.dups.length ? r.dups.map((d) => `${pill(SOURCES[d.source] || d.source, d.score >= 0.9 ? 'p-info' : 'p-mut')} <span class="muted">${esc(d.reason)} · ${Math.round(d.score * 100)} % · ${STATUS_MV[d.status]?.[0] || ''}</span>`).join('<br>') : '<span class="muted">Sin coincidencias</span>'}</td>
        <td><select class="in" data-da="${r.i}">${opt('crear', 'Crear movimiento', DEC[r.i].action)}${r.dups.length ? opt('vincular', 'Vincular al existente (no duplicar)', DEC[r.i].action) : ''}${opt('ignorar', 'Ignorar fila', DEC[r.i].action)}</select><label class="small row" style="margin-top:4px;gap:4px"><input type="checkbox" data-dap="${r.i}" ${DEC[r.i].approve ? 'checked' : ''}> aprobar al aplicar</label></td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="row" style="margin-top:12px"><span class="muted small">Se guarda una copia literal de cada fila importada para auditoría.</span><span class="spacer"></span><button class="btn pri" id="dr-apply">${ic('check')} Aplicar decisiones</button></div>` : '<div class="empty">No hay filas nuevas ni modificadas. El archivo está al día.</div>'}
  </div>` : ''}
  <div class="card"><div class="card-h"><h2>Historial de sincronizaciones</h2></div><div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Origen</th><th class="n">Leídas</th><th class="n">Nuevas</th><th class="n">Modificadas</th><th class="n">Errores</th></tr></thead><tbody>
    ${sh.history.slice(0, 12).map((h) => `<tr><td class="small">${fdt(h.ts)}</td><td>${esc(h.trigger)}</td><td class="n num">${h.stats.leidas}</td><td class="n num">${h.stats.nuevas}</td><td class="n num">${h.stats.modificadas}</td><td class="n num">${h.stats.errores}</td></tr>`).join('')}
  </tbody></table></div></div>`;
};
BIND.drive = (el) => {
  const sh = S.sheet;
  $('#dr-tab', el).onchange = (e) => { sh.tab = e.target.value; save(); };
  $('#dr-hr', el).onchange = (e) => { sh.headerRow = +e.target.value || 1; save(); };
  $('#dr-cron', el).onchange = (e) => { sh.cron = e.target.value; log('sheets.programar', e.target.selectedOptions[0].textContent); save(); toast('Programación guardada'); };
  $$('[data-map]', el).forEach((s) => (s.onchange = () => { sh.mapping[s.dataset.map] = s.value; save(); }));
  $('#dr-sync', el).onclick = async () => {
    const b = $('#dr-sync', el); b.classList.add('spin'); b.disabled = true;
    try {
      if (S.settings.mode === 'api') { const srcs = await remote.req('/api/v1/sheets/sources'); if (!srcs.length) throw new Error('No hay archivos configurados en el backend'); const r = await remote.req(`/api/v1/sheets/sources/${srcs[0].id}/preview`, { method: 'POST' }); sh.preview = { ts: new Date().toISOString(), stats: r.stats, rows: r.preview.map((x, i) => ({ i, rowNumber: x.rowNumber, state: x.state, raw: x.raw, mapped: x.mapped, product: x.product, issues: x.issues, dups: x.duplicates.map((d) => ({ id: d.movementId, ...d })), action: x.suggestion === 'vincular_existente' ? 'vincular' : x.suggestion, importRowId: x.importRowId })) }; }
      else { await new Promise((r) => setTimeout(r, 500)); previewSheet(); }
      for (const k in DEC) delete DEC[k]; save(); render();
    } catch (e) { toast(e.message); b.classList.remove('spin'); b.disabled = false; }
  };
  $$('[data-da]', el).forEach((s) => (s.onchange = () => (DEC[s.dataset.da].action = s.value)));
  $$('[data-dap]', el).forEach((s) => (s.onchange = () => (DEC[s.dataset.dap].approve = s.checked)));
  $$('[data-dp]', el).forEach((s) => (s.onchange = () => { DEC[s.dataset.dp].productId = s.value; if (s.value) { DEC[s.dataset.dp].action = 'crear'; const r = sh.preview.rows.find((x) => x.i === +s.dataset.dp); r.issues = r.issues.filter((x) => !x.startsWith('Producto')); } render(); }));
  $('#dr-apply', el)?.addEventListener('click', async () => {
    const decisions = sh.preview.rows.map((r) => ({ i: r.i, ...DEC[r.i] })).filter((d) => { const r = sh.preview.rows.find((x) => x.i === d.i); return !(d.action === 'crear' && (!d.productId || r.issues.length)); });
    if (S.settings.mode === 'api') { await remote.req('/api/v1/sheets/apply', { method: 'POST', body: { decisions: decisions.map((d) => ({ importRowId: sh.preview.rows.find((r) => r.i === d.i).importRowId, action: d.action === 'vincular' ? 'vincular_existente' : d.action, movementId: sh.preview.rows.find((r) => r.i === d.i).dups[0]?.id, productId: d.productId || undefined, approve: d.approve })) } }); await remote.load(); sh.preview.rows = []; }
    else { const r = applySheet(decisions); toast(`${r.created} creados · ${r.linked} vinculados · ${r.ignored} ignorados`); }
    for (const k in DEC) delete DEC[k]; runRecon(); save(); render();
  });
};

/* ---------------- Conciliación ---------------- */
let RC = { st: '' };
RENDER.conciliacion = () => {
  if (!S.recon) runRecon();
  const R = S.recon, t = R.totals;
  const rows = R.rows.filter((r) => !RC.st || r.status === RC.st).sort((a, b) => (a.valor || 0) - (b.valor || 0) || String(a.status).localeCompare(b.status));
  const T = (l) => `<span class="t">${l}</span>`, O = (o) => `<span class="op">${o}</span>`;
  return `
  <div class="formula" aria-label="Fórmula">${T('Inventario inicial')}${O('+')}${T('Entradas aprobadas')}${O('+')}${T('Devoluciones')}${O('−')}${T('Salidas')}${O('−')}${T('Marchados')}${O('−')}${T('Daños')}${O('−')}${T('Vencimientos')}${O('−')}${T('Pérdidas')}${O('=')}<span class="t res">Inventario teórico</span>${O('↔')}${T('Conteo físico')}</div>
  <div class="kpis">
    <div class="kpi ${t.perdida ? 'alert' : ''}"><span class="k">Pérdida estimada</span><span class="v">${money(-t.perdida)}</span><span class="s">faltantes al costo promedio</span></div>
    <div class="kpi"><span class="k">Sobrantes</span><span class="v">${money(t.sobrante)}</span><span class="s">físico mayor al teórico</span></div>
    <div class="kpi"><span class="k">Productos conciliados</span><span class="v">${R.rows.filter((r) => r.status !== 'no_registrado').length}</span><span class="s">corte: conteo físico más reciente</span></div>
    <div class="kpi"><span class="k">Última ejecución</span><span class="v" style="font-size:.95rem;white-space:normal">${fdt(R.ts)}</span><span class="s"><button class="btn sm" id="rc-run" style="margin-top:4px">${ic('sync')} Volver a conciliar</button></span></div>
  </div>
  <div class="row"><button class="btn sm ${!RC.st ? 'pri' : ''}" data-rs="">Todos · ${R.rows.length}</button>${Object.entries(RECON_STATUS).map(([k, v]) => (t[k] ? `<button class="btn sm ${RC.st === k ? 'pri' : ''}" data-rs="${k}">${v} · ${t[k]}</button>` : '')).join('')}</div>
  <div class="tbl-wrap"><table><thead><tr><th>Producto</th><th class="n">Inicial</th><th class="n">+ Entradas</th><th class="n">+ Dev.</th><th class="n">− Salidas</th><th class="n">− Marchados</th><th class="n">− Daños</th><th class="n">− Venc.</th><th class="n">− Pérd.</th><th class="n">Teórico</th><th class="n">Físico</th><th class="n">Diferencia</th><th class="n">Valor</th><th>Estado</th><th></th></tr></thead><tbody>
  ${rows.map((r) => { const sev = ['importante', 'sin_respaldo'].includes(r.status) ? 'sev-bad' : ['menor', 'duplicado'].includes(r.status) ? 'sev-warn' : r.status === 'coincide' ? 'sev-ok' : '';
    if (r.status === 'no_registrado') return `<tr class="sev"><td colspan="13"><b>${esc(r.name)}</b><span class="sub">Aparece en ${esc(SOURCES[r.source] || r.source)} pero no existe en el catálogo</span></td><td>${pill(RECON_STATUS[r.status], RECON_PILL[r.status])}</td><td><button class="btn sm" data-newp="${esc(r.name)}">Crear producto</button></td></tr>`;
    const salidas = (r.salidas || 0) + (r.consumos || 0) + (r.cortesias || 0);
    return `<tr class="sev ${sev}"><td><b>${esc(r.name)}</b><span class="sub">${esc(r.category)} · ${esc(r.unit)}${r.duplicates?.length ? ' · ' + r.duplicates.length + ' posible duplicado' : ''}${r.sinRespaldo ? ` · ${r.sinRespaldo} sin respaldo` : ''}</span></td>
    <td class="n num">${num(r.inicial)}</td><td class="n num">${num(r.entradas)}</td><td class="n num">${num(r.devoluciones)}</td><td class="n num">${num(salidas)}</td><td class="n num">${num(r.marchados)}</td><td class="n num">${num(r.danos)}</td><td class="n num">${num(r.vencidos)}</td><td class="n num">${num(r.perdidas)}</td>
    <td class="n num"><b>${num(r.teorico)}</b></td><td class="n num">${r.fisico == null ? '—' : num(r.fisico)}</td>
    <td class="n num ${r.diferencia < 0 ? 'neg' : r.diferencia > 0 ? 'pos' : ''}">${r.diferencia == null ? '—' : (r.diferencia > 0 ? '+' : '') + num(r.diferencia)}</td>
    <td class="n num ${r.valor < 0 ? 'neg' : ''}">${r.valor ? money(r.valor) : '—'}</td><td>${pill(RECON_STATUS[r.status], RECON_PILL[r.status])}</td>
    <td><div class="actions" style="flex-wrap:nowrap">${r.diferencia ? `<button class="btn sm" data-adj="${r.productId}" title="Crear ajuste para igualar al físico">Ajustar</button>` : ''}<button class="btn sm" data-kx="${r.productId}" title="Historial">${ic('hist')}</button></div></td></tr>`; }).join('')}
  </tbody></table></div>
  <p class="muted small" style="margin:0">Diferencia menor: hasta ±1 unidad o 5 % del teórico. Movimiento duplicado: dos registros del mismo hecho desde fuentes distintas. Sin respaldo: salidas reportadas por WhatsApp aprobadas sin evidencia. Solo cuentan movimientos aprobados hasta la hora del conteo.</p>`;
};
BIND.conciliacion = (el) => {
  $('#rc-run', el).onclick = () => { runRecon(); save(); render(); toast('Conciliación actualizada'); };
  $$('[data-rs]', el).forEach((b) => (b.onclick = () => { RC.st = b.dataset.rs; render(); }));
  $$('[data-kx]', el).forEach((b) => (b.onclick = () => kardex(b.dataset.kx)));
  $$('[data-newp]', el).forEach((b) => (b.onclick = () => productForm(null)));
  $$('[data-adj]', el).forEach((b) => (b.onclick = async () => {
    const r = S.recon.rows.find((x) => x.productId === b.dataset.adj);
    const reason = await ask({ title: `Ajustar ${esc(r.name)}`, text: `Se creará un <b>ajuste (${r.diferencia > 0 ? '+' : '−'}) de ${num(Math.abs(r.diferencia))} ${esc(r.unit)}</b> pendiente de aprobación, por ${money(Math.abs(r.valor))}. Revisa primero los duplicados y movimientos sin respaldo.`, input: 'Motivo del ajuste', label: 'Crear ajuste' });
    if (!reason) return;
    await run('addMovement', { productId: r.productId, qty: Math.abs(r.diferencia), type: r.diferencia > 0 ? 'ajuste_pos' : 'ajuste_neg', source: 'conteo', reason: `Ajuste por conciliación: ${reason}`, ts: r.countTs }, { approve: false });
    toast('Ajuste creado: apruébalo en Productos marchados');
  }));
};

/* ---------------- Proveedores ---------------- */
function supplierForm(s = null, cb) {
  s = s || { name: '', taxId: '', phone: '', email: '', contact: '', notes: '' };
  const m = modal({ title: s.id ? 'Editar proveedor' : 'Nuevo proveedor', body: `<div class="grid g2">${[['name', 'Razón social'], ['taxId', 'NIT'], ['contact', 'Contacto'], ['phone', 'Teléfono / WhatsApp'], ['email', 'Correo']].map(([k, l]) => `<div class="field"><label for="sf-${k}">${l}</label><input class="in" id="sf-${k}" value="${esc(s[k] || '')}"></div>`).join('')}<div class="field"><label for="sf-notes">Observaciones</label><input class="in" id="sf-notes" value="${esc(s.notes || '')}"></div></div>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="sf-ok">${ic('check')} Guardar</button>` });
  m.querySelector('#sf-ok').onclick = async () => { const o = { ...s }; ['name', 'taxId', 'contact', 'phone', 'email', 'notes'].forEach((k) => (o[k] = m.querySelector('#sf-' + k).value.trim())); if (!o.name) { toast('Escribe el nombre del proveedor.'); return; } closeModal(); if (S.settings.mode === 'demo') { const r = act.saveSupplier(o); save(); cb ? cb(r) : render(); } else { await run('saveSupplier', o); cb?.(S.suppliers.find((x) => x.name === o.name)); } toast('Proveedor guardado'); };
}
RENDER.proveedores = () => {
  const month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const rows = S.suppliers.map((s) => { const ps = S.purchases.filter((p) => p.supplierId === s.id && p.status === 'aprobada'); return { s, n: ps.length, total: ps.reduce((a, p) => a + p.total, 0), mes: ps.filter((p) => new Date(p.purchasedAt + 'T12:00') >= month).reduce((a, p) => a + p.total, 0), last: ps.map((p) => p.purchasedAt).sort().pop(), prods: S.products.filter((p) => p.supplierId === s.id).length }; }).sort((a, b) => b.total - a.total);
  return `<div class="row"><span class="muted small">${S.suppliers.length} proveedores</span><span class="spacer"></span><button class="btn pri" id="sp-new">${ic('plus')} Nuevo proveedor</button></div>
  <div class="tbl-wrap"><table><thead><tr><th>Proveedor</th><th>NIT</th><th>Contacto</th><th class="n">Productos</th><th class="n">Compras</th><th class="n">Este mes</th><th class="n">Histórico</th><th>Última compra</th><th></th></tr></thead><tbody>
  ${rows.map(({ s, n, total, mes, last, prods }) => `<tr><td><b>${esc(s.name)}</b></td><td class="mono small">${esc(s.taxId || '—')}</td><td class="small">${esc(s.contact || '')}<span class="sub">${esc(s.phone || '')}</span></td><td class="n num">${prods}</td><td class="n num">${n}</td><td class="n num">${money(mes)}</td><td class="n num">${money(total)}</td><td class="small">${last ? fdate(last + 'T12:00') : '—'}</td><td><button class="btn sm" data-se="${s.id}">${ic('edit')}</button></td></tr>`).join('')}
  </tbody></table></div>`;
};
BIND.proveedores = (el) => { $('#sp-new', el).onclick = () => supplierForm(); $$('[data-se]', el).forEach((b) => (b.onclick = () => supplierForm(supById(b.dataset.se)))); };

/* ---------------- Gastos ---------------- */
RENDER.gastos = () => {
  const list = [...S.expenses].sort((a, b) => b.date.localeCompare(a.date));
  const month = iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const tm = list.filter((e) => e.date >= month && e.status !== 'anulado').reduce((a, e) => a + e.amount, 0);
  return `<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);align-items:start" id="gx-grid">
  <div class="card"><div class="card-h"><h2>Registrar gasto</h2></div>
    <div class="grid g2"><div class="field"><label for="gx-d">Fecha</label><input type="date" class="in" id="gx-d" value="${iso(Date.now())}"></div><div class="field"><label for="gx-c">Categoría</label><select class="in" id="gx-c">${EXP_CATS.map((c) => opt(c, c)).join('')}</select></div></div>
    <div class="field" style="margin-top:8px"><label for="gx-t">Descripción</label><input class="in" id="gx-t" placeholder="Ej.: gas propano cocina"></div>
    <div class="grid g2" style="margin-top:8px"><div class="field"><label for="gx-a">Valor (COP)</label><input class="in num" type="number" min="0" step="100" id="gx-a"></div><div class="field"><label for="gx-p">Forma de pago</label><select class="in" id="gx-p">${PAY.map((p) => opt(p, p)).join('')}</select></div></div>
    <div class="grid g2" style="margin-top:8px"><div class="field"><label for="gx-s">Proveedor</label><select class="in" id="gx-s">${opt('', '—')}${S.suppliers.map((s) => opt(s.id, s.name)).join('')}</select></div><div class="field"><label for="gx-f">Comprobante</label><input type="file" class="in" id="gx-f" accept="image/*,application/pdf"></div></div>
    <button class="btn pri" id="gx-ok" style="margin-top:12px;width:100%">${ic('check')} Registrar gasto</button></div>
  <div class="card"><div class="card-h"><h2>Gastos</h2><span class="spacer"></span><span class="muted small">Este mes: <b class="num">${money(tm)}</b></span></div>
    <div class="tbl-wrap" style="max-height:520px;overflow:auto"><table><thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th class="n">Valor</th><th>Pago</th><th>Fuente</th></tr></thead><tbody>
    ${list.map((e) => `<tr><td class="small">${fdate(e.date + 'T12:00')}</td><td>${esc(e.category)}</td><td>${esc(e.description)}${e.attachment ? ' <span class="tag">comprobante</span>' : ''}</td><td class="n num">${money(e.amount)}</td><td class="small">${esc(e.payMethod)}</td><td class="small">${esc(SOURCES[e.source] || e.source)}</td></tr>`).join('')}
    </tbody></table></div></div></div>`;
};
BIND.gastos = (el) => {
  if (innerWidth < 1000) $('#gx-grid', el).style.gridTemplateColumns = '1fr';
  $('#gx-ok', el).onclick = async () => { const g = (k) => $('#gx-' + k, el).value.trim(); if (!g('t') || !(+g('a') > 0)) { toast('Escribe la descripción y un valor mayor que cero.'); return; } const f = await readFile($('#gx-f', el)); await run('saveExpense', { date: g('d'), category: g('c'), description: g('t'), amount: +g('a'), payMethod: g('p'), supplierId: g('s') || null, source: 'manual', attachment: f?.name || null }); toast('Gasto registrado'); };
};

/* ---------------- Bitácora ---------------- */
let BQ = '';
RENDER.bitacora = () => {
  const l = S.audit.filter((a) => !BQ || normalize(`${a.action} ${a.detail} ${a.user}`).includes(normalize(BQ)));
  return `<div class="row"><input class="in" id="bq" placeholder="Buscar en la bitácora" value="${esc(BQ)}" style="max-width:360px"><span class="muted small">${l.length} registros · los registros no se pueden editar ni borrar</span></div>
  <div class="tbl-wrap"><table><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>
  ${l.slice(0, 300).map((a) => `<tr><td class="small mono">${fdt(a.ts)}</td><td class="small">${esc(a.user)}</td><td><span class="tag mono">${esc(a.action)}</span></td><td class="small">${esc(a.detail)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">Sin registros</div></td></tr>'}
  </tbody></table></div>`;
};
BIND.bitacora = (el) => { const q = $('#bq', el); q.oninput = () => { BQ = q.value; render(); const n = $('#bq'); n.focus(); n.setSelectionRange(BQ.length, BQ.length); }; };

/* ---------------- Integraciones y API ---------------- */
const ENDPOINTS = [
  ['GET', '/health', 'Estado del servicio'], ['POST', '/api/v1/auth/login', 'Iniciar sesión → token JWT'], ['GET', '/api/v1/dashboard', 'Indicadores del tablero'], ['GET', '/api/v1/dashboard/series', 'Series para gráficos'],
  ['GET · POST · PATCH', '/api/v1/products', 'Catálogo de productos'], ['GET', '/api/v1/products/{id}/history', 'Kardex'], ['GET · POST', '/api/v1/movements', 'Movimientos (sin DELETE)'],
  ['POST', '/api/v1/movements/{id}/approve | reject | duplicate | request-info | void', 'Revisión y anulación'], ['POST', '/api/v1/marchados/interpret', 'Intérprete de “marchar”'], ['POST', '/api/v1/counts', 'Conteo físico'],
  ['GET · POST', '/api/v1/purchases', 'Entradas y compras'], ['POST', '/api/v1/purchases/{id}/approve', 'Aprobar entrada'], ['GET · POST', '/api/v1/expenses', 'Gastos'], ['GET · POST', '/api/v1/suppliers', 'Proveedores'],
  ['POST', '/api/v1/attachments?extract=true', 'Subir factura y leerla con IA'], ['GET · POST', '/webhooks/whatsapp', 'Webhook de WhatsApp Business'], ['GET', '/api/v1/whatsapp/inbox', 'Bandeja de WhatsApp'],
  ['GET', '/api/v1/sheets/files', 'Archivos de Drive'], ['POST', '/api/v1/sheets/sources/{id}/preview', 'ACTUALIZAR DATOS DESDE DRIVE'], ['POST', '/api/v1/sheets/apply', 'Aplicar vista previa'],
  ['POST', '/api/v1/reconciliation/run', 'Conciliar'], ['POST', '/api/v1/sync-and-reconcile', 'ACTUALIZAR Y CONCILIAR INFORMACIÓN'], ['POST', '/api/v1/reports/export', 'Exportar a Google Sheets'], ['GET', '/api/v1/audit', 'Bitácora'],
];
RENDER.integraciones = () => {
  const s = S.settings, base = s.baseUrl || 'https://control.capybarahostel.com';
  return `
  <div class="grid g2" style="align-items:start">
    ${cl.active ? `<div class="card" style="grid-column:1/-1"><div class="card-h"><h2>Datos en Claude</h2><span class="spacer"></span><span id="cloud-st">${cl.statusHtml()}</span></div>
      <p class="small" style="margin:0 0 8px">Los datos se guardan en Claude y se actualizan en vivo para todas las personas con quienes compartas esta página. Cada persona entra con su cuenta de Claude.</p>
      <p class="muted small" style="margin:0">Para sumar a alguien: menú <b>Compartir</b> de la página. Administradores como <b>Editor</b>; el resto del equipo como <b>Contributor</b>. Al abrirla por primera vez, la persona aparece en <b>Control de acceso</b> como empleado y ahí le asignas su perfil.</p>
      ${cl.admin ? `<div class="row" style="margin-top:10px"><button class="btn" id="cl-backup">Guardar copia en Supabase</button><span class="muted small">Copia todo a la tabla cc_records del proyecto capybara-control con tu conector de Supabase.</span></div>` : ''}
    </div>` : ''}
    <div class="card" style="grid-column:1/-1" ${cl.active ? 'hidden' : ''}><div class="card-h"><h2>Base de datos en Supabase</h2><span class="spacer"></span>${s.cloud?.on ? pill('Conectada', 'p-ok') : pill('Sin conectar', 'p-mut')}</div>
      ${s.cloud?.on ? `<p class="small" style="margin:0 0 10px">Proyecto <span class="mono">${esc(s.cloud.url)}</span> · sesión de <b>${esc(cloud.user?.email || '—')}</b> · <span id="cloud-st">${cloud.statusHtml()}</span></p>
      <p class="muted small" style="margin:0 0 10px">Cada cambio se guarda en Supabase en menos de un segundo y aparece en vivo para el resto del equipo.</p>
      <div class="row"><button class="btn" id="sb-reload">Recargar desde Supabase</button><button class="btn" id="sb-out">Cerrar sesión y desconectar</button></div>` : `
      <div class="grid g2"><div class="field"><label for="sb-url">URL del proyecto</label><input class="in mono" id="sb-url" value="${esc(s.cloud?.url || CLOUD_DEFAULT.url)}" placeholder="https://xxxx.supabase.co"></div><div class="field"><label for="sb-key">Clave anon (pública)</label><input class="in mono" id="sb-key" value="${esc(s.cloud?.key || CLOUD_DEFAULT.key)}" placeholder="eyJhbGciOi…"></div></div>
      <div class="grid g2" style="margin-top:8px"><div class="field"><label for="sb-email">Correo</label><input class="in" id="sb-email" autocomplete="username" value="${esc(cloud.lastEmail || '')}" placeholder="admin@capybarahostel.com"></div><div class="field"><label for="sb-pw">Contraseña</label><input class="in" id="sb-pw" type="password" autocomplete="current-password"></div></div>
      <div class="row" style="margin-top:10px"><button class="btn pri" id="sb-go">Conectar con Supabase</button></div>
      <p class="muted small" style="margin:10px 0 0">Las cuentas se crean en Supabase › Authentication › Users. Usa la clave <b>anon</b>, nunca la <span class="mono">service_role</span>.</p>`}
    </div>
    <div class="card" ${cl.active ? 'hidden' : ''}><div class="card-h"><h2>Conexión con el backend</h2><span class="spacer"></span>${s.cloud?.on ? pill('No se usa: datos en Supabase', 'p-mut') : s.mode === 'api' ? pill('API conectada', 'p-ok') : pill('Modo demostración', 'p-warn')}</div>
      <div class="field"><label for="ig-url">URL del backend</label><input class="in mono" id="ig-url" value="${esc(s.baseUrl)}" placeholder="https://control.capybarahostel.com"></div>
      <div class="grid g2" style="margin-top:8px"><div class="field"><label for="ig-email">Correo</label><input class="in" id="ig-email" value="admin@capybarahostel.com" autocomplete="username"></div><div class="field"><label for="ig-pw">Contraseña</label><input class="in" id="ig-pw" type="password" autocomplete="current-password"></div></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="ig-test">Probar conexión</button><button class="btn pri" id="ig-login">Conectar con la API</button>${s.mode === 'api' ? '<button class="btn" id="ig-demo">Volver a modo demostración</button>' : ''}</div>
      <p class="muted small" style="margin:10px 0 0">Dentro de claude.ai esta página no puede llamar a servidores externos, así que funciona con datos de ejemplo. Al desplegar el backend, esta misma interfaz se sirve desde <span class="mono">/</span> y se conecta sin cambios.</p>
    </div>
    <div class="card"><div class="card-h"><h2>Reglas de negocio</h2></div>
      <label class="row"><input type="checkbox" id="ig-auto" ${s.autoApply ? 'checked' : ''}> Aplicar automáticamente los movimientos con confianza ≥ <b class="num">${Math.round(s.threshold * 100)} %</b></label>
      <p class="muted small" style="margin:4px 0 10px">Por debajo del umbral, todo queda pendiente de aprobación. Recomendado: dejarlo apagado las primeras semanas.</p>
      <div class="grid g2"><div class="field"><label for="ig-th">Umbral de confianza</label><input class="in num" type="number" min="0.85" max="1" step="0.01" id="ig-th" value="${s.threshold}"></div><div class="field"><label for="ig-win">Ventana para duplicados (horas)</label><input class="in num" type="number" min="1" max="72" id="ig-win" value="${s.windowH}"></div></div>
      ${s.cloud?.on || cl.active ? '' : `<div class="field" style="margin-top:8px"><label for="ig-user">Usuario actual</label><select class="in" id="ig-user">${USERS.map((u) => opt(u, u, s.user)).join('')}</select></div>`}
      ${s.cloud?.on || cl.active ? '' : '<div class="row" style="margin-top:12px"><button class="btn bad" id="ig-reset">Restablecer datos de ejemplo</button></div>'}
    </div>
  </div>
  <div class="grid g2" style="align-items:start">
    <div class="card"><div class="card-h"><h2>WhatsApp Business (Cloud API de Meta)</h2></div>
      <ol class="steps"><li>Crea una app en <b>developers.facebook.com</b> con el producto WhatsApp y un número del hostel.</li><li>Genera un token permanente de usuario del sistema con permisos <span class="mono">whatsapp_business_messaging</span>.</li><li>En Configuración → Webhook usa la URL y el token de verificación de abajo. Suscribe el campo <span class="mono">messages</span>.</li><li>Registra los números del personal en Usuarios (o en <span class="mono">WHATSAPP_ALLOWED_NUMBERS</span>). Los demás se ignoran.</li></ol>
      <div class="field" style="margin-top:10px"><label>URL de devolución</label><div class="row" style="flex-wrap:nowrap"><code class="code" style="flex:1">${esc(base)}/webhooks/whatsapp</code><button class="btn sm" data-copy="${esc(base)}/webhooks/whatsapp">${ic('copy')}</button></div></div>
      <div class="field" style="margin-top:8px"><label>Token de verificación</label><div class="row" style="flex-wrap:nowrap"><code class="code" style="flex:1">capybara-verify-2026</code><button class="btn sm" data-copy="capybara-verify-2026">${ic('copy')}</button></div></div>
      <p class="muted small" style="margin:8px 0 0">Las fotos y PDF se leen con Claude; las notas de voz se transcriben con Google Speech-to-Text o Whisper. Cada archivo se guarda con su huella SHA-256 para no procesarlo dos veces.</p>
    </div>
    <div class="card"><div class="card-h"><h2>Google Drive y Sheets</h2></div>
      <ol class="steps"><li>En Google Cloud crea una cuenta de servicio y habilita las API de Sheets y Drive.</li><li>Descarga la llave JSON y copia el correo y la llave privada en el archivo <span class="mono">.env</span>.</li><li>Comparte el archivo de inventario con el correo de la cuenta de servicio como <b>Lector</b>.</li><li>En Drive y Sheets elige el archivo, la hoja y relaciona las columnas.</li></ol>
      <div class="code" style="margin-top:10px">GOOGLE_SERVICE_ACCOUNT_EMAIL=capybara-control@proyecto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n…"
ANTHROPIC_API_KEY=sk-ant-…
WHATSAPP_TOKEN=EAAG…   WHATSAPP_PHONE_NUMBER_ID=…</div>
    </div>
  </div>
  <div class="card"><div class="card-h"><h2>Endpoints disponibles</h2><span class="spacer"></span><span class="muted small">Especificación completa en <span class="mono">/openapi.yaml</span></span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Método</th><th>Ruta</th><th>Uso</th></tr></thead><tbody>${ENDPOINTS.map(([m, p, d]) => `<tr><td class="mono small">${m}</td><td class="mono small">${esc(p)}</td><td class="small">${esc(d)}</td></tr>`).join('')}</tbody></table></div>
    <div class="code" style="margin-top:12px">curl -X POST ${esc(base)}/api/v1/marchados/interpret \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"text":"Marchar 3 cervezas y 2 aguas a la habitación 203"}'</div>
  </div>`;
};
BIND.integraciones = (el) => {
  const s = S.settings;
  $('#sb-go', el)?.addEventListener('click', async (e) => {
    const url = $('#sb-url', el).value.trim().replace(/\/$/, ''), key = $('#sb-key', el).value.trim();
    if (!/^https:\/\/[^/]+$/.test(url)) { toast('Escribe la URL del proyecto, por ejemplo https://xxxx.supabase.co'); return; }
    if (!key) { toast('Pega la clave anon del proyecto (Settings › API).'); return; }
    cloud.lastEmail = $('#sb-email', el).value.trim();
    if (!cloud.lastEmail || !$('#sb-pw', el).value) { toast('Escribe el correo y la contraseña de tu usuario de Supabase.'); return; }
    e.target.disabled = true;
    try {
      s.cloud = { on: false, url, key }; s.mode = 'demo';
      await cloud.login(cloud.lastEmail, $('#sb-pw', el).value);
      s.cloud.on = true;
      await cloud.connect();
      save(); render(); toast('Conectado con Supabase');
    } catch (err) {
      s.cloud.on = false; cloud.ready = false; cloud.setStatus('off');
      try { await cloud.sb?.auth.signOut(); } catch { /* sin red */ }
      save(); render(); toast('No se pudo conectar: ' + err.message);
    }
  });
  $('#cl-backup', el)?.addEventListener('click', async (e) => { e.target.disabled = true; try { await cl.backupToSupabase(); } finally { e.target.disabled = false; } });
  $('#sb-reload', el)?.addEventListener('click', async () => { try { await cloud.load(); render(); toast('Datos recargados'); } catch (err) { toast('No se pudo recargar: ' + err.message); } });
  $('#sb-out', el)?.addEventListener('click', async () => { if (await ask({ title: 'Desconectar Supabase', text: 'La página vuelve a los datos de ejemplo de este navegador. Los datos en Supabase no se borran.', label: 'Desconectar' })) { await cloud.disconnect(); toast('Desconectado'); } });
  $('#ig-test', el).onclick = async () => { s.baseUrl = $('#ig-url', el).value.trim(); try { const h = await remote.health(); toast(h.ok ? 'Conexión correcta: base de datos en línea' : 'El servicio respondió con error'); } catch (e) { toast('No hay conexión con ' + (s.baseUrl || 'el backend') + '. Dentro de claude.ai las llamadas externas están bloqueadas.'); } };
  $('#ig-login', el).onclick = async () => { if (s.cloud?.on) { toast('Los datos ya están en Supabase. Desconéctalo antes de usar otro backend.'); return; } s.baseUrl = $('#ig-url', el).value.trim(); if (!s.baseUrl) { toast('Escribe la URL del backend.'); return; } try { await remote.login($('#ig-email', el).value, $('#ig-pw', el).value); await remote.load(); s.mode = 'api'; S.recon = null; save(); render(); toast('Conectado con la API'); } catch (e) { toast('No se pudo conectar: ' + e.message); } };
  $('#ig-demo', el)?.addEventListener('click', () => { const keep = { ...s, mode: 'demo', token: '' }; S = store.get(LS_KEY, null) || seedState(); S.settings = keep; save(); render(); });
  $('#ig-auto', el).onchange = (e) => { s.autoApply = e.target.checked; log('config.auto_aplicar', e.target.checked ? 'Activado' : 'Desactivado'); save(); render(); };
  $('#ig-th', el).onchange = (e) => { s.threshold = Math.max(0.85, Math.min(1, +e.target.value || 0.85)); save(); render(); };
  $('#ig-win', el).onchange = (e) => { s.windowH = +e.target.value || 12; save(); };
  if ($('#ig-user', el)) $('#ig-user', el).onchange = (e) => { s.user = e.target.value; save(); renderNav(); };
  if ($('#ig-reset', el)) $('#ig-reset', el).onclick = async () => { if (await ask({ title: 'Restablecer datos de ejemplo', text: 'Se borrarán los cambios hechos en este navegador y se cargarán de nuevo los datos de ejemplo.', label: 'Restablecer', danger: true })) { const keep = { ...s }; seedState(); S.settings = { ...S.settings, theme: keep.theme, user: keep.user }; save(); render(); toast('Datos de ejemplo restablecidos'); } };
  $$('[data-copy]', el).forEach((b) => (b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Copiado'), () => toast('Selecciona el texto y cópialo manualmente.'))));
};

/* ---------------- arranque ---------------- */
function boot() {
  const saved = store.get(LS_KEY, null);
  const settings = store.get(LS_KEY + '-settings', null);
  S = saved && saved.products?.length ? saved : seedState();
  if (settings) S.settings = { ...S.settings, ...settings };
  upgradeState();
  if (S.settings.mode === 'api') remote.load().then(render).catch(() => { S.settings.mode = 'demo'; toast('No se pudo conectar con la API; se muestran datos de ejemplo.'); render(); });
  if (window.claude?.use) cl.boot(); else cloud.boot();
  applyTheme();
  $('#theme-btn').onclick = cycleTheme;
  $('#sync-btn').onclick = syncAndReconcile;
  $('#menu-btn').onclick = () => $('.app').classList.toggle('nav-open');
  $('.app').addEventListener('click', (e) => { if (e.target === $('.app') && $('.app').classList.contains('nav-open')) $('.app').classList.remove('nav-open'); });
  render();
  save();
}
