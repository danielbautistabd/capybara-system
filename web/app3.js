/* ================= Capybara Control · app (3/4): inventario, entradas, marchados, WhatsApp ================= */

/* ---------------- Productos e inventario ---------------- */
let IV = { q: '', cat: '', kind: 'consumible', st: '' };
RENDER.inventario = () => {
  const st = stockMap();
  const list = S.products.filter((p) => (IV.kind === 'inactivo' ? p.status === 'inactivo' : p.status !== 'inactivo' && (!IV.kind || p.kind === IV.kind)))
    .filter((p) => !IV.cat || p.category === IV.cat)
    .filter((p) => { if (!IV.q) return true; const q = normalize(IV.q); return normalize(`${p.name} ${p.code} ${p.barcode} ${(p.aliases || []).join(' ')} ${p.location}`).includes(q); })
    .filter((p) => !IV.st || stockState(p, st[p.id])[0] === IV.st)
    .sort((a, b) => a.code.localeCompare(b.code));
  const kinds = [['consumible', 'Consumibles'], ['menaje', 'Menaje y lencería'], ['activo', 'Equipos y mobiliario'], ['servicio', 'Servicios'], ['', 'Todos'], ['inactivo', 'Inactivos']];
  const total = list.reduce((a, p) => a + Math.max(0, st[p.id]) * p.avgCost, 0);
  return `
  <div class="row"><div class="tabs" role="tablist">${kinds.map(([k, l]) => `<button role="tab" data-kind="${k}" class="${IV.kind === k ? 'on' : ''}">${l}<span class="ct">${S.products.filter((p) => (k === 'inactivo' ? p.status === 'inactivo' : p.status !== 'inactivo' && (!k || p.kind === k))).length}</span></button>`).join('')}</div></div>
  <div class="row">
    <input class="in" id="iv-q" placeholder="Buscar por nombre, código, código de barras o alias" value="${esc(IV.q)}" style="flex:1 1 260px;width:auto">
    <select class="in" id="iv-cat" style="width:auto">${opt('', 'Todas las categorías')}${cats().map((c) => opt(c, c, IV.cat)).join('')}</select>
    <select class="in" id="iv-st" style="width:auto">${opt('', 'Todos los estados')}${['Disponible', 'Bajo', 'Agotado', 'Vence pronto'].map((s) => opt(s, s, IV.st)).join('')}</select>
    <span class="spacer"></span>
    ${can('inventario.editar') ? `<a class="btn" href="#importar">${ic('upload')} Importar Excel</a>` : ''}${can('conteos.crear') ? `<button class="btn" id="iv-count">${ic('count')} Conteo físico</button>` : ''}
    ${can('movimientos.crear') ? `<button class="btn" id="iv-mv">${ic('sync')} Registrar movimiento</button>` : ''}
    ${can('inventario.editar') ? `<button class="btn pri" id="iv-new">${ic('plus')} Nuevo producto</button>` : ''}
  </div>
  <div class="tbl-wrap"><table><thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th class="n">Stock</th><th class="n">Mín / Máx</th><th class="n money">Costo prom.</th><th class="n money">Último precio</th><th class="n money">Valor</th><th>Estado</th><th></th></tr></thead><tbody>
  ${list.map((p) => { const s = st[p.id]; const [lab, cls] = stockState(p, s); const pct = p.stockMax ? Math.min(100, (Math.max(0, s) / p.stockMax) * 100) : 0;
    return `<tr><td class="mono small">${esc(p.code)}${p.barcode ? `<span class="sub">${esc(p.barcode)}</span>` : ''}</td>
    <td><div class="row" style="flex-wrap:nowrap;gap:10px">${p.photo ? `<img src="${p.photo}" alt="" class="thumb" style="object-fit:cover">` : `<span class="thumb">${esc(p.name.slice(0, 2).toUpperCase())}</span>`}<span class="pcell"><b>${esc(p.name)}</b>${p.example ? ' <span class="tag">ejemplo</span>' : ''}<span class="sub">${esc(p.location || '—')}${supById(p.supplierId) ? ' · ' + esc(supById(p.supplierId).name) : ''}${p.expiresAt ? ' · vence ' + fdate(p.expiresAt + 'T12:00') : ''}</span></span></div></td>
    <td>${esc(p.category)}</td>
    <td class="n"><b class="num ${s <= 0 && p.kind !== 'activo' && p.kind !== 'servicio' ? 'neg' : ''}">${num(s)}</b> <span class="muted small">${esc(p.unit)}</span>${p.kind !== 'servicio' ? `<div class="bar" style="margin-top:4px;width:90px;margin-left:auto"><b style="width:${pct}%;background:${s <= p.stockMin ? 'var(--warn)' : 'var(--jungle-2)'}"></b></div>` : ''}</td>
    <td class="n num small">${num(p.stockMin)} / ${p.stockMax ? num(p.stockMax) : '—'}</td>
    <td class="n num money">${p.avgCost ? money(p.avgCost) : '—'}</td><td class="n num money">${p.lastPrice ? money(p.lastPrice) : '—'}</td>
    <td class="n num money">${p.avgCost ? money(Math.max(0, s) * p.avgCost) : '—'}</td>
    <td>${pill(lab, cls)}</td>
    <td><div class="actions" style="flex-wrap:nowrap">${can('movimientos.crear') ? `<button class="btn sm" data-mv="${p.id}" title="Registrar movimiento">${ic('sync')}</button>` : ''}<button class="btn sm" data-hist="${p.id}" title="Historial">${ic('hist')}</button>${can('inventario.editar') ? `<button class="btn sm" data-edit="${p.id}" title="Editar">${ic('edit')}</button>` : ''}</div></td></tr>`; }).join('') || `<tr><td colspan="10"><div class="empty">No hay productos con esos filtros.</div></td></tr>`}
  </tbody></table></div>
  <p class="muted small" style="margin:0">${list.length} productos<span class="money"> · valor ${money(total)}</span> · El stock es el inventario teórico: inicial + movimientos aprobados.</p>`;
};
BIND.inventario = (el) => {
  $$('[data-kind]', el).forEach((b) => (b.onclick = () => { IV.kind = b.dataset.kind; render(); }));
  const q = $('#iv-q', el); q.oninput = () => { IV.q = q.value; const pos = q.selectionStart; render(); const n = $('#iv-q'); n.focus(); n.setSelectionRange(pos, pos); };
  $('#iv-cat', el).onchange = (e) => { IV.cat = e.target.value; render(); };
  $('#iv-st', el).onchange = (e) => { IV.st = e.target.value; render(); };
  $('#iv-new', el)?.addEventListener('click', () => productForm());
  $('#iv-mv', el)?.addEventListener('click', () => movementForm());
  $('#iv-count', el)?.addEventListener('click', () => countForm());
  $$('[data-mv]', el).forEach((b) => (b.onclick = () => movementForm({ productId: b.dataset.mv })));
  $$('[data-hist]', el).forEach((b) => (b.onclick = () => kardex(b.dataset.hist)));
  $$('[data-edit]', el).forEach((b) => (b.onclick = () => productForm(prodById(b.dataset.edit))));
};

function readFile(input) { return new Promise((res) => { const f = input.files?.[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res({ name: f.name, data: r.result, type: f.type }); r.readAsDataURL(f); }); }

function productForm(p = null) {
  const isNew = !p; p = p || { code: '', barcode: '', name: '', aliases: [], description: '', category: 'Alimentos', kind: 'consumible', unit: 'unidad', stockInit: 0, stockMin: 0, stockMax: '', avgCost: 0, lastPrice: 0, supplierId: '', location: '', expiresAt: '', status: 'activo', notes: '', photo: null };
  const F_ = (id, label, val, type = 'text', extra = '') => `<div class="field"><label for="pf-${id}">${label}</label><input class="in" id="pf-${id}" type="${type}" value="${esc(val ?? '')}" ${extra}></div>`;
  const m = modal({ title: isNew ? 'Nuevo producto' : 'Editar producto', wide: true, body: `
    <div class="grid g4">${F_('code', 'Código interno', p.code, 'text', 'required')}${F_('barcode', 'Código de barras', p.barcode)}<div class="field" style="grid-column:span 2"><label for="pf-name">Nombre</label><input class="in" id="pf-name" value="${esc(p.name)}" required></div></div>
    <div class="grid g4">
      <div class="field"><label for="pf-category">Categoría</label><select class="in" id="pf-category">${cats().map((c) => opt(c, c, p.category)).join('')}</select></div>
      <div class="field"><label for="pf-kind">Tipo</label><select class="in" id="pf-kind">${[['consumible', 'Consumible'], ['menaje', 'Menaje / lencería'], ['activo', 'Equipo o mobiliario'], ['servicio', 'Servicio']].map(([k, l]) => opt(k, l, p.kind)).join('')}</select></div>
      ${F_('unit', 'Unidad de medida', p.unit, 'text', 'list="units"')}
      <div class="field"><label for="pf-supplierId">Proveedor principal</label><select class="in" id="pf-supplierId">${opt('', '—')}${S.suppliers.map((s) => opt(s.id, s.name, p.supplierId)).join('')}</select></div>
    </div>
    <datalist id="units">${['unidad', 'botella', 'lata', 'bolsa', 'caja', 'paquete', 'rollo', 'kg', 'g', 'L', 'ml', 'juego', 'porción'].map((u) => `<option value="${u}">`).join('')}</datalist>
    <div class="grid g4">${F_('stockInit', 'Stock inicial', p.stockInit, 'number', `step="any" ${isNew ? '' : 'disabled title="El stock inicial no se edita; usa un ajuste de inventario"'}`)}${F_('stockMin', 'Stock mínimo', p.stockMin, 'number', 'step="any"')}${F_('stockMax', 'Stock máximo', p.stockMax, 'number', 'step="any"')}${F_('avgCost', 'Costo promedio (COP)', p.avgCost, 'number', 'step="50"')}</div>
    <div class="grid g4">${F_('location', 'Ubicación física', p.location)}${F_('expiresAt', 'Fecha de vencimiento', p.expiresAt || '', 'date')}<div class="field" style="grid-column:span 2"><label for="pf-aliases">Alias para WhatsApp (separados por coma)</label><input class="in" id="pf-aliases" value="${esc((p.aliases || []).join(', '))}" placeholder="pola, cerveza, club"></div></div>
    <div class="grid g2"><div class="field"><label for="pf-description">Descripción</label><textarea class="in" id="pf-description" rows="2">${esc(p.description)}</textarea></div><div class="field"><label for="pf-notes">Observaciones</label><textarea class="in" id="pf-notes" rows="2">${esc(p.notes)}</textarea></div></div>
    <div class="row"><div class="field"><label for="pf-photo">Fotografía</label><input type="file" accept="image/*" class="in" id="pf-photo"></div>${p.photo ? `<img src="${p.photo}" alt="Foto actual" style="height:56px;border-radius:9px">` : ''}${!isNew ? `<span class="spacer"></span><span class="muted small">Valor disponible: <b class="num">${money(Math.max(0, stockOf(p)) * p.avgCost)}</b></span>` : ''}</div>`,
    foot: `${!isNew ? `<button class="btn bad" id="pf-deact" style="margin-right:auto">${ic('ban')} ${p.status === 'inactivo' ? 'Reactivar' : 'Desactivar'}</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn pri" id="pf-save">${ic('check')} Guardar producto</button>` });
  m.querySelector('#pf-save').onclick = async () => {
    const g = (k) => m.querySelector('#pf-' + k).value.trim();
    if (!g('code') || !g('name')) { toast('El código y el nombre son obligatorios.'); return; }
    if (S.products.some((x) => x.code === g('code') && x.id !== p.id)) { toast(`El código ${g('code')} ya existe.`); return; }
    const photo = await readFile(m.querySelector('#pf-photo'));
    const out = { ...p, code: g('code'), barcode: g('barcode'), name: g('name'), category: g('category'), kind: g('kind'), unit: g('unit') || 'unidad', supplierId: g('supplierId') || null, stockMin: +g('stockMin') || 0, stockMax: g('stockMax') ? +g('stockMax') : null, avgCost: +g('avgCost') || 0, location: g('location'), expiresAt: g('expiresAt') || null, aliases: g('aliases').split(',').map((s) => s.trim()).filter(Boolean), description: g('description'), notes: g('notes'), photo: photo?.data || p.photo };
    if (isNew) { out.stockInit = +g('stockInit') || 0; out.lastPrice = out.avgCost; }
    closeModal(); await run('saveProduct', out); toast(isNew ? 'Producto creado' : 'Producto actualizado');
  };
  m.querySelector('#pf-deact')?.addEventListener('click', async () => { closeModal(); await run('saveProduct', { ...p, status: p.status === 'inactivo' ? 'activo' : 'inactivo' }); toast(p.status === 'inactivo' ? 'Producto reactivado' : 'Producto desactivado'); });
}

function movementForm(pre = {}) {
  const p0 = prodById(pre.productId);
  const m = modal({ title: 'Registrar movimiento', body: `
    <div class="grid g2"><div class="field"><label for="mf-p">Producto</label><select class="in" id="mf-p">${prodOptions(pre.productId)}</select></div>
    <div class="field"><label for="mf-t">Tipo de movimiento</label><select class="in" id="mf-t">${typeOptions(pre.type || 'marchado')}</select></div></div>
    <div class="grid g3"><div class="field"><label for="mf-q">Cantidad</label><input class="in" id="mf-q" type="number" min="0" step="any" value="${pre.qty || 1}"></div>
    <div class="field"><label for="mf-u">Unidad</label><input class="in" id="mf-u" value="${esc(pre.unit || p0?.unit || 'unidad')}"></div>
    <div class="field money"><label for="mf-c">Costo unitario (solo entradas)</label><input class="in" id="mf-c" type="number" step="50" value="${p0?.lastPrice || ''}"></div></div>
    <div class="grid g3"><div class="field"><label for="mf-a">Área solicitante</label><input class="in" id="mf-a" list="areas" value="${esc(pre.area || '')}"></div>
    <div class="field"><label for="mf-r">Responsable</label><select class="in" id="mf-r" ${can('movimientos.aprobar') ? '' : 'disabled'}>${S.users.map((u) => opt(u.name, u.name, S.settings.user)).join('')}</select></div>
    <div class="field"><label for="mf-s">Fuente de información</label><select class="in" id="mf-s">${Object.entries(SOURCES).map(([k, v]) => opt(k, v, pre.source || 'manual')).join('')}</select></div></div>
    <datalist id="areas">${AREAS.map((a) => `<option value="${a}">`).join('')}</datalist>
    <div class="field"><label for="mf-m">Motivo</label><input class="in" id="mf-m" value="${esc(pre.reason || '')}" placeholder="Ej.: cortesía a huésped, rotura en servicio, compra semanal"></div>
    <div class="grid g2"><div class="field"><label for="mf-e">Documento o evidencia</label><input type="file" class="in" id="mf-e" accept="image/*,application/pdf"></div><div class="field"><label for="mf-o">Observaciones</label><input class="in" id="mf-o"></div></div>
    ${can('movimientos.aprobar') ? '<label class="row small"><input type="checkbox" id="mf-ap" checked> Aprobar ahora y actualizar el inventario</label>' : '<p class="muted small" style="margin:0">Quedará pendiente de aprobación.</p>'}`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="mf-save">${ic('check')} Registrar</button>` });
  m.querySelector('#mf-p').onchange = (e) => { const p = prodById(e.target.value); m.querySelector('#mf-u').value = p.unit; m.querySelector('#mf-c').value = p.lastPrice || ''; };
  m.querySelector('#mf-save').onclick = async () => {
    const g = (k) => m.querySelector('#mf-' + k).value.trim();
    const qty = +g('q'); if (!(qty > 0)) { toast('La cantidad debe ser mayor que cero.'); return; }
    const ev = await readFile(m.querySelector('#mf-e'));
    const o = { productId: g('p'), type: g('t'), qty, unit: g('u'), unitCost: g('t') === 'entrada' ? +g('c') || undefined : undefined, area: g('a'), user: g('r'), source: g('s'), reason: g('m'), notes: g('o'), evidence: ev?.name || null };
    closeModal(); await run('addMovement', o, { approve: !!m.querySelector('#mf-ap')?.checked });
    const last = S.movements[S.movements.length - 1];
    toast(last?.status === 'duplicado' ? 'Registrado como posible duplicado: revísalo en Marchados' : `${MOVEMENT_TYPES[o.type].label} registrada`);
  };
}

function countForm() {
  const st = stockMap(); const blind = !can('movimientos.aprobar'); let cat = blind ? '' : 'Bebidas';
  const draw = () => S.products.filter((p) => p.status === 'activo' && p.kind !== 'servicio' && (!cat || p.category === cat) && (!blind || inMyArea(p))).map((p) => `<tr><td><b>${esc(p.name)}</b><span class="sub">${esc(p.location || '')}</span></td>${blind ? `<td class="small muted">${esc(p.unit)}</td>` : `<td class="n num">${num(st[p.id])} ${esc(p.unit)}</td>`}<td class="n"><input class="in num" type="number" min="0" step="any" data-cnt="${p.id}" placeholder="—" style="width:96px;text-align:right" aria-label="Conteo ${esc(p.name)}"></td></tr>`).join('');
  const m = modal({ title: 'Conteo físico', wide: true, body: `
    <div class="row"><select class="in" id="cf-cat" style="width:auto">${opt('', 'Todas las categorías')}${cats().map((c) => opt(c, c, cat)).join('')}</select><span class="muted small">${blind ? 'Conteo ciego de tu área: escribe lo que ves, sin comparar con el sistema.' : 'Escribe lo que hay realmente. Deja en blanco lo que no contaste.'}</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Producto</th><th class="n">${blind ? 'Unidad' : 'Teórico'}</th><th class="n">Físico</th></tr></thead><tbody id="cf-body">${draw()}</tbody></table></div>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="cf-save">${ic('check')} Guardar conteo y conciliar</button>` });
  const vals = {};
  const keep = () => $$('[data-cnt]', m).forEach((i) => { if (i.value !== '') vals[i.dataset.cnt] = i.value; });
  const restore = () => $$('[data-cnt]', m).forEach((i) => { if (vals[i.dataset.cnt] !== undefined) i.value = vals[i.dataset.cnt]; });
  m.querySelector('#cf-cat').onchange = (e) => { keep(); cat = e.target.value; m.querySelector('#cf-body').innerHTML = draw(); restore(); };
  m.querySelector('#cf-save').onclick = async () => {
    keep(); const items = Object.entries(vals).map(([productId, qty]) => ({ productId, qty: +qty }));
    if (!items.length) { toast('No registraste ninguna cantidad.'); return; }
    closeModal(); await run('saveCounts', items); runRecon(); save(); if (can('conciliacion.ver')) location.hash = 'conciliacion'; render(); toast(`Conteo guardado: ${items.length} productos`);
  };
}

function kardex(pid) {
  const p = prodById(pid);
  const ms = S.movements.filter((m) => m.productId === pid).sort((a, b) => new Date(a.ts) - new Date(b.ts));
  let bal = p.stockInit;
  const rows = ms.map((m) => { const s = MOVEMENT_TYPES[m.type].sign; if (m.status === 'aprobado') bal += s * m.qty; return { m, bal: m.status === 'aprobado' ? bal : null }; }).reverse();
  const cnt = S.counts.filter((c) => c.productId === pid).sort((a, b) => new Date(b.ts) - new Date(a.ts))[0];
  const md = modal({ title: `Historial · ${esc(p.name)}`, wide: true, body: `
    <div class="kpis"><div class="kpi"><span class="k">Stock inicial</span><span class="v">${num(p.stockInit)}</span></div><div class="kpi"><span class="k">Stock teórico</span><span class="v">${num(stockOf(p))}</span><span class="s">${esc(p.unit)}</span></div><div class="kpi"><span class="k">Último conteo</span><span class="v">${cnt ? num(cnt.qty) : '—'}</span><span class="s">${cnt ? fdt(cnt.ts) + ' · ' + esc(cnt.countedBy) : 'sin conteo'}</span></div><div class="kpi money"><span class="k">Costo promedio</span><span class="v">${money(p.avgCost)}</span></div></div>
    <div class="tbl-wrap" style="max-height:52vh;overflow:auto"><table><thead><tr><th>Fecha</th><th>Tipo</th><th class="n">Cantidad</th><th class="n">Saldo</th><th>Fuente</th><th>Responsable · área</th><th>Estado</th><th></th></tr></thead><tbody>
    ${rows.map(({ m, bal }) => `<tr><td class="small">${fdt(m.ts)}</td><td>${MOVEMENT_TYPES[m.type].label}${m.reason ? `<span class="sub">${esc(m.reason)}</span>` : ''}</td><td class="n num ${MOVEMENT_TYPES[m.type].sign < 0 ? 'neg' : 'pos'}">${MOVEMENT_TYPES[m.type].sign < 0 ? '−' : '+'}${num(m.qty)}</td><td class="n num">${bal === null ? '—' : num(bal)}</td><td>${esc(SOURCES[m.source] || m.source)}${m.evidence ? ' <span class="tag">evidencia</span>' : ''}</td><td class="small">${esc(m.user || '')}${m.area ? ' · ' + esc(m.area) : ''}</td><td>${mvPill(m.status)}</td><td>${m.status === 'aprobado' && !m.reversesId && can('movimientos.aprobar') ? `<button class="btn sm bad" data-void="${m.id}">Anular</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8"><div class="empty">Sin movimientos</div></td></tr>'}
    </tbody></table></div><p class="muted small" style="margin:0">Los movimientos no se eliminan. Anular crea un contramovimiento que conserva la trazabilidad.</p>`,
    foot: `${can('movimientos.crear') ? `<button class="btn" id="kx-mv">${ic('sync')} Registrar movimiento</button>` : ''}<button class="btn pri" data-close>Cerrar</button>` });
  md.querySelector('#kx-mv')?.addEventListener('click', () => movementForm({ productId: pid }));
  $$('[data-void]', md).forEach((b) => (b.onclick = async () => { const reason = await ask({ title: 'Anular movimiento', text: 'Se creará un ajuste que revierte este movimiento. El original queda visible como anulado.', input: 'Motivo de la anulación', label: 'Anular', danger: true }); if (reason) { await run('voidMv', b.dataset.void, reason); kardex(pid); toast('Movimiento anulado'); } }));
}

/* ---------------- Registro de entradas ---------------- */
let PU = null;
const blankPurchase = () => ({ id: null, supplierId: S.suppliers[0]?.id, invoice: '', purchasedAt: iso(Date.now()), receivedAt: iso(Date.now()), items: [{ productId: '', qty: 1, unit: 'unidad', unitCost: 0 }], taxPct: 19, tax: 0, discount: 0, payMethod: 'Transferencia', receivedBy: S.settings.user, attachment: null, notes: '', status: 'borrador', source: 'manual' });
RENDER.entradas = () => {
  PU ||= blankPurchase();
  const sub = PU.items.reduce((a, i) => a + (+i.qty || 0) * (+i.unitCost || 0), 0);
  PU.tax = Math.round(sub * (PU.taxPct || 0) / 100);
  const total = sub + PU.tax - (+PU.discount || 0);
  const recent = [...S.purchases].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)).slice(0, 25);
  const fotos = S.inbox.filter((i) => i.doc && i.analysis?.type === 'entrada' && i.status === 'pendiente_aprobacion');
  return `
  ${fotos.length ? `<div class="banner">${ic('img')}<div><b>${fotos.length} factura${fotos.length > 1 ? 's' : ''} recibida${fotos.length > 1 ? 's' : ''} por WhatsApp.</b> ${fotos.map((f) => `<button class="btn sm" data-fromwa="${f.id}" style="margin-left:6px">Cargar ${esc(f.doc.invoiceNumber || 'factura')} · ${esc(f.doc.supplier || '')}</button>`).join('')}</div></div>` : ''}
  <div class="card"><div class="card-h"><h2>${PU.id ? 'Editar entrada ' + esc(PU.invoice) : 'Nueva entrada de productos'}</h2><span class="spacer"></span>${PU.source !== 'manual' ? pill('Desde ' + (SOURCES[PU.source] || PU.source), 'p-info') : ''}</div>
    <div class="grid g4">
      <div class="field"><label for="pu-sup">Proveedor</label><div class="row" style="flex-wrap:nowrap;gap:6px"><select class="in" id="pu-sup">${S.suppliers.map((s) => opt(s.id, s.name, PU.supplierId)).join('')}</select><button class="btn sm" id="pu-newsup" title="Crear proveedor">${ic('plus')}</button></div></div>
      <div class="field"><label for="pu-inv">Número de factura</label><input class="in" id="pu-inv" value="${esc(PU.invoice)}" placeholder="FE-12345"></div>
      <div class="field"><label for="pu-pd">Fecha de compra</label><input class="in" type="date" id="pu-pd" value="${PU.purchasedAt}"></div>
      <div class="field"><label for="pu-rd">Fecha de recepción</label><input class="in" type="date" id="pu-rd" value="${PU.receivedAt}"></div>
    </div>
    <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th style="min-width:220px">Producto</th><th class="n">Cantidad</th><th>Unidad</th><th class="n money">Costo unitario</th><th class="n money">Subtotal</th><th></th></tr></thead><tbody>
      ${PU.items.map((it, i) => `<tr><td><select class="in" data-it="${i}" data-f="productId">${opt('', 'Selecciona…')}${prodOptions(it.productId, (p) => p.kind !== 'servicio')}</select></td>
      <td class="n"><input class="in num" type="number" min="0" step="any" data-it="${i}" data-f="qty" value="${it.qty}" style="width:90px;text-align:right"></td>
      <td><input class="in" data-it="${i}" data-f="unit" value="${esc(it.unit)}" style="width:96px"></td>
      <td class="n money"><input class="in num" type="number" min="0" step="50" data-it="${i}" data-f="unitCost" value="${it.unitCost}" style="width:120px;text-align:right"></td>
      <td class="n num money">${money((+it.qty || 0) * (+it.unitCost || 0))}</td>
      <td><button class="btn sm ghost" data-del="${i}" aria-label="Quitar fila">${ic('x')}</button></td></tr>`).join('')}
    </tbody></table></div>
    <div class="row" style="margin-top:8px"><button class="btn sm" id="pu-add">${ic('plus')} Agregar producto</button></div>
    <div class="grid g4" style="margin-top:12px">
      <div class="field money"><label for="pu-tax">Impuestos (IVA)</label><select class="in" id="pu-tax">${[0, 5, 19].map((v) => opt(v, v + ' %', PU.taxPct)).join('')}</select></div>
      <div class="field money"><label for="pu-disc">Descuento (COP)</label><input class="in num" type="number" min="0" step="100" id="pu-disc" value="${PU.discount}"></div>
      <div class="field"><label for="pu-pay">Forma de pago</label><select class="in" id="pu-pay">${PAY.map((p) => opt(p, p, PU.payMethod)).join('')}</select></div>
      <div class="field"><label for="pu-rec">Recibió</label><select class="in" id="pu-rec">${[...new Set([...S.users.map((u) => u.name), PU.receivedBy])].map((u) => opt(u, u, PU.receivedBy)).join('')}</select></div>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="field"><label for="pu-att">Factura o comprobante</label><input type="file" class="in" id="pu-att" accept="image/*,application/pdf">${PU.attachment ? `<span class="small muted">Adjunto: ${esc(PU.attachment)}</span>` : ''}</div>
      <div class="field"><label for="pu-notes">Observaciones</label><input class="in" id="pu-notes" value="${esc(PU.notes)}"></div>
    </div>
    <div class="row" style="margin-top:16px;align-items:flex-end">
      <div class="formula money"><span>Subtotal <b class="num">${money(sub)}</b></span><span class="op">+</span><span>IVA <b class="num">${money(PU.tax)}</b></span><span class="op">−</span><span>Descuento <b class="num">${money(PU.discount)}</b></span><span class="op">=</span><span class="t res num">${money(total)}</span></div>
      <span class="spacer"></span><button class="btn" id="pu-clear">Limpiar</button><button class="btn ${can('entradas.aprobar') ? '' : 'pri'}" id="pu-draft">${can('entradas.aprobar') ? 'Guardar borrador' : 'Enviar para aprobación'}</button>${can('entradas.aprobar') ? `<button class="btn pri" id="pu-approve">${ic('check')} Aprobar entrada</button>` : ''}
    </div>
    <p class="muted small" style="margin:8px 0 0">${can('entradas.aprobar') ? '' : '<b>Registra lo que recibiste: cantidades y factura.</b> Un supervisor completa los costos y aprueba. '}Al aprobar: se actualiza el inventario, se crean los movimientos, se recalcula el costo promedio ponderado, se asocia la compra al proveedor, se guarda la evidencia y queda en la bitácora.</p>
  </div>
  <div class="card"><div class="card-h"><h2>Entradas recientes</h2></div><div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th class="n">Ítems</th><th class="n money">Total</th><th>Pago</th><th>Recibió</th><th>Estado</th><th></th></tr></thead><tbody>
    ${recent.map((p) => `<tr><td class="small">${fdate(p.purchasedAt + 'T12:00')}</td><td>${esc(supById(p.supplierId)?.name || '—')}</td><td class="mono small">${esc(p.invoice || '—')}</td><td class="n num">${p.items.length}</td><td class="n num money">${money(p.total)}</td><td class="small">${esc(p.payMethod)}</td><td class="small">${esc(p.receivedBy)}</td><td>${p.status === 'aprobada' ? pill('Aprobada', 'p-ok') : p.kind === 'orden' ? pill('Orden de compra', 'p-info') : pill('Borrador', 'p-warn')}${p.alegraBillId ? ' <span class="tag">Alegra</span>' : ''}</td><td>${p.status === 'borrador' && can('entradas.aprobar') ? `<button class="btn sm" data-open="${p.id}">${p.kind === 'orden' ? 'Recibir' : 'Revisar'}</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div></div>`;
};
BIND.entradas = (el) => {
  const sync = () => { PU.supplierId = $('#pu-sup', el).value; PU.invoice = $('#pu-inv', el).value.trim(); PU.purchasedAt = $('#pu-pd', el).value; PU.receivedAt = $('#pu-rd', el).value; PU.taxPct = +$('#pu-tax', el).value; PU.discount = +$('#pu-disc', el).value || 0; PU.payMethod = $('#pu-pay', el).value; PU.receivedBy = $('#pu-rec', el).value; PU.notes = $('#pu-notes', el).value; };
  $$('[data-it]', el).forEach((i) => (i.onchange = () => { sync(); const it = PU.items[+i.dataset.it]; it[i.dataset.f] = i.type === 'number' ? +i.value : i.value; if (i.dataset.f === 'productId') { const p = prodById(i.value); if (p) { it.unit = p.unit; it.unitCost = p.lastPrice || p.avgCost; } } render(); }));
  ['#pu-tax', '#pu-disc', '#pu-sup', '#pu-pay', '#pu-rec'].forEach((s) => ($(s, el).onchange = () => { sync(); render(); }));
  $$('[data-del]', el).forEach((b) => (b.onclick = () => { sync(); PU.items.splice(+b.dataset.del, 1); if (!PU.items.length) PU.items.push({ productId: '', qty: 1, unit: 'unidad', unitCost: 0 }); render(); }));
  $('#pu-add', el).onclick = () => { sync(); PU.items.push({ productId: '', qty: 1, unit: 'unidad', unitCost: 0 }); render(); };
  $('#pu-clear', el).onclick = () => { PU = null; render(); };
  $('#pu-newsup', el).onclick = () => { sync(); supplierForm(null, (s) => { PU.supplierId = s.id; render(); }); };
  const go = async (approve) => {
    sync();
    const f = await readFile($('#pu-att', el)); if (f) PU.attachment = f.name;
    PU.items = PU.items.filter((i) => i.productId && i.qty > 0);
    if (!PU.items.length) { toast('Agrega al menos un producto con cantidad.'); PU.items.push({ productId: '', qty: 1, unit: 'unidad', unitCost: 0 }); return; }
    if (PU.invoice && S.purchases.some((p) => p.id !== PU.id && p.supplierId === PU.supplierId && p.invoice.toUpperCase() === PU.invoice.toUpperCase())) { toast(`La factura ${PU.invoice} de este proveedor ya está registrada.`); return; }
    const src = PU.fromInbox; const pu = { ...PU, status: PU.status || 'borrador', kind: approve ? 'compra' : PU.kind || 'compra' }; delete pu.taxPct; delete pu.fromInbox;
    await run('savePurchase', pu, approve);
    if (src) act.inboxStatus(src, approve ? 'aprobado' : 'pendiente_aprobacion', { silent: true });
    save(); PU = null; render(); toast(approve ? 'Entrada aprobada: inventario actualizado' : 'Borrador guardado');
  };
  $('#pu-draft', el).onclick = () => go(false);
  $('#pu-approve', el)?.addEventListener('click', () => go(true));
  $$('[data-open]', el).forEach((b) => (b.onclick = () => { const p = S.purchases.find((x) => x.id === b.dataset.open); PU = { ...JSON.parse(JSON.stringify(p)), taxPct: p.subtotal ? Math.round((p.tax / p.subtotal) * 100) : 0 }; render(); window.scrollTo(0, 0); }));
  $$('[data-fromwa]', el).forEach((b) => (b.onclick = () => loadInvoiceFromInbox(b.dataset.fromwa)));
};
function loadInvoiceFromInbox(id) {
  const it = S.inbox.find((x) => x.id === id); const d = it.doc;
  let sup = S.suppliers.find((s) => normalize(s.name) === normalize(d.supplier));
  if (!sup) { sup = act.saveSupplier({ name: d.supplier, taxId: '', phone: '', contact: '' }); }
  // los movimientos propuestos por WhatsApp se reemplazan por la compra (evita doble entrada)
  S.movements.filter((m) => m.inboxId === id && m.status === 'pendiente').forEach((m) => { m.status = 'duplicado'; m.notes = 'Reemplazado por la entrada de compra ' + (d.invoiceNumber || ''); });
  PU = { ...blankPurchase(), supplierId: sup.id, invoice: d.invoiceNumber || '', purchasedAt: d.date || iso(Date.now()), receivedAt: iso(Date.now()), payMethod: d.paymentMethod || 'Efectivo', receivedBy: it.from, attachment: 'foto-whatsapp.jpg', source: 'whatsapp_foto', fromInbox: id, taxPct: d.tax && d.subtotal ? Math.round((d.tax / d.subtotal) * 100) : 0, notes: `Leída de una foto enviada por ${it.from}`,
    items: it.analysis.items.map((x) => ({ productId: x.productId || '', qty: x.qty, unit: x.unit, unitCost: x.unitCost || 0 })) };
  location.hash = 'entradas'; render();
}

/* ---------------- Productos marchados ---------------- */
let MQ = { text: '', result: null, type: null, area: '', filter: 'pendiente' };
const EXAMPLES = ['Marchar 3 cervezas y 2 aguas', 'Enviar 4 toallas a la habitación 203', 'Se utilizaron 2 bolsas de hielo', 'Sacar 3 productos de aseo para limpieza', 'Entregar 5 desayunos', 'Se dañaron 2 vasos', 'Entregar una botella de ron como cortesía'];
const suggested = (c) => (c >= S.settings.threshold ? ['Aprobar', 'p-ok'] : c >= 0.6 ? ['Revisar y editar', 'p-warn'] : ['Solicitar información', 'p-bad']);
RENDER.marchados = () => {
  const r = MQ.result;
  const isOut = (m) => MOVEMENT_TYPES[m.type].sign < 0 && !m.type.startsWith('ajuste');
  const pend = S.movements.filter((m) => {
    if (m.source === 'sistema') return false;
    if (MQ.filter === 'pendiente') return ['pendiente', 'requiere_info', 'duplicado'].includes(m.status);
    if (!isOut(m)) return false;
    return MQ.filter === 'todos' || m.status === MQ.filter;
  })
    .sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 80);
  return `
  <div class="banner">${ic('info')}<div>En Capybara Hostel <b>marchar</b> significa entregar, despachar, utilizar, consumir o retirar un producto del inventario. Escribe la instrucción como la dirías por WhatsApp. Nada se descuenta hasta aprobar; con confianza menor al ${Math.round(S.settings.threshold * 100)} % nunca se aplica automáticamente.</div></div>
  <div class="card"><div class="card-h"><h2>Interpretar instrucción</h2></div>
    <div class="field"><label for="mq-text">Mensaje</label><textarea class="in" id="mq-text" rows="2" placeholder="Marchar 3 cervezas y 2 aguas a la habitación 203">${esc(MQ.text)}</textarea></div>
    <div class="row" style="margin-top:8px">${EXAMPLES.map((e) => `<button class="btn sm ghost" data-ex="${esc(e)}" style="border:1px dashed var(--line)">${esc(e)}</button>`).join('')}<span class="spacer"></span><button class="btn pri" id="mq-go">${ic('sync')} Interpretar</button></div>
    ${r ? `<div class="prop" style="margin-top:14px">
      <div class="row"><span class="eyebrow">Mensaje original</span><span class="muted small">${fdt(Date.now())} · ${esc(S.settings.user)} · Manual</span><span class="spacer"></span>${confHtml(r.confidence)} ${pill(...suggested(r.confidence))}</div>
      <div style="font-size:1.02rem">“${esc(MQ.text)}”</div>
      <div class="grid g3"><div class="field"><label for="mq-type">Acción interpretada</label><select class="in" id="mq-type">${typeOptions(MQ.type || r.type)}</select></div><div class="field"><label for="mq-area">Área o destino</label><input class="in" id="mq-area" list="areas" value="${esc(MQ.area ?? r.area ?? '')}"></div><div class="field"><label for="mq-reason">Motivo</label><input class="in" id="mq-reason" value="${(MQ.type || r.type) === 'cortesia' ? 'Cortesía a huésped' : ''}"></div></div>
      <datalist id="areas">${AREAS.map((a) => `<option value="${a}">`).join('')}</datalist>
      <div class="prop-row eyebrow"><span>Producto detectado</span><span>Cantidad</span><span>Unidad</span><span>Confianza</span></div>
      ${r.items.map((it, i) => `<div class="prop-row"><select class="in" data-mi="${i}" data-f="productId">${opt('', `No reconocido: “${it.rawText}”`)}${prodOptions(it.productId)}</select><input class="in num" type="number" min="0" step="any" data-mi="${i}" data-f="qty" value="${it.qty}"><input class="in" data-mi="${i}" data-f="unit" value="${esc(it.unit)}">${confHtml(it.confidence)}</div>`).join('') || '<div class="empty">No se detectaron productos.</div>'}
      <div class="actions" style="margin-top:4px">${can('movimientos.aprobar') ? `<button class="btn pri" id="mq-ok">${ic('check')} Aprobar</button>` : ''}<button class="btn ${can('movimientos.aprobar') ? '' : 'pri'}" id="mq-pend">${ic('edit')} ${can('movimientos.aprobar') ? 'Guardar para revisión' : 'Enviar para aprobación'}</button><button class="btn" id="mq-info">${ic('q')} Solicitar información</button><button class="btn" id="mq-dup">${ic('dup')} Marcar como duplicado</button><button class="btn bad" id="mq-no">${ic('x')} Rechazar</button></div>
    </div>` : ''}
  </div>
  <div class="card"><div class="card-h"><h2>Movimientos propuestos</h2><span class="spacer"></span><div class="seg">${[['pendiente', 'Por revisar'], ['aprobado', 'Aprobados'], ['rechazado', 'Rechazados'], ['todos', 'Todos']].map(([k, l]) => `<button data-mf="${k}" class="${MQ.filter === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Mensaje original</th><th>Producto</th><th class="n">Cant.</th><th>Unidad</th><th>Fecha y hora</th><th>Persona</th><th>Fuente</th><th>Confianza</th><th>Sugerencia</th><th>Estado</th><th></th></tr></thead><tbody>
    ${pend.map((m) => { const p = prodById(m.productId); const c = m.confidence ?? 1; return `<tr class="sev ${m.status === 'duplicado' ? 'sev-warn' : c < S.settings.threshold && m.status === 'pendiente' ? 'sev-bad' : ''}"><td class="small" style="max-width:260px">${esc((m.notes || m.reason || '').replace(/^"|"$/g, '') || '—')}${m.duplicates?.length ? `<span class="sub">${ic('dup').replace('<svg', '<svg style="width:12px;height:12px;vertical-align:-2px"')} ${esc(m.duplicates[0].reason)} (${Math.round(m.duplicates[0].score * 100)} %)</span>` : ''}</td><td><b>${esc(p?.name)}</b><span class="sub">${MOVEMENT_TYPES[m.type].label}${m.area ? ' · ' + esc(m.area) : ''}</span></td><td class="n num">${num(m.qty)}</td><td class="small">${esc(m.unit)}</td><td class="small">${fdt(m.ts)}</td><td class="small">${esc(m.user)}</td><td class="small">${esc(SOURCES[m.source] || m.source)}</td><td>${m.confidence != null ? confHtml(m.confidence) : '<span class="muted small">manual</span>'}</td><td>${m.status === 'pendiente' ? pill(...suggested(c)) : ''}</td><td>${mvPill(m.status)}</td>
    <td>${['pendiente', 'requiere_info', 'duplicado'].includes(m.status) && can('movimientos.aprobar') ? `<div class="actions" style="flex-wrap:nowrap"><button class="btn sm ok" data-ap="${m.id}" title="Aprobar">${ic('check')}</button><button class="btn sm" data-ed="${m.id}" title="Editar">${ic('edit')}</button><button class="btn sm" data-in="${m.id}" title="Solicitar información">${ic('q')}</button><button class="btn sm" data-du="${m.id}" title="Marcar como duplicado">${ic('dup')}</button><button class="btn sm bad" data-rj="${m.id}" title="Rechazar">${ic('x')}</button></div>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="11"><div class="empty">No hay movimientos en esta vista.</div></td></tr>'}
    </tbody></table></div></div>`;
};
BIND.marchados = (el) => {
  const t = $('#mq-text', el);
  const go = () => { MQ.text = t.value.trim(); if (!MQ.text) return; MQ.result = parseInstruction(MQ.text, catalogForParser()); MQ.type = null; MQ.area = null; render(); };
  $('#mq-go', el).onclick = go;
  t.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } };
  $$('[data-ex]', el).forEach((b) => (b.onclick = () => { t.value = b.dataset.ex; go(); }));
  $$('[data-mf]', el).forEach((b) => (b.onclick = () => { MQ.filter = b.dataset.mf; render(); }));
  if (MQ.result) {
    $$('[data-mi]', el).forEach((i) => (i.onchange = () => { const it = MQ.result.items[+i.dataset.mi]; it[i.dataset.f] = i.type === 'number' ? +i.value : i.value; if (i.dataset.f === 'productId' && i.value) { it.matched = true; it.unit = prodById(i.value).unit; it.confidence = 1; } }));
    $('#mq-type', el).onchange = (e) => (MQ.type = e.target.value);
    $('#mq-area', el).onchange = (e) => (MQ.area = e.target.value);
    const commit = async (status, note = '') => {
      const items = MQ.result.items.filter((i) => i.productId && i.qty > 0);
      if (!items.length && status !== 'rechazado') { toast('Selecciona al menos un producto.'); return; }
      const type = $('#mq-type', el).value, area = $('#mq-area', el).value, reason = $('#mq-reason', el).value;
      for (const it of items) {
        await run('addMovement', { productId: it.productId, qty: it.qty, unit: it.unit, type, area, reason, confidence: it.confidence, notes: `"${MQ.text}"` }, { approve: status === 'aprobado' });
        if (S.settings.mode === 'demo' && status !== 'aprobado' && status !== 'pendiente') { const m = S.movements[S.movements.length - 1]; act.setStatus(m.id, status, note); }
      }
      save(); const n = items.length; MQ = { ...MQ, text: '', result: null }; render();
      toast({ aprobado: `${n} movimiento${n > 1 ? 's' : ''} aprobado${n > 1 ? 's' : ''}: inventario actualizado`, pendiente: 'Guardado para revisión', requiere_info: 'Marcado: requiere información', duplicado: 'Marcado como duplicado', rechazado: 'Instrucción rechazada' }[status]);
    };
    $('#mq-ok', el)?.addEventListener('click', () => commit('aprobado'));
    $('#mq-pend', el).onclick = () => commit('pendiente');
    $('#mq-dup', el).onclick = () => commit('duplicado');
    $('#mq-no', el).onclick = () => { MQ.result = null; MQ.text = ''; log('marchado.rechazar', 'Instrucción descartada'); render(); toast('Instrucción rechazada'); };
    $('#mq-info', el).onclick = async () => { const q = await ask({ title: 'Solicitar información', text: 'Escribe la pregunta para quien hizo la solicitud.', input: 'Pregunta', label: 'Guardar solicitud' }); if (q) commit('requiere_info', q); };
  }
  $$('[data-ap]', el).forEach((b) => (b.onclick = async () => { await run('approve', b.dataset.ap, {}); toast('Aprobado: inventario actualizado'); }));
  $$('[data-rj]', el).forEach((b) => (b.onclick = async () => { await run('setStatus', b.dataset.rj, 'rechazado', ''); toast('Rechazado'); }));
  $$('[data-du]', el).forEach((b) => (b.onclick = async () => { await run('setStatus', b.dataset.du, 'duplicado', ''); toast('Marcado como duplicado'); }));
  $$('[data-in]', el).forEach((b) => (b.onclick = async () => { const q = await ask({ title: 'Solicitar información', text: '¿Qué necesitas confirmar?', input: 'Pregunta', label: 'Guardar' }); if (q) await run('setStatus', b.dataset.in, 'requiere_info', q); }));
  $$('[data-ed]', el).forEach((b) => (b.onclick = () => editMovement(b.dataset.ed)));
};
function editMovement(id) {
  const m = S.movements.find((x) => x.id === id);
  const md = modal({ title: 'Editar y aprobar', body: `
    ${m.notes ? `<div class="bubble">${esc(m.notes)}</div>` : ''}
    <div class="grid g2"><div class="field"><label for="em-p">Producto</label><select class="in" id="em-p">${prodOptions(m.productId)}</select></div><div class="field"><label for="em-t">Tipo</label><select class="in" id="em-t">${typeOptions(m.type)}</select></div></div>
    <div class="grid g3"><div class="field"><label for="em-q">Cantidad</label><input class="in" id="em-q" type="number" step="any" value="${m.qty}"></div><div class="field"><label for="em-u">Unidad</label><input class="in" id="em-u" value="${esc(m.unit)}"></div><div class="field"><label for="em-a">Área</label><input class="in" id="em-a" value="${esc(m.area || '')}"></div></div>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="em-ok">${ic('check')} Aprobar con cambios</button>` });
  md.querySelector('#em-ok').onclick = async () => { const g = (k) => md.querySelector('#em-' + k).value; closeModal(); await run('approve', id, { productId: g('p'), type: g('t'), qty: +g('q'), unit: g('u'), area: g('a') }); toast('Aprobado con cambios'); };
}

/* ---------------- WhatsApp ---------------- */
let WA = { tab: 'pendiente_aprobacion' };
RENDER.whatsapp = () => {
  const counts = {}; for (const i of S.inbox) counts[i.status] = (counts[i.status] || 0) + 1;
  const list = S.inbox.filter((i) => WA.tab === 'todos' || i.status === WA.tab).sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const chats = [...new Map(S.inbox.map((i) => [i.chat, i])).values()];
  return `
  <div class="tabs">${[...Object.keys(INBOX_ST), 'todos'].map((k) => `<button data-wt="${k}" class="${WA.tab === k ? 'on' : ''}">${k === 'todos' ? 'Todos' : INBOX_ST[k][0]}<span class="ct">${k === 'todos' ? S.inbox.length : counts[k] || 0}</span></button>`).join('')}</div>
  <div class="grid" style="grid-template-columns:minmax(0,1fr) 300px;align-items:start" id="wa-grid">
  <div class="grid">${list.map(waCard).join('') || '<div class="card empty">Sin mensajes en este estado.</div>'}</div>
  <div class="grid">
    <div class="card"><div class="card-h"><h2>Probar un mensaje</h2></div>
      <div class="field"><label for="wa-from">Remitente</label><select class="in" id="wa-from">${USERS.slice(1).map((u) => opt(u, u)).join('')}</select></div>
      <div class="field" style="margin-top:8px"><label for="wa-text">Texto o transcripción</label><textarea class="in" id="wa-text" rows="3" placeholder="Bajaron 6 polas y 2 aguardientes a la terraza"></textarea></div>
      <div class="field" style="margin-top:8px"><label for="wa-kind">Tipo</label><select class="in" id="wa-kind">${opt('text', 'Mensaje de texto')}${opt('audio', 'Nota de voz (transcrita)')}</select></div>
      <button class="btn pri" id="wa-send" style="margin-top:10px;width:100%">${ic('wa')} Simular mensaje entrante</button>
      <p class="muted small" style="margin:8px 0 0">Pasa por el mismo flujo que el webhook: autorización, interpretación, detección de duplicados y bandeja.</p></div>
    <div class="card"><div class="card-h"><h2>Chats autorizados</h2></div><div class="list">${chats.map((c) => `<div class="li"><span class="thumb">${esc(c.chat.split(' ').map((w) => w[0]).join('').slice(0, 2))}</span><span class="grow"><b>${esc(c.chat)}</b><span class="small muted">+${esc(c.phone)}</span></span>${pill('Autorizado', 'p-ok')}</div>`).join('')}</div>
      <p class="muted small" style="margin:8px 0 0">Mensajes de chats o números no autorizados se descartan sin guardar contenido.</p></div>
  </div></div>`;
};
function waCard(i) {
  const a = i.analysis || { items: [] }; const [lab, cls] = INBOX_ST[i.status];
  const mvs = S.movements.filter((m) => m.inboxId === i.id);
  const att = i.type === 'audio' ? `<div class="att">${ic('mic')}<span>Nota de voz · ${esc(i.duration || '0:05')}</span></div>` : i.type === 'image' ? `<div class="att">${ic('img')}<span>Foto · ${esc(i.doc?.documentType || 'imagen')}</span></div>` : i.type === 'document' ? `<div class="att">${ic('doc')}<span>PDF · ${esc(i.doc?.documentType || 'documento')}</span></div>` : '';
  const pending = ['pendiente_aprobacion', 'requiere_info', 'pendiente_analisis', 'duplicado'].includes(i.status);
  return `<div class="card msg">
    <div><div class="bubble"><div class="meta"><b>${esc(i.from)}</b><span>${esc(i.chat)}</span><span>${fdt(i.ts)}</span></div>${i.text ? esc(i.text) : ''}${i.transcript ? `<div class="small" style="margin-top:6px"><span class="eyebrow">Transcripción</span><br>“${esc(i.transcript)}”</div>` : ''}${att}</div>
      ${i.doc ? `<div class="small" style="margin-top:8px"><span class="eyebrow">Datos leídos del documento</span><div class="tbl-wrap" style="margin-top:4px"><table><tbody><tr><td>Proveedor</td><td>${esc(i.doc.supplier)}</td></tr><tr><td>Factura</td><td class="mono">${esc(i.doc.invoiceNumber)}</td></tr><tr><td>Fecha</td><td>${esc(i.doc.date)}</td></tr><tr><td>Pago</td><td>${esc(i.doc.paymentMethod)}</td></tr><tr><td>Total</td><td class="num">${money(i.doc.total)}</td></tr></tbody></table></div></div>` : ''}
      ${i.reviewNote ? `<p class="small" style="margin:8px 0 0"><b>Nota:</b> ${esc(i.reviewNote)}</p>` : ''}
    </div>
    <div class="prop">
      <div class="row"><span class="eyebrow">${a.type === 'gasto' ? 'Gasto detectado' : 'Acción interpretada: ' + esc(MOVEMENT_TYPES[a.type]?.label || a.type)}${a.area ? ' · ' + esc(a.area) : ''}</span><span class="spacer"></span>${confHtml(i.confidence)} ${pill(lab, cls)}</div>
      ${a.type === 'gasto' ? `<div class="small">${esc(i.doc.items[0].description)} · <b class="num">${money(i.doc.total)}</b></div>` :
        (a.items.map((x) => { const m = mvs.find((mm) => mm.productId === x.productId); return `<div class="prop-row"><span>${x.productId ? `<b>${esc(prodById(x.productId)?.name)}</b>` : `<span class="neg">No reconocido: “${esc(x.rawText)}”</span>`}${m?.duplicates?.length ? `<span class="sub">${esc(m.duplicates[0].reason)}</span>` : ''}</span><span class="num">${num(x.qty)}</span><span class="small">${esc(x.unit)}</span>${m ? mvPill(m.status) : confHtml(x.confidence)}</div>`; }).join('') || '<div class="small muted">No se detectaron productos ni cantidades.</div>')}
      ${pending ? `<div class="actions" style="margin-top:6px">
        ${a.type === 'gasto' ? `<button class="btn sm pri" data-wexp="${i.id}">${ic('check')} Registrar gasto</button>` : i.doc ? `<button class="btn sm pri" data-winv="${i.id}">${ic('in')} Abrir como entrada</button>` : `<button class="btn sm pri" data-wst="aprobado" data-id="${i.id}" ${mvs.some((m) => m.status === 'pendiente') ? '' : 'disabled'}>${ic('check')} Aprobar</button>`}
        ${a.type !== 'gasto' && !i.doc ? `<button class="btn sm" data-wed="${i.id}">${ic('edit')} Editar</button>` : ''}
        <button class="btn sm" data-wst="requiere_info" data-id="${i.id}">${ic('q')} Solicitar información</button>
        <button class="btn sm" data-wst="duplicado" data-id="${i.id}">${ic('dup')} Duplicado</button>
        <button class="btn sm bad" data-wst="rechazado" data-id="${i.id}">${ic('x')} Rechazar</button></div>` : ''}
    </div></div>`;
}
BIND.whatsapp = (el) => {
  if (innerWidth < 1100) $('#wa-grid', el).style.gridTemplateColumns = '1fr';
  $$('[data-wt]', el).forEach((b) => (b.onclick = () => { WA.tab = b.dataset.wt; render(); }));
  $$('[data-wst]', el).forEach((b) => (b.onclick = async () => {
    const st = b.dataset.wst; let note = '';
    if (st === 'requiere_info') { note = await ask({ title: 'Solicitar información', text: 'La pregunta se enviará al remitente por WhatsApp cuando la API esté conectada.', input: 'Pregunta', label: 'Enviar' }); if (!note) return; }
    await run('inboxStatus', b.dataset.id, st, { note }); toast({ aprobado: 'Aprobado: inventario actualizado', rechazado: 'Mensaje rechazado', duplicado: 'Marcado como duplicado', requiere_info: 'Solicitud registrada' }[st]);
  }));
  $$('[data-winv]', el).forEach((b) => (b.onclick = () => loadInvoiceFromInbox(b.dataset.winv)));
  $$('[data-wexp]', el).forEach((b) => (b.onclick = async () => { const i = S.inbox.find((x) => x.id === b.dataset.wexp); await run('saveExpense', { date: i.doc.date, category: 'Lavandería externa', description: `${i.doc.items[0].description} — ${i.doc.supplier} ${i.doc.invoiceNumber}`, amount: i.doc.total, payMethod: i.doc.paymentMethod, source: 'whatsapp_foto', attachment: 'recibo-whatsapp.pdf' }); act.inboxStatus(i.id, 'procesado', { silent: true }); save(); render(); toast('Gasto registrado'); }));
  $$('[data-wed]', el).forEach((b) => (b.onclick = () => { const i = S.inbox.find((x) => x.id === b.dataset.wed); const m = S.movements.find((x) => x.inboxId === i.id && ['pendiente', 'duplicado', 'requiere_info'].includes(x.status)); if (m) editMovement(m.id); else { MQ.text = i.transcript || i.text; MQ.result = parseInstruction(MQ.text, catalogForParser()); location.hash = 'marchados'; } }));
  $('#wa-send', el).onclick = () => {
    const text = $('#wa-text', el).value.trim(); if (!text) { toast('Escribe un mensaje para probar.'); return; }
    const from = $('#wa-from', el).value, kind = $('#wa-kind', el).value;
    const it = ingestMessage({ from, phone: '57300' + Math.floor(1e6 + Math.random() * 9e6), chat: { 'Camila Rojas': 'Grupo Bar Capybara', 'Andrés Pérez': 'Recepción', 'Luz Marina': 'Grupo Housekeeping', 'Jhon Fredy': 'Grupo Cocina' }[from] || 'Recepción', ts: new Date().toISOString(), type: kind, text: kind === 'text' ? text : '', transcript: kind === 'audio' ? text : undefined, duration: '0:06' });
    WA.tab = it.status; save(); render(); toast(`Mensaje analizado: ${INBOX_ST[it.status][0]}`);
  };
};
