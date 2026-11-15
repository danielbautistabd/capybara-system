/* ================= Capybara Control · app (9): Pedidos con cuenta abierta ================= */
/* Ruta: el equipo anota cada pedido en la cuenta abierta del huésped/habitación (hoja tipo Google Sheets)
 * → al cerrar la cuenta sale UNA factura emitida (descuenta inventario) → la revisión "Para Alegra"
 * las envía en bloque. Funciona con el servidor (modo API); en demostración no aparece. */

VIEWS.facturacion.t = 'Pedidos y facturación';
VIEWS.facturacion.short = 'Pedidos';
let ORD = { tabs: [], drafts: [], showClosed: false, busy: false, loaded: false, drive: null };
const ordApi = () => S.settings.mode === 'api';
const ordTabById = (id) => ORD.tabs.find((t) => t.id === id);
const ordTabLabel = (t) => (t ? `${t.number} · ${t.customerName}${t.room ? ' · ' + t.room : ''}` : '');
const ordOpenTabs = () => ORD.tabs.filter((t) => t.status === 'abierta');
const fHora = (ts) => new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
const fDia = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const invNumberById = (id) => (id ? Object.entries(S.billing?.status || {}).find(([, v]) => v.invoiceId === id)?.[0] || '' : '');
const ORD_ST = { pedido: 'Pedido', anulado: 'Anulado', facturado: 'Facturado' };

async function loadOrders() {
  // Se llama al iniciar sesión, antes de que el modo quede en 'api': basta con tener sesión.
  if (!S.settings.token || !(can('facturacion.crear') || can('facturacion.emitir'))) { ORD.tabs = []; return; }
  try { ORD.tabs = await remote.req(`/api/v1/orders/tabs?status=${ORD.showClosed ? 'todas' : 'abierta'}&days=7`); ORD.loaded = true; }
  catch (e) { toast('No se cargaron los pedidos: ' + e.message); }
  ORD.drive = await remote.req('/api/v1/orders/sheet').catch(() => null);
}
const _remoteLoad9 = remote.load;
remote.load = async () => { await _remoteLoad9(); await loadOrders(); };

/* ---------- pestañas extra de la hoja ---------- */
sheetExtraTabs = () => (!ordApi() ? [] : [
  ...(can('facturacion.crear') || can('facturacion.emitir') ? [['pedidos', 'Pedidos'], ['cuentas', 'Cuentas']] : []),
  ...(can('alegra.gestionar') || can('alegra.enviar') ? [['alegra', `Para Alegra${pendingAlegra().length ? ' · ' + pendingAlegra().length : ''}`]] : []),
]);
const _sheetDef9 = sheetDef;
sheetDef = function () {
  if (!SH._ord) { SH._ord = true; if (ordApi() && (can('facturacion.crear') || can('facturacion.emitir'))) { SH.tab = 'pedidos'; SH.c = 5; } }
  if (!ordApi() && ['pedidos', 'cuentas', 'alegra'].includes(SH.tab)) SH.tab = 'ventas';
  if (SH.tab === 'pedidos') return pedidosDef();
  if (SH.tab === 'cuentas') return cuentasDef();
  if (SH.tab === 'alegra') return alegraDef();
  return _sheetDef9();
};

/* ---------- registro en Google Drive ---------- */
const canDrive = () => can('facturacion.emitir') || can('sheets.sincronizar');
function driveHtml() {
  const d = ORD.drive; if (!d) return '';
  if (!d.configured) return `<span class="small muted" title="Configura ORDERS_SHEET_ID y la cuenta de servicio de Google en el servidor">Drive: sin configurar</span>`;
  const last = d.last ? `${d.last.error ? '<span class="neg">con error</span>' : 'al día'} · ${fHora(d.last.at)} · ${num(d.last.rows || 0)} filas` : 'sin registrar aún';
  return `<span class="small muted">Drive: ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.tab)}</a>` : esc(d.tab)} ${last}</span>${canDrive() ? `<button class="btn sm ghost" id="or-drive" ${ORD.busy ? 'disabled' : ''}>Registrar en Drive</button>` : ''}`;
}
function driveBind(el) {
  $('#or-drive', el)?.addEventListener('click', async () => {
    ORD.busy = true; render();
    try { const r = await remote.req('/api/v1/orders/sheet/sync', { method: 'POST' }); toast(`Registrado en Drive: ${num(r.rows)} pedidos en la pestaña ${ORD.drive?.tab || 'Pedidos'}`); }
    catch (e) { toast(e.message); }
    ORD.busy = false; ORD.drive = await remote.req('/api/v1/orders/sheet').catch(() => ORD.drive); render();
  });
}

/* ---------- Pedidos: una fila por pedido ---------- */
function pedidosRows() {
  const q = normalize(SH.q || '');
  const rows = ORD.tabs.flatMap((t) => t.lines.map((l) => ({ ...l, tabLabel: ordTabLabel(t), _tab: t })));
  const drafts = ORD.drafts.map((d) => ({ ...d, _tab: ordTabById(d.tabId) }));
  return [...rows, ...drafts].filter((r) => !q || normalize(`${r.tabLabel} ${r.product || prodById(r.productId)?.name || ''} ${r.waiter || ''}`).includes(q));
}
function pedidosDef() {
  const rows = pedidosRows();
  const total = (r) => { const sub = (+r.qty || 0) * (+r.price || 0); return sub + Math.round((sub * (+r.taxPct || 0)) / 100); };
  return {
    title: 'Pedidos', noDelete: true,
    rows,
    locked: (r) => !can('facturacion.crear') || (!r._draft && (r.status !== 'pedido' || r._tab?.status !== 'abierta')),
    cols: [
      { num: false, k: 'fecha', h: 'Fecha', w: 96, t: 'calc', f: (r) => (r.ts ? new Date(fDia(r.ts) + 'T12:00').toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' }) : 'nuevo') },
      { num: false, k: 'hora', h: 'Hora', w: 64, t: 'calc', f: (r) => (r.ts ? fHora(r.ts) : '') },
      { k: 'tabLabel', h: 'Cuenta', w: 210, t: 'select', o: ['', ...ordOpenTabs().map(ordTabLabel)] },
      { num: false, k: 'cliente', h: 'Huésped / cliente', w: 150, t: 'calc', f: (r) => r._tab?.customerName || '' },
      { num: false, k: 'hab', h: 'Hab. / cama', w: 86, t: 'calc', f: (r) => r._tab?.room || '' },
      { k: 'productId', h: 'Producto', w: 210, t: 'product' },
      { k: 'qty', h: 'Cant.', w: 60, t: 'num' },
      { k: 'price', h: 'Precio', w: 96, t: 'money' },
      { k: 'taxPct', h: 'Impuesto', w: 92, t: 'tax' },
      { k: 'total', h: 'Total', w: 100, t: 'calc', f: (r) => (r.productId ? total(r) : ''), fx: (n) => `=G${n}*H${n}*(1+I${n})` },
      { num: false, k: 'waiter', h: 'Mesero', w: 120, t: 'calc', f: (r) => r.waiter || me().name },
      { k: 'st', h: 'Estado', w: 96, t: 'calc', f: (r) => (r._draft ? 'Sin guardar' : r._tab?.status === 'abierta' ? ORD_ST[r.status] : r.status === 'anulado' ? 'Anulado' : r._tab?.status === 'anulada' ? 'Cuenta anulada' : 'Facturado') },
      { num: false, k: 'pago', h: 'Forma de pago', w: 110, t: 'calc', f: (r) => r._tab?.payMethod || '' },
      { num: false, k: 'factura', h: 'Factura / Alegra', w: 130, t: 'calc', f: (r) => { const n = invNumberById(r._tab?.invoiceId); return n ? `${n}${S.billing.status[n]?.alegra ? ' · Alegra ' + S.billing.status[n].alegra : ''}` : ''; } },
    ],
    totals: { qty: 1, total: 1 },
    onChange: (row, c) => pedidoChanged(row, c),
    toolbar: pedidosToolbar,
    bind: pedidosBind,
    footer: () => `<p class="muted small" style="margin:0">Cada fila es un pedido de la cuenta del huésped o de la mesa. Los pedidos <b>no descuentan inventario</b>: al <b>cerrar la cuenta</b> sale una sola factura, se descuenta el inventario y queda en <b>Para Alegra</b> para que un administrador o manager la revise y la envíe. Un pedido nunca se borra: se anula con motivo.</p>`,
  };
}
async function pedidoChanged(row, c) {
  if (row._draft) {
    const d = ORD.drafts.find((x) => x.id === row.id); if (!d) return;
    if (c.k === 'tabLabel') d.tabId = ordOpenTabs().find((t) => ordTabLabel(t) === row.tabLabel)?.id || '';
    if (['productId', 'qty', 'price', 'taxPct'].includes(c.k)) { d[c.k] = row[c.k]; (d._set ||= {})[c.k] = true; }
    if (c.k === 'productId' && !d._set.price) { const p = prodById(row.productId); d.price = +p?.salePrice || 0; d.taxPct = defaultTax(p); }
    if (!d.tabId || !d.productId) { render(); if (d.productId && !d.tabId) toast('Elige la cuenta del pedido (columna C).'); return; }
    if (!(+d.qty > 0)) return toast('La cantidad debe ser mayor que cero.');
    try {
      const saved = await remote.req(`/api/v1/orders/tabs/${d.tabId}/lines`, { method: 'POST', body: { productId: d.productId, qty: +d.qty, ...(d._set.price ? { price: +d.price } : {}), ...(d._set.taxPct ? { taxPct: +d.taxPct } : {}) } });
      ORD.drafts = ORD.drafts.filter((x) => x.id !== d.id); await loadOrders();
      // el cursor queda en la cantidad del pedido recién guardado, listo para escribirla
      const i = pedidosRows().findIndex((x) => x.id === saved.id); if (i >= 0) { SH.r = i; SH.c = 6; SH.edit = false; }
      render(); $('#gs-grid')?.focus({ preventScroll: true }); toast(`${saved.product} guardado: escribe la cantidad o pasa al siguiente pedido`);
    } catch (e) { toast('No se guardó el pedido: ' + e.message); render(); }
    return;
  }
  if (c.k === 'tabLabel') { toast('Para pasar un pedido a otra cuenta, anúlalo y créalo en la otra.'); await loadOrders(); return render(); }
  if (!['productId', 'qty', 'price', 'taxPct'].includes(c.k)) return;
  if (c.k === 'qty' && !(+row.qty > 0)) { toast('La cantidad debe ser mayor que cero. Para quitar el pedido, anúlalo.'); await loadOrders(); return render(); }
  try { await remote.req(`/api/v1/orders/lines/${row.id}`, { method: 'PATCH', body: { [c.k]: c.k === 'productId' ? row.productId : +row[c.k] } }); await loadOrders(); render(); }
  catch (e) { toast('No se guardó el cambio: ' + e.message); await loadOrders(); render(); }
}
function pedidosToolbar(row) {
  const t = row?._tab;
  const live = t ? t.lines.filter((l) => l.status !== 'anulado') : [];
  return `
    ${can('facturacion.crear') ? `<button class="btn sm pri" id="or-quick">${ic('plus')} Pedido rápido</button><button class="btn sm" id="or-newtab">Nueva cuenta</button><button class="btn sm" id="or-newline" ${ordOpenTabs().length ? '' : 'disabled title="Primero abre una cuenta"'}>Fila nueva</button>` : ''}
    ${row && !row._draft && row.status === 'pedido' && t?.status === 'abierta' && can('facturacion.crear') ? `<button class="btn sm ghost" id="or-voidline">${ic('x')} Anular pedido</button>` : ''}
    ${row?._draft ? `<button class="btn sm ghost" id="or-dropdraft">${ic('x')} Quitar fila</button>` : ''}
    <label class="row small" style="gap:4px"><input type="checkbox" id="or-closed" ${ORD.showClosed ? 'checked' : ''}> Ver cerradas (7 días)</label>
    ${driveHtml()}
    ${t ? `<span class="gs-sep"></span><span class="small">Cuenta <b class="mono">${esc(t.number)}</b> · ${esc(t.customerName)}${t.room ? ' · ' + esc(t.room) : ''} · ${live.length} ${live.length === 1 ? 'pedido' : 'pedidos'} · <b class="num">${money(t.total)}</b></span>
      ${t.status === 'abierta' ? `<button class="btn sm" id="or-prebill">Pre-cuenta</button>` : ''}
      ${t.status === 'abierta' && can('facturacion.emitir') ? `<button class="btn sm pri" id="or-close">${ic('check')} Cerrar y facturar</button><button class="btn sm ghost" id="or-voidtab">Anular cuenta</button>` : ''}
      ${t.status === 'abierta' && !can('facturacion.emitir') ? pill('Caja o un manager cierra la cuenta', 'p-info') : ''}` : ''}`;
}
function pedidosBind(el) {
  driveBind(el);
  $('#or-quick', el)?.addEventListener('click', () => quickOrderModal(sheetDef().rows?.[SH.r]?._tab?.status === 'abierta' ? sheetDef().rows[SH.r]._tab.id : ''));
  $('#or-prebill', el)?.addEventListener('click', () => preBill(sheetDef().rows[SH.r]._tab));
  $('#or-newtab', el)?.addEventListener('click', () => tabForm());
  $('#or-newline', el)?.addEventListener('click', () => newOrderLine());
  $('#or-dropdraft', el)?.addEventListener('click', () => { const r = sheetDef().rows[SH.r]; ORD.drafts = ORD.drafts.filter((x) => x.id !== r.id); SH.r = Math.max(0, SH.r - 1); render(); });
  $('#or-closed', el)?.addEventListener('change', async (e) => { ORD.showClosed = e.target.checked; await loadOrders(); SH.r = 0; render(); });
  $('#or-voidline', el)?.addEventListener('click', async () => {
    const r = sheetDef().rows[SH.r];
    const reason = await ask({ title: `Anular pedido de ${esc(r._tab.customerName)}`, text: `${esc(r.product || '')} × ${num(r.qty)}. El pedido no se borra: queda anulado con el motivo.`, input: 'Motivo (obligatorio)', label: 'Anular pedido', danger: true });
    if (!reason) return; if (reason.trim().length < 3) return toast('Escribe un motivo de al menos 3 letras.');
    try { await remote.req(`/api/v1/orders/lines/${r.id}/void`, { method: 'POST', body: { reason } }); await loadOrders(); render(); toast('Pedido anulado'); } catch (e) { toast('No se anuló: ' + e.message); }
  });
  $('#or-close', el)?.addEventListener('click', () => closeTabModal(sheetDef().rows[SH.r]._tab));
  $('#or-voidtab', el)?.addEventListener('click', () => voidTab(sheetDef().rows[SH.r]._tab));
}
function newOrderLine(tabId) {
  const cur = sheetDef().rows?.[SH.r]?._tab;
  const tid = tabId || (cur?.status === 'abierta' ? cur.id : ordOpenTabs().slice(-1)[0]?.id) || '';
  if (SH.tab !== 'pedidos') SH.tab = 'pedidos';
  ORD.drafts.push({ id: uid('od'), _draft: true, tabId: tid, tabLabel: ordTabLabel(ordTabById(tid)), productId: '', qty: 1, price: 0, taxPct: 8 });
  SH.q = ''; SH.r = pedidosRows().length - 1; SH.c = 5; SH.edit = false; render();
  toast('Escribe el producto y presiona Enter');
}
function tabForm(t = null) {
  const m = modal({ title: t ? `Editar cuenta ${esc(t.number)}` : 'Nueva cuenta', body: `
    <div class="grid g2"><div class="field"><label for="tf-name">Huésped o cliente</label><input class="in" id="tf-name" value="${esc(t?.customerName || '')}" placeholder="Nombre"></div>
    <div class="field"><label for="tf-room">Habitación, cama o punto</label><input class="in" id="tf-room" value="${esc(t?.room || '')}" placeholder="203 · Cama 4 · Bar · Terraza"></div></div>
    <div class="field"><label for="tf-doc">Documento (opcional, para la factura)</label><input class="in" id="tf-doc" value="${esc(t?.customerDoc || '')}" placeholder="Cédula, pasaporte o NIT"></div>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="tf-ok">${t ? 'Guardar' : 'Abrir cuenta'}</button>` });
  const go = async () => {
    const body = { customerName: m.querySelector('#tf-name').value.trim(), room: m.querySelector('#tf-room').value.trim() || null, customerDoc: m.querySelector('#tf-doc').value.trim() || null };
    if (body.customerName.length < 2) return toast('Escribe el nombre del huésped o cliente.');
    try {
      const out = await remote.req(t ? `/api/v1/orders/tabs/${t.id}` : '/api/v1/orders/tabs', { method: t ? 'PATCH' : 'POST', body });
      closeModal(); await loadOrders();
      if (!t) { newOrderLine(out.id); toast(`Cuenta ${out.number} abierta: anota el primer pedido`); } else { render(); toast('Cuenta actualizada'); }
    } catch (e) { toast('No se guardó la cuenta: ' + e.message); }
  };
  m.querySelector('#tf-ok').onclick = go;
  m.querySelector('#tf-room').onkeydown = (e) => e.key === 'Enter' && go();
}
function closeTabModal(t) {
  const live = t.lines.filter((l) => l.status !== 'anulado');
  const pays = PAY.filter((p) => p !== 'Crédito proveedor');
  const m = modal({ title: `Cerrar y facturar ${esc(t.number)}`, body: `
    <p class="small" style="margin:0 0 8px"><b>${esc(t.customerName)}</b>${t.room ? ' · ' + esc(t.room) : ''} · ${live.length} pedidos</p>
    <div class="tbl-wrap"><table><thead><tr><th>Producto</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Total</th><th>Mesero</th></tr></thead><tbody>
    ${live.map((l) => { const sub = l.qty * l.price; return `<tr><td>${esc(l.product)}</td><td class="n num">${num(l.qty)}</td><td class="n num">${money(l.price)}</td><td class="n num">${money(sub + Math.round((sub * l.taxPct) / 100))}</td><td class="small">${esc(l.waiter)}</td></tr>`; }).join('')}
    </tbody><tfoot><tr><td colspan="3"><b>Total a cobrar</b> <span class="muted small">(${money(t.subtotal)} + impuestos ${money(t.tax)})</span></td><td class="n num"><b>${money(t.total)}</b></td><td></td></tr></tfoot></table></div>
    <div class="grid g2" style="margin-top:10px"><div class="field"><label for="ct-pay">Forma de pago</label><select class="in" id="ct-pay">${pays.map((p) => opt(p, p, 'Efectivo')).join('')}</select></div>
    <div class="field"><label for="ct-doc">Documento del cliente</label><input class="in" id="ct-doc" value="${esc(t.customerDoc || '')}" placeholder="Opcional"></div></div>
    <p class="muted small" style="margin:0">Se crea una factura con estos pedidos, se descuenta el inventario y queda en <b>Para Alegra</b> para revisión.</p>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="ct-ok">${ic('check')} Facturar ${money(t.total)}</button>` });
  m.querySelector('#ct-ok').onclick = async (ev) => {
    ev.target.disabled = true;
    try {
      const r = await remote.req(`/api/v1/orders/tabs/${t.id}/close`, { method: 'POST', body: { payMethod: m.querySelector('#ct-pay').value, customerDoc: m.querySelector('#ct-doc').value.trim() || null } });
      closeModal(); await remote.load(); save(); render();
      toast(`${t.number} cerrada: factura ${r.invoice.number} por ${money(r.invoice.total)}${r.warnings?.length ? ' · ' + r.warnings.join('; ') : ''}`);
    } catch (e) { ev.target.disabled = false; toast('No se cerró la cuenta: ' + e.message); }
  };
}
async function voidTab(t) {
  const reason = await ask({ title: `Anular cuenta ${esc(t.number)}`, text: 'La cuenta y sus pedidos quedan anulados (no se borran). Úsalo solo si se abrió por error.', input: 'Motivo (obligatorio)', label: 'Anular cuenta', danger: true });
  if (!reason) return; if (reason.trim().length < 3) return toast('Escribe un motivo de al menos 3 letras.');
  try { await remote.req(`/api/v1/orders/tabs/${t.id}/void`, { method: 'POST', body: { reason } }); await loadOrders(); SH.r = 0; render(); toast(`Cuenta ${t.number} anulada`); } catch (e) { toast('No se anuló: ' + e.message); }
}

/* ---------- Cuentas: una fila por cuenta ---------- */
function cuentasDef() {
  const q = normalize(SH.q || '');
  const rows = ORD.tabs.filter((t) => !q || normalize(`${t.number} ${t.customerName} ${t.room || ''}`).includes(q)).map((t) => ({ ...t, _tab: t }));
  return {
    title: 'Cuentas', noDelete: true, rows,
    locked: (t) => t.status !== 'abierta' || !can('facturacion.crear'),
    cols: [
      { num: false, k: 'number', h: 'Cuenta', w: 92, t: 'calc', f: (t) => t.number },
      { k: 'customerName', h: 'Huésped / cliente', w: 170, t: 'text' },
      { k: 'room', h: 'Hab. / cama', w: 92, t: 'text' },
      { k: 'customerDoc', h: 'Documento', w: 110, t: 'text' },
      { num: false, k: 'abierta', h: 'Abierta', w: 120, t: 'calc', f: (t) => `${new Date(fDia(t.openedAt) + 'T12:00').toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })} ${fHora(t.openedAt)}` },
      { k: 'pedidos', h: 'Pedidos', w: 72, t: 'calc', f: (t) => t.pedidos },
      { k: 'subtotal', h: 'Subtotal', w: 100, t: 'calc', f: (t) => t.subtotal },
      { k: 'tax', h: 'Impuestos', w: 92, t: 'calc', f: (t) => t.tax },
      { k: 'total', h: 'Total', w: 104, t: 'calc', f: (t) => t.total },
      { num: false, k: 'openedBy', h: 'Abrió', w: 120, t: 'calc', f: (t) => t.openedBy },
      { k: 'st', h: 'Estado', w: 92, t: 'calc', f: (t) => ({ abierta: 'Abierta', cerrada: 'Cerrada', anulada: 'Anulada' }[t.status] || t.status) },
      { num: false, k: 'pago', h: 'Forma de pago', w: 110, t: 'calc', f: (t) => t.payMethod || '' },
      { num: false, k: 'factura', h: 'Factura / Alegra', w: 130, t: 'calc', f: (t) => { const n = invNumberById(t.invoiceId); return n ? `${n}${S.billing.status[n]?.alegra ? ' · Alegra ' + S.billing.status[n].alegra : ''}` : ''; } },
    ],
    totals: { pedidos: 1, subtotal: 1, tax: 1, total: 1 },
    onChange: async (t, c) => {
      if (!['customerName', 'room', 'customerDoc'].includes(c.k)) return;
      if (c.k === 'customerName' && String(t.customerName).trim().length < 2) { toast('El nombre debe tener al menos 2 letras.'); await loadOrders(); return render(); }
      try { await remote.req(`/api/v1/orders/tabs/${t.id}`, { method: 'PATCH', body: { [c.k]: String(t[c.k] || '').trim() || null } }); await loadOrders(); render(); }
      catch (e) { toast('No se guardó: ' + e.message); await loadOrders(); render(); }
    },
    toolbar: (t) => `
      ${can('facturacion.crear') ? `<button class="btn sm" id="or-newtab">${ic('plus')} Nueva cuenta</button>` : ''}
      <label class="row small" style="gap:4px"><input type="checkbox" id="or-closed" ${ORD.showClosed ? 'checked' : ''}> Ver cerradas (7 días)</label>
      ${driveHtml()}
      ${t && t.status === 'abierta' ? `<span class="gs-sep"></span>${can('facturacion.crear') ? `<button class="btn sm" id="or-addto">${ic('plus')} Pedido para ${esc(t.number)}</button>` : ''}<button class="btn sm" id="or-prebill">Pre-cuenta</button>${can('facturacion.emitir') ? `<button class="btn sm pri" id="or-close">${ic('check')} Cerrar y facturar ${money(t.total)}</button><button class="btn sm ghost" id="or-voidtab">Anular cuenta</button>` : ''}` : ''}`,
    bind: (el) => {
      pedidosBind(el);
      $('#or-addto', el)?.addEventListener('click', () => quickOrderModal(sheetDef().rows[SH.r].id));
    },
    footer: () => `<p class="muted small" style="margin:0">Una fila por cuenta. Puedes corregir el nombre, la habitación y el documento mientras la cuenta esté abierta.</p>`,
  };
}

/* ---------- Para Alegra: revisión de facturas emitidas que aún no están en Alegra ---------- */
function pendingAlegra() {
  if (!S.billing?.lines) return [];
  const by = {};
  for (const l of S.billing.lines) {
    const st = S.billing.status[l.inv]; if (!st || st.st !== 'emitida' || st.alegra) continue;
    const g = (by[l.inv] ||= { id: l.inv, inv: l.inv, invoiceId: st.invoiceId, date: l.date, customer: l.customer, room: l.room, pay: l.pay, by: st.by || '', sub: 0, tax: 0, total: 0, lines: 0, missing: [] });
    const c = lineCalc(l); g.sub += c.sub; g.tax += c.tax; g.total += c.total; g.lines++;
    const p = prodById(l.productId); if (p && !p.alegraItemId && !g.missing.includes(p.name)) g.missing.push(p.name);
  }
  return Object.values(by).sort((a, b) => a.date.localeCompare(b.date) || a.inv.localeCompare(b.inv));
}
let ALG = { sending: false };
function alegraDef() {
  const q = normalize(SH.q || '');
  const rows = pendingAlegra().filter((r) => !q || normalize(`${r.inv} ${r.customer} ${r.room}`).includes(q));
  const ready = rows.filter((r) => !r.missing.length), blocked = rows.filter((r) => r.missing.length);
  const missingAll = [...new Set(blocked.flatMap((r) => r.missing))];
  return {
    title: 'Para Alegra', noDelete: true, rows, locked: () => true,
    cols: [
      { k: 'date', h: 'Fecha', w: 100, t: 'date' }, { k: 'inv', h: 'Factura', w: 92, t: 'text' }, { k: 'customer', h: 'Cliente / huésped', w: 170, t: 'text' }, { k: 'room', h: 'Hab. / punto', w: 92, t: 'text' },
      { num: false, k: 'cuenta', h: 'Cuenta', w: 92, t: 'calc', f: (r) => S.billing.status[r.inv]?.tab || '' },
      { k: 'lines', h: 'Líneas', w: 64, t: 'num' }, { k: 'sub', h: 'Subtotal', w: 104, t: 'money' }, { k: 'tax', h: 'Impuestos', w: 96, t: 'money' }, { k: 'total', h: 'Total', w: 108, t: 'money' },
      { k: 'pay', h: 'Pago', w: 104, t: 'text' }, { k: 'by', h: 'Emitió', w: 120, t: 'text' },
      { k: 'st', h: 'Revisión', w: 240, t: 'calc', f: (r) => (r.missing.length ? `Vincular en Alegra: ${r.missing.join(', ')}` : 'Lista para enviar') },
    ],
    totals: { lines: 1, sub: 1, tax: 1, total: 1 },
    toolbar: (r) => `
      <button class="btn sm pri" id="al-all" ${ready.length && !ALG.sending ? '' : 'disabled'}>${ic('check')} Enviar ${ready.length === 1 ? 'la factura lista' : `las ${ready.length} facturas listas`} a Alegra</button>
      ${r && !r.missing.length ? `<button class="btn sm" id="al-one" ${ALG.sending ? 'disabled' : ''}>Enviar solo ${esc(r.inv)}</button>` : ''}
      ${r ? `<button class="btn sm ghost" id="al-see">Ver ${esc(r.inv)} en Ventas</button>` : ''}
      ${blocked.length && can('alegra.gestionar') ? `<button class="btn sm" id="al-link">Vincular ${missingAll.length} ${missingAll.length === 1 ? 'producto' : 'productos'} en Alegra</button>` : ''}
      <span class="spacer"></span><span class="small muted">${rows.length ? `${ready.length} listas · ${blocked.length} por vincular · ${money(rows.reduce((a, x) => a + x.total, 0))}` : 'Todo está en Alegra'}</span>`,
    bind: (el) => {
      const send = async (list) => {
        ALG.sending = true; render();
        const ok = [], bad = [];
        for (const r of list) { try { const x = await remote.req(`/api/v1/invoices/${r.invoiceId}/alegra`, { method: 'POST' }); ok.push(`${r.inv}→${x.alegraInvoiceId}`); } catch (e) { bad.push(`${r.inv}: ${e.message}`); } }
        ALG.sending = false; await remote.load(); save(); render();
        toast(`${ok.length} enviadas a Alegra${bad.length ? ` · ${bad.length} con error: ${bad.join('; ')}` : ''}`);
      };
      $('#al-all', el)?.addEventListener('click', async () => { const list = sheetDef().rows.filter((r) => !r.missing.length); if (await ask({ title: 'Enviar a Alegra', text: `Se enviarán <b>${list.length}</b> facturas por <b>${money(list.reduce((a, x) => a + x.total, 0))}</b>. Revisa cliente, valores y forma de pago antes de continuar.`, label: 'Enviar a Alegra' })) send(list); });
      $('#al-link', el)?.addEventListener('click', () => { location.hash = 'alegra'; toast('Vincula cada producto con su ítem de Alegra y vuelve a Para Alegra.'); });
      $('#al-one', el)?.addEventListener('click', () => send([sheetDef().rows[SH.r]]));
      $('#al-see', el)?.addEventListener('click', () => { const r = sheetDef().rows[SH.r]; SH.tab = 'ventas'; SH.q = r.inv; SH.r = 0; render(); });
    },
    footer: () => `<p class="muted small" style="margin:0">Facturas emitidas que todavía no están en Alegra. Revisa cliente, valores y forma de pago y envía en bloque las listas; cada una queda con su número de Alegra en Ventas, Pedidos y Cuentas. Las que tienen productos sin vincular a un ítem de Alegra no se envían hasta vincularlos (pantalla Alegra).</p>`,
  };
}

/* ---------- Pedido rápido (pensado para el celular del mesero) y pre-cuenta ---------- */
let QO = { tabId: '', newTab: false, q: '', cat: '', cart: {}, name: '', room: '' };
const sellable = () => S.products.filter((p) => p.status === 'activo' && p.kind !== 'activo' && p.kind !== 'menaje' && (+p.salePrice > 0 || p.kind === 'servicio'));
function quickOrderModal(tabId = '') {
  if (!ordApi()) return toast('Los pedidos funcionan con el servidor conectado.');
  const open = ordOpenTabs();
  QO = { tabId: tabId || (open.length ? open[open.length - 1].id : ''), newTab: !open.length, q: '', cat: '', cart: {}, name: '', room: '' };
  const m = modal({ title: 'Pedido rápido', wide: true, body: '<div id="qo"></div>', foot: `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="qo-send" disabled>Enviar pedido</button>` });
  m.classList.add('qo-modal');
  const draw = () => {
    const tabs = ordOpenTabs();
    const cats = [...new Set(sellable().map((p) => p.category).filter(Boolean))].sort();
    const q = normalize(QO.q);
    const list = sellable().filter((p) => (!QO.cat || p.category === QO.cat) && (!q || normalize(`${p.name} ${(p.aliases || []).join(' ')} ${p.code}`).includes(q)));
    const items = Object.entries(QO.cart).filter(([, n]) => n > 0).map(([id, n]) => ({ p: prodById(id), n }));
    const tot = items.reduce((a, { p, n }) => { const sub = n * (+p.salePrice || 0); return a + sub + Math.round((sub * defaultTax(p)) / 100); }, 0);
    m.querySelector('#qo').innerHTML = `
      <div class="qo-tab">
        ${QO.newTab ? `<div class="grid g2"><div class="field"><label for="qo-name">Huésped o cliente</label><input class="in" id="qo-name" placeholder="Nombre" value="${esc(QO.name)}"></div><div class="field"><label for="qo-room">Habitación, cama o punto</label><input class="in" id="qo-room" placeholder="203 · Cama 4 · Bar" value="${esc(QO.room)}"></div></div>${tabs.length ? '<button class="btn sm ghost" id="qo-pick">Elegir una cuenta abierta</button>' : ''}`
          : `<div class="field"><label for="qo-tabsel">Cuenta</label><div class="row" style="gap:6px;flex-wrap:nowrap"><select class="in" id="qo-tabsel">${tabs.map((t) => opt(t.id, `${ordTabLabel(t)} · ${money(t.total)}`, QO.tabId)).join('')}</select><button class="btn" id="qo-new">${ic('plus')} Nueva</button></div></div>`}
      </div>
      <input class="in" id="qo-q" type="search" placeholder="Buscar producto (cerveza, agua, desayuno…)" value="${esc(QO.q)}" autocomplete="off">
      <div class="qo-cats"><button class="chip ${!QO.cat ? 'on' : ''}" data-qc="">Todo</button>${cats.map((c) => `<button class="chip ${QO.cat === c ? 'on' : ''}" data-qc="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="qo-grid">${list.slice(0, 60).map((p) => `<button class="qo-tile ${QO.cart[p.id] ? 'on' : ''}" data-qp="${p.id}"><span class="qo-n">${esc(p.name)}</span><span class="qo-p">${money(+p.salePrice || 0)}</span>${QO.cart[p.id] ? `<span class="qo-b">${QO.cart[p.id]}</span>` : ''}</button>`).join('') || '<p class="muted small">No hay productos con ese nombre.</p>'}</div>
      ${items.length ? `<div class="qo-cart">${items.map(({ p, n }) => `<div class="qo-line"><span>${esc(p.name)}</span><div class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm" data-qm="${p.id}" aria-label="Quitar uno">−</button><b class="num">${n}</b><button class="btn sm" data-qa="${p.id}" aria-label="Agregar uno">+</button></div><span class="num">${money(n * (+p.salePrice || 0))}</span></div>`).join('')}<div class="qo-line qo-tot"><span>Total con impuestos</span><span></span><b class="num">${money(tot)}</b></div></div>` : ''}`;
    const send = $('#qo-send'); const n = items.reduce((a, x) => a + x.n, 0);
    send.disabled = !n; send.textContent = n ? `Enviar ${n} ${n === 1 ? 'producto' : 'productos'} · ${money(tot)}` : 'Enviar pedido';
    const qi = m.querySelector('#qo-q');
    qi.oninput = () => { QO.q = qi.value; draw(); const x = m.querySelector('#qo-q'); x.focus(); x.setSelectionRange(QO.q.length, QO.q.length); };
    m.querySelector('#qo-tabsel')?.addEventListener('change', (e) => (QO.tabId = e.target.value));
    m.querySelector('#qo-name')?.addEventListener('input', (e) => (QO.name = e.target.value));
    m.querySelector('#qo-room')?.addEventListener('input', (e) => (QO.room = e.target.value));
    m.querySelector('#qo-new')?.addEventListener('click', () => { QO.newTab = true; draw(); m.querySelector('#qo-name').focus(); });
    m.querySelector('#qo-pick')?.addEventListener('click', () => { QO.newTab = false; draw(); });
    $$('[data-qc]', m).forEach((b) => (b.onclick = () => { QO.cat = b.dataset.qc; draw(); }));
    $$('[data-qp]', m).forEach((b) => (b.onclick = () => { QO.cart[b.dataset.qp] = (QO.cart[b.dataset.qp] || 0) + 1; draw(); }));
    $$('[data-qa]', m).forEach((b) => (b.onclick = () => { QO.cart[b.dataset.qa]++; draw(); }));
    $$('[data-qm]', m).forEach((b) => (b.onclick = () => { QO.cart[b.dataset.qm] = Math.max(0, QO.cart[b.dataset.qm] - 1); draw(); }));
  };
  draw();
  $('#qo-send').onclick = async (ev) => {
    const items = Object.entries(QO.cart).filter(([, n]) => n > 0);
    let tabId = QO.tabId;
    const btn = ev.target; btn.disabled = true;
    try {
      if (QO.newTab) {
        const name = QO.name.trim();
        if (name.length < 2) { btn.disabled = false; return toast('Escribe el nombre del huésped o cliente.'); }
        const t = await remote.req('/api/v1/orders/tabs', { method: 'POST', body: { customerName: name, room: QO.room.trim() || null } });
        tabId = t.id; QO.newTab = false; QO.tabId = t.id;
      }
      if (!tabId) { btn.disabled = false; return toast('Elige la cuenta.'); }
      let ok = 0; const bad = [];
      for (const [productId, qty] of items) {
        try { await remote.req(`/api/v1/orders/tabs/${tabId}/lines`, { method: 'POST', body: { productId, qty } }); ok++; delete QO.cart[productId]; }
        catch (e) { bad.push(`${prodById(productId)?.name}: ${e.message}`); }
      }
      await loadOrders();
      const t = ordTabById(tabId);
      if (bad.length) { draw(); toast(`Se enviaron ${ok}; con error: ${bad.join('; ')}`); return; }
      closeModal(); render(); toast(`Pedido enviado a ${t ? ordTabLabel(t) : 'la cuenta'} · cuenta en ${money(t?.total || 0)}`);
    } catch (e) { btn.disabled = false; toast('No se envió el pedido: ' + e.message); }
  };
}
/** Pre-cuenta para mostrar o imprimir al huésped (tirilla de 80 mm). No es factura. */
function preBill(t) {
  const live = t.lines.filter((l) => l.status !== 'anulado');
  const w = window.open('', '_blank'); if (!w) return toast('El navegador bloqueó la ventana; permite ventanas emergentes.');
  const row = (l) => { const sub = l.qty * l.price; return `<tr><td>${num(l.qty)} × ${esc(l.product)}</td><td class="n">${money(sub + Math.round((sub * l.taxPct) / 100))}</td></tr>`; };
  w.document.write(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pre-cuenta ${esc(t.number)}</title>
  <style>body{font:13px ui-monospace,Menlo,monospace;margin:0 auto;padding:12px;max-width:300px;color:#111}h1{font-size:15px;text-align:center;margin:0 0 4px}p{margin:2px 0;text-align:center}table{width:100%;border-collapse:collapse;margin:10px 0}td{padding:3px 0;vertical-align:top}.n{text-align:right;white-space:nowrap}.t td{border-top:1px dashed #555;padding-top:6px}.b{font-weight:700;font-size:15px}small{display:block;text-align:center;color:#444;margin-top:10px}@media print{button{display:none}}</style>
  <h1>Capybara Hostel</h1><p>PRE-CUENTA · ${esc(t.number)}</p><p>${esc(t.customerName)}${t.room ? ' · ' + esc(t.room) : ''}</p><p>${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })}</p>
  <table>${live.map(row).join('')}<tr class="t"><td>Subtotal</td><td class="n">${money(t.subtotal)}</td></tr><tr><td>Impuestos</td><td class="n">${money(t.tax)}</td></tr><tr class="b"><td>Total</td><td class="n">${money(t.total)}</td></tr></table>
  <small>Este documento no es una factura. La factura electrónica se emite al pagar.</small><p style="margin-top:12px"><button onclick="print()">Imprimir</button></p>`);
  w.document.close();
}

/* Mi turno: acceso directo para tomar pedidos (inicio del mesero) */
const _rMT9 = RENDER.miturno;
RENDER.miturno = () => {
  const html = _rMT9();
  if (!ordApi() || !can('facturacion.crear')) return html;
  const open = ordOpenTabs();
  const card = `<div class="card qo-card"><div class="card-h"><h2>Pedidos</h2><span class="spacer"></span><button class="btn pri" id="mt-quick">${ic('plus')} Tomar pedido</button></div>
    <p class="muted small" style="margin:0">${open.length ? `${open.length} ${open.length === 1 ? 'cuenta abierta' : 'cuentas abiertas'}: ${open.slice(-4).map((t) => esc(ordTabLabel(t))).join(' · ')}` : 'No hay cuentas abiertas. Al tomar el primer pedido abres la cuenta del huésped o la mesa.'}</p></div>`;
  const i = html.indexOf('<div class="kpis">');
  return i >= 0 ? html.slice(0, i) + card + html.slice(i) : card + html;
};
const _bMT9 = BIND.miturno;
BIND.miturno = (el) => { _bMT9?.(el); $('#mt-quick', el)?.addEventListener('click', () => quickOrderModal()); };
