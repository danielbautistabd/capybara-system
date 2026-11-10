/* ================= Capybara Control · app (5/5): roles, Mi turno, Inteligencia, Alegra, Control de acceso ================= */

/* ---------------- usuarios y permisos ---------------- */
const AREA_CATS = { Bar: ['Bebidas', 'Licores'], Cocina: ['Alimentos', 'Cocina'], Limpieza: ['Productos de aseo', 'Lavandería', 'Amenities'], Lavandería: ['Lavandería'], Recepción: ['Papelería', 'Amenities'], Mantenimiento: ['Mantenimiento'], Habitaciones: ['Amenities', 'Lavandería'] };
const LEAD = { s1: 2, s2: 2, s3: 1, s4: 3, s5: 1, s6: 1 };
const PACK = { 'BEB-001': 24, 'BEB-002': 24, 'BEB-003': 12, 'BEB-004': 12, 'ALI-001': 30, 'ASE-002': 12 };
function seedUsers() {
  return [
    { id: 'u0', name: 'Alejandro (Admin)', email: 'admin@capybarahostel.com', role: 'ADMIN', area: 'Administración', areas: [], phone: '', active: true },
    { id: 'u1', name: 'Andrés Pérez', email: 'recepcion@capybarahostel.com', role: 'SUPERVISOR', area: 'Recepción', areas: [], phone: '573112223344', active: true },
    { id: 'u2', name: 'Camila Rojas', email: 'bar@capybarahostel.com', role: 'EMPLEADO', area: 'Bar', areas: [], phone: '573001112233', active: true },
    { id: 'u3', name: 'Luz Marina', email: 'housekeeping@capybarahostel.com', role: 'EMPLEADO', area: 'Limpieza', areas: ['Lavandería', 'Habitaciones'], phone: '573004445566', active: true },
    { id: 'u4', name: 'Jhon Fredy', email: 'cocina@capybarahostel.com', role: 'EMPLEADO', area: 'Cocina', areas: [], phone: '573205556677', active: true },
  ];
}
const ROLE_PILL = { ADMIN: 'p-bad', SUPERVISOR: 'p-warn', CAJERO: 'p-ok', EMPLEADO: 'p-info', SOCIO: 'p-info', AUDITOR: 'p-mut' };
const me = () => (S.settings.mode === 'api' && S.settings.role ? { ...(S.users?.find((u) => u.name === S.settings.user) || {}), name: S.settings.user, role: S.settings.role, area: S.settings.area || '' } : S.users?.find((u) => u.name === S.settings.user) || S.users?.[0] || { name: S.settings.user, role: 'ADMIN', area: '' });
const can = (p) => hasPerm(me().role, p, S.rolePerms);
const myAreas = () => { const u = me(); return [u.area, ...(u.areas || [])].filter(Boolean); };
const inMyArea = (p) => { const a = myAreas(); return a.some((x) => (AREA_CATS[x] || []).includes(p.category) || normalize(p.location || '').includes(normalize(x))); };

/** Completa estados guardados por versiones anteriores */
function upgradeState() {
  S.users ||= seedUsers();
  S.rolePerms ||= JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMS));
  S.requests ||= [
    { id: uid('sc'), ts: new Date(Date.now() - 5 * 36e5).toISOString(), productId: 'p_LIC-002', qty: 6, reason: 'Fin de semana con evento en terraza', requestedBy: 'Camila Rojas', area: 'Bar', status: 'abierta' },
    { id: uid('sc'), ts: new Date(Date.now() - 26 * 36e5).toISOString(), productId: 'p_LAV-001', qty: 2, reason: 'Queda media bolsa', requestedBy: 'Luz Marina', area: 'Lavandería', status: 'abierta' },
  ];
  S.insights ||= { reports: [], service: 0.95, reviewDays: 7 };
  for (const s of S.suppliers) if (s.leadDays == null) s.leadDays = LEAD[s.id] ?? 2;
  for (const p of S.products) if (p.packSize == null) p.packSize = PACK[p.code] || 1;
  if (!S.users.some((u) => u.name === S.settings.user)) S.settings.user = S.users[0].name;
  if (!S.alegra) seedAlegra();
}
function seedAlegra() {
  const pur = S.purchases.filter((p) => p.status === 'aprobada').sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt));
  pur.slice(0, Math.max(0, pur.length - 4)).forEach((p, i) => (p.alegraBillId = String(1900 + i)));
  const bav = pur.filter((p) => p.supplierId === 's1').pop();
  const today = iso(Date.now());
  S.alegra = {
    configured: false, company: 'Capybara Hostel SAS', email: 'contabilidad@capybarahostel.com', lastSync: new Date(Date.now() - 3 * 36e5).toISOString(), webhooks: false,
    supplierLinks: { s1: '12', s2: '15', s3: '21', s5: '33', s6: '41' },
    items: [
      { id: '301', name: 'Cerveza Club Colombia x330', reference: 'BEB-001' }, { id: '302', name: 'Cerveza Aguila 330', reference: 'BEB-002' }, { id: '303', name: 'Agua Cristal 600', reference: '' },
      { id: '310', name: 'Huevo AA x unidad', reference: '' }, { id: '311', name: 'Pan tajado familiar', reference: 'ALI-002' }, { id: '312', name: 'Leche entera Alqueria 1L', reference: '' }, { id: '320', name: 'Hielo bolsa 2kg', reference: 'BEB-005' },
    ],
    itemLinks: { 'p_BEB-001': '301', 'p_BEB-002': '302', 'p_ALI-002': '311', 'p_BEB-005': '320' },
    bills: [
      bav ? { id: '2041', number: bav.invoice, provider: { id: '12', name: 'Distribuidora Bavaria' }, date: bav.purchasedAt, total: bav.total, status: 'open', items: bav.items.map((i) => ({ id: '301', name: prodById(i.productId)?.name, quantity: i.qty, price: i.unitCost })), categories: [], state: 'vinculada', localId: bav.id } : null,
      { id: '2045', number: 'FE-3391', provider: { id: '21', name: 'Mercados del Puerto' }, date: today, total: 50400 + 41400 + 51600, status: 'open', items: [{ id: '310', name: 'Huevo AA x unidad', quantity: 90, price: 560 }, { id: '311', name: 'Pan tajado familiar', quantity: 6, price: 6900 }, { id: '312', name: 'Leche entera Alqueria 1L', quantity: 12, price: 4300 }], categories: [], state: 'nueva' },
      { id: '2047', number: 'FT-118', provider: { id: '52', name: 'Ferretería El Tornillo' }, date: today, total: 36000, status: 'open', items: [], categories: [{ id: '5135', name: 'Mantenimiento y reparaciones', quantity: 2, price: 18000, observations: 'Silicona transparente' }], state: 'nueva' },
      { id: '2050', number: 'HP-20931', provider: { id: '33', name: 'Hielo Polar' }, date: today, total: 45000, status: 'closed', items: [{ id: '320', name: 'Hielo bolsa 2kg', quantity: 10, price: 4500 }], categories: [], state: 'nueva' },
    ].filter(Boolean),
    log: [{ ts: new Date(Date.now() - 3 * 36e5).toISOString(), action: 'facturas.importar', status: 'ok', detail: '1 vinculada, 0 nuevas' }],
  };
}

/* ---------------- vistas nuevas y orden del menú ---------------- */
(() => {
  const order = [
    ['miturno', { t: 'Mi turno', ic: 'count', grp: 'Operación' }], 'dashboard', 'inventario', 'entradas', 'marchados', 'whatsapp', 'drive',
    ['alegra', { t: 'Alegra · compras', short: 'Alegra', ic: 'doc', grp: 'Fuentes' }],
    ['inteligencia', { t: 'Inteligencia y compras sugeridas', short: 'Inteligencia', ic: 'spark', grp: 'Control' }], 'conciliacion', 'proveedores', 'gastos', 'bitacora',
    ['acceso', { t: 'Control de acceso', short: 'Control de acceso', ic: 'users', grp: 'Sistema' }], 'integraciones',
  ];
  const old = { ...VIEWS }; for (const k in VIEWS) delete VIEWS[k];
  for (const o of order) { if (Array.isArray(o)) VIEWS[o[0]] = o[1]; else VIEWS[o] = old[o]; }
  ICON.spark = '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>';
  ICON.users = '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5"/>';
  ICON.lock = '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
})();
const VIEW_PERM = { miturno: 'movimientos.crear', dashboard: 'tablero.ver', inventario: 'inventario.ver', entradas: 'entradas.crear', marchados: 'movimientos.crear', whatsapp: 'whatsapp.revisar', drive: 'sheets.sincronizar', alegra: 'alegra.gestionar', inteligencia: 'inteligencia.ver', conciliacion: 'conciliacion.ver', proveedores: 'proveedores.gestionar', gastos: 'gastos.gestionar', bitacora: 'bitacora.ver', acceso: 'usuarios.gestionar', integraciones: 'integraciones.configurar' };
const allowed = (v) => !VIEW_PERM[v] || can(VIEW_PERM[v]);
const homeView = () => (can('tablero.ver') ? 'dashboard' : me().role === 'SOCIO' || (can('socios.ver') && !can('movimientos.crear')) ? 'socios' : me().role === 'CAJERO' && can('facturacion.crear') ? 'facturacion' : can('movimientos.crear') ? 'miturno' : Object.keys(VIEWS).find((v) => allowed(v)) || 'miturno');

/* parches de shell: menú filtrado, guardas, selector "Ver como" */
const _renderNav = renderNav;
renderNav = function () {
  _renderNav();
  $$('#nav a').forEach((a) => { const v = a.getAttribute('href').slice(1); if (!allowed(v) || (v === 'miturno' && can('tablero.ver') && me().role === 'ADMIN' && false)) a.remove(); });
  $$('#nav .grp').forEach((g) => { if (!g.nextElementSibling || g.nextElementSibling.classList.contains('grp')) g.remove(); });
  const u = me();
  $('#who').innerHTML = `<select class="in" id="as-user" aria-label="Ver como" style="background:rgba(255,255,255,.08);color:inherit;border-color:rgba(255,255,255,.2);padding:5px 8px;margin-top:4px">${S.users.filter((x) => x.active).map((x) => opt(x.name, `${x.name} · ${ROLES[x.role]}`, u.name)).join('')}</select>`;
  $('#as-user').onchange = (e) => { S.settings.user = e.target.value; save(); toast(`Viendo como ${me().name} (${ROLES[me().role]})`); location.hash = homeView(); render(); };
  $('#sync-btn').hidden = !can('conciliacion.ver');
};
const _render = render;
render = function () {
  if (!S) return;
  const v = view();
  if (!allowed(v)) { location.replace('#' + homeView()); return; }
  document.body.classList.toggle('no-money', !can('costos.ver'));
  _render();
};

/* ---------------- Mi turno (módulo empleado) ---------------- */
let MT = { text: '', result: null };
RENDER.miturno = () => {
  const u = me(), st = stockMap(), today = d0();
  const mine = S.movements.filter((m) => m.user === u.name).sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const hoy = mine.filter((m) => new Date(m.ts) >= today);
  const pend = mine.filter((m) => ['pendiente', 'requiere_info'].includes(m.status));
  const low = S.products.filter((p) => p.status === 'activo' && p.kind === 'consumible' && inMyArea(p) && st[p.id] <= p.stockMin);
  const reqs = S.requests.filter((r) => r.requestedBy === u.name);
  const r = MT.result;
  return `
  <div class="sec-h"><h2>Hola, ${esc(u.name.split(' ')[0])}</h2><span class="muted">${esc(ROLES[u.role])} · ${esc(myAreas().join(', ') || 'sin área')} · ${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
  ${!can('movimientos.aprobar') ? `<div class="banner">${ic('lock')}<div>Lo que registres queda <b>pendiente de aprobación</b> por un supervisor. No verás costos ni valores en pesos.</div></div>` : ''}
  <div class="kpis"><div class="kpi"><span class="k">Mis registros hoy</span><span class="v">${hoy.length}</span></div><div class="kpi ${pend.length ? 'warn' : ''}"><span class="k">Esperando aprobación</span><span class="v">${pend.length}</span></div><div class="kpi ${low.length ? 'alert' : ''}"><span class="k">Bajos en mi área</span><span class="v">${low.length}</span></div><div class="kpi"><span class="k">Mis solicitudes abiertas</span><span class="v">${reqs.filter((x) => x.status === 'abierta').length}</span></div></div>
  <div class="grid g2" style="align-items:start">
    <div class="card"><div class="card-h"><h2>Marchar o reportar</h2></div>
      <div class="field"><label for="mt-text">Escribe como en WhatsApp</label><textarea class="in" id="mt-text" rows="2" placeholder="Marchar 3 cervezas y 2 aguas a la habitación 203">${esc(MT.text)}</textarea></div>
      <div class="row" style="margin-top:8px"><button class="btn pri" id="mt-go">${ic('sync')} Interpretar</button><span class="spacer"></span>${can('entradas.crear') ? `<a class="btn" href="#entradas">${ic('in')} Recibí mercancía</a>` : ''}${can('conteos.crear') ? `<button class="btn" id="mt-count">${ic('count')} Contar mi área</button>` : ''}</div>
      ${r ? `<div class="prop" style="margin-top:12px"><div class="row"><span class="eyebrow">${esc(MOVEMENT_TYPES[r.type].label)}${r.area ? ' · ' + esc(r.area) : ''}</span><span class="spacer"></span>${confHtml(r.confidence)}</div>
        ${r.items.map((it, i) => `<div class="prop-row"><select class="in" data-mti="${i}" data-f="productId">${opt('', `No reconocido: “${it.rawText}”`)}${prodOptions(it.productId)}</select><input class="in num" type="number" min="0" step="any" data-mti="${i}" data-f="qty" value="${it.qty}"><span class="small">${esc(it.unit)}</span></div>`).join('') || '<div class="small muted">No encontré productos. Escribe cantidad y producto.</div>'}
        <div class="actions"><button class="btn pri" id="mt-send">${ic('check')} ${can('movimientos.aprobar') ? 'Registrar y aprobar' : 'Enviar para aprobación'}</button><button class="btn" id="mt-cancel">Cancelar</button></div></div>` : ''}
    </div>
    <div class="card"><div class="card-h"><h2>Bajos en mi área</h2></div><div class="list">
      ${low.map((p) => `<div class="li"><span class="grow"><b>${esc(p.name)}</b><span class="small muted">Quedan ${num(st[p.id])} ${esc(p.unit)} · mínimo ${num(p.stockMin)}</span></span>${reqs.some((x) => x.productId === p.id && x.status === 'abierta') ? pill('Solicitado', 'p-info') : `<button class="btn sm" data-req="${p.id}">Solicitar compra</button>`}</div>`).join('') || '<div class="empty">Todo en orden en tu área.</div>'}
    </div><button class="btn" id="mt-newreq" style="margin-top:8px">${ic('plus')} Solicitar otro producto</button></div>
  </div>
  <div class="card"><div class="card-h"><h2>Mis registros recientes</h2></div><div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="n">Cantidad</th><th>Área</th><th>Estado</th></tr></thead><tbody>
    ${mine.slice(0, 20).map((m) => `<tr><td class="small">${fdt(m.ts)}</td><td>${esc(prodById(m.productId)?.name)}</td><td class="small">${MOVEMENT_TYPES[m.type].label}</td><td class="n num">${num(m.qty)} ${esc(m.unit)}</td><td class="small">${esc(m.area || '')}</td><td>${mvPill(m.status)}${m.status === 'requiere_info' && m.notes ? `<span class="sub">${esc(m.notes.split(' · ').pop())}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">Aún no tienes registros.</div></td></tr>'}
  </tbody></table></div></div>
  ${reqs.length ? `<div class="card"><div class="card-h"><h2>Mis solicitudes de compra</h2></div><div class="list">${reqs.map((x) => `<div class="li"><span class="grow"><b>${esc(prodById(x.productId)?.name)}</b><span class="small muted">${num(x.qty)} · ${fdt(x.ts)}${x.reason ? ' · ' + esc(x.reason) : ''}</span></span>${pill(REQ_ST[x.status][0], REQ_ST[x.status][1])}</div>`).join('')}</div></div>` : ''}`;
};
const REQ_ST = { abierta: ['Abierta', 'p-warn'], en_orden: ['En orden de compra', 'p-info'], atendida: ['Atendida', 'p-ok'], rechazada: ['Rechazada', 'p-mut'] };
function requestForm(productId = '') {
  const m = modal({ title: 'Solicitar compra', body: `<div class="field"><label for="rq-p">Producto</label><select class="in" id="rq-p">${prodOptions(productId, (p) => p.kind !== 'activo')}</select></div><div class="grid g2"><div class="field"><label for="rq-q">Cantidad</label><input class="in" type="number" min="1" id="rq-q" value="${prodById(productId)?.packSize || 1}"></div><div class="field"><label for="rq-r">Motivo</label><input class="in" id="rq-r" placeholder="Ej.: evento del sábado"></div></div>`, foot: `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="rq-ok">Enviar solicitud</button>` });
  m.querySelector('#rq-ok').onclick = () => { const q = +m.querySelector('#rq-q').value; if (!(q > 0)) return toast('Escribe una cantidad.'); S.requests.unshift({ id: uid('sc'), ts: new Date().toISOString(), productId: m.querySelector('#rq-p').value, qty: q, reason: m.querySelector('#rq-r').value, requestedBy: me().name, area: me().area, status: 'abierta' }); log('solicitud.crear', `${prodById(m.querySelector('#rq-p').value)?.name} × ${q}`); closeModal(); save(); render(); toast('Solicitud enviada al administrador'); };
}
BIND.miturno = (el) => {
  const t = $('#mt-text', el);
  $('#mt-go', el).onclick = () => { MT.text = t.value.trim(); if (!MT.text) return; MT.result = parseInstruction(MT.text, catalogForParser()); render(); };
  t.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#mt-go', el).click(); } };
  $('#mt-count', el)?.addEventListener('click', () => countForm());
  $('#mt-newreq', el).onclick = () => requestForm();
  $$('[data-req]', el).forEach((b) => (b.onclick = () => requestForm(b.dataset.req)));
  if (MT.result) {
    $$('[data-mti]', el).forEach((i) => (i.onchange = () => { const it = MT.result.items[+i.dataset.mti]; it[i.dataset.f] = i.type === 'number' ? +i.value : i.value; if (i.dataset.f === 'productId' && i.value) { it.unit = prodById(i.value).unit; it.confidence = 1; } }));
    $('#mt-cancel', el).onclick = () => { MT = { text: '', result: null }; render(); };
    $('#mt-send', el).onclick = async () => {
      const items = MT.result.items.filter((i) => i.productId && i.qty > 0); if (!items.length) return toast('Selecciona al menos un producto.');
      for (const it of items) await run('addMovement', { productId: it.productId, qty: it.qty, unit: it.unit, type: MT.result.type, area: MT.result.area || me().area, confidence: it.confidence, notes: `"${MT.text}"` }, { approve: can('movimientos.aprobar') });
      MT = { text: '', result: null }; render(); toast(can('movimientos.aprobar') ? 'Registrado y aprobado' : 'Enviado para aprobación');
    };
  }
};

/* ---------------- Inteligencia ---------------- */
let IN = { period: 'day', sev: '', busy: false, error: '', ask: '' };
let samplePromise = null;
const getSample = () => (samplePromise ||= (window.claude?.use ? window.claude.use('sample').catch(() => null) : Promise.resolve(null)));
function computeInsights() {
  const st = stockMap();
  const lead = (p) => supById(p.supplierId)?.leadDays ?? 2;
  const onOrder = {}; for (const po of S.purchases.filter((x) => x.kind === 'orden' && x.status === 'borrador')) for (const it of po.items) onOrder[it.productId] = (onOrder[it.productId] || 0) + it.qty;
  const plan = reorderPlan({ products: S.products, movements: S.movements, stockOf: (p) => st[p.id], leadDays: lead, onOrder, service: S.insights.service, reviewDays: S.insights.reviewDays });
  if (!S.recon) runRecon();
  const signals = purchaseSignals({ products: S.products, movements: S.movements, plan, recon: S.recon });
  return { plan, signals, orders: suggestedOrders(plan, S.suppliers), st };
}
function digestFor(period, ins) {
  return buildDigest({ period, products: S.products.map((p) => ({ ...p, stockCurrent: ins.st[p.id] })), movements: S.movements, purchases: S.purchases.filter((p) => p.kind !== 'orden'), expenses: S.expenses, recon: S.recon, plan: ins.plan, signals: ins.signals, inbox: S.inbox });
}
const SIG = { comprar_ya: ['Comprar ya', 'p-bad'], comprar_pronto: ['Punto de reorden', 'p-warn'], sobrestock: ['Sobrestock', 'p-info'], alza_precio: ['Alza de precio', 'p-warn'], baja_precio: ['Precio a la baja', 'p-ok'], consumo_anomalo: ['Consumo inusual', 'p-warn'], riesgo_vencimiento: ['Riesgo de vencimiento', 'p-warn'], merma: ['Merma', 'p-bad'] };
const LEVEL = { agotado: ['Agotado', 'p-bad'], comprar_ya: ['Comprar ya', 'p-bad'], comprar_pronto: ['Punto de reorden', 'p-warn'], sobrestock: ['Sobrestock', 'p-info'], ok: ['Cubierto', 'p-ok'] };
const PRIO = { alta: 'p-bad', media: 'p-warn', baja: 'p-mut' };
const MOD_VIEW = { compras: 'inteligencia', inventario: 'inventario', conciliacion: 'conciliacion', marchados: 'marchados', gastos: 'gastos', personal: 'acceso' };
RENDER.inteligencia = () => {
  const ins = computeInsights();
  const rep = S.insights.reports.find((r) => r.period === IN.period);
  const sm = rep?.summary;
  const sigs = ins.signals.filter((s) => !IN.sev || s.type === IN.sev);
  const sigCount = {}; for (const s of ins.signals) sigCount[s.type] = (sigCount[s.type] || 0) + 1;
  const reorderCost = ins.plan.reduce((a, r) => a + r.estCost, 0);
  const openReq = S.requests.filter((r) => r.status === 'abierta');
  return `
  <div class="card ai-card"><div class="card-h"><h2>${ic('spark')} Resumen inteligente</h2><span class="spacer"></span>
    <div class="seg">${[['day', 'Hoy'], ['week', 'Semana'], ['month', 'Mes']].map(([k, l]) => `<button data-ip="${k}" class="${IN.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <button class="btn pri" id="in-gen" ${IN.busy ? 'disabled' : ''}>${ic('spark')} ${IN.busy ? 'Analizando…' : sm ? 'Actualizar resumen' : 'Generar resumen con IA'}</button></div>
    ${IN.busy ? `<div class="ai-wait"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="muted" id="in-stream">Leyendo movimientos, compras, conteos y señales…</span></div>` : ''}
    ${IN.error ? `<div class="banner" style="margin-bottom:10px">${ic('info')}<div>${esc(IN.error)}</div></div>` : ''}
    ${sm ? `<div class="ai-body">
      <p class="ai-head">${esc(sm.titular)}</p><p style="margin:0;max-width:75ch">${esc(sm.resumen)}</p>
      ${sm.puntos_clave?.length ? `<ul class="ai-points">${sm.puntos_clave.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${sm.alertas?.length ? `<div class="row">${sm.alertas.map((a) => `<span class="pill ${PRIO[a.prioridad] || 'p-warn'}" title="${esc(a.detalle)}">${esc(a.titulo)}</span>`).join('')}</div>` : ''}
      <div class="recs">${(sm.recomendaciones || []).map((x) => `<div class="rec"><div class="row" style="gap:6px">${pill(x.prioridad, PRIO[x.prioridad] || 'p-mut')}<b style="flex:1;min-width:0">${esc(x.titulo)}</b>${x.impacto_cop ? `<span class="num small money">${moneyK(x.impacto_cop)}</span>` : ''}</div><p class="small" style="margin:4px 0">${esc(x.detalle)}</p><div class="row"><span class="small muted" style="flex:1">→ ${esc(x.accion)}</span>${MOD_VIEW[x.modulo] && allowed(MOD_VIEW[x.modulo]) ? `<a class="btn sm" href="#${MOD_VIEW[x.modulo]}">Abrir</a>` : ''}</div></div>`).join('')}</div>
      ${sm.compras ? `<p class="small" style="margin:0"><b>Compras:</b> ${esc(sm.compras)}</p>` : ''}
      ${sm.preguntas_para_el_equipo?.length ? `<p class="small muted" style="margin:0"><b>Preguntar al equipo:</b> ${sm.preguntas_para_el_equipo.map(esc).join(' · ')}</p>` : ''}
      ${sm.respuesta ? `<div class="bubble"><b>Respuesta:</b> ${esc(sm.respuesta)}</div>` : ''}
      <p class="small muted" style="margin:0">${rep.by === 'reglas' ? 'Generado con reglas (sin IA)' : 'Generado con IA'} · ${fdt(rep.ts)}${rep.question ? ` · pregunta: “${esc(rep.question)}”` : ''}</p>
    </div>` : !IN.busy ? `<p class="muted" style="margin:0">Analiza consumo, compras, gastos, conteos, WhatsApp y señales del periodo, y propone acciones con su impacto en pesos.</p>` : ''}
    <div class="row" style="margin-top:12px"><input class="in" id="in-ask" placeholder="Pregunta algo: ¿por qué subió el consumo de cerveza?, ¿qué compro para el fin de semana?" value="${esc(IN.ask)}" style="flex:1 1 280px;width:auto"><button class="btn" id="in-askb" ${IN.busy ? 'disabled' : ''}>Preguntar</button></div>
  </div>

  <div class="kpis">
    <div class="kpi alert"><span class="k">Comprar ya</span><span class="v">${ins.plan.filter((r) => r.level === 'comprar_ya' || r.level === 'agotado').length}</span><span class="s">cobertura menor al tiempo de entrega</span></div>
    <div class="kpi warn"><span class="k">En punto de reorden</span><span class="v">${ins.plan.filter((r) => r.level === 'comprar_pronto').length}</span></div>
    <div class="kpi money"><span class="k">Reposición sugerida</span><span class="v">${moneyK(reorderCost)}</span><span class="s">${ins.orders.length} proveedores</span></div>
    <div class="kpi"><span class="k">Señales activas</span><span class="v">${ins.signals.length}</span><span class="s">${ins.signals.filter((s) => s.severity === 'alta').length} de prioridad alta</span></div>
    <div class="kpi ${openReq.length ? 'warn' : ''}"><span class="k">Solicitudes del personal</span><span class="v">${openReq.length}</span></div>
  </div>

  <div class="card"><div class="card-h"><h2>Señales de compra y riesgo</h2></div>
    <div class="row" style="margin-bottom:10px"><button class="btn sm ${!IN.sev ? 'pri' : ''}" data-is="">Todas · ${ins.signals.length}</button>${Object.entries(sigCount).map(([k, n]) => `<button class="btn sm ${IN.sev === k ? 'pri' : ''}" data-is="${k}">${SIG[k]?.[0] || k} · ${n}</button>`).join('')}</div>
    <div class="list">${sigs.slice(0, 30).map((s) => `<div class="li">${pill(SIG[s.type]?.[0] || s.type, SIG[s.type]?.[1] || 'p-mut')}<span class="grow"><b>${esc(s.title)}</b><span class="small muted">${esc(s.detail)}</span></span>${s.value ? `<span class="num small money">${moneyK(s.value)}</span>` : ''}</div>`).join('') || '<div class="empty">Sin señales</div>'}</div></div>

  <div class="card"><div class="card-h"><h2>Órdenes de compra sugeridas</h2><span class="spacer"></span><span class="muted small">agrupadas por proveedor · redondeadas al empaque</span></div>
    <div class="grid g3">${ins.orders.map((o, i) => `<div class="prop"><div class="row"><b style="flex:1">${esc(o.supplierName)}</b>${o.urgent ? pill('Urgente', 'p-bad') : ''}</div>
      <span class="small muted">Entrega en ${supById(o.supplierId)?.leadDays ?? '—'} días${supById(o.supplierId)?.phone ? ' · ' + esc(supById(o.supplierId).phone) : ''}</span>
      ${o.items.map((it) => `<div class="row small" style="gap:6px;flex-wrap:nowrap"><span style="flex:1;min-width:0">${esc(it.name)}</span><b class="num">${num(it.qty)}</b><span class="muted">${esc(it.unit)}</span><span class="num money" style="min-width:70px;text-align:right">${moneyK(it.subtotal)}</span></div>`).join('')}
      <div class="row money" style="border-top:1px dashed var(--line);padding-top:6px"><span class="small">Total estimado</span><span class="spacer"></span><b class="num">${money(o.total)}</b></div>
      <div class="actions">${can('entradas.aprobar') ? `<button class="btn sm pri" data-po="${i}">Crear orden</button>${can('alegra.gestionar') && o.supplierId && S.alegra.supplierLinks[o.supplierId] ? `<button class="btn sm" data-poa="${i}">Orden en Alegra</button>` : ''}` : ''}<button class="btn sm" data-pow="${i}">${ic('copy')} Pedido por WhatsApp</button></div></div>`).join('') || '<div class="empty">No hay nada por pedir.</div>'}</div></div>

  ${openReq.length ? `<div class="card"><div class="card-h"><h2>Solicitudes del personal</h2></div><div class="list">${openReq.map((r) => `<div class="li"><span class="grow"><b>${esc(prodById(r.productId)?.name)} × ${num(r.qty)}</b><span class="small muted">${esc(r.requestedBy)} · ${esc(r.area || '')} · ${fdt(r.ts)}${r.reason ? ' · ' + esc(r.reason) : ''}</span></span>${can('entradas.aprobar') ? `<button class="btn sm ok" data-rqa="${r.id}">${ic('check')} Agregar a orden</button><button class="btn sm bad" data-rqr="${r.id}">${ic('x')}</button>` : ''}</div>`).join('')}</div></div>` : ''}

  <div class="card"><div class="card-h"><h2>Punto de reorden por producto</h2><span class="spacer"></span>
    <label class="small row" style="gap:6px">Nivel de servicio <select class="in" id="in-svc" style="width:auto">${[[0.9, '90 %'], [0.95, '95 %'], [0.98, '98 %'], [0.99, '99 %']].map(([v, l]) => opt(v, l, S.insights.service)).join('')}</select></label>
    <label class="small row" style="gap:6px">Revisión cada <select class="in" id="in-rev" style="width:auto">${[3, 7, 14].map((v) => opt(v, v + ' días', S.insights.reviewDays)).join('')}</select></label></div>
    <div class="formula" style="margin-bottom:10px"><span class="t">Punto de reorden</span><span class="op">=</span><span class="t">consumo diario × días de entrega</span><span class="op">+</span><span class="t">stock de seguridad (z · σ · √días)</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Producto</th><th class="n">Stock</th><th class="n">Consumo/día</th><th class="n">Entrega</th><th class="n">Seguridad</th><th class="n">Reorden</th><th>Cobertura</th><th>Se agota</th><th class="n">Pedir</th><th class="n money">Costo</th><th>Estado</th></tr></thead><tbody>
    ${ins.plan.map((r) => { const cov = r.cover == null ? null : Math.min(100, (r.cover / Math.max(1, r.leadDays * 4)) * 100); return `<tr class="sev ${r.level === 'agotado' || r.level === 'comprar_ya' ? 'sev-bad' : r.level === 'comprar_pronto' ? 'sev-warn' : ''}"><td><b>${esc(r.name)}</b><span class="sub">${esc(supById(r.supplierId)?.name || 'sin proveedor')}</span></td><td class="n num">${num(r.stock)}</td><td class="n num">${num(r.avgDaily)}</td><td class="n num">${num(r.leadDays)} d</td><td class="n num">${num(r.safetyStock)}</td><td class="n num"><b>${num(r.reorderPoint)}</b></td>
      <td style="min-width:120px">${r.cover == null ? '<span class="muted small">sin consumo</span>' : `<div class="bar"><b style="width:${cov}%;background:${r.cover < r.leadDays ? 'var(--bad)' : r.level === 'comprar_pronto' ? 'var(--warn)' : 'var(--jungle-2)'}"></b></div><span class="small num">${num(r.cover)} días</span>`}</td>
      <td class="small">${r.stockoutDate ? fdate(r.stockoutDate + 'T12:00') : '—'}</td><td class="n num">${r.suggestedQty ? `<b>${num(r.suggestedQty)}</b>` : '—'}${r.onOrder ? `<span class="sub">${num(r.onOrder)} en camino</span>` : ''}</td><td class="n num money">${r.estCost ? money(r.estCost) : '—'}</td><td>${pill(...LEVEL[r.level])}</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="muted small" style="margin:8px 0 0">El consumo diario combina la última semana (60 %) y las últimas cuatro (40 %). El tiempo de entrega se configura en cada proveedor. Las órdenes abiertas cuentan como "en camino" y evitan pedir dos veces.</p>
  </div>`;
};
async function generateSummary(question = '') {
  IN.busy = true; IN.error = ''; render();
  const ins = computeInsights();
  const digest = digestFor(IN.period, ins);
  let summary = null, by = 'reglas';
  try {
    if (S.settings.mode === 'api') { const r = await remote.req('/api/v1/insights/summary', { method: 'POST', body: { period: IN.period, question: question || undefined } }); summary = r.summary; by = r.generatedBy; }
    else {
      const sample = await getSample();
      if (sample) {
        summary = await sample.json(summaryPrompt(digest, question), { cache: false, onText: ({ text }) => { const el = $('#in-stream'); if (el) el.textContent = 'Redactando… ' + text.replace(/[{}"\[\]]/g, ' ').slice(-140); } });
        if (!summary || typeof summary !== 'object' || !summary.resumen) throw { code: 'invalid_json', message: 'Respuesta incompleta' };
        by = 'ia';
      } else IN.error = 'La IA no está disponible en esta vista; se muestra el resumen calculado con reglas. Con el backend conectado se usa Claude desde el servidor.';
    }
  } catch (e) {
    IN.error = { not_granted: 'No se dio permiso para usar Claude en esta página; se muestra el resumen con reglas.', rate_limited: 'Se alcanzó el límite de uso por ahora; se muestra el resumen con reglas. Intenta más tarde.', invalid_json: 'La IA respondió en un formato inesperado; se muestra el resumen con reglas. Puedes intentar otra vez.' }[e.code] || `No se pudo generar con IA (${e.message || e.code}); se muestra el resumen con reglas.`;
  }
  if (!summary) { summary = ruleSummary(digest); by = 'reglas'; }
  S.insights.reports = [{ id: uid('ir'), ts: new Date().toISOString(), period: IN.period, by, question: question || null, summary }, ...S.insights.reports.filter((r) => r.period !== IN.period)].slice(0, 6);
  log('inteligencia.resumen', `${{ day: 'Hoy', week: 'Semana', month: 'Mes' }[IN.period]} · ${by === 'reglas' ? 'reglas' : 'IA'}${question ? ' · ' + question.slice(0, 60) : ''}`);
  IN.busy = false; save(); render();
}
function createOrder(o, { alegra = false } = {}) {
  const po = { id: uid('oc'), kind: 'orden', supplierId: o.supplierId, invoice: 'OC-' + Date.now().toString(36).toUpperCase().slice(-6), purchasedAt: iso(Date.now()), receivedAt: iso(Date.now() + (supById(o.supplierId)?.leadDays || 2) * DAY), items: o.items.map((i) => ({ productId: i.productId, qty: i.qty, unit: i.unit, unitCost: i.unitCost, subtotal: i.subtotal })), subtotal: o.total, tax: 0, discount: 0, total: o.total, payMethod: 'Crédito proveedor', receivedBy: '—', status: 'borrador', source: 'sistema', notes: 'Orden sugerida por punto de reorden' };
  if (alegra) { po.alegraPO = String(5000 + Math.floor(Math.random() * 900)); S.alegra.log.unshift({ ts: new Date().toISOString(), action: 'orden.crear', status: 'ok', detail: `${o.supplierName}: ${o.items.length} ítems → Alegra OC ${po.alegraPO} (simulado)` }); }
  S.purchases.push(po);
  for (const r of S.requests.filter((x) => x.status === 'abierta' && o.items.some((i) => i.productId === x.productId))) r.status = 'en_orden';
  log('orden.crear', `${o.supplierName} · ${o.items.length} ítems · ${money(o.total)}${alegra ? ' · Alegra' : ''}`);
  save(); render(); toast(`Orden ${po.invoice} creada${alegra ? ' y enviada a Alegra (simulado)' : ''}. Al recibir la mercancía, ábrela en Registro de entradas.`);
}
BIND.inteligencia = (el) => {
  $$('[data-ip]', el).forEach((b) => (b.onclick = () => { IN.period = b.dataset.ip; IN.error = ''; render(); }));
  $$('[data-is]', el).forEach((b) => (b.onclick = () => { IN.sev = b.dataset.is; render(); }));
  $('#in-gen', el).onclick = () => generateSummary();
  const ask = $('#in-ask', el); ask.oninput = () => (IN.ask = ask.value);
  ask.onkeydown = (e) => e.key === 'Enter' && $('#in-askb', el).click();
  $('#in-askb', el).onclick = () => { if (!IN.ask.trim()) return toast('Escribe una pregunta.'); generateSummary(IN.ask.trim()); };
  $('#in-svc', el).onchange = (e) => { S.insights.service = +e.target.value; save(); render(); };
  $('#in-rev', el).onchange = (e) => { S.insights.reviewDays = +e.target.value; save(); render(); };
  const ins = computeInsights();
  $$('[data-po]', el).forEach((b) => (b.onclick = () => createOrder(ins.orders[+b.dataset.po])));
  $$('[data-poa]', el).forEach((b) => (b.onclick = () => createOrder(ins.orders[+b.dataset.poa], { alegra: true })));
  $$('[data-pow]', el).forEach((b) => (b.onclick = () => { const o = ins.orders[+b.dataset.pow]; const txt = `Hola, ${o.supplierName}. Pedido de Capybara Hostel:\n${o.items.map((i) => `• ${i.qty} ${i.unit} ${i.name}`).join('\n')}\nGracias.`; navigator.clipboard.writeText(txt).then(() => toast('Pedido copiado: pégalo en WhatsApp del proveedor'), () => modal({ title: 'Pedido para WhatsApp', body: `<textarea class="in" rows="8" readonly>${esc(txt)}</textarea>` })); }));
  $$('[data-rqa]', el).forEach((b) => (b.onclick = () => { const r = S.requests.find((x) => x.id === b.dataset.rqa); const p = prodById(r.productId); const o = { supplierId: p.supplierId, supplierName: supById(p.supplierId)?.name || 'Sin proveedor', items: [{ productId: p.id, name: p.name, qty: r.qty, unit: p.unit, unitCost: p.lastPrice || p.avgCost, subtotal: r.qty * (p.lastPrice || p.avgCost) }], total: r.qty * (p.lastPrice || p.avgCost) }; createOrder(o); }));
  $$('[data-rqr]', el).forEach((b) => (b.onclick = () => { S.requests.find((x) => x.id === b.dataset.rqr).status = 'rechazada'; log('solicitud.rechazar', b.dataset.rqr); save(); render(); }));
};

/* ---------------- Alegra ---------------- */
let AL = { tab: 'facturas' };
function alegraBillState(b) {
  if (b.state === 'vinculada' || b.state === 'importada' || b.state === 'gasto') return b.state;
  const sup = S.suppliers.find((s) => S.alegra.supplierLinks[s.id] === String(b.provider.id));
  const local = S.purchases.find((p) => (sup && p.supplierId === sup.id && (p.invoice || '').toUpperCase() === b.number.toUpperCase()) || p.alegraBillId === b.id);
  if (local) return 'existe';
  if (S.inbox.some((i) => i.doc?.invoiceNumber?.toUpperCase() === b.number.toUpperCase())) return 'whatsapp';
  if (!b.items.length && b.categories.length) return 'categoria';
  if (b.items.some((it) => !Object.entries(S.alegra.itemLinks).find(([, v]) => v === it.id))) return 'sin_vincular';
  return 'nueva';
}
const AL_ST = { vinculada: ['Vinculada a una compra', 'p-ok'], importada: ['Importada como borrador', 'p-info'], gasto: ['Registrada como gasto', 'p-info'], existe: ['Ya existe en Capybara', 'p-ok'], whatsapp: ['Coincide con factura de WhatsApp', 'p-warn'], categoria: ['Servicio o gasto', 'p-mut'], sin_vincular: ['Ítems sin vincular', 'p-bad'], nueva: ['Nueva', 'p-info'] };
function alegraImport(id) {
  const b = S.alegra.bills.find((x) => x.id === id); const st = alegraBillState(b);
  let sup = S.suppliers.find((s) => S.alegra.supplierLinks[s.id] === String(b.provider.id));
  if (!sup) { sup = act.saveSupplier({ name: b.provider.name, taxId: '', phone: '', contact: '', notes: 'Creado desde Alegra' }); S.alegra.supplierLinks[sup.id] = String(b.provider.id); sup.leadDays = 2; }
  if (st === 'categoria') {
    for (const c of b.categories) act.saveExpense({ date: b.date, category: c.name.includes('Mantenimiento') ? 'Mantenimiento' : 'Otros', description: `${c.observations || c.name} — ${b.provider.name} ${b.number}`, amount: c.price * c.quantity, payMethod: 'Crédito proveedor', supplierId: sup.id, source: 'alegra', status: 'pendiente_revision', attachment: `Alegra ${b.id}` });
    b.state = 'gasto';
  } else if (st === 'existe') {
    const local = S.purchases.find((p) => p.supplierId === sup.id && (p.invoice || '').toUpperCase() === b.number.toUpperCase());
    local.alegraBillId = b.id; b.state = 'vinculada'; b.localId = local.id;
  } else {
    const items = b.items.map((it) => { const pid = Object.entries(S.alegra.itemLinks).find(([, v]) => v === it.id)?.[0]; return pid ? { productId: pid, qty: it.quantity, unit: prodById(pid).unit, unitCost: it.price, subtotal: it.quantity * it.price } : null; }).filter(Boolean);
    if (!items.length) return toast('Vincula los ítems de Alegra con productos antes de importar.');
    if (st === 'whatsapp') { const wa = S.inbox.find((i) => i.doc?.invoiceNumber?.toUpperCase() === b.number.toUpperCase()); S.movements.filter((m) => m.inboxId === wa.id && m.status === 'pendiente').forEach((m) => { m.status = 'duplicado'; m.notes = `Reemplazado por la factura ${b.number} de Alegra`; }); act.inboxStatus(wa.id, 'procesado', { silent: true }); }
    const pu = act.savePurchase({ supplierId: sup.id, invoice: b.number, purchasedAt: b.date, receivedAt: b.date, items, tax: Math.max(0, b.total - items.reduce((a, i) => a + i.subtotal, 0)), discount: 0, payMethod: b.status === 'closed' ? 'Efectivo' : 'Crédito proveedor', receivedBy: 'Alegra', status: 'borrador', source: 'alegra', alegraBillId: b.id, attachment: `Alegra ${b.id}`, notes: `Factura de proveedor importada de Alegra${st === 'whatsapp' ? ' (sustituye la foto de WhatsApp)' : ''}` }, false);
    b.state = 'importada'; b.localId = pu.id;
  }
  S.alegra.log.unshift({ ts: new Date().toISOString(), action: 'factura.importar', status: 'ok', detail: `${b.provider.name} ${b.number} → ${AL_ST[b.state][0]}` });
  save(); render(); toast(AL_ST[b.state][0]);
}
function alegraPush(id) {
  const p = S.purchases.find((x) => x.id === id);
  if (!S.alegra.supplierLinks[p.supplierId]) return toast(`${supById(p.supplierId)?.name} no está vinculado con Alegra. Vincúlalo en la pestaña Vínculos.`);
  p.alegraBillId = String(2100 + S.alegra.log.length);
  const unl = p.items.filter((i) => !S.alegra.itemLinks[i.productId]).length;
  S.alegra.log.unshift({ ts: new Date().toISOString(), action: 'factura.exportar', status: 'ok', detail: `${supById(p.supplierId)?.name} ${p.invoice || ''} → Alegra ${p.alegraBillId}${unl ? ` (${unl} líneas a la cuenta contable de compras)` : ''}${p.payMethod !== 'Crédito proveedor' ? ' + pago' : ''} (simulado)` });
  log('alegra.exportar', `${p.invoice} → ${p.alegraBillId}`);
}
RENDER.alegra = () => {
  const A = S.alegra;
  const pend = S.purchases.filter((p) => p.status === 'aprobada' && !p.alegraBillId && p.source !== 'alegra' && p.kind !== 'orden').sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
  const sent = S.purchases.filter((p) => p.alegraBillId).length;
  const tabs = [['facturas', 'Facturas de proveedor', A.bills.filter((b) => !['vinculada', 'importada', 'gasto', 'existe'].includes(alegraBillState(b))).length], ['enviar', 'Enviar a Alegra', pend.length], ['vinculos', 'Vínculos', 0], ['registro', 'Registro', 0]];
  let body = '';
  if (AL.tab === 'facturas') body = `<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Detalle</th><th class="n">Total</th><th>Pago</th><th>Estado en Capybara</th><th></th></tr></thead><tbody>
    ${A.bills.map((b) => { const st = alegraBillState(b); return `<tr class="sev ${st === 'sin_vincular' ? 'sev-bad' : st === 'whatsapp' ? 'sev-warn' : ''}"><td class="small">${fdate(b.date + 'T12:00')}</td><td>${esc(b.provider.name)}<span class="sub mono">Alegra #${esc(b.provider.id)}</span></td><td class="mono small">${esc(b.number)}<span class="sub">id ${esc(b.id)}</span></td>
    <td class="small">${[...b.items.map((i) => `${num(i.quantity)} × ${esc(i.name)}`), ...b.categories.map((c) => `${esc(c.observations || c.name)} (cuenta ${esc(c.id)})`)].join('<br>')}</td><td class="n num">${money(b.total)}</td><td>${b.status === 'closed' ? pill('Pagada', 'p-ok') : pill('Por pagar', 'p-warn')}</td><td>${pill(...AL_ST[st])}</td>
    <td>${['nueva', 'whatsapp', 'categoria', 'existe'].includes(st) ? `<button class="btn sm pri" data-ai="${b.id}">${st === 'existe' ? 'Vincular' : st === 'categoria' ? 'Registrar gasto' : 'Importar'}</button>` : st === 'sin_vincular' ? `<button class="btn sm" data-altab="vinculos">Vincular ítems</button>` : b.localId ? `<a class="btn sm" href="#entradas" data-openpu="${b.localId}">Ver compra</a>` : ''}</td></tr>`; }).join('')}
  </tbody></table></div><p class="muted small" style="margin:8px 0 0">Las facturas importadas llegan como <b>borrador</b>: el inventario se actualiza solo cuando alguien aprueba la entrada. Si la misma factura llegó antes por foto de WhatsApp, se reemplaza para no duplicar.</p>`;
  if (AL.tab === 'enviar') body = `<div class="row" style="margin-bottom:10px"><span class="muted small">Compras aprobadas en Capybara que aún no están en Alegra.</span><span class="spacer"></span>${pend.length ? `<button class="btn pri" id="al-pushall">Enviar ${pend.length} a Alegra</button>` : ''}</div>
    <div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th class="n">Ítems</th><th class="n">Total</th><th>Pago</th><th>Proveedor en Alegra</th><th></th></tr></thead><tbody>
    ${pend.map((p) => `<tr><td class="small">${fdate(p.purchasedAt + 'T12:00')}</td><td>${esc(supById(p.supplierId)?.name)}</td><td class="mono small">${esc(p.invoice || '—')}</td><td class="n num">${p.items.length}<span class="sub">${p.items.filter((i) => S.alegra.itemLinks[i.productId]).length} con ítem</span></td><td class="n num">${money(p.total)}</td><td class="small">${esc(p.payMethod)}</td><td>${A.supplierLinks[p.supplierId] ? pill('#' + A.supplierLinks[p.supplierId], 'p-ok') : pill('Sin vincular', 'p-bad')}</td><td><button class="btn sm" data-ap="${p.id}">Enviar</button></td></tr>`).join('') || '<tr><td colspan="8"><div class="empty">Todo está en Alegra.</div></td></tr>'}
    </tbody></table></div><p class="muted small" style="margin:8px 0 0">Se crea la factura de proveedor (POST /bills). Los productos sin ítem en Alegra van a la cuenta contable configurada. Si la compra ya se pagó, también se registra el pago (POST /payments).</p>`;
  if (AL.tab === 'vinculos') body = `<div class="grid g2" style="align-items:start">
    <div><h3 style="margin-bottom:8px">Proveedores</h3><div class="tbl-wrap"><table><thead><tr><th>Capybara</th><th>NIT</th><th>Contacto en Alegra</th></tr></thead><tbody>${S.suppliers.map((s) => `<tr><td>${esc(s.name)}</td><td class="mono small">${esc(s.taxId || '—')}</td><td><input class="in mono" data-sl="${s.id}" value="${esc(A.supplierLinks[s.id] || '')}" placeholder="id" style="width:110px"></td></tr>`).join('')}</tbody></table></div></div>
    <div><h3 style="margin-bottom:8px">Ítems de Alegra ↔ productos</h3><div class="tbl-wrap"><table><thead><tr><th>Ítem en Alegra</th><th>Producto en Capybara</th></tr></thead><tbody>${A.items.map((it) => { const linked = Object.entries(A.itemLinks).find(([, v]) => v === it.id)?.[0]; const sug = linked ? null : (it.reference && S.products.find((p) => p.code === it.reference)) || matchProduct(it.name, catalogForParser())?.product; return `<tr><td><b>${esc(it.name)}</b><span class="sub mono">#${esc(it.id)}${it.reference ? ' · ref ' + esc(it.reference) : ''}</span></td><td><select class="in" data-il="${it.id}">${opt('', '— sin vincular —')}${prodOptions(linked || '', (p) => p.kind !== 'activo')}</select>${sug ? `<span class="sub">Sugerido: ${esc(sug.name)} <button class="btn sm" data-ils="${it.id}" data-p="${sug.id}">Usar</button></span>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div></div>`;
  if (AL.tab === 'registro') body = `<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Acción</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>${A.log.slice(0, 60).map((l) => `<tr><td class="small mono">${fdt(l.ts)}</td><td><span class="tag mono">${esc(l.action)}</span></td><td>${pill(l.status, l.status === 'ok' ? 'p-ok' : 'p-bad')}</td><td class="small">${esc(l.detail)}</td></tr>`).join('')}</tbody></table></div>`;
  return `
  <div class="grid g2" style="align-items:start">
    <div class="card"><div class="card-h"><h2>Conexión con Alegra</h2><span class="spacer"></span>${S.settings.mode === 'api' ? pill('Desde el backend', 'p-ok') : pill('Ejemplo', 'p-warn')}</div>
      <div class="li"><span class="thumb">AL</span><span class="grow"><b>${esc(A.company)}</b><span class="small muted">${esc(A.email)} · última sincronización ${fdt(A.lastSync)}</span></span></div>
      <div class="row" style="margin-top:10px"><button class="btn pri" id="al-sync">${ic('sync')} Sincronizar ahora</button><button class="btn" id="al-hook" ${A.webhooks ? 'disabled' : ''}>${A.webhooks ? 'Webhooks activos' : 'Activar webhooks'}</button></div>
      <p class="muted small" style="margin:10px 0 0">El correo y el token de la API se guardan solo en el servidor (<span class="mono">ALEGRA_EMAIL</span>, <span class="mono">ALEGRA_TOKEN</span>). Alegra permite 150 solicitudes por minuto: el backend las dosifica y reintenta si recibe 429.</p>
    </div>
    <div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="kpi"><span class="k">Compras en Alegra</span><span class="v">${sent}</span></div>
      <div class="kpi ${pend.length ? 'warn' : ''}"><span class="k">Pendientes de enviar</span><span class="v">${pend.length}</span></div>
      <div class="kpi"><span class="k">Proveedores vinculados</span><span class="v">${Object.values(A.supplierLinks).filter(Boolean).length}/${S.suppliers.length}</span></div>
      <div class="kpi"><span class="k">Ítems vinculados</span><span class="v">${Object.keys(A.itemLinks).length}/${A.items.length}</span></div>
    </div>
  </div>
  <div class="tabs">${tabs.map(([k, l, c]) => `<button data-altab="${k}" class="${AL.tab === k ? 'on' : ''}">${l}${c ? `<span class="ct">${c}</span>` : ''}</button>`).join('')}</div>
  ${body}`;
};
BIND.alegra = (el) => {
  $$('[data-altab]', el).forEach((b) => (b.onclick = () => { AL.tab = b.dataset.altab; render(); }));
  $$('[data-ai]', el).forEach((b) => (b.onclick = () => alegraImport(b.dataset.ai)));
  $$('[data-openpu]', el).forEach((a) => (a.onclick = () => { const p = S.purchases.find((x) => x.id === a.dataset.openpu); if (p) PU = { ...JSON.parse(JSON.stringify(p)), taxPct: p.subtotal ? Math.round((p.tax / p.subtotal) * 100) : 0 }; }));
  $$('[data-ap]', el).forEach((b) => (b.onclick = () => { alegraPush(b.dataset.ap); save(); render(); toast('Compra enviada a Alegra (simulado)'); }));
  $('#al-pushall', el)?.addEventListener('click', () => { const ps = S.purchases.filter((p) => p.status === 'aprobada' && !p.alegraBillId && p.source !== 'alegra' && p.kind !== 'orden'); let ok = 0; for (const p of ps) if (S.alegra.supplierLinks[p.supplierId]) { alegraPush(p.id); ok++; } save(); render(); toast(`${ok} compras enviadas · ${ps.length - ok} con proveedor sin vincular`); });
  $$('[data-sl]', el).forEach((i) => (i.onchange = () => { S.alegra.supplierLinks[i.dataset.sl] = i.value.trim(); save(); toast('Vínculo guardado'); }));
  $$('[data-il]', el).forEach((s) => (s.onchange = () => { for (const [k, v] of Object.entries(S.alegra.itemLinks)) if (v === s.dataset.il) delete S.alegra.itemLinks[k]; if (s.value) S.alegra.itemLinks[s.value] = s.dataset.il; save(); render(); }));
  $$('[data-ils]', el).forEach((b) => (b.onclick = () => { S.alegra.itemLinks[b.dataset.p] = b.dataset.ils; save(); render(); toast('Ítem vinculado'); }));
  $('#al-sync', el).onclick = async () => {
    if (S.settings.mode === 'api') { try { const r = await remote.req('/api/v1/alegra/sync', { method: 'POST', body: {} }); toast(`Alegra: ${r.bills.nuevas} nuevas, ${r.bills.vinculadas} vinculadas`); await remote.load(); } catch (e) { toast(e.message); } return; }
    S.alegra.lastSync = new Date().toISOString();
    const n = S.alegra.bills.filter((b) => !['vinculada', 'importada', 'gasto'].includes(alegraBillState(b))).length;
    S.alegra.log.unshift({ ts: S.alegra.lastSync, action: 'facturas.consultar', status: 'ok', detail: `${S.alegra.bills.length} facturas leídas · ${n} por revisar (simulado)` }); save(); render(); toast(`${n} facturas por revisar`);
  };
  $('#al-hook', el).onclick = () => { S.alegra.webhooks = true; S.alegra.log.unshift({ ts: new Date().toISOString(), action: 'webhooks.suscribir', status: 'ok', detail: 'new-bill, edit-bill, delete-bill, new-item, edit-item (simulado)' }); save(); render(); toast('Webhooks activados (simulado)'); };
};

/* ---------------- Control de acceso ---------------- */
RENDER.acceso = () => {
  const since = Date.now() - 30 * DAY;
  const act30 = (u) => { const ms = S.movements.filter((m) => m.user === u.name && new Date(m.ts) >= since); const c = (s) => ms.filter((m) => m.status === s).length; return { t: ms.length, a: c('aprobado'), p: c('pendiente') + c('requiere_info'), r: c('rechazado'), d: c('duplicado') }; };
  const roles = Object.keys(ROLES);
  return `
  <div class="row"><span class="muted small">${S.users.filter((u) => u.active).length} usuarios activos</span><span class="spacer"></span><button class="btn pri" id="ac-new">${ic('plus')} Nuevo usuario</button></div>
  <div class="tbl-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Área</th><th>WhatsApp</th><th class="n">Registros 30 d</th><th class="n">Aprobados</th><th class="n">Pendientes</th><th class="n">Rechazados</th><th>Estado</th><th></th></tr></thead><tbody>
  ${S.users.map((u) => { const a = act30(u); return `<tr><td><b>${esc(u.name)}</b><span class="sub">${esc(u.email || '')}</span></td><td>${pill(ROLES[u.role], ROLE_PILL[u.role])}</td><td class="small">${esc([u.area, ...(u.areas || [])].filter(Boolean).join(', '))}</td><td class="mono small">${u.phone ? '+' + esc(u.phone) : '—'}</td><td class="n num">${a.t}</td><td class="n num">${a.a}</td><td class="n num">${a.p}</td><td class="n num ${a.r ? 'neg' : ''}">${a.r}</td><td>${u.active ? pill('Activo', 'p-ok') : pill('Inactivo', 'p-mut')}</td><td><div class="actions" style="flex-wrap:nowrap"><button class="btn sm" data-ue="${u.id}">${ic('edit')}</button>${u.active && u.name !== me().name ? `<button class="btn sm" data-uv="${u.id}" title="Ver la app como este usuario">Ver como</button>` : ''}</div></td></tr>`; }).join('')}
  </tbody></table></div>

  <div class="grid g2" style="align-items:start">
    <div class="card"><div class="card-h"><h2>Módulo administrador</h2></div><ul class="steps"><li>Tablero completo con costos, compras, gastos y pérdida estimada</li><li>Aprueba, rechaza y anula movimientos, entradas y mensajes de WhatsApp</li><li>Conciliación, inteligencia, Alegra, Drive y bitácora</li><li>Gestiona usuarios, roles y permisos, y configura integraciones</li></ul></div>
    <div class="card"><div class="card-h"><h2>Módulo empleados (limitado)</h2></div><ul class="steps"><li>Entran a <b>Mi turno</b>: marchar, reportar daños, recibir mercancía y contar su área</li><li>Todo lo que registran queda <b>pendiente</b> hasta que un supervisor lo apruebe</li><li>No ven costos, precios, valores en pesos, tablero, conciliación ni configuración</li><li>Pueden solicitar compras de lo que está bajo en su área</li></ul></div>
  </div>

  <div class="card"><div class="card-h"><h2>Permisos por rol</h2><span class="spacer"></span><span class="muted small">El administrador siempre tiene todo</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Permiso</th>${roles.map((r) => `<th style="text-align:center">${ROLES[r]}</th>`).join('')}</tr></thead><tbody>
    ${Object.entries(PERMISSIONS).map(([k, l]) => `<tr><td>${esc(l)}<span class="sub mono">${k}</span></td>${roles.map((r) => `<td style="text-align:center"><input type="checkbox" data-pm="${r}|${k}" ${hasPerm(r, k, S.rolePerms) ? 'checked' : ''} ${r === 'ADMIN' ? 'disabled' : ''} aria-label="${esc(l)} · ${ROLES[r]}"></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <div class="row" style="margin-top:10px"><button class="btn" id="ac-reset">Restablecer permisos recomendados</button></div>
  </div>`;
};
function userForm(u = null) {
  const isNew = !u; u = u || { name: '', email: '', role: 'EMPLEADO', area: 'Bar', areas: [], phone: '', active: true };
  const m = modal({ title: isNew ? 'Nuevo usuario' : 'Editar usuario', body: `
    <div class="grid g2"><div class="field"><label for="uf-name">Nombre</label><input class="in" id="uf-name" value="${esc(u.name)}"></div><div class="field"><label for="uf-email">Correo (inicio de sesión)</label><input class="in" id="uf-email" type="email" value="${esc(u.email || '')}"></div></div>
    <div class="grid g3"><div class="field"><label for="uf-role">Rol</label><select class="in" id="uf-role">${Object.entries(ROLES).map(([k, l]) => opt(k, l, u.role)).join('')}</select></div><div class="field"><label for="uf-area">Área principal</label><select class="in" id="uf-area">${['Administración', ...AREAS].map((a) => opt(a, a, u.area)).join('')}</select></div><div class="field"><label for="uf-phone">WhatsApp (57…)</label><input class="in mono" id="uf-phone" value="${esc(u.phone || '')}" placeholder="573001112233"></div></div>
    <div class="field"><label>Áreas adicionales</label><div class="row">${AREAS.map((a) => `<label class="small row" style="gap:4px"><input type="checkbox" data-ua="${a}" ${(u.areas || []).includes(a) ? 'checked' : ''}>${a}</label>`).join('')}</div></div>
    ${!isNew ? `<label class="row small"><input type="checkbox" id="uf-active" ${u.active ? 'checked' : ''}> Usuario activo</label>` : '<p class="muted small" style="margin:0">Con el backend conectado se envía una contraseña temporal por correo. Su número de WhatsApp queda autorizado para reportar.</p>'}`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="uf-ok">${ic('check')} Guardar</button>` });
  m.querySelector('#uf-ok').onclick = () => {
    const g = (k) => m.querySelector('#uf-' + k).value.trim();
    if (!g('name')) return toast('Escribe el nombre.');
    if (g('phone') && !/^\d{10,15}$/.test(g('phone'))) return toast('El WhatsApp debe tener solo números, con indicativo (57…).');
    const isMe = u.name === me().name;
    const o = { ...u, name: g('name'), email: g('email'), role: g('role'), area: g('area'), phone: g('phone'), areas: $$('[data-ua]', m).filter((x) => x.checked).map((x) => x.dataset.ua), active: isNew ? true : m.querySelector('#uf-active').checked };
    if (isMe && (o.role !== 'ADMIN' || !o.active)) return toast('No puedes quitarte el rol de administrador ni desactivarte.');
    if (isNew) { o.id = uid('u'); S.users.push(o); } else { const i = S.users.findIndex((x) => x.id === u.id); if (isMe) S.settings.user = o.name; S.users[i] = o; }
    log(isNew ? 'usuario.crear' : 'usuario.editar', `${o.name} · ${ROLES[o.role]}`); closeModal(); save(); render(); toast('Usuario guardado');
  };
}
BIND.acceso = (el) => {
  $('#ac-new', el).onclick = () => userForm();
  $$('[data-ue]', el).forEach((b) => (b.onclick = () => userForm(S.users.find((u) => u.id === b.dataset.ue))));
  $$('[data-uv]', el).forEach((b) => (b.onclick = () => { S.settings.user = S.users.find((u) => u.id === b.dataset.uv).name; save(); toast(`Viendo como ${me().name}. Cambia de usuario en el menú lateral.`); location.hash = homeView(); render(); }));
  $$('[data-pm]', el).forEach((c) => (c.onchange = () => { const [r, k] = c.dataset.pm.split('|'); const set = new Set(S.rolePerms[r] || []); c.checked ? set.add(k) : set.delete(k); S.rolePerms[r] = [...set]; log('rol.permisos', `${ROLES[r]}: ${c.checked ? '+' : '−'} ${k}`); save(); renderNav(); }));
  $('#ac-reset', el).onclick = () => { S.rolePerms = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMS)); log('rol.permisos', 'Restablecidos'); save(); render(); toast('Permisos restablecidos'); };
};

/* ---------------- arranque ---------------- */
const _seedState = seedState;
seedState = function () { _seedState(); S.users = null; S.alegra = null; S.requests = null; S.insights = null; S.rolePerms = null; upgradeState(); return S; };
