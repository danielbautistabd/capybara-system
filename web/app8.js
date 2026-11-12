/* ================= Capybara Control · app (8/8): Socios, caja del día y accesos Cajero / Manager / Socio ================= */
VIEW_PERM.socios = 'socios.ver';
(() => { const e = Object.entries(VIEWS); for (const k in VIEWS) delete VIEWS[k]; VIEWS.socios = { t: 'Socios · resultados del hostel', short: 'Socios', ic: 'trend', grp: 'Dirección' }; for (const [k, v] of e) VIEWS[k] = v; })();
ICON.trend = '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>';

const LINES = ['Hospedaje', 'Bar', 'Restaurante', 'Otros'];
const LINE_COLOR = { Hospedaje: '--c1', Bar: '--c2', Restaurante: '--c3', Otros: '--c4' };
const lineOf = (p) => (!p ? 'Otros' : p.category === 'Hospedaje' ? 'Hospedaje' : ['Bebidas', 'Licores'].includes(p.category) ? 'Bar' : ['Alimentos', 'Servicios'].includes(p.category) ? 'Restaurante' : 'Otros');

/* ---------- actualización de estados guardados: roles nuevos, usuarios, hospedaje, histórico ---------- */
function upgradePartners() {
  // roles: agrega permisos nuevos a matrices guardadas antes
  S.permsV ||= 1;
  if (S.permsV < 2) {
    for (const r of ['SUPERVISOR', 'CAJERO', 'SOCIO']) { const set = new Set(S.rolePerms[r] || DEFAULT_ROLE_PERMS[r] || []); for (const p of DEFAULT_ROLE_PERMS[r] || []) set.add(p); S.rolePerms[r] = [...set]; }
    S.permsV = 2;
  }
  if (S.permsV < 3) { // cajero: ingresa productos, factura, verifica y envía a Alegra; sin marchados ni solicitudes
    S.rolePerms.CAJERO = [...DEFAULT_ROLE_PERMS.CAJERO];
    S.permsV = 3;
  }
  const add = (u) => { if (!S.users.some((x) => x.email === u.email)) S.users.push({ areas: [], phone: '', active: true, ...u }); };
  if (!S.usersV) { // solo una vez: si alguien los borra, no vuelven a aparecer
    add({ id: 'u5', name: 'Cajero 1', email: 'caja1@capybarahostel.com', role: 'CAJERO', area: 'Recepción' });
    add({ id: 'u6', name: 'Cajero 2', email: 'caja2@capybarahostel.com', role: 'CAJERO', area: 'Bar' });
    add({ id: 'u7', name: 'Socio 1', email: 'socio1@capybarahostel.com', role: 'SOCIO', area: '' });
    add({ id: 'u8', name: 'Socio 2', email: 'socio2@capybarahostel.com', role: 'SOCIO', area: '' });
    S.usersV = 1;
  }
  // productos de hospedaje
  for (const [code, name, unit, price, aliases] of [['HOS-001', 'Noche en dormitorio compartido', 'cama-noche', 55000, ['noche dormitorio', 'cama', 'dormitorio']], ['HOS-002', 'Noche en habitación privada', 'hab-noche', 165000, ['noche privada', 'habitacion privada', 'privada']]])
    if (!S.products.some((p) => p.code === code)) S.products.push({ id: 'p_' + code, code, barcode: '', name, aliases, description: '', category: 'Hospedaje', kind: 'servicio', unit, stockInit: 0, stockMin: 0, stockMax: null, avgCost: 0, lastPrice: 0, salePrice: price, supplierId: null, location: 'Recepción', expiresAt: null, photo: null, status: 'activo', notes: 'Servicio de hospedaje', packSize: 1 });
  S.partners ||= { beds: 36, dormBeds: 30, privRooms: 6, period: 'mes' };
  if (!S.billing.history || S.billing.historyV !== 2) seedSalesHistory();
}
const _upg2 = upgradeState;
upgradeState = function () { _upg2(); upgradePartners(); };

/** Histórico de ventas de EJEMPLO (agregado por día) para que el módulo de socios tenga tendencia. */
function seedSalesHistory() {
  const R = rng(91126);
  const now = new Date(), h = [];
  const frac = Math.min(1, Math.max(0.05, (now.getHours() + now.getMinutes() / 60) / 24));
  for (let d = 120; d >= 0; d--) {
    const day = new Date(+d0(now) - d * DAY), dow = day.getDay(), date = iso(day);
    const season = 1 + (120 - d) / 120 * 0.18; // temporada alta hacia diciembre
    const occ = Math.min(0.98, ([5, 6].includes(dow) ? 0.78 : dow === 0 ? 0.66 : 0.56) * season * (0.88 + R() * 0.24));
    const k = d === 0 ? frac : 1;
    const dorm = Math.round(S.partners.dormBeds * occ * k), priv = Math.round(S.partners.privRooms * Math.min(1, occ * 1.08) * k);
    const nights = dorm + priv;
    const hosp = dorm * 55000 + priv * 165000;
    const bar = Math.round(nights * (8000 + R() * 9000) * ([5, 6].includes(dow) ? 1.45 : 1) / 100) * 100;
    const rest = Math.round(nights * (5500 + R() * 4500) / 100) * 100;
    const otros = Math.round(R() * 70000 * k / 100) * 100;
    const ing = { Hospedaje: hosp, Bar: bar, Restaurante: rest, Otros: otros };
    const sub = hosp + bar + rest + otros;
    const imp = Math.round(hosp * 0.19 * 0.45 + (bar + rest) * 0.08 + otros * 0.19);
    const total = sub + imp;
    const pagos = { Tarjeta: Math.round(total * 0.44), Transferencia: Math.round(total * 0.2), Efectivo: Math.round(total * 0.21) }; pagos.Nequi = total - pagos.Tarjeta - pagos.Transferencia - pagos.Efectivo;
    const gastos = {};
    // costos fijos de ejemplo (no existen en los gastos registrados de la demo, así que no se duplican)
    { const dm = day.getDate(), last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate(); if (dm === 1) gastos.Arriendo = 8500000; if (dm === 15 || dm === last) gastos['Nómina'] = 9200000; if (dm === 10) gastos['Seguridad social y parafiscales'] = 4300000; gastos['Comisiones OTA (diarias)'] = Math.round(hosp * 0.42 * 0.15); }
    if (d > 30) { const dm = day.getDate(); if (dm === 3) gastos['Servicios públicos'] = 1450000 + Math.round(R() * 120000); if (dm === 5) gastos['Servicios públicos'] = (gastos['Servicios públicos'] || 0) + 405000; if (dm === 6) gastos['Internet y telefonía'] = 189900; if (dm === 15) gastos['Comisiones OTA'] = 880000 + Math.round(R() * 150000); if (dm % 7 === 2) gastos.Mantenimiento = 60000 + Math.round(R() * 260000); if (dm % 5 === 1) gastos.Transporte = 15000 + Math.round(R() * 20000); if (dm === 12) gastos['Lavandería externa'] = 145000; if (dm === 14) gastos.Marketing = 250000; }
    h.push({ date, ing, imp, nights, dorm, priv, facturas: Math.round(nights * 0.55 + (bar + rest) / 45000), pagos, costo: Math.round(bar * 0.38 + rest * 0.42), gastos });
  }
  S.billing.history = h; S.billing.historyV = 2;
}

/* ---------- libro diario de ingresos (histórico de ejemplo + facturas reales emitidas + gastos) ---------- */
function dayBook(from, to) {
  const days = {};
  for (let t = +new Date(from + 'T12:00'); t <= +new Date(to + 'T12:00'); t += DAY) { const k = iso(t); days[k] = { date: k, ing: { Hospedaje: 0, Bar: 0, Restaurante: 0, Otros: 0 }, imp: 0, nights: 0, facturas: 0, pagos: {}, costo: 0, gastos: {} }; }
  const add = (o, k, v) => (o[k] = (o[k] || 0) + v);
  for (const hh of S.billing.history || []) { const d = days[hh.date]; if (!d) continue; for (const l of LINES) d.ing[l] += hh.ing[l]; d.imp += hh.imp; d.nights += hh.nights; d.facturas += hh.facturas; d.costo += hh.costo; for (const [k, v] of Object.entries(hh.pagos)) add(d.pagos, k, v); for (const [k, v] of Object.entries(hh.gastos)) add(d.gastos, k, v); }
  const seenInv = new Set();
  for (const l of S.billing.lines) {
    const d = days[l.date]; if (!d || invStatus(l.inv) !== 'emitida') continue;
    const p = prodById(l.productId); const c = lineCalc(l); const ln = lineOf(p);
    d.ing[ln] += c.sub; d.imp += c.tax; add(d.pagos, l.pay, c.total); d.costo += (+l.qty || 0) * (p?.avgCost || 0);
    if (ln === 'Hospedaje') d.nights += +l.qty || 0;
    if (!seenInv.has(l.inv)) { seenInv.add(l.inv); d.facturas++; }
  }
  for (const e of S.expenses) { const d = days[e.date]; if (d && e.status !== 'anulado') add(d.gastos, e.category, e.amount); }
  return Object.values(days);
}
function sumBook(days) {
  const t = { ing: { Hospedaje: 0, Bar: 0, Restaurante: 0, Otros: 0 }, imp: 0, nights: 0, facturas: 0, pagos: {}, costo: 0, gastos: {}, n: days.length };
  for (const d of days) { for (const l of LINES) t.ing[l] += d.ing[l]; t.imp += d.imp; t.nights += d.nights; t.facturas += d.facturas; t.costo += d.costo; for (const [k, v] of Object.entries(d.pagos)) t.pagos[k] = (t.pagos[k] || 0) + v; for (const [k, v] of Object.entries(d.gastos)) t.gastos[k] = (t.gastos[k] || 0) + v; }
  t.ingresos = LINES.reduce((a, l) => a + t.ing[l], 0);
  t.gastosTotal = Object.values(t.gastos).reduce((a, b) => a + b, 0);
  t.margenBruto = t.ingresos - t.costo;
  t.resultado = t.margenBruto - t.gastosTotal;
  t.margenPct = t.ingresos ? t.resultado / t.ingresos : 0;
  const beds = S.partners.beds;
  t.ocupacion = beds && t.n ? t.nights / (beds * t.n) : 0;
  t.adr = t.nights ? t.ing.Hospedaje / t.nights : 0;           // tarifa promedio por cama-noche vendida
  t.revpab = beds && t.n ? t.ing.Hospedaje / (beds * t.n) : 0; // ingreso de hospedaje por cama disponible
  t.ticket = t.facturas ? (t.ingresos + t.imp) / t.facturas : 0;
  return t;
}
function periodRange(key) {
  const today = d0(), y = today.getFullYear(), m = today.getMonth();
  if (key === 'mes') { const from = new Date(y, m, 1); const prevFrom = new Date(y, m - 1, 1); const len = Math.round((today - from) / DAY); return { from: iso(from), to: iso(today), pFrom: iso(prevFrom), pTo: iso(new Date(+prevFrom + len * DAY)), label: today.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }), cmp: 'mismos días del mes anterior' }; }
  if (key === 'mes_ant') { const from = new Date(y, m - 1, 1), to = new Date(y, m, 0); const pf = new Date(y, m - 2, 1), pt = new Date(y, m - 1, 0); return { from: iso(from), to: iso(to), pFrom: iso(pf), pTo: iso(pt), label: from.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }), cmp: 'el mes anterior' }; }
  const n = key === '7' ? 7 : key === '30' ? 30 : 90;
  const from = new Date(+today - (n - 1) * DAY); return { from: iso(from), to: iso(today), pFrom: iso(+from - n * DAY), pTo: iso(+from - DAY), label: `últimos ${n} días`, cmp: `los ${n} días anteriores` };
}
const delta = (a, b) => (b ? (a - b) / Math.abs(b) : null);
const deltaHtml = (a, b, invert = false) => { const d = delta(a, b); if (d === null || !isFinite(d)) return '<span class="dl">—</span>'; const good = invert ? d < 0 : d > 0; return `<span class="dl ${Math.abs(d) < 0.005 ? '' : good ? 'up' : 'down'}">${d > 0 ? '▲' : d < 0 ? '▼' : ''} ${Math.abs(d * 100).toFixed(1).replace('.', ',')} %</span>`; };
const pct = (v) => (v * 100).toFixed(1).replace('.', ',') + ' %';

let PT = { ai: null, aiBusy: false };
RENDER.socios = () => {
  const P = S.partners, r = periodRange(P.period);
  const cur = sumBook(dayBook(r.from, r.to)), prev = sumBook(dayBook(r.pFrom, r.pTo));
  const st = stockMap();
  const invValue = S.products.filter((p) => p.status === 'activo' && p.kind !== 'servicio').reduce((a, p) => a + Math.max(0, st[p.id]) * p.avgCost, 0);
  if (!S.recon) runRecon();
  const Hero = (k, v, sub, dl) => `<div class="hero-kpi pt"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${dl} <span class="muted">vs. ${r.cmp}</span>${sub ? ` · ${sub}` : ''}</span></div>`;
  const Mini = (k, v, dl, hint = '') => `<div class="kpi"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${dl}${hint ? ` · ${hint}` : ''}</span></div>`;
  const lines = LINES.map((l) => ({ l, v: cur.ing[l], p: prev.ing[l] })).filter((x) => x.v || x.p);
  const gastosTop = Object.entries(cur.gastos).sort((a, b) => b[1] - a[1]);
  return `
  <div class="greet">
    <div><h2>Resultados de Capybara Hostel</h2><p class="muted">${esc(r.label)} · del ${fdate(r.from + 'T12:00')} al ${fdate(r.to + 'T12:00')} · cifras sin impuestos</p></div>
    <div class="row" style="gap:8px"><div class="seg">${[['mes', 'Este mes'], ['mes_ant', 'Mes anterior'], ['30', '30 días'], ['90', '90 días']].map(([k, l]) => `<button data-pp="${k}" class="${P.period === k ? 'on' : ''}">${l}</button>`).join('')}</div><button class="btn sm" id="pt-xls">${ic('in')} Informe Excel</button></div>
  </div>
  ${S.settings.mode === 'demo' ? `<div class="banner">${ic('info')}<div>Vista de solo lectura. Incluye un <b>histórico de ventas de ejemplo</b> de 120 días para mostrar tendencias; con el backend conectado se calcula con las facturas reales emitidas y los gastos registrados.</div></div>` : ''}

  <div class="heroes">
    ${Hero('Ingresos', moneyK(cur.ingresos), `${num(cur.facturas)} facturas`, deltaHtml(cur.ingresos, prev.ingresos))}
    ${Hero('Resultado operativo', moneyK(cur.resultado), `margen ${pct(cur.margenPct)}`, deltaHtml(cur.resultado, prev.resultado))}
    ${Hero('Ocupación', pct(cur.ocupacion), `${num(cur.nights)} camas-noche`, deltaHtml(cur.ocupacion, prev.ocupacion))}
    ${Hero('Tarifa promedio (ADR)', moneyK(cur.adr), `RevPAB ${moneyK(cur.revpab)}`, deltaHtml(cur.adr, prev.adr))}
  </div>

  <div class="charts">
    <div class="card ch w8"><div class="card-h"><h2>Ingresos por día</h2><span class="muted small">comparado con ${r.cmp}</span></div><canvas id="p-daily"></canvas></div>
    <div class="card ch w4"><div class="card-h"><h2>De dónde vienen los ingresos</h2></div><canvas id="p-mix"></canvas>
      <div class="stats" style="margin-top:10px">${lines.map((x) => `<div class="stat"><span class="dot" style="background:var(${LINE_COLOR[x.l]})"></span><span class="l">${x.l}</span><span class="r"><b>${moneyK(x.v)}</b><small>${cur.ingresos ? pct(x.v / cur.ingresos) : '—'} · ${deltaHtml(x.v, x.p)}</small></span></div>`).join('')}</div></div>

    <div class="card ch w4"><div class="card-h"><h2>Estado de resultados</h2><span class="muted small">estimado</span></div>
      <div class="pnl">
        <div class="pl"><span>Ingresos</span><b>${money(cur.ingresos)}</b></div>
        <div class="pl neg-row"><span>Costo de lo vendido</span><b>−${money(cur.costo)}</b></div>
        <div class="pl sub"><span>Margen bruto</span><b>${money(cur.margenBruto)}</b></div>
        ${gastosTop.slice(0, 6).map(([k, v]) => `<div class="pl neg-row small"><span>${esc(k)}</span><b>−${money(v)}</b></div>`).join('')}
        ${gastosTop.length > 6 ? `<div class="pl neg-row small"><span>Otros gastos</span><b>−${money(gastosTop.slice(6).reduce((a, x) => a + x[1], 0))}</b></div>` : ''}
        <div class="pl total ${cur.resultado < 0 ? 'is-neg' : ''}"><span>Resultado operativo</span><b>${money(cur.resultado)}</b></div>
      </div>
      <p class="muted small" style="margin:10px 0 0">Incluye solo los gastos registrados (en la demo: arriendo, nómina y comisiones de ejemplo). No incluye impuesto de renta ni depreciación.</p></div>
    <div class="card ch w8"><div class="card-h"><h2>Ingresos por mes</h2><span class="muted small">por línea de negocio</span></div><canvas id="p-month"></canvas></div>

    <div class="card ch w12 kpi-strip"><div class="kpis">
      ${Mini('Ticket promedio', moneyK(cur.ticket), deltaHtml(cur.ticket, prev.ticket), 'con impuestos')}
      ${Mini('Gastos', moneyK(cur.gastosTotal), deltaHtml(cur.gastosTotal, prev.gastosTotal, true))}
      ${Mini('Margen bruto', pct(cur.ingresos ? cur.margenBruto / cur.ingresos : 0), deltaHtml(cur.margenBruto, prev.margenBruto))}
      ${Mini('Impuestos recaudados', moneyK(cur.imp), deltaHtml(cur.imp, prev.imp), 'IVA e INC por pagar')}
      ${Mini('Valor del inventario', moneyK(invValue), '<span class="dl">hoy</span>')}
      ${Mini('Pérdida por inventario', moneyK(-(S.recon?.totals.perdida || 0)), '<span class="dl">último conteo</span>')}
    </div></div>

    <div class="card ch"><div class="card-h"><h2>Formas de pago</h2></div><canvas id="p-pay"></canvas></div>
    <div class="card ch"><div class="card-h"><h2>Gastos por categoría</h2></div><canvas id="p-exp"></canvas></div>

    <div class="card ch w12"><div class="card-h"><h2>${ic('spark')} Lectura para socios</h2><span class="spacer"></span><button class="btn sm pri" id="pt-ai" ${PT.aiBusy ? 'disabled' : ''}>${PT.aiBusy ? 'Analizando…' : PT.ai ? 'Actualizar' : 'Generar con IA'}</button></div>
      <div id="pt-ai-text" class="pt-ai">${PT.ai ? esc(PT.ai.text).replace(/\n/g, '<br>') : '<span class="muted">Un resumen en lenguaje simple de cómo va el negocio en este periodo, qué explica los cambios y qué vigilar.</span>'}</div>
      ${PT.ai ? `<p class="muted small" style="margin:8px 0 0">${PT.ai.by === 'ia' ? 'Generado con IA' : 'Generado con reglas'} · ${fdt(PT.ai.ts)}</p>` : ''}</div>
  </div>
  ${can('usuarios.gestionar') ? `<div class="card"><div class="card-h"><h2>Capacidad del hostel</h2><span class="muted small">para ocupación, ADR y RevPAB</span></div><div class="row"><label class="small row" style="gap:6px">Camas en dormitorios <input class="in num sm" type="number" min="0" id="pt-dorm" value="${P.dormBeds}" style="width:80px"></label><label class="small row" style="gap:6px">Habitaciones privadas <input class="in num sm" type="number" min="0" id="pt-priv" value="${P.privRooms}" style="width:80px"></label><span class="muted small">Total: ${P.beds} unidades por noche</span></div></div>` : ''}`;
};
function partnerText(cur, prev, r) {
  const d = delta(cur.ingresos, prev.ingresos), top = LINES.map((l) => [l, cur.ing[l]]).sort((a, b) => b[1] - a[1])[0];
  const g = Object.entries(cur.gastos).sort((a, b) => b[1] - a[1])[0];
  return `En ${r.label} los ingresos suman ${money(cur.ingresos)}${d != null ? `, ${d >= 0 ? 'un aumento' : 'una caída'} de ${pct(Math.abs(d))} frente a ${r.cmp}` : ''}. ${top[0]} aporta el ${pct(cur.ingresos ? top[1] / cur.ingresos : 0)} de los ingresos.
La ocupación es de ${pct(cur.ocupacion)} con una tarifa promedio de ${money(cur.adr)} por cama-noche.
El resultado operativo estimado es ${money(cur.resultado)} (margen ${pct(cur.margenPct)})${g ? `; el gasto principal es ${g[0].toLowerCase()} con ${money(g[1])}` : ''}.
Hay ${money(cur.imp)} en impuestos recaudados que corresponden a la DIAN.`;
}
BIND.socios = (el) => {
  const P = S.partners, r = periodRange(P.period);
  $$('[data-pp]', el).forEach((b) => (b.onclick = () => { P.period = b.dataset.pp; PT.ai = null; save(); render(); }));
  const setCap = () => { P.dormBeds = Math.max(0, +$('#pt-dorm', el).value || 0); P.privRooms = Math.max(0, +$('#pt-priv', el).value || 0); P.beds = P.dormBeds + P.privRooms; log('socios.capacidad', `${P.dormBeds} camas + ${P.privRooms} privadas`); save(); render(); };
  $('#pt-dorm', el)?.addEventListener('change', setCap); $('#pt-priv', el)?.addEventListener('change', setCap);
  const curDays = dayBook(r.from, r.to), prevDays = dayBook(r.pFrom, r.pTo);
  const cur = sumBook(curDays), prev = sumBook(prevDays);
  const C = palette();
  const tot = (d) => LINES.reduce((a, l) => a + d.ing[l], 0);
  chart('p-daily', { type: 'line', data: { labels: curDays.map((d) => fdate(d.date + 'T12:00')), datasets: [
    { label: 'Este periodo', data: curDays.map(tot), borderColor: C[0], backgroundColor: fade(C[0]), fill: true },
    { label: 'Periodo de comparación', data: prevDays.slice(0, curDays.length).map(tot), borderColor: alpha(cv('--muted'), 0.6), borderDash: [4, 4], borderWidth: 1.6, fill: false } ] },
    options: { plugins: { legend: { position: 'top', align: 'end' }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.raw)}` } } }, scales: { x: {}, y: { beginAtZero: true, ticks: moneyTick } } } });
  const mix = LINES.filter((l) => cur.ing[l]);
  chart('p-mix', { type: 'doughnut', data: { labels: mix, datasets: [{ data: mix.map((l) => cur.ing[l]), backgroundColor: mix.map((l) => cv(LINE_COLOR[l])), spacing: 2 }] }, options: { cutout: '72%', interaction: { mode: 'nearest', intersect: true }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(c.raw)}` } } } }, plugins: [centerText('ingresos', moneyK(cur.ingresos))] });
  // por mes: últimos 4 meses calendario
  const months = []; const t0 = d0(); for (let i = 3; i >= 0; i--) { const f = new Date(t0.getFullYear(), t0.getMonth() - i, 1), tt = i ? new Date(t0.getFullYear(), t0.getMonth() - i + 1, 0) : t0; months.push({ label: f.toLocaleDateString('es-CO', { month: 'short' }) + (i ? '' : ' (en curso)'), s: sumBook(dayBook(iso(f), iso(tt))) }); }
  chart('p-month', { type: 'bar', data: { labels: months.map((m) => m.label), datasets: LINES.map((l) => ({ label: l, data: months.map((m) => m.s.ing[l]), backgroundColor: cv(LINE_COLOR[l]), maxBarThickness: 46 })) }, options: { plugins: { legend: { position: 'top', align: 'end' }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.raw)}`, footer: (items) => 'Total: ' + money(items.reduce((a, i) => a + i.raw, 0)) } } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: moneyTick } } } });
  const pays = Object.entries(cur.pagos).sort((a, b) => b[1] - a[1]);
  chart('p-pay', { type: 'bar', data: { labels: pays.map((x) => x[0]), datasets: [{ data: pays.map((x) => x[1]), backgroundColor: pays.map((_, i) => alpha(C[i % C.length], 0.85)), barThickness: 14 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${money(c.raw)} · ${pct(c.raw / pays.reduce((a, x) => a + x[1], 0))}` } } }, scales: { x: { beginAtZero: true, ticks: moneyTick }, y: {} } } });
  const ge = Object.entries(cur.gastos).sort((a, b) => b[1] - a[1]);
  chart('p-exp', { type: 'bar', data: { labels: ge.map((x) => x[0]), datasets: [{ data: ge.map((x) => x[1]), backgroundColor: alpha(C[3], 0.85), barThickness: 12 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + money(c.raw) } } }, scales: { x: { beginAtZero: true, ticks: moneyTick }, y: {} } } });

  $('#pt-ai', el).onclick = async () => {
    PT.aiBusy = true; render();
    const facts = { periodo: r.label, comparacion: r.cmp, ingresos: Math.round(cur.ingresos), ingresosAnterior: Math.round(prev.ingresos), porLinea: cur.ing, porLineaAnterior: prev.ing, resultado: Math.round(cur.resultado), resultadoAnterior: Math.round(prev.resultado), margen: +cur.margenPct.toFixed(3), ocupacion: +cur.ocupacion.toFixed(3), ocupacionAnterior: +prev.ocupacion.toFixed(3), adr: Math.round(cur.adr), adrAnterior: Math.round(prev.adr), gastos: cur.gastos, gastosAnterior: prev.gastos, ticket: Math.round(cur.ticket), impuestos: Math.round(cur.imp), perdidaInventario: S.recon?.totals.perdida || 0 };
    let text = null, by = 'reglas';
    try {
      const sample = await getSample();
      if (sample) { const out = await sample(`Eres asesor financiero de los socios de Capybara Hostel (Colombia, pesos COP). Con estos datos escribe en español, para socios no contables, 5 frases cortas: cómo va el negocio, qué explica el cambio frente al periodo de comparación, la línea que más aporta, un riesgo a vigilar y una recomendación concreta. No inventes datos. Sin títulos ni viñetas, una frase por línea.\n\nDATOS: ${JSON.stringify(facts)}`, { cache: { gcTime: 3600000 } }); text = out.text.trim(); by = 'ia'; }
    } catch (e) { if (e.code && !['not_granted', 'sampling_disabled', 'rate_limited'].includes(e.code)) toast('No se pudo usar la IA; se muestra el resumen con reglas.'); }
    PT.ai = { text: text || partnerText(cur, prev, r), by, ts: new Date().toISOString() }; PT.aiBusy = false; render();
  };
  $('#pt-xls', el).onclick = async () => {
    if (!window.XLSX) return toast('No se pudo cargar el generador de Excel.');
    const wb = XLSX.utils.book_new();
    const res = [['Capybara Hostel · Informe para socios'], [`Periodo: ${r.label} (${r.from} a ${r.to})`, '', `Comparación: ${r.cmp}`], [], ['Indicador', 'Periodo', 'Comparación', 'Variación'],
      ...[['Ingresos (sin impuestos)', cur.ingresos, prev.ingresos], ...LINES.map((l) => ['  ' + l, cur.ing[l], prev.ing[l]]), ['Costo de lo vendido', cur.costo, prev.costo], ['Margen bruto', cur.margenBruto, prev.margenBruto], ['Gastos', cur.gastosTotal, prev.gastosTotal], ['Resultado operativo', cur.resultado, prev.resultado], ['Impuestos recaudados', cur.imp, prev.imp], ['Facturas', cur.facturas, prev.facturas], ['Ticket promedio', Math.round(cur.ticket), Math.round(prev.ticket)], ['Camas-noche vendidas', cur.nights, prev.nights], ['Ocupación', cur.ocupacion, prev.ocupacion], ['Tarifa promedio (ADR)', Math.round(cur.adr), Math.round(prev.adr)], ['RevPAB', Math.round(cur.revpab), Math.round(prev.revpab)]].map(([k, a, b]) => [k, Math.round(a * 1000) / 1000, Math.round(b * 1000) / 1000, b ? Math.round(((a - b) / Math.abs(b)) * 1000) / 1000 : ''])];
    const ws1 = XLSX.utils.aoa_to_sheet(res); ws1['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');
    const dd = [['Fecha', ...LINES, 'Total ingresos', 'Impuestos', 'Camas-noche', 'Facturas', 'Costo de lo vendido', 'Gastos'], ...curDays.map((d) => [d.date, ...LINES.map((l) => d.ing[l]), tot(d), d.imp, d.nights, d.facturas, Math.round(d.costo), Object.values(d.gastos).reduce((a, b) => a + b, 0)])];
    const ws2 = XLSX.utils.aoa_to_sheet(dd); ws2['!cols'] = dd[0].map(() => ({ wch: 14 })); XLSX.utils.book_append_sheet(wb, ws2, 'Diario');
    const ws3 = XLSX.utils.aoa_to_sheet([['Categoría', 'Gasto'], ...Object.entries(cur.gastos).sort((a, b) => b[1] - a[1])]); ws3['!cols'] = [{ wch: 28 }, { wch: 14 }]; XLSX.utils.book_append_sheet(wb, ws3, 'Gastos');
    const filename = `informe-socios-capybara-${r.from}-a-${r.to}.xlsx`;
    const dl = await getDownloads();
    if (dl) { try { await dl.save({ filename, data: new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })) }); log('socios.informe', filename); return; } catch (e) { if (e.code === 'declined') return; } }
    navigator.clipboard.writeText(XLSX.utils.sheet_to_csv(ws1, { FS: '\t' })).then(() => toast('La descarga no está disponible aquí: copié el resumen para pegarlo en Excel.'), () => toast('La descarga no está disponible en esta vista.'));
  };
};

/* ---------- Caja del día en Facturación (cajeros, manager, admin) ---------- */
const _rFact = RENDER.facturacion;
RENDER.facturacion = () => {
  const html = _rFact();
  if (!can('caja.ver') || SH.tab !== 'ventas') return html;
  const today = iso(Date.now());
  const ls = S.billing.lines.filter((l) => l.date === today && invStatus(l.inv) === 'emitida');
  const mineOnly = me().role === 'CAJERO';
  const by = {}, pay = {}, invs = new Set(); let total = 0;
  for (const l of ls) { const who = S.billing.status[l.inv]?.by || '—'; if (mineOnly && who !== me().name) continue; const t = lineCalc(l).total; total += t; pay[l.pay] = (pay[l.pay] || 0) + t; by[who] = (by[who] || 0) + t; invs.add(l.inv); }
  const pend = S.billing.lines.filter((l) => invStatus(l.inv) === 'borrador').reduce((s, l) => s.add(l.inv), new Set()).size;
  const caja = `<div class="caja">
    <div class="caja-main"><span class="k">${mineOnly ? 'Mi caja de hoy' : 'Caja de hoy'}</span><span class="v">${money(total)}</span><span class="s">${invs.size} facturas emitidas · ${pend} en borrador</span></div>
    <div class="caja-pays">${['Efectivo', 'Tarjeta', 'Transferencia', 'Nequi', 'Daviplata', 'Cargo a la habitación'].filter((p) => pay[p]).map((p) => `<div><span class="k">${p}</span><b>${money(pay[p])}</b></div>`).join('') || '<span class="muted small">Aún no hay ventas emitidas hoy.</span>'}</div>
    ${!mineOnly && Object.keys(by).length ? `<div class="caja-who">${Object.entries(by).map(([w, v]) => `<span class="tag">${esc(w)} · ${moneyK(v)}</span>`).join(' ')}</div>` : ''}
    <button class="btn sm" id="caja-copy">${ic('copy')} Copiar cuadre</button></div>`;
  return caja + html;
};
const _bFact = BIND.facturacion;
BIND.facturacion = (el) => {
  _bFact(el);
  $('#caja-copy', el)?.addEventListener('click', () => {
    const today = iso(Date.now()); const mineOnly = me().role === 'CAJERO'; const pay = {}; let total = 0, n = new Set();
    for (const l of S.billing.lines) { if (l.date !== today || invStatus(l.inv) !== 'emitida') continue; if (mineOnly && S.billing.status[l.inv]?.by !== me().name) continue; const t = lineCalc(l).total; total += t; pay[l.pay] = (pay[l.pay] || 0) + t; n.add(l.inv); }
    const txt = `Cuadre de caja · ${fdate(today + 'T12:00')} · ${me().name}\nFacturas: ${n.size}\n${Object.entries(pay).map(([k, v]) => `${k}: ${money(v)}`).join('\n')}\nTotal: ${money(total)}`;
    navigator.clipboard.writeText(txt).then(() => toast('Cuadre copiado'), () => toast('No se pudo copiar.'));
    log('caja.cuadre', `${n.size} facturas · ${money(total)}`);
  });
};

/* ---------- modo API: facturas, usuarios y permisos reales ---------- */
const _remoteLoad = remote.load;
remote.load = async () => {
  await _remoteLoad();
  const tryGet = (p) => remote.req('/api/v1' + p).catch(() => null);
  const [rows, users, roles] = await Promise.all([tryGet('/invoices?format=rows'), tryGet('/users'), tryGet('/roles')]);
  if (rows) {
    const status = {};
    for (const r of rows) status[r.inv] = { st: r.status, by: r.issuedBy || '', alegra: r.alegra || null, invoiceId: r.invoiceId };
    const drafts = (S.billing?.lines || []).filter((l) => l.localDraft);
    S.billing = { next: 1, status, lines: [...rows.map((r) => ({ id: r.id, inv: r.inv, invoiceId: r.invoiceId, date: r.date, customer: r.customer, room: r.room || '', productId: r.productId, qty: r.qty, price: r.price, taxPct: r.taxPct, pay: r.pay })), ...drafts], draftPurchases: S.billing?.draftPurchases || [], history: [], historyV: 2 };
  }
  if (users) S.users = users.map((u) => ({ ...u, areas: u.areas || [] }));
  if (roles?.matrix) S.rolePerms = roles.matrix;
  S.alegra ||= null; S.imports ||= [];
  if (S.alegra) S.alegra.supplierLinks = Object.fromEntries(S.suppliers.map((s) => [s.id, s.alegraId || ''])); // vínculos reales del servidor
  if (S.alegra) S.alegra.itemLinks = Object.fromEntries(S.products.filter((p) => p.alegraItemId).map((p) => [p.id, String(p.alegraItemId)]));
  const itemRows = S.alegra ? await tryGet('/alegra/items/links') : null; // consulta el catálogo de Alegra (solo administradores)
  if (S.alegra && Array.isArray(itemRows)) S.alegra.items = itemRows.map((r) => ({ id: r.alegraItemId, name: r.alegraName, reference: r.reference || '' }));
};
const _newInvoice = newInvoice;
newInvoice = function () { _newInvoice(); if (S.settings.mode === 'api') { const l = S.billing.lines[S.billing.lines.length - 1]; l.localDraft = true; l.inv = 'BORRADOR-' + Date.now().toString(36).toUpperCase().slice(-4); save(); render(); } };
const _emitInvoice = emitInvoice;
emitInvoice = async function (inv) {
  if (S.settings.mode !== 'api') return _emitInvoice(inv);
  const lines = S.billing.lines.filter((l) => l.inv === inv);
  if (lines.some((l) => !l.productId || !(l.qty > 0))) return toast(`Completa producto y cantidad en todas las líneas de ${inv}.`);
  const body = { date: lines[0].date, customerName: lines[0].customer || 'Consumidor final', room: lines[0].room || undefined, payMethod: lines[0].pay, lines: lines.map((l) => ({ productId: l.productId, qty: +l.qty, price: +l.price, taxPct: +l.taxPct })) };
  try {
    const id = lines[0].invoiceId;
    const saved = id ? await remote.req(`/api/v1/invoices/${id}`, { method: 'PUT', body }) : await remote.req('/api/v1/invoices', { method: 'POST', body });
    const r = await remote.req(`/api/v1/invoices/${saved.id}/issue`, { method: 'POST' });
    S.billing.lines = S.billing.lines.filter((l) => l.inv !== inv);
    await remote.load(); save(); render();
    toast(`${saved.number} emitida${r.warnings?.length ? ' · ' + r.warnings.join('; ') : ''}`);
  } catch (e) { toast('No se pudo emitir: ' + e.message); }
};

/* ---------- arranque: si la página la sirve el backend, pide iniciar sesión ---------- */
function loginModal() {
  const m = modal({ title: 'Iniciar sesión en Capybara Control', body: `
    <div class="field"><label for="lg-email">Correo</label><input class="in" id="lg-email" type="email" autocomplete="username" value="${esc(S.settings.lastEmail || '')}"></div>
    <div class="field"><label for="lg-pw">Contraseña</label><input class="in" id="lg-pw" type="password" autocomplete="current-password"></div>
    <p class="muted small" id="lg-msg" style="margin:0">Servidor: <span class="mono">${esc(S.settings.baseUrl)}</span></p>`,
    foot: `<button class="btn" id="lg-demo">Ver demostración</button><button class="btn pri" id="lg-ok">Entrar</button>` });
  const go = async () => {
    const email = m.querySelector('#lg-email').value.trim(), pw = m.querySelector('#lg-pw').value;
    if (!email || !pw) return toast('Escribe tu correo y contraseña.');
    try { const d = await remote.login(email, pw); S.settings.lastEmail = email; await remote.load(); S.settings.mode = 'api'; S.recon = null; if (!S.users.some((u) => u.name === d.user.name)) S.users.push({ id: d.user.id, name: d.user.name, role: d.user.role, area: d.user.area || '', areas: [], email, active: true }); S.settings.user = d.user.name; save(); closeModal(); location.hash = homeView(); render(); toast(`Hola, ${d.user.name}`); }
    catch (e) { m.querySelector('#lg-msg').innerHTML = `<span class="neg">${esc(e.message)}</span>`; }
  };
  m.querySelector('#lg-ok').onclick = go;
  m.querySelector('#lg-pw').onkeydown = (e) => e.key === 'Enter' && go();
  m.querySelector('#lg-demo').onclick = () => { closeModal(); toast('Modo demostración: los datos de ejemplo viven solo en este navegador.'); };
}
boot();
if (window.CAPYBARA_API) {
  S.settings.baseUrl ||= window.CAPYBARA_API;
  if (!S.settings.token || S.settings.mode !== 'api') loginModal();
}
