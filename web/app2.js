/* ================= Capybara Control · app (2/4): API remota, shell, tablero ================= */

/* ---------------- API remota (backend Capybara Control) ---------------- */
const remote = {
  base: () => (S.settings.baseUrl || '').replace(/\/$/, ''),
  async req(path, { method = 'GET', body } = {}) {
    const r = await fetch(remote.base() + path, { method, headers: { 'Content-Type': 'application/json', ...(S.settings.token ? { Authorization: 'Bearer ' + S.settings.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    return data;
  },
  async health() { return remote.req('/health'); },
  async login(email, password) { const d = await remote.req('/api/v1/auth/login', { method: 'POST', body: { email, password } }); S.settings.token = d.token; S.settings.user = d.user.name; S.settings.role = d.user.role; S.settings.area = d.user.area || ''; save(); return d; },
  async load() {
    const [products, movements, suppliers, purchases, expenses, inbox, categories] = await Promise.all(['/products?status=todos', '/movements?take=2000', '/suppliers', '/purchases', '/expenses', '/whatsapp/inbox', '/categories'].map((p, i) => remote.req('/api/v1' + p).catch((e) => { if (i === 0) throw e; return []; }))); // sin permiso para un recurso = lista vacía
    S.categories = categories;
    S.products = products.map((p) => ({ ...p, category: p.category, example: false }));
    S.movements = movements.map((m) => ({ ...m, user: m.user?.name || m.reportedBy || '', evidence: m.evidenceId, inboxId: m.inboxItemId }));
    S.suppliers = suppliers;
    S.purchases = purchases.map((p) => ({ ...p, purchasedAt: iso(p.purchasedAt), receivedAt: iso(p.receivedAt), subtotal: +p.subtotal, tax: +p.tax, discount: +p.discount, total: +p.total, items: p.items.map((i) => ({ ...i, qty: +i.qty, unitCost: +i.unitCost })) }));
    S.expenses = expenses.map((e) => ({ ...e, date: iso(e.date), amount: +e.amount }));
    S.inbox = inbox.map((i) => ({ ...i, from: i.fromName || i.from, phone: i.from, chat: i.chatId, type: i.msgType, ts: i.ts, doc: i.attachment?.extracted || null }));
  },
};
const catId = (name) => S.categories?.find((c) => c.name === name)?.id;
const remoteAct = {
  addMovement: (o, opt = {}) => remote.req('/api/v1/movements', { method: 'POST', body: { productId: o.productId, qty: +o.qty, unit: o.unit, type: o.type, area: o.area || undefined, reason: o.reason || undefined, source: o.source || 'manual', notes: o.notes || undefined, unitCost: o.unitCost || undefined, approve: !!opt.approve } }),
  approve: (id, edits) => remote.req(`/api/v1/movements/${id}/approve`, { method: 'POST', body: { edits } }),
  setStatus: (id, status, note) => remote.req(`/api/v1/movements/${id}/${{ rechazado: 'reject', duplicado: 'duplicate', requiere_info: 'request-info' }[status]}`, { method: 'POST', body: { reason: note, question: note } }),
  voidMv: (id, reason) => remote.req(`/api/v1/movements/${id}/void`, { method: 'POST', body: { reason } }),
  savePurchase: (pu, approve) => remote.req('/api/v1/purchases', { method: 'POST', body: { supplierId: pu.supplierId, invoice: pu.invoice, purchasedAt: pu.purchasedAt, receivedAt: pu.receivedAt, items: pu.items.map((i) => ({ productId: i.productId, qty: +i.qty, unit: i.unit, unitCost: +i.unitCost })), tax: +pu.tax || 0, discount: +pu.discount || 0, payMethod: pu.payMethod, receivedBy: pu.receivedBy, notes: pu.notes, approve } }),
  approvePurchase: (id) => remote.req(`/api/v1/purchases/${id}/approve`, { method: 'POST' }),
  saveProduct: (p) => { const body = { code: p.code, barcode: p.barcode || null, name: p.name, aliases: p.aliases, description: p.description, categoryId: catId(p.category), kind: p.kind, unit: p.unit, stockMin: +p.stockMin, stockMax: p.stockMax ? +p.stockMax : null, avgCost: +p.avgCost, supplierId: p.supplierId || null, location: p.location, expiresAt: p.expiresAt || null, notes: p.notes }; return p.id && !p.id.startsWith('p_new') && S.products.some((x) => x.id === p.id) ? remote.req(`/api/v1/products/${p.id}`, { method: 'PATCH', body }) : remote.req('/api/v1/products', { method: 'POST', body: { ...body, stockInit: +p.stockInit || 0 } }); },
  saveSupplier: (s) => (s.id ? remote.req(`/api/v1/suppliers/${s.id}`, { method: 'PATCH', body: s }) : remote.req('/api/v1/suppliers', { method: 'POST', body: s })),
  saveExpense: (e) => remote.req('/api/v1/expenses', { method: 'POST', body: { ...e, amount: +e.amount } }),
  saveCounts: (items) => remote.req('/api/v1/counts', { method: 'POST', body: { items: items.map((i) => ({ productId: i.productId, qty: +i.qty })) } }),
  inboxStatus: (id, status, opt = {}) => remote.req(`/api/v1/whatsapp/inbox/${id}/status`, { method: 'POST', body: { status, note: opt.note } }),
};
/** Ejecuta una acción en modo demo (local) o contra la API */
async function run(name, ...args) {
  try {
    if (S.settings.mode === 'api') { await remoteAct[name](...args); await remote.load(); }
    else act[name](...args);
    save(); render();
  } catch (e) { toast('No se pudo completar: ' + e.message); throw e; }
}

/* ---------------- UI base ---------------- */
function toast(msg) { const box = $('#toasts'); while (box.children.length >= 3) box.firstChild.remove(); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('#toasts').append(t); setTimeout(() => t.remove(), 4200); }
function modal({ title, body, foot = '', wide = false, onMount }) {
  closeModal();
  const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.id = 'modal';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mdl-t"><div class="modal-h"><h2 id="mdl-t">${title}</h2><button class="btn ghost sm" data-close aria-label="Cerrar">${ic('x')}</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) closeModal(); });
  document.body.append(bg);
  onMount?.(bg);
  setTimeout(() => bg.querySelector('input,select,textarea,button:not([data-close])')?.focus(), 30);
  return bg;
}
function closeModal() { $('#modal')?.remove(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
/** Confirmación con texto dentro de la página (confirm() no existe en el visor) */
function ask({ title, text, label = 'Confirmar', input = null, danger = false }) {
  return new Promise((res) => {
    const m = modal({ title, body: `<p style="margin:0">${text}</p>${input ? `<div class="field"><label for="ask-in">${input}</label><textarea class="in" id="ask-in" rows="2"></textarea></div>` : ''}`,
      foot: `<button class="btn" data-close>Cancelar</button><button class="btn ${danger ? 'bad' : 'pri'}" id="ask-ok">${label}</button>` });
    m.querySelector('#ask-ok').onclick = () => { const v = input ? m.querySelector('#ask-in').value.trim() : true; if (input && !v) { m.querySelector('#ask-in').focus(); return; } closeModal(); res(v); };
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === m) res(null); });
  });
}
const opt = (v, l, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`;
const prodOptions = (sel, filter = () => true) => S.products.filter((p) => p.status !== 'inactivo' && filter(p)).sort((a, b) => a.name.localeCompare(b.name)).map((p) => opt(p.id, `${p.name} · ${p.code}`, sel)).join('');
const typeOptions = (sel, only) => Object.entries(MOVEMENT_TYPES).filter(([k]) => !only || only.includes(k)).map(([k, v]) => opt(k, v.label, sel)).join('');
const cats = () => [...new Set([...CATEGORIES, ...S.products.map((p) => p.category)])];

/* ---------------- tema ---------------- */
function applyTheme() { const t = S.settings.theme; if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); $('#theme-btn').innerHTML = ic(t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'auto') + `<span class="hide-sm">${{ system: 'Sistema', light: 'Claro', dark: 'Oscuro' }[t]}</span>`; }
function cycleTheme() { S.settings.theme = { system: 'light', light: 'dark', dark: 'system' }[S.settings.theme]; applyTheme(); save(); render(); }
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => S && render());

/* ---------------- router ---------------- */
const VIEWS = {
  dashboard: { t: 'Tablero', ic: 'dash', grp: 'Operación' },
  inventario: { t: 'Productos e inventario', ic: 'box', grp: 'Operación' },
  entradas: { t: 'Registro de entradas', ic: 'in', grp: 'Operación' },
  marchados: { t: 'Productos marchados', ic: 'out', grp: 'Operación' },
  whatsapp: { t: 'Movimientos detectados en WhatsApp', short: 'WhatsApp', ic: 'wa', grp: 'Fuentes' },
  drive: { t: 'Google Drive y Sheets', short: 'Drive y Sheets', ic: 'drive', grp: 'Fuentes' },
  conciliacion: { t: 'Motor de conciliación', short: 'Conciliación', ic: 'scale', grp: 'Control' },
  proveedores: { t: 'Proveedores y compras', short: 'Proveedores', ic: 'truck', grp: 'Control' },
  gastos: { t: 'Gastos', ic: 'cash', grp: 'Control' },
  bitacora: { t: 'Bitácora', ic: 'log', grp: 'Control' },
  integraciones: { t: 'Integraciones y API', ic: 'plug', grp: 'Sistema' },
};
const view = () => (VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard');
function navCounts() {
  return {
    marchados: S.movements.filter((m) => m.status === 'pendiente' || m.status === 'requiere_info').length,
    whatsapp: S.inbox.filter((i) => ['pendiente_analisis', 'pendiente_aprobacion', 'requiere_info'].includes(i.status)).length,
    drive: S.sheet?.preview?.rows.length || 0,
    conciliacion: S.recon ? S.recon.rows.filter((r) => ['importante', 'duplicado', 'sin_respaldo'].includes(r.status)).length : 0,
    entradas: S.purchases.filter((p) => p.status === 'borrador').length,
  };
}
function renderNav() {
  const c = navCounts(); let g = '';
  $('#nav').innerHTML = Object.entries(VIEWS).map(([k, v]) => {
    const head = v.grp !== g ? `<div class="grp">${(g = v.grp)}</div>` : '';
    return `${head}<a href="#${k}" class="${view() === k ? 'on' : ''}" ${view() === k ? 'aria-current="page"' : ''}>${ic(v.ic)}<span>${v.short || v.t}</span>${c[k] ? `<span class="ct">${c[k]}</span>` : ''}</a>`;
  }).join('');
  $('#mode-chip').innerHTML = cl.active ? `${pill('Datos en Claude', 'p-ok')}<span id="cloud-st">${cl.statusHtml()}</span>` : S.settings.cloud?.on ? `${pill('Supabase', 'p-ok')}<span id="cloud-st">${cloud.statusHtml()}</span>` : S.settings.mode === 'api' ? `${pill('API conectada', 'p-ok')}<span class="small">${esc(remote.base())}</span>` : `${pill('Modo demostración', 'p-warn')}<span class="small">Datos de ejemplo en este navegador</span>`;
  $('#who').textContent = S.settings.user;
}
const charts = {};
function render() {
  if (!S) return;
  renderNav();
  const v = view();
  $('#ttl').textContent = VIEWS[v].t;
  document.title = 'Capybara Control';
  Object.values(charts).forEach((c) => c.destroy()); for (const k in charts) delete charts[k];
  const el = $('#content');
  el.innerHTML = RENDER[v]();
  BIND[v]?.(el);
  $('.app').classList.remove('nav-open');
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

/* ---------------- gráficos ---------------- */
const cv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function chart(id, cfg) {
  const el = document.getElementById(id); if (!el || !window.Chart) return;
  const fg = cv('--muted'), grid = alpha(cv('--muted').startsWith('#') ? cv('--muted') : '#888888', 0.14);
  Object.assign(Chart.defaults, { color: fg });
  Chart.defaults.font.family = 'Figtree, system-ui, sans-serif'; Chart.defaults.font.size = 11.5;
  Chart.defaults.elements.bar.borderRadius = 6; Chart.defaults.elements.bar.borderSkipped = false;
  Chart.defaults.elements.line.tension = 0.38; Chart.defaults.elements.line.borderWidth = 2.2;
  Chart.defaults.elements.point.radius = 0; Chart.defaults.elements.point.hoverRadius = 5; Chart.defaults.elements.point.hitRadius = 12;
  Chart.defaults.elements.arc.borderWidth = 0;
  const base = { responsive: true, maintainAspectRatio: false, animation: { duration: 600, easing: 'easeOutQuart' }, interaction: { mode: 'index', intersect: false }, layout: { padding: { top: 4 } },
    plugins: { legend: { position: 'bottom', align: 'start', labels: { boxWidth: 7, boxHeight: 7, usePointStyle: true, pointStyle: 'circle', padding: 14, color: fg } },
      tooltip: { backgroundColor: cv('--surface'), titleColor: cv('--fg'), bodyColor: cv('--fg'), borderColor: cv('--line'), borderWidth: 1, padding: 10, cornerRadius: 10, boxPadding: 4, usePointStyle: true, titleFont: { weight: '600' } } } };
  cfg.options = { ...base, ...(cfg.options || {}), plugins: { ...base.plugins, ...(cfg.options?.plugins || {}), legend: { ...base.plugins.legend, ...(cfg.options?.plugins?.legend || {}), labels: { ...base.plugins.legend.labels, ...(cfg.options?.plugins?.legend?.labels || {}) } }, tooltip: { ...base.plugins.tooltip, ...(cfg.options?.plugins?.tooltip || {}) } } };
  for (const [k, ax] of Object.entries(cfg.options.scales || {})) {
    const valueAxis = (cfg.options.indexAxis === 'y') === (k === 'x');
    ax.grid = valueAxis ? { color: grid, drawTicks: false, ...(ax.grid || {}) } : { display: false, ...(ax.grid || {}) };
    ax.border = { display: false, dash: [3, 4] }; ax.ticks = { padding: 8, maxTicksLimit: valueAxis ? 5 : 8, color: fg, ...(ax.ticks || {}) };
  }
  charts[id] = new Chart(el, cfg);
}
const palette = () => ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'].map(cv);
const alpha = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
/** Relleno degradado vertical para líneas */
const fade = (hex) => (ctx) => { const a = ctx.chart.chartArea; if (!a) return alpha(hex, 0.12); const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, alpha(hex, 0.22)); g.addColorStop(1, alpha(hex, 0)); return g; };
/** Texto centrado en donas */
const centerText = (label, value) => ({ id: 'center', afterDraw(c) { const { ctx, chartArea: a } = c; if (!a) return; const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2; ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = cv('--fg'); ctx.font = '600 20px Figtree, system-ui, sans-serif'; ctx.fillText(value, x, y + 2); ctx.fillStyle = cv('--muted'); ctx.font = '12px Figtree, system-ui, sans-serif'; ctx.fillText(label, x, y + 20); ctx.restore(); } });
function spark(vals, color) {
  if (!vals?.length) return '';
  const w = 160, h = 40, max = Math.max(...vals), min = Math.min(...vals), rg = max - min || 1;
  const X = (i) => (i / (vals.length - 1)) * w, Y = (v) => h - 3 - ((v - min) / rg) * (h - 8);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}L${w},${h}L0,${h}Z" fill="${color}" opacity=".10"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
const moneyTick = { callback: (v) => moneyK(v) };

/* ---------------- filtros del tablero ---------------- */
let F = { from: iso(Date.now() - 29 * DAY), to: iso(Date.now()), product: '', category: '', supplier: '', user: '', type: '', source: '', recon: '', group: 'day', priceProduct: 'p_BEB-001' };
function filteredMoves() {
  const from = d0(new Date(F.from + 'T00:00')), to = new Date(new Date(F.to + 'T00:00').getTime() + DAY);
  return S.movements.filter((m) => {
    if (m.status !== 'aprobado') return false;
    const t = new Date(m.ts); if (t < from || t >= to) return false;
    const p = prodById(m.productId); if (!p) return false;
    if (F.product && m.productId !== F.product) return false;
    if (F.category && p.category !== F.category) return false;
    if (F.supplier && p.supplierId !== F.supplier) return false;
    if (F.user && m.user !== F.user) return false;
    if (F.type && m.type !== F.type) return false;
    if (F.source && m.source !== F.source) return false;
    if (F.recon && S.recon && S.recon.rows.find((r) => r.productId === m.productId)?.status !== F.recon) return false;
    return true;
  });
}
const bucket = (ts) => { const d = new Date(ts); if (F.group === 'month') return iso(d).slice(0, 7); if (F.group === 'week') { const x = d0(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); } return iso(d); };

const RENDER = {};
const BIND = {};
RENDER.dashboard = () => {
  if (!S.recon) runRecon();
  const st = stockMap();
  const act_ = S.products.filter((p) => p.status === 'activo' && p.kind !== 'servicio');
  const today = d0(), week = new Date(+today - 6 * DAY), month = new Date(today.getFullYear(), today.getMonth(), 1);
  const tM = S.movements.filter((m) => m.status === 'aprobado' && new Date(m.ts) >= today);
  const sumQ = (arr, f) => arr.filter(f).reduce((a, m) => a + m.qty, 0);
  const entHoy = sumQ(tM, (m) => MOVEMENT_TYPES[m.type].sign > 0 && !m.type.startsWith('ajuste'));
  const marHoy = sumQ(tM, (m) => m.type === 'marchado' || m.type === 'cortesia');
  const salHoy = sumQ(tM, (m) => MOVEMENT_TYPES[m.type].sign < 0 && !['marchado', 'cortesia', 'ajuste_neg'].includes(m.type));
  const pur = S.purchases.filter((p) => p.status === 'aprobada');
  const sumP = (from) => pur.filter((p) => new Date(p.purchasedAt + 'T23:59') >= from).reduce((a, p) => a + p.total, 0);
  const sumE = (from) => S.expenses.filter((e) => e.status !== 'anulado' && new Date(e.date + 'T23:59') >= from).reduce((a, e) => a + e.amount, 0);
  const low = act_.filter((p) => p.kind !== 'activo' && st[p.id] > 0 && st[p.id] <= p.stockMin);
  const out = act_.filter((p) => p.kind !== 'activo' && st[p.id] <= 0);
  const exp = act_.filter((p) => p.expiresAt && new Date(p.expiresAt) - Date.now() < 30 * DAY);
  const value = act_.reduce((a, p) => a + Math.max(0, st[p.id]) * p.avgCost, 0);
  const units = act_.reduce((a, p) => a + Math.max(0, st[p.id]), 0);
  const rr = S.recon.rows; const diffs = rr.filter((r) => !['coincide', 'sin_conteo'].includes(r.status));
  const waPend = S.inbox.filter((i) => ['pendiente_analisis', 'pendiente_aprobacion', 'requiere_info'].includes(i.status)).length;
  const waToday = S.inbox.filter((i) => new Date(i.ts) >= today).length;
  const shImp = S.movements.filter((m) => m.source === 'sheets' && new Date(m.ts) >= new Date(+today - 29 * DAY)).length;
  const invPend = S.purchases.filter((p) => p.status === 'borrador').length + S.inbox.filter((i) => i.doc && i.status === 'pendiente_aprobacion').length;
  const fm = filteredMoves();
  const outBy = {}; for (const m of fm) if (MOVEMENT_TYPES[m.type].sign < 0 && !m.type.startsWith('ajuste')) outBy[m.productId] = (outBy[m.productId] || 0) + m.qty;
  const top = Object.entries(outBy).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const slow = act_.filter((p) => p.kind === 'consumible' && st[p.id] > 0).map((p) => [p, (outBy[p.id] || 0) / Math.max(1, st[p.id])]).sort((a, b) => a[1] - b[1]).slice(0, 5);
  const alerts = [
    ...out.map((p) => ['bad', `${p.name} está agotado`, 'inventario']),
    ...rr.filter((r) => r.status === 'importante' || r.status === 'sin_respaldo').slice(0, 4).map((r) => ['bad', `${r.name}: diferencia de ${num(r.diferencia)} ${r.unit} (${money(r.valor)})`, 'conciliacion']),
    ...rr.filter((r) => r.status === 'duplicado').map((r) => ['warn', `${r.name}: posible movimiento duplicado`, 'conciliacion']),
    ...S.inbox.filter((i) => i.status === 'requiere_info').map((i) => ['warn', `WhatsApp de ${i.from} requiere información`, 'whatsapp']),
    ...exp.filter((p) => new Date(p.expiresAt) - Date.now() < 7 * DAY).map((p) => ['warn', `${p.name} vence el ${fdate(p.expiresAt)}`, 'inventario']),
  ];
  const _ins = computeInsights();
  alerts.splice(out.length, 0, ..._ins.signals.filter((s) => s.type === 'comprar_ya' && !out.some((p) => p.id === s.productId)).slice(0, 3).map((s) => ['bad', s.title, 'inteligencia']));
  const K = (k, v, s = '', cls = '', go = '') => `<div class="kpi ${cls} ${go ? 'click' : ''}" ${go ? `data-go="${go}" tabindex="0" role="link"` : ''}><span class="k">${k}</span><span class="v">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
  const sel = (id, label, opts) => `<div class="field"><label for="${id}">${label}</label><select class="in" id="${id}">${opts}</select></div>`;
  const activeF = ['product', 'category', 'supplier', 'user', 'type', 'source', 'recon'].filter((k) => F[k]).length;
  // series de 14 días para las mini gráficas
  const days14 = Array.from({ length: 14 }, (_, i) => d0(new Date(Date.now() - (13 - i) * DAY)));
  const appr = S.movements.filter((m) => m.status === 'aprobado');
  const dayIdx = (ts) => { const t = d0(new Date(ts)).getTime(); return days14.findIndex((d) => d.getTime() === t); };
  const sMar = new Array(14).fill(0), sNet = new Array(14).fill(0), sPur = new Array(14).fill(0);
  for (const m of appr) { const i = dayIdx(m.ts); if (i < 0) continue; if (m.type === 'marchado' || m.type === 'cortesia') sMar[i] += m.qty; sNet[i] += MOVEMENT_TYPES[m.type].sign * m.qty * (prodById(m.productId)?.avgCost || 0); }
  for (const p of S.purchases) { if (p.status !== 'aprobada' || p.kind === 'orden') continue; const i = dayIdx(p.purchasedAt + 'T12:00'); if (i >= 0) sPur[i] += p.total; }
  const sVal = []; { let v = value; for (let i = 13; i >= 0; i--) { sVal[i] = v; v -= sNet[i]; } }
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const crit = alerts.filter((a) => a[0] === 'bad').length;
  const Hero = (label, val, sub, sp, color, go, cls = '') => `<a class="hero-kpi ${cls}" href="#${go}"><span class="k">${label}</span><span class="v">${val}</span><span class="s">${sub}</span>${sp ? spark(sp, color) : ''}</a>`;
  const Row = (label, val, sub, tone, go) => `<a class="stat" href="#${go}"><span class="dot ${tone}"></span><span class="l">${label}</span><span class="r"><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</span></a>`;
  const sigHigh = _ins.signals.filter((s) => s.severity === 'alta').length;
  return `
  <div class="greet">
    <div><h2>${hello}, Capybara Hostel</h2><p class="muted">${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} · ${crit ? `<b class="neg">${crit} ${crit === 1 ? 'asunto requiere' : 'asuntos requieren'} tu atención</b>` : 'todo en orden'}</p></div>
    <details class="fbox" ${activeF ? 'open' : ''}><summary>${ic('log')} ${fdate(F.from + 'T12:00')} – ${fdate(F.to + 'T12:00')}${activeF ? ' · ' + activeF + ' filtros' : ''}</summary>
    <div class="filters">
      <div class="field"><label for="f-from">Desde</label><input type="date" class="in" id="f-from" value="${F.from}"></div>
      <div class="field"><label for="f-to">Hasta</label><input type="date" class="in" id="f-to" value="${F.to}"></div>
      ${sel('f-product', 'Producto', opt('', 'Todos') + prodOptions(F.product, (p) => p.kind !== 'activo'))}
      ${sel('f-category', 'Categoría', opt('', 'Todas') + cats().map((c) => opt(c, c, F.category)).join(''))}
      ${sel('f-supplier', 'Proveedor', opt('', 'Todos') + S.suppliers.map((s) => opt(s.id, s.name, F.supplier)).join(''))}
      ${sel('f-user', 'Responsable', opt('', 'Todos') + [...new Set(S.movements.map((m) => m.user).filter(Boolean))].sort().map((u) => opt(u, u, F.user)).join(''))}
      ${sel('f-type', 'Tipo de movimiento', opt('', 'Todos') + typeOptions(F.type))}
      ${sel('f-source', 'Fuente', opt('', 'Todas') + Object.entries(SOURCES).map(([k, v]) => opt(k, v, F.source)).join(''))}
      ${sel('f-recon', 'Estado de conciliación', opt('', 'Todos') + Object.entries(RECON_STATUS).map(([k, v]) => opt(k, v, F.recon)).join(''))}
      <button class="btn" id="f-clear">Limpiar filtros</button>
    </div></details>
  </div>

  <div class="heroes">
    ${Hero('Valor del inventario', moneyK(value), `${num(act_.length)} productos · ${num(Math.round(units))} unidades`, sVal, 'var(--c1)', 'inventario')}
    ${Hero('Marchados hoy', num(marHoy), `entradas ${num(entHoy)} · otras salidas ${num(salHoy)}`, sMar, 'var(--c2)', 'marchados')}
    ${Hero('Compras del mes', moneyK(sumP(month)), `hoy ${moneyK(sumP(today))} · semana ${moneyK(sumP(week))}`, sPur, 'var(--c3)', 'proveedores')}
    ${Hero('Pérdida estimada', moneyK(-S.recon.totals.perdida), `${num(diffs.length)} diferencias por conciliar`, null, '', 'conciliacion', S.recon.totals.perdida ? 'is-bad' : '')}
  </div>

  <div class="charts">
    <div class="card ch w8"><div class="card-h"><h2>Entradas y salidas</h2><span class="muted small">unidades</span><span class="spacer"></span><div class="seg" role="group" aria-label="Agrupar">${['day', 'week', 'month'].map((g) => `<button data-group="${g}" class="${F.group === g ? 'on' : ''}">${{ day: 'Día', week: 'Semana', month: 'Mes' }[g]}</button>`).join('')}</div></div><canvas id="c-io"></canvas></div>
    <div class="card ch w4"><div class="card-h"><h2>Requiere atención</h2><span class="spacer"></span>${alerts.length ? `<span class="count">${alerts.length}</span>` : ''}</div><div class="list attn">${alerts.length ? alerts.slice(0, 7).map(([s, t, go]) => `<a class="li" href="#${go}"><span class="dot ${s === 'bad' ? 'bad' : 'warn'}"></span><span class="grow small">${esc(t)}</span><span class="chev">›</span></a>`).join('') : '<div class="empty">Sin pendientes. Buen trabajo.</div>'}</div></div>

    <div class="card ch w4"><div class="card-h"><h2>Indicadores</h2></div><div class="stats">
      ${Row('Gastos de hoy', moneyK(sumE(today)), `mes ${moneyK(sumE(month))}`, '', 'gastos')}
      ${Row('Facturas por revisar', num(invPend), '', invPend ? 'warn' : 'ok', 'entradas')}
      ${Row('Señales de compra', num(sigHigh), `${moneyK(_ins.plan.reduce((a, r) => a + r.estCost, 0))} por reponer`, sigHigh ? 'bad' : 'ok', 'inteligencia')}
      ${Row('Inventario bajo', num(low.length), '', low.length ? 'warn' : 'ok', 'inventario')}
      ${Row('Agotados', num(out.length), out.slice(0, 1).map((p) => esc(p.name.split(' ').slice(0, 2).join(' '))).join(''), out.length ? 'bad' : 'ok', 'inventario')}
      ${Row('Próximos a vencer', num(exp.length), '30 días', exp.length ? 'warn' : 'ok', 'inventario')}
      ${Row('WhatsApp', num(waToday), `${waPend} por revisar`, waPend ? 'warn' : 'ok', 'whatsapp')}
      ${Row('Importados de Sheets', num(shImp), '30 días', '', 'drive')}
    </div></div>
    <div class="card ch w4"><div class="card-h"><h2>Más consumidos</h2><span class="muted small">unidades</span></div><canvas id="c-prod"></canvas></div>
    <div class="card ch w4"><div class="card-h"><h2>Consumo por categoría</h2><span class="muted small">al costo</span></div><canvas id="c-cat"></canvas></div>

    <div class="card ch w4"><div class="card-h"><h2>Mayor consumo</h2></div><div class="list rank">${top.map(([id, q], i) => { const p = prodById(id); return `<div class="li"><span class="pos">${i + 1}</span><span class="grow"><b>${esc(p.name)}</b><div class="bar"><b style="width:${(q / top[0][1]) * 100}%"></b></div></span><span class="num">${num(q)}</span></div>`; }).join('') || '<div class="empty">Sin salidas en el periodo</div>'}</div></div>
    <div class="card ch w4"><div class="card-h"><h2>Menor rotación</h2><span class="muted small">salidas ÷ stock</span></div><div class="list">${slow.map(([p, r]) => `<div class="li"><span class="grow"><b>${esc(p.name)}</b><span class="small muted">${num(st[p.id])} ${p.unit} en stock</span></span><span class="num muted">${r.toFixed(2)}</span></div>`).join('')}</div></div>
    <div class="card ch w4"><div class="card-h"><h2>Movimientos por fuente</h2></div><canvas id="c-src"></canvas></div>

    <div class="card ch"><div class="card-h"><h2>Compras por proveedor</h2></div><canvas id="c-sup"></canvas></div>
    <div class="card ch"><div class="card-h"><h2>Gastos por categoría</h2></div><canvas id="c-exp"></canvas></div>
    <div class="card ch"><div class="card-h"><h2>Variación de precios</h2><span class="spacer"></span><select class="in sm" id="f-price" aria-label="Producto">${prodOptions(F.priceProduct, (p) => S.movements.filter((m) => m.productId === p.id && m.type === 'entrada' && m.unitCost).length >= 2)}</select></div><canvas id="c-price"></canvas></div>
    <div class="card ch"><div class="card-h"><h2>Diferencias de inventario</h2><span class="muted small">físico − teórico</span></div><canvas id="c-diff"></canvas></div>
  </div>`;
};
BIND.dashboard = (el) => {
  const upd = () => render();
  [['f-from', 'from'], ['f-to', 'to'], ['f-product', 'product'], ['f-category', 'category'], ['f-supplier', 'supplier'], ['f-user', 'user'], ['f-type', 'type'], ['f-source', 'source'], ['f-recon', 'recon'], ['f-price', 'priceProduct']].forEach(([id, k]) => { const i = $('#' + id, el); if (i) i.onchange = () => { F[k] = i.value; upd(); }; });
  $('#f-clear', el).onclick = () => { Object.assign(F, { product: '', category: '', supplier: '', user: '', type: '', source: '', recon: '', from: iso(Date.now() - 29 * DAY), to: iso(Date.now()) }); upd(); };
  $$('[data-group]', el).forEach((b) => (b.onclick = () => { F.group = b.dataset.group; upd(); }));
  $$('[data-go]', el).forEach((k) => { k.onclick = () => (location.hash = k.dataset.go); k.onkeydown = (e) => e.key === 'Enter' && k.click(); });
  const C = palette(), fm = filteredMoves();
  // entradas vs salidas
  const tl = {}; const from = d0(new Date(F.from + 'T00:00')), to = d0(new Date(F.to + 'T00:00'));
  for (let t = +from; t <= +to; t += DAY) tl[bucket(t)] ||= [0, 0];
  for (const m of fm) { const b = bucket(m.ts); tl[b] ||= [0, 0]; if (m.type.startsWith('ajuste')) continue; tl[b][MOVEMENT_TYPES[m.type].sign > 0 ? 0 : 1] += m.qty; }
  const keys = Object.keys(tl).sort();
  const lab = (k) => (F.group === 'month' ? new Date(k + '-02').toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }) : F.group === 'week' ? 'Sem ' + fdate(k + 'T12:00') : fdate(k + 'T12:00'));
  chart('c-io', { type: F.group === 'day' ? 'line' : 'bar', data: { labels: keys.map(lab), datasets: [{ label: 'Entradas', data: keys.map((k) => tl[k][0]), borderColor: C[0], backgroundColor: F.group === 'day' ? fade(C[0]) : alpha(C[0], 0.85), fill: true, maxBarThickness: 22 }, { label: 'Salidas', data: keys.map((k) => tl[k][1]), borderColor: C[1], backgroundColor: F.group === 'day' ? fade(C[1]) : alpha(C[1], 0.85), fill: true, maxBarThickness: 22 }] }, options: { plugins: { legend: { align: 'end', position: 'top' } }, scales: { x: {}, y: { beginAtZero: true } } } });
  // por producto
  const byP = {}, byC = {}, bySrc = {};
  for (const m of fm) { bySrc[m.source] = (bySrc[m.source] || 0) + 1; if (MOVEMENT_TYPES[m.type].sign < 0 && !m.type.startsWith('ajuste')) { const p = prodById(m.productId); byP[p.name] = (byP[p.name] || 0) + m.qty; byC[p.category] = (byC[p.category] || 0) + m.qty * p.avgCost; } }
  const tp = Object.entries(byP).sort((a, b) => b[1] - a[1]).slice(0, 8);
  chart('c-prod', { type: 'bar', data: { labels: tp.slice(0, 6).map((x) => x[0].split(' ').slice(0, 2).join(' ')), datasets: [{ label: 'Unidades', data: tp.slice(0, 6).map((x) => x[1]), backgroundColor: tp.slice(0, 6).map((_, i) => alpha(C[0], 1 - i * 0.12)), barThickness: 14 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: {} } } });
  const tc = Object.entries(byC).sort((a, b) => b[1] - a[1]);
  const tc5 = [...tc.slice(0, 5), ...(tc.length > 5 ? [['Otras', tc.slice(5).reduce((a, x) => a + x[1], 0)]] : [])];
  chart('c-cat', { type: 'doughnut', data: { labels: tc5.map((x) => x[0]), datasets: [{ data: tc5.map((x) => Math.round(x[1])), backgroundColor: tc5.map((_, i) => C[i % C.length]), spacing: 2, hoverOffset: 4 }] }, options: { cutout: '72%', interaction: { mode: 'nearest', intersect: true }, plugins: { legend: { position: 'bottom', align: 'center' }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(c.raw)}` } } } }, plugins: [centerText('total', moneyK(tc.reduce((a, x) => a + x[1], 0)))] });
  const ts = Object.entries(bySrc).sort((a, b) => b[1] - a[1]);
  chart('c-src', { type: 'doughnut', data: { labels: ts.map((x) => SOURCES[x[0]] || x[0]), datasets: [{ data: ts.map((x) => x[1]), backgroundColor: ts.map((_, i) => C[i % C.length]), spacing: 2, hoverOffset: 4 }] }, options: { cutout: '72%', interaction: { mode: 'nearest', intersect: true }, plugins: { legend: { position: 'bottom', align: 'center' } } }, plugins: [centerText('movimientos', num(ts.reduce((a, x) => a + x[1], 0)))] });
  // compras por proveedor
  const fromD = new Date(F.from + 'T00:00'), toD = new Date(+new Date(F.to + 'T00:00') + DAY);
  const bySup = {}; for (const p of S.purchases) { const d = new Date(p.purchasedAt + 'T12:00'); if (p.status !== 'aprobada' || d < fromD || d >= toD) continue; if (F.supplier && p.supplierId !== F.supplier) continue; const n = supById(p.supplierId)?.name || '—'; bySup[n] = (bySup[n] || 0) + p.total; }
  const tsu = Object.entries(bySup).sort((a, b) => b[1] - a[1]);
  chart('c-sup', { type: 'bar', data: { labels: tsu.map((x) => x[0]), datasets: [{ label: 'Compras', data: tsu.map((x) => x[1]), backgroundColor: alpha(C[2], 0.85), hoverBackgroundColor: C[2], maxBarThickness: 30 }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + money(c.raw) } } }, scales: { y: { beginAtZero: true, ticks: moneyTick }, x: { ticks: { callback(v) { const l = this.getLabelForValue(v); return l.split(' ').slice(0, 2).join(' '); } } } } } });
  const byE = {}; for (const e of S.expenses) { const d = new Date(e.date + 'T12:00'); if (e.status === 'anulado' || d < fromD || d >= toD) continue; byE[e.category] = (byE[e.category] || 0) + e.amount; }
  const te = Object.entries(byE).sort((a, b) => b[1] - a[1]);
  chart('c-exp', { type: 'bar', data: { labels: te.map((x) => x[0]), datasets: [{ label: 'Gastos', data: te.map((x) => x[1]), backgroundColor: alpha(C[3], 0.85), hoverBackgroundColor: C[3], barThickness: 12 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + money(c.raw) } } }, scales: { x: { beginAtZero: true, ticks: moneyTick }, y: {} } } });
  // precios
  const pe = S.movements.filter((m) => m.productId === F.priceProduct && m.type === 'entrada' && m.unitCost && m.status === 'aprobado').sort((a, b) => new Date(a.ts) - new Date(b.ts));
  chart('c-price', { type: 'line', data: { labels: pe.map((m) => fdate(m.ts)), datasets: [{ label: 'Costo unitario', data: pe.map((m) => m.unitCost), borderColor: C[1], backgroundColor: fade(C[1]), fill: true, pointRadius: pe.map((_, i) => (i === pe.length - 1 ? 4 : 0)), pointBackgroundColor: C[1] }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + money(c.raw) } } }, scales: { y: { ticks: moneyTick }, x: {} } } });
  const dr = S.recon.rows.filter((r) => r.diferencia).sort((a, b) => a.valor - b.valor).slice(0, 10);
  chart('c-diff', { type: 'bar', data: { labels: dr.map((r) => r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name), datasets: [{ label: 'Valor', data: dr.map((r) => r.valor || r.diferencia), backgroundColor: dr.map((r) => alpha(r.diferencia < 0 ? cv('--bad') : cv('--ok'), 0.8)), barThickness: 12 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => { const r = dr[c.dataIndex]; return `${num(r.diferencia)} ${r.unit} · ${money(r.valor)}`; } } } }, scales: { x: { ticks: moneyTick }, y: {} } } });
};

/* ---------------- botón principal ---------------- */
async function syncAndReconcile() {
  const b = $('#sync-btn'); b.classList.add('spin'); b.disabled = true;
  try {
    let summary;
    if (S.settings.mode === 'api') {
      const r = await remote.req('/api/v1/sync-and-reconcile', { method: 'POST' });
      await remote.load();
      S.recon = { ts: new Date().toISOString(), ...r.reconciliation };
      summary = { sheets: r.sheets.reduce((a, s) => a + (s.pendientes || 0), 0), wa: r.whatsappPending, recon: S.recon };
    } else {
      await new Promise((r) => setTimeout(r, 650));
      const pv = previewSheet();
      const wa = S.inbox.filter((i) => ['pendiente_aprobacion', 'requiere_info'].includes(i.status)).length;
      summary = { sheets: pv.rows.length, stats: pv.stats, wa, recon: runRecon() };
    }
    S.lastSync = new Date().toISOString(); save(); render();
    const t = summary.recon.totals;
    modal({ title: 'Información actualizada y conciliada', body: `
      <div class="kpis">
        <div class="kpi"><span class="k">Filas de Drive por revisar</span><span class="v">${num(summary.sheets)}</span>${summary.stats ? `<span class="s">${summary.stats.nuevas} nuevas · ${summary.stats.modificadas} modificadas · ${summary.stats.coincidenWhatsApp} coinciden con WhatsApp</span>` : ''}</div>
        <div class="kpi"><span class="k">WhatsApp por aprobar</span><span class="v">${num(summary.wa)}</span></div>
        <div class="kpi ${t.importante ? 'alert' : ''}"><span class="k">Diferencias importantes</span><span class="v">${num(t.importante || 0)}</span></div>
        <div class="kpi ${t.perdida ? 'alert' : ''}"><span class="k">Pérdida estimada</span><span class="v">${moneyK(-t.perdida)}</span><span class="s">sobrante ${money(t.sobrante)}</span></div>
      </div>
      <div class="row">${Object.entries(RECON_STATUS).map(([k, v]) => (t[k] ? pill(`${v}: ${t[k]}`, RECON_PILL[k]) : '')).join(' ')}</div>
      <p class="muted small" style="margin:0">Nada se descontó del inventario sin aprobación. Revisa las filas de Drive y la bandeja de WhatsApp antes de cerrar el día.</p>`,
      foot: `<a class="btn" href="#drive" data-close>Revisar Drive</a><a class="btn" href="#whatsapp" data-close>Revisar WhatsApp</a><a class="btn pri" href="#conciliacion" data-close>Ver conciliación</a>` });
  } catch (e) { toast('No se pudo actualizar: ' + e.message); }
  finally { b.classList.remove('spin'); b.disabled = false; }
}
