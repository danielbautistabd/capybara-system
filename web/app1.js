/* ================= Capybara Control · app (1/4): utilidades, datos, acciones ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const money = (v) => COP.format(Math.round(v || 0));
const moneyK = (v) => { const a = Math.abs(v); return (v < 0 ? '−' : '') + (a >= 1e6 ? '$' + NUM.format(Math.round(a / 1e5) / 10) + ' M' : a >= 1e4 ? '$' + NUM.format(Math.round(a / 1e3)) + ' mil' : COP.format(a)); };
const num = (v) => NUM.format(v || 0);
const DAY = 864e5;
const d0 = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fdate = (ts) => new Date(ts).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
const ftime = (ts) => new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
const fdt = (ts) => `${fdate(ts)} · ${ftime(ts)}`;
const iso = (d) => { const x = new Date(d); return new Date(x - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const ICON = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  in: '<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v3h16v-3"/>',
  out: '<path d="M5 12h12m0 0-5-5m5 5-5 5"/><path d="M19 5v14"/>',
  wa: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19.3z"/><path d="M9 9.5c.5 2.5 2.5 4.5 5 5l1-1.5-2-1-1 .8a4 4 0 0 1-2.2-2.2l.8-1-1-2z"/>',
  drive: '<path d="M8 3h8l6 10-4 7H6l-4-7z"/><path d="M8 3l6 10H2M16 3l-6 10 4 7"/>',
  scale: '<path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>',
  truck: '<path d="M2 6h11v10H2zM13 10h5l3 3v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v.01M18 15v.01"/>',
  log: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>',
  sync: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  q: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
  hist: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5L5 20"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  doc: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  count: '<path d="M9 5H5v14h14v-4M9 3h6v4H9zM9 12l2 2 4-4"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><rect x="4" y="4" width="12" height="12" rx="2"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ''}</svg>`;

const USERS = ['Alejandro (Admin)', 'Camila Rojas', 'Andrés Pérez', 'Luz Marina', 'Jhon Fredy'];
const AREAS = ['Bar', 'Cocina', 'Recepción', 'Limpieza', 'Lavandería', 'Mantenimiento', 'Terraza', 'Piscina', 'Habitaciones'];
const SOURCES = { manual: 'Manual', whatsapp: 'WhatsApp', whatsapp_foto: 'WhatsApp · foto', whatsapp_audio: 'WhatsApp · voz', factura: 'Factura', sheets: 'Google Sheets', conteo: 'Conteo físico', sistema: 'Sistema' };
const STATUS_MV = { pendiente: ['Pendiente', 'p-warn'], aprobado: ['Aprobado', 'p-ok'], rechazado: ['Rechazado', 'p-mut'], anulado: ['Anulado', 'p-mut'], duplicado: ['Duplicado', 'p-info'], requiere_info: ['Requiere info', 'p-bad'] };
const INBOX_ST = { pendiente_analisis: ['Pendiente de análisis', 'p-mut'], pendiente_aprobacion: ['Pendiente de aprobación', 'p-warn'], aprobado: ['Aprobado', 'p-ok'], rechazado: ['Rechazado', 'p-mut'], duplicado: ['Duplicado', 'p-info'], procesado: ['Procesado', 'p-ok'], requiere_info: ['Requiere información adicional', 'p-bad'] };
const RECON_PILL = { coincide: 'p-ok', menor: 'p-warn', importante: 'p-bad', duplicado: 'p-info', sin_respaldo: 'p-bad', no_registrado: 'p-mut', sin_conteo: 'p-mut' };
const EXP_CATS = ['Servicios públicos', 'Internet y telefonía', 'Mantenimiento', 'Transporte', 'Lavandería externa', 'Marketing', 'Papelería', 'Comisiones OTA', 'Otros'];
const PAY = ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta', 'Crédito proveedor'];
const pill = (label, cls) => `<span class="pill ${cls}">${esc(label)}</span>`;
const mvPill = (s) => pill(...(STATUS_MV[s] || [s, 'p-mut']));
const confHtml = (c) => { const p = Math.round((c || 0) * 100); const col = p >= 85 ? 'var(--ok)' : p >= 60 ? 'var(--warn)' : 'var(--bad)'; return `<span class="conf" title="Nivel de confianza"><i><b style="width:${p}%;background:${col}"></b></i>${p} %</span>`; };

/* ---------------- estado ---------------- */
let S; // estado completo
const LS_KEY = 'capybara-control-v1';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};
const save = () => { const c = S.settings.cloud?.on; if (S.settings.mode === 'demo' && !c) store.set(LS_KEY, S); store.set(LS_KEY + '-settings', S.settings); if (c) cloud.queue(); };

function seedState() {
  const R = rng(20261106);
  const now = new Date();
  const start = d0(new Date(+now - 30 * DAY));
  const pid = (code) => 'p_' + code;
  const suppliers = SUPPLIERS.map((s) => ({ ...s, email: '', notes: '', active: true }));
  const products = PRODUCTS.map((p) => ({
    id: pid(p.code), code: p.code, barcode: p.kind === 'consumible' ? '770' + String(Math.floor(R() * 1e10)).padStart(10, '0') : '',
    name: p.name, aliases: p.aliases, description: '', category: p.category, kind: p.kind, unit: p.unit,
    stockInit: p.stockInit, stockMin: p.stockMin, stockMax: p.kind === 'activo' ? p.stockInit : Math.round(Math.max(p.stockMin * 3, p.stockInit * 1.3)),
    avgCost: p.avgCost, lastPrice: p.avgCost, supplierId: p.supplierId, location: p.location,
    expiresAt: p.expDays ? iso(+now + Math.round(p.expDays * (0.15 + R() * 0.6)) * DAY) : null,
    photo: null, status: 'activo', notes: p.example ? 'Producto de ejemplo: ajusta stock y costo reales.' : 'Del inventario manuscrito del hostel.', example: !!p.example,
  }));
  const P = Object.fromEntries(products.map((p) => [p.code, p]));
  const movements = [], purchases = [], expenses = [], counts = [], audit = [];
  const mv = (o) => { const m = { id: uid('mv'), unit: P[o.code]?.unit || 'unidad', status: 'aprobado', source: 'manual', area: null, reason: '', evidence: null, notes: '', confidence: null, user: USERS[1 + Math.floor(R() * 4)], ...o, productId: pid(o.code) }; delete m.code; m.fingerprint = fingerprint(m); movements.push(m); return m; };

  // consumo diario esperado por producto
  const RATE = { 'BEB-001': [7, 'Bar'], 'BEB-002': [5, 'Bar'], 'BEB-003': [5, 'Bar'], 'BEB-004': [3, 'Bar'], 'BEB-005': [2, 'Bar'], 'LIC-001': [0.6, 'Bar'], 'LIC-002': [0.9, 'Bar'], 'ALI-001': [14, 'Cocina'], 'ALI-002': [1.2, 'Cocina'], 'ALI-003': [0.5, 'Cocina'], 'ALI-004': [1.8, 'Cocina'], 'ALI-006': [6, 'Bar'], 'ASE-001': [0.4, 'Limpieza'], 'ASE-002': [7, 'Limpieza'], 'ASE-003': [0.4, 'Limpieza'], 'LAV-001': [0.25, 'Lavandería'], 'AME-001': [9, 'Habitaciones'], 'AME-002': [7, 'Habitaciones'], 'PAP-001': [0.5, 'Recepción'] };
  const SUP = { 'BEB-001': 's1', 'BEB-002': 's1', 'BEB-003': 's2', 'BEB-004': 's2', 'BEB-005': 's5', 'LIC-001': 's6', 'LIC-002': 's6' };
  const stock = Object.fromEntries(products.map((p) => [p.code, p.stockInit]));
  const lastCountTs = new Date(d0(now) - DAY + 21 * 36e5); // ayer 9 p. m.
  const pendingByDay = {};
  for (let d = 0; d <= 30; d++) {
    const day = new Date(+start + d * DAY);
    const isToday = d === 30;
    for (const [code, [rate, area]] of Object.entries(RATE)) {
      const weekend = [5, 6].includes(day.getDay()) ? 1.5 : 1;
      let q = Math.round(rate * weekend * (0.5 + R()));
      if (isToday) q = Math.round(q * Math.min(1, (now.getHours() - 7) / 15));
      if (q <= 0) continue;
      q = Math.min(q, Math.max(0, stock[code]));
      if (code === 'ALI-002' && d >= 27) q = Math.max(0, stock[code]); // pan se agota
      if (!q) continue;
      const ts = new Date(+day + (8 + R() * 13) * 36e5);
      if (isToday && ts > now) continue;
      const type = code.startsWith('ASE') || code.startsWith('LAV') || code.startsWith('PAP') ? 'consumo_interno' : 'marchado';
      const src = R() < 0.35 ? 'whatsapp' : R() < 0.25 ? 'sheets' : 'manual';
      mv({ code, qty: q, type, ts: ts.toISOString(), area, source: src, reason: type === 'marchado' ? 'Operación diaria' : 'Uso interno', evidence: src === 'whatsapp' ? 'wa-msg' : null });
      stock[code] -= q;
    }
    // reposición
    const buy = {};
    for (const code of Object.keys(RATE)) {
      const p = P[code];
      if (code === 'ALI-002' && d >= 25) continue;
      if (code === 'LIC-002' && d >= 22) continue;
      if (code === 'LAV-001' && d >= 20) continue;
      if (stock[code] <= p.stockMin * 1.15 && !isToday) {
        const s = SUP[code] || (code.startsWith('A') && code !== 'AME-001' && code !== 'AME-002' ? 's3' : 's4');
        (buy[s] ||= []).push(code);
      }
    }
    for (const [s, codes] of Object.entries(buy)) {
      const ts = new Date(+day + (9 + R() * 3) * 36e5);
      const inv = `${SUPPLIERS.find((x) => x.id === s).name.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()}-${20800 + Math.floor(R() * 900)}`;
      const items = codes.map((code) => {
        const p = P[code];
        const qty = Math.max(1, Math.round((p.stockMax || p.stockMin * 3) - stock[code]));
        const unitCost = Math.round(p.avgCost * (0.95 + R() * 0.14) / 50) * 50;
        return { productId: p.id, code, qty, unit: p.unit, unitCost, subtotal: qty * unitCost };
      });
      const subtotal = items.reduce((a, i) => a + i.subtotal, 0);
      const tax = s === 's3' ? 0 : Math.round(subtotal * 0.19);
      const pu = { id: uid('pu'), supplierId: s, invoice: inv, purchasedAt: iso(ts), receivedAt: iso(ts), items, subtotal, tax, discount: 0, total: subtotal + tax, payMethod: PAY[Math.floor(R() * 4)], receivedBy: USERS[2], status: 'aprobada', source: 'manual', attachment: 'factura.pdf', notes: '' };
      purchases.push(pu);
      for (const it of items) {
        const p = P[it.code];
        p.avgCost = weightedAvgCost(stock[it.code], p.avgCost, it.qty, it.unitCost);
        p.lastPrice = it.unitCost;
        mv({ code: it.code, qty: it.qty, type: 'entrada', unitCost: it.unitCost, ts: ts.toISOString(), source: 'factura', invoice: inv, purchaseId: pu.id, reason: `Compra ${inv}`, evidence: 'factura.pdf', user: USERS[2] });
        stock[it.code] += it.qty;
      }
    }
  }
  // menaje: daños y pérdidas registradas
  [['COC-090', 3, 'danado', 9], ['COC-009', 2, 'danado', 14], ['COC-018', 2, 'perdida', 18], ['LAV-002', 2, 'danado', 21], ['COC-007', 1, 'danado', 25], ['ALI-004', 2, 'vencido', 26]].forEach(([code, qty, type, d]) => {
    mv({ code, qty, type, ts: new Date(+start + d * DAY + 15 * 36e5).toISOString(), reason: type === 'danado' ? 'Se rompió en servicio' : type === 'perdida' ? 'No aparece tras el turno' : 'Fecha de vencimiento', area: 'Cocina', user: USERS[4] });
    stock[code] -= qty;
  });
  mv({ code: 'LAV-002', qty: 2, type: 'devolucion', ts: new Date(+start + 22 * DAY + 10 * 36e5).toISOString(), reason: 'Huésped devolvió toallas de piscina', area: 'Piscina', user: USERS[3] });
  stock['LAV-002'] += 2;
  // movimiento duplicado aprobado por error (WhatsApp + Sheets)
  const dupTs = new Date(d0(now) - 2 * DAY + 19 * 36e5);
  mv({ code: 'BEB-002', qty: 6, type: 'marchado', ts: dupTs.toISOString(), source: 'whatsapp', area: 'Terraza', reason: 'Evento terraza', evidence: 'wa-msg', user: USERS[1] });
  mv({ code: 'BEB-002', qty: 6, type: 'marchado', ts: new Date(+dupTs + 2 * 36e5).toISOString(), source: 'sheets', area: 'Terraza', reason: 'Evento terraza', user: USERS[1] });
  // marchado sin respaldo
  mv({ code: 'LIC-001', qty: 2, type: 'marchado', ts: new Date(d0(now) - 3 * DAY + 23 * 36e5).toISOString(), source: 'whatsapp', area: 'Bar', reason: 'Sin detalle', evidence: null, user: USERS[1] });

  // conteo físico de anoche: teórico con algunas diferencias
  const theo = (code) => theoreticalStock(P[code], movements, lastCountTs).teorico;
  const DIFF = { 'BEB-001': -4, 'LIC-001': -2, 'LAV-002': -3, 'COC-090': -2, 'ALI-001': 6, 'COC-015': -2, 'BEB-003': -1, 'AME-001': -12, 'BEB-002': 6 };
  for (const p of products) {
    if (p.kind === 'activo' && !['EQU-013', 'EQU-008'].includes(p.code)) continue;
    if (p.code === 'ALI-005') continue;
    counts.push({ id: uid('cf'), productId: p.id, qty: Math.max(0, theo(p.code) + (DIFF[p.code] || 0)), ts: lastCountTs.toISOString(), countedBy: USERS[2], sessionId: 'CF-' + iso(lastCountTs) });
  }

  // gastos
  const EXP = [['Servicios públicos', 'Energía eléctrica — Air-e', 1480000, 3], ['Servicios públicos', 'Acueducto y alcantarillado', 410000, 5], ['Internet y telefonía', 'Internet fibra 500 Mb', 189900, 6], ['Mantenimiento', 'Mantenimiento aires acondicionados (4)', 360000, 9], ['Transporte', 'Domicilio mercado', 18000, 10], ['Lavandería externa', 'Lavado de cobijas', 145000, 12], ['Marketing', 'Pauta Instagram', 250000, 14], ['Transporte', 'Taxi compras', 22000, 17], ['Mantenimiento', 'Repuesto llave lavaplatos', 68000, 19], ['Comisiones OTA', 'Comisión Booking (quincena)', 920000, 15], ['Papelería', 'Manillas de huésped', 85000, 23], ['Transporte', 'Domicilio hielo', 12000, 27], ['Otros', 'Gas propano cocina', 132000, 28], ['Mantenimiento', 'Pintura baño dormitorio 2', 95000, 29], ['Transporte', 'Domicilio licores', 15000, 30]];
  for (const [category, description, amount, d] of EXP) expenses.push({ id: uid('gx'), date: iso(+start + d * DAY), category, description, amount, supplierId: null, payMethod: PAY[d % 4], source: d % 3 ? 'manual' : 'whatsapp', status: 'registrado', attachment: d % 2 ? 'recibo.jpg' : null });

  const st = { products, suppliers, movements, purchases, expenses, counts, audit, inbox: [], sheet: null, recon: null, lastSync: null,
    settings: { mode: 'demo', baseUrl: '', token: '', user: USERS[0], autoApply: false, threshold: AUTO_APPLY_CONFIDENCE, windowH: 12, theme: 'system' } };
  S = st;
  seedInbox(R, now);
  seedSheet(now);
  log('sistema.inicio', 'Datos de ejemplo cargados', 'Sistema');
  return S;
}

function seedInbox(R, now) {
  const ago = (h) => new Date(+now - h * 36e5).toISOString();
  const raw = [
    { from: 'Camila Rojas', phone: '573001112233', chat: 'Grupo Bar Capybara', ts: ago(0.6), type: 'text', text: 'Marchar 3 cervezas y 2 aguas a la habitación 203' },
    { from: 'Luz Marina', phone: '573004445566', chat: 'Grupo Housekeeping', ts: ago(1.1), type: 'text', text: 'Enviar 4 toallas a la habitación 105' },
    { from: 'Camila Rojas', phone: '573001112233', chat: 'Grupo Bar Capybara', ts: ago(1.6), type: 'text', text: 'Se dañaron 2 vasos en la barra' },
    { from: 'Andrés Pérez', phone: '573112223344', chat: 'Recepción', ts: ago(2.2), type: 'text', text: 'marchen 2 cervesas aguila pa la terraza' },
    { from: 'Jhon Fredy', phone: '573205556677', chat: 'Grupo Cocina', ts: ago(2.9), type: 'audio', text: '', transcript: 'Se utilizaron dos bolsas de hielo para la piscina', duration: '0:07' },
    { from: 'Andrés Pérez', phone: '573112223344', chat: 'Recepción', ts: ago(3.4), type: 'image', text: 'Factura del hielo de hoy', doc: { documentType: 'factura', supplier: 'Hielo Polar', invoiceNumber: 'HP-20931', date: iso(now), paymentMethod: 'Efectivo', items: [{ description: 'Bolsa de hielo 2 kg', qty: 10, unit: 'bolsa', unitPrice: 4500, total: 45000 }], subtotal: 45000, tax: 0, total: 45000, confidence: 0.93 } },
    { from: 'Jhon Fredy', phone: '573205556677', chat: 'Grupo Cocina', ts: ago(4.1), type: 'text', text: 'manden eso que pidieron arriba' },
    { from: 'Camila Rojas', phone: '573001112233', chat: 'Grupo Bar Capybara', ts: ago(5.5), type: 'text', text: 'Entregar una botella de ron como cortesía a la hab 302' },
    { from: 'Camila Rojas', phone: '573001112233', chat: 'Grupo Bar Capybara', ts: ago(0.5), type: 'text', text: 'Marchar 3 cervezas y 2 aguas a la habitación 203' },
    { from: 'Luz Marina', phone: '573004445566', chat: 'Grupo Housekeeping', ts: ago(6.2), type: 'document', text: 'Recibo lavandería', doc: { documentType: 'recibo', supplier: 'Lavandería La Burbuja', invoiceNumber: 'LB-0412', date: iso(now), paymentMethod: 'Nequi', items: [{ description: 'Lavado de cobijas (12)', qty: 1, unit: 'servicio', unitPrice: 96000, total: 96000 }], total: 96000, movementHint: 'gasto', confidence: 0.88 } },
  ];
  for (const r of raw) ingestMessage(r, { silent: true });
  // estados de ejemplo
  const byText = (t) => S.inbox.find((i) => (i.text || i.transcript) === t);
  const cort = byText('Entregar una botella de ron como cortesía a la hab 302');
  if (cort) act.inboxStatus(cort.id, 'aprobado', { silent: true });
}

function seedSheet(now) {
  const t = (h) => new Date(+now - h * 36e5);
  const f = (d) => `${iso(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  S.sheet = {
    file: { id: '1aBcD-CapybaraInventario2026', name: 'Inventario Capybara 2026', type: 'Google Sheets', modified: t(0.4).toISOString() },
    tab: 'Movimientos', headerRow: 1, cron: 'manual',
    mapping: { Fecha: 'ts', Producto: 'product', Cantidad: 'qty', Tipo: 'type', Responsable: 'responsible', 'Área': 'area', Factura: 'invoice', 'Valor unitario': 'unitCost' },
    headers: ['Fecha', 'Producto', 'Cantidad', 'Tipo', 'Responsable', 'Área', 'Factura', 'Valor unitario'],
    rows: [
      [f(t(26)), 'Leche entera', 4, 'marchado', 'Jhon Fredy', 'Cocina', '', ''],
      [f(t(0.7)), 'Cerveza Club Colombia', 3, 'marchado', 'Camila Rojas', 'Habitación 203', '', ''],
      [f(t(3.3)), 'Hielo 2kg', 10, 'entrada', 'Andrés Pérez', 'Cocina', 'HP-20931', 4500],
      [f(t(5)), 'Papel higienico', 12, 'consumo_interno', 'Luz Marina', 'Limpieza', '', ''],
      [f(t(5.2)), 'Shampoo amenity', 20, 'consumo_interno', 'Luz Marina', 'Habitaciones', '', ''],
      [f(t(6)), 'Sombrilla de piscina', 2, 'marchado', 'Luz Marina', 'Piscina', '', ''],
      [f(t(7)), 'Coca cola 400', 6, 'marchado', 'Camila Rojas', 'Bar', '', ''],
      [f(t(8)), 'Huevos', 'treinta', 'marchado', 'Jhon Fredy', 'Cocina', '', ''],
    ],
    imported: { 0: 'h_prev' }, // fila 2 ya importada antes, con otro contenido (simula fila modificada)
    history: [{ ts: new Date(+now - 26 * 36e5).toISOString(), trigger: 'manual', stats: { leidas: 1, nuevas: 1, modificadas: 0, errores: 0 } }],
    preview: null,
  };
}

function log(action, detail, who = S?.settings?.user) { S.audit.unshift({ id: uid('au'), ts: new Date().toISOString(), user: who, action, detail }); if (S.audit.length > 800) S.audit.length = 800; }

/* ---------------- cálculos ---------------- */
const prodById = (id) => S.products.find((p) => p.id === id);
const supById = (id) => S.suppliers.find((s) => s.id === id);
function stockOf(p) { return theoreticalStock(p, S.movements).teorico; }
function stockMap() { const m = {}; for (const p of S.products) m[p.id] = stockOf(p); return m; }
function stockState(p, st) {
  if (p.status === 'inactivo') return ['Inactivo', 'p-mut'];
  if (p.kind === 'servicio') return ['Servicio', 'p-info'];
  if (st <= 0 && p.kind !== 'activo') return ['Agotado', 'p-bad'];
  if (p.expiresAt && new Date(p.expiresAt) - Date.now() < 7 * DAY) return ['Vence pronto', 'p-warn'];
  if (st <= p.stockMin && p.kind !== 'activo') return ['Bajo', 'p-warn'];
  return ['Disponible', 'p-ok'];
}
const catalogForParser = () => S.products.filter((p) => p.status !== 'inactivo');

/* ---------------- acciones (demo local o API remota) ---------------- */
const act = {
  addMovement(o, { approve = false, silent = false } = {}) {
    const p = prodById(o.productId);
    const m = { id: uid('mv'), ts: new Date().toISOString(), unit: p?.unit || 'unidad', status: 'pendiente', source: 'manual', user: S.settings.user, area: null, reason: '', evidence: null, notes: '', confidence: null, ...o };
    m.qty = Number(m.qty);
    m.fingerprint = fingerprint(m);
    const dups = findDuplicates(m, S.movements.filter((x) => x.status === 'aprobado' || x.status === 'pendiente'), S.settings.windowH);
    m.duplicates = dups.slice(0, 3).map((d) => ({ id: d.b.id, reason: d.reason, score: d.score }));
    if (dups.length && dups[0].score >= 0.9 && m.source !== 'manual') m.status = 'duplicado';
    S.movements.push(m);
    if (approve && m.status === 'pendiente') act.approve(m.id, {}, { silent: true });
    if (!silent) log('movimiento.crear', `${MOVEMENT_TYPES[m.type].label}: ${num(m.qty)} ${m.unit} · ${p?.name}`);
    return m;
  },
  approve(id, edits = {}, { silent = false } = {}) {
    const m = S.movements.find((x) => x.id === id); if (!m || m.status === 'aprobado') return;
    Object.assign(m, edits); m.qty = Number(m.qty);
    const p = prodById(m.productId);
    if (m.type === 'entrada' && m.unitCost) { p.avgCost = weightedAvgCost(stockOf(p), p.avgCost, m.qty, m.unitCost); p.lastPrice = m.unitCost; }
    m.status = 'aprobado'; m.approvedBy = S.settings.user; m.approvedAt = new Date().toISOString(); m.fingerprint = fingerprint(m);
    if (!silent) log('movimiento.aprobar', `${MOVEMENT_TYPES[m.type].label}: ${num(m.qty)} ${m.unit} · ${p?.name}`);
  },
  setStatus(id, status, note = '') {
    const m = S.movements.find((x) => x.id === id); if (!m) return;
    m.status = status; if (note) m.notes = (m.notes ? m.notes + ' · ' : '') + note;
    log('movimiento.' + status, `${prodById(m.productId)?.name}: ${num(m.qty)} ${m.unit}${note ? ' — ' + note : ''}`);
  },
  voidMv(id, reason) {
    const m = S.movements.find((x) => x.id === id); if (!m) return;
    if (m.status === 'aprobado') {
      const sign = MOVEMENT_TYPES[m.type].sign;
      act.addMovement({ productId: m.productId, qty: m.qty, unit: m.unit, type: sign > 0 ? 'ajuste_neg' : 'ajuste_pos', source: 'sistema', reason: `Anulación de ${m.id}: ${reason}`, reversesId: m.id }, { approve: true, silent: true });
    }
    m.status = 'anulado'; m.notes = `Anulado: ${reason}`;
    log('movimiento.anular', `${prodById(m.productId)?.name}: ${num(m.qty)} ${m.unit} — ${reason}`);
  },
  savePurchase(pu, approve) {
    pu.id ||= uid('pu');
    pu.subtotal = pu.items.reduce((a, i) => a + i.qty * i.unitCost, 0);
    pu.total = pu.subtotal + Number(pu.tax || 0) - Number(pu.discount || 0);
    const ex = S.purchases.findIndex((x) => x.id === pu.id);
    if (ex >= 0) S.purchases[ex] = pu; else S.purchases.push(pu);
    log('compra.guardar', `${supById(pu.supplierId)?.name} · ${pu.invoice || 's/f'} · ${money(pu.total)}`);
    if (approve) act.approvePurchase(pu.id);
    return pu;
  },
  approvePurchase(id) {
    const pu = S.purchases.find((x) => x.id === id); if (!pu || pu.status === 'aprobada') return;
    for (const it of pu.items) {
      const m = act.addMovement({ productId: it.productId, qty: it.qty, unit: it.unit, type: 'entrada', unitCost: it.unitCost, source: pu.source || 'factura', invoice: pu.invoice, purchaseId: pu.id, evidence: pu.attachment, ts: new Date(pu.receivedAt + 'T12:00:00').toISOString(), reason: `Compra ${pu.invoice || ''}`, user: pu.receivedBy }, { silent: true });
      if (m.status === 'duplicado') { m.notes = 'Coincide con otra entrada de la misma factura; revisa antes de aprobar.'; continue; }
      act.approve(m.id, {}, { silent: true });
      const p = prodById(it.productId); if (p && !p.supplierId) p.supplierId = pu.supplierId;
    }
    pu.status = 'aprobada';
    log('compra.aprobar', `${supById(pu.supplierId)?.name} · ${pu.invoice || 's/f'} · ${pu.items.length} ítems · ${money(pu.total)}`);
  },
  saveProduct(p) {
    const i = S.products.findIndex((x) => x.id === p.id);
    if (i >= 0) { S.products[i] = { ...S.products[i], ...p }; log('producto.editar', p.name); }
    else { p.id = uid('p'); p.status = 'activo'; S.products.push(p); log('producto.crear', p.name); }
  },
  saveSupplier(s) {
    const i = S.suppliers.findIndex((x) => x.id === s.id);
    if (i >= 0) S.suppliers[i] = { ...S.suppliers[i], ...s }; else { s.id = uid('s'); s.active = true; S.suppliers.push(s); }
    log('proveedor.guardar', s.name); return s;
  },
  saveExpense(e) { e.id = uid('gx'); e.status ||= 'registrado'; S.expenses.push(e); log('gasto.registrar', `${e.category} · ${e.description} · ${money(e.amount)}`); },
  saveCounts(items) {
    const ts = new Date().toISOString(), sessionId = 'CF-' + Date.now();
    for (const it of items) S.counts.push({ id: uid('cf'), productId: it.productId, qty: Number(it.qty), ts, countedBy: S.settings.user, sessionId });
    log('conteo.registrar', `${items.length} productos contados`);
  },
  inboxStatus(id, status, { silent = false, note = '' } = {}) {
    const it = S.inbox.find((x) => x.id === id); if (!it) return;
    const mvs = S.movements.filter((m) => m.inboxId === id && ['pendiente', 'duplicado', 'requiere_info'].includes(m.status));
    if (status === 'aprobado') { for (const m of mvs) if (m.status !== 'duplicado') act.approve(m.id, {}, { silent: true }); it.status = 'procesado'; }
    else if (status === 'rechazado') { mvs.forEach((m) => (m.status = 'rechazado')); it.status = 'rechazado'; }
    else if (status === 'duplicado') { mvs.forEach((m) => (m.status = 'duplicado')); it.status = 'duplicado'; }
    else if (status === 'requiere_info') { mvs.forEach((m) => (m.status = 'requiere_info')); it.status = 'requiere_info'; }
    else it.status = status;
    if (note) it.reviewNote = note;
    if (!silent) log('whatsapp.' + it.status, `${it.from}: "${(it.text || it.transcript || '').slice(0, 60)}"`);
  },
};

/** Pipeline de un mensaje de WhatsApp (equivalente al webhook del backend) */
function ingestMessage(r, { silent = false } = {}) {
  const it = { id: uid('wa'), waId: 'wamid.' + Math.random().toString(36).slice(2, 12), status: 'pendiente_analisis', ...r };
  S.inbox.unshift(it);
  const text = r.transcript || r.text || '';
  let analysis;
  if (r.doc && r.doc.movementHint === 'gasto') {
    analysis = { type: 'gasto', items: [], confidence: r.doc.confidence, document: r.doc };
    it.analysis = analysis; it.confidence = r.doc.confidence; it.status = 'pendiente_aprobacion';
    return it;
  }
  if (r.doc) {
    analysis = { type: 'entrada', area: null, document: r.doc, items: r.doc.items.map((d) => { const p = parseInstruction(`${d.qty} ${d.description}`, catalogForParser()).items[0] || {}; return { ...p, qty: d.qty, unitCost: d.unitPrice, confidence: Math.min(p.confidence || 0.3, r.doc.confidence) }; }) };
  } else analysis = parseInstruction(text, catalogForParser());
  analysis.confidence = analysis.items.length ? Math.min(...analysis.items.map((i) => i.confidence)) : 0;
  it.analysis = analysis; it.confidence = analysis.confidence;
  const src = r.type === 'image' || r.type === 'document' ? 'whatsapp_foto' : r.type === 'audio' ? 'whatsapp_audio' : 'whatsapp';
  const created = [];
  for (const x of analysis.items.filter((i) => i.productId)) {
    created.push(act.addMovement({ productId: x.productId, qty: x.qty, unit: x.unit, type: analysis.type, unitCost: x.unitCost, ts: r.ts, source: src, area: analysis.area, user: r.from, reason: 'Reporte por WhatsApp', evidence: r.type !== 'text' ? r.type : 'wa-msg', confidence: x.confidence, inboxId: it.id, invoice: r.doc?.invoiceNumber, notes: `"${text}"` }, { silent: true }));
  }
  if (!analysis.items.length || analysis.items.some((i) => !i.productId)) it.status = created.length ? 'pendiente_aprobacion' : 'requiere_info';
  else if (created.every((m) => m.status === 'duplicado')) it.status = 'duplicado';
  else it.status = 'pendiente_aprobacion';
  if (S.settings.autoApply && it.status === 'pendiente_aprobacion' && analysis.confidence >= S.settings.threshold) act.inboxStatus(it.id, 'aprobado', { silent: true });
  if (!silent) log('whatsapp.recibir', `${r.from}: "${text.slice(0, 60)}" → ${INBOX_ST[it.status][0]}`);
  return it;
}

/* ---------------- Google Sheets (vista previa local, misma lógica que el backend) ---------------- */
function sheetHash(arr) { let h = 2166136261; const s = JSON.stringify(arr); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return 'h' + (h >>> 0).toString(16); }
function previewSheet() {
  const sh = S.sheet; const out = []; const stats = { leidas: sh.rows.length, nuevas: 0, modificadas: 0, sinCambios: 0, errores: 0, coincidenWhatsApp: 0, duplicadas: 0 };
  sh.rows.forEach((row, i) => {
    const raw = Object.fromEntries(sh.headers.map((h, j) => [h, row[j]]));
    const hsh = sheetHash(row);
    const prev = sh.imported[i];
    if (prev === hsh) { stats.sinCambios++; return; }
    const state = prev ? 'modificado' : 'nuevo'; stats[prev ? 'modificadas' : 'nuevas']++;
    const m = {}; for (const [col, f] of Object.entries(sh.mapping)) if (f) m[f] = raw[col];
    const issues = [];
    const match = m.product ? matchProduct(String(m.product), catalogForParser()) : null;
    if (!match) issues.push(`Producto no reconocido: "${m.product}"`);
    const qty = Number(String(m.qty).replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) issues.push(`Cantidad inválida: "${m.qty}"`);
    const ts = new Date(String(m.ts).replace(' ', 'T'));
    if (isNaN(ts)) issues.push('Fecha inválida');
    let dups = [];
    const type = MOVEMENT_TYPES[m.type] ? m.type : 'marchado';
    if (match && !issues.length) dups = findDuplicates({ productId: match.product.id, type, qty, ts: ts.toISOString(), source: 'sheets', invoice: m.invoice }, S.movements.filter((x) => ['aprobado', 'pendiente', 'duplicado'].includes(x.status)), S.settings.windowH);
    if (dups.some((d) => String(d.b.source).startsWith('whatsapp'))) stats.coincidenWhatsApp++;
    if (dups[0]?.score >= 0.9) stats.duplicadas++;
    if (issues.length) stats.errores++;
    out.push({ i, rowNumber: i + 2, state, raw, hash: hsh, mapped: { ...m, qty, type, ts: isNaN(ts) ? null : ts.toISOString() }, product: match ? { id: match.product.id, name: match.product.name, score: match.score } : null, issues, dups: dups.slice(0, 2).map((d) => ({ id: d.b.id, source: d.b.source, reason: d.reason, score: d.score, status: d.b.status })),
      action: issues.length ? 'revisar' : dups[0]?.score >= 0.9 ? 'vincular' : 'crear' });
  });
  sh.preview = { ts: new Date().toISOString(), stats, rows: out };
  sh.history.unshift({ ts: sh.preview.ts, trigger: 'manual', stats });
  log('sheets.consultar', `${sh.file.name} / ${sh.tab}: ${stats.nuevas} nuevas, ${stats.modificadas} modificadas, ${stats.errores} con error`);
  return sh.preview;
}
function applySheet(decisions) {
  const sh = S.sheet; let created = 0, linked = 0, ignored = 0;
  for (const d of decisions) {
    const r = sh.preview.rows.find((x) => x.i === d.i); if (!r) continue;
    if (d.action === 'ignorar') { ignored++; sh.imported[r.i] = r.hash; continue; }
    if (d.action === 'vincular' && r.dups[0]) {
      const m = S.movements.find((x) => x.id === r.dups[0].id);
      if (m) { m.importRef = `${sh.file.name}!${sh.tab}:${r.rowNumber}`; if (m.status === 'pendiente') act.approve(m.id, {}, { silent: true }); }
      linked++; sh.imported[r.i] = r.hash; continue;
    }
    const pid = d.productId || r.product?.id; if (!pid) continue;
    act.addMovement({ productId: pid, qty: r.mapped.qty, type: r.mapped.type, ts: r.mapped.ts, source: 'sheets', area: r.mapped.area, user: r.mapped.responsible, invoice: r.mapped.invoice || null, unitCost: Number(r.mapped.unitCost) || undefined, reason: 'Importado de Google Sheets', importRef: `${sh.file.name}!${sh.tab}:${r.rowNumber}`, raw: r.raw }, { approve: d.approve, silent: true });
    created++; sh.imported[r.i] = r.hash;
  }
  sh.preview.rows = sh.preview.rows.filter((r) => sh.imported[r.i] !== r.hash);
  S.lastSync = new Date().toISOString();
  log('sheets.aplicar', `${created} creados, ${linked} vinculados a movimientos existentes, ${ignored} ignorados`);
  return { created, linked, ignored };
}

function runRecon() {
  const unmatched = S.inbox.filter((i) => i.status === 'requiere_info').flatMap((i) => (i.analysis?.items || []).filter((x) => !x.productId).map((x) => ({ rawText: `"${x.rawText}" (WhatsApp · ${i.from})`, source: 'whatsapp' })));
  const sheetUnk = (S.sheet.preview?.rows || []).filter((r) => !r.product).map((r) => ({ rawText: `"${r.mapped.product}" (Sheets fila ${r.rowNumber})`, source: 'sheets' }));
  S.recon = { ts: new Date().toISOString(), ...reconcile({ products: S.products.filter((p) => p.kind !== 'servicio'), movements: S.movements, counts: S.counts, unmatched: [...unmatched, ...sheetUnk] }) };
  log('conciliacion.ejecutar', `${S.recon.rows.length} filas · pérdida estimada ${money(S.recon.totals.perdida)}`);
  return S.recon;
}
