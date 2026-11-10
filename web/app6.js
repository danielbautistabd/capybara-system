/* ================= Capybara Control · app (6/6): Facturación en hoja de cálculo ================= */
/* Hoja tipo Google Sheets: letras de columna, números de fila, barra de fórmulas, selección con
 * flechas/Tab/Enter, edición en celda, pegar desde Excel o Sheets y copiar como tabla. */

VIEW_PERM.facturacion = 'facturacion.crear';
(() => { const e = Object.entries(VIEWS); for (const k in VIEWS) delete VIEWS[k]; for (const [k, v] of e) { VIEWS[k] = v; if (k === 'marchados') VIEWS.facturacion = { t: 'Facturación', ic: 'sheet', grp: 'Operación' }; } })();
ICON.sheet = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>';

const SALE = { 'HOS-001': 55000, 'HOS-002': 165000, 'BEB-001': 7000, 'BEB-002': 6000, 'BEB-003': 4000, 'BEB-004': 5000, 'LIC-001': 95000, 'LIC-002': 85000, 'ALI-005': 18000, 'AME-001': 3000, 'AME-002': 4000, 'LAV-002': 0 };
const TAXES = [[0, 'Exento 0 %'], [8, 'INC 8 %'], [19, 'IVA 19 %']];
const defaultTax = (p) => (!p ? 19 : ['Bebidas', 'Licores', 'Alimentos', 'Servicios'].includes(p.category) ? 8 : 19); // impoconsumo en bar y restaurante

function upgradeBilling() {
  for (const p of S.products) if (p.salePrice == null) p.salePrice = SALE[p.code] || 0;
  if (!S.billing) {
    const y = iso(Date.now() - DAY), t = iso(Date.now());
    const L = (inv, date, customer, room, code, qty, pay) => { const p = prodById('p_' + code); return { id: uid('fl'), inv, date, customer, room, productId: p.id, qty, price: p.salePrice, taxPct: defaultTax(p), pay }; };
    S.billing = {
      next: 4,
      status: { 'FV-0001': { st: 'emitida', at: new Date(Date.now() - 20 * 36e5).toISOString(), by: 'Andrés Pérez', alegra: '9001', seeded: true }, 'FV-0002': { st: 'emitida', at: new Date(Date.now() - 3 * 36e5).toISOString(), by: 'Camila Rojas', seeded: true } },
      lines: [
        L('FV-0001', y, 'Lucía Fernández', '203', 'ALI-005', 2, 'Tarjeta'), L('FV-0001', y, 'Lucía Fernández', '203', 'BEB-001', 4, 'Tarjeta'), L('FV-0001', y, 'Lucía Fernández', '203', 'BEB-003', 2, 'Tarjeta'),
        L('FV-0002', t, 'Consumidor final', 'Bar', 'LIC-002', 1, 'Efectivo'), L('FV-0002', t, 'Consumidor final', 'Bar', 'BEB-004', 3, 'Efectivo'),
        L('FV-0003', t, 'Tom Becker', '105', 'BEB-002', 6, 'Nequi'), L('FV-0003', t, 'Tom Becker', '105', 'ALI-005', 1, 'Nequi'), L('FV-0003', t, 'Tom Becker', '105', 'AME-002', 1, 'Nequi'),
      ],
      draftPurchases: [],
    };
  }
}
const _upgrade = upgradeState;
upgradeState = function () { _upgrade(); upgradeBilling(); };

/* ---------------- motor de hoja ---------------- */
const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let SH = { tab: 'ventas', r: 0, c: 4, edit: false, q: '' };
const invStatus = (inv) => S.billing.status[inv]?.st || 'borrador';
const lineCalc = (l) => { const sub = (+l.qty || 0) * (+l.price || 0); const tax = Math.round(sub * (+l.taxPct || 0) / 100); return { sub, tax, total: sub + tax }; };

function sheetDef() {
  if (SH.tab === 'ventas') {
    const lines = S.billing.lines.filter((l) => !SH.q || normalize(`${l.inv} ${l.customer} ${l.room} ${prodById(l.productId)?.name || ''}`).includes(normalize(SH.q)));
    return {
      rows: lines, locked: (l) => invStatus(l.inv) !== 'borrador' || !can('facturacion.crear'),
      cols: [
        { k: 'date', h: 'Fecha', w: 104, t: 'date' }, { k: 'inv', h: 'Factura', w: 92, t: 'text' }, { k: 'customer', h: 'Cliente / huésped', w: 170, t: 'text' }, { k: 'room', h: 'Hab. / punto', w: 92, t: 'text' },
        { k: 'productId', h: 'Producto', w: 220, t: 'product' }, { k: 'qty', h: 'Cant.', w: 64, t: 'num' }, { k: 'price', h: 'Precio unit.', w: 108, t: 'money' }, { k: 'taxPct', h: 'Impuesto', w: 96, t: 'tax' },
        { k: 'sub', h: 'Subtotal', w: 108, t: 'calc', f: (l) => lineCalc(l).sub, fx: (r) => `=F${r}*G${r}` }, { k: 'tax', h: 'Impuesto $', w: 98, t: 'calc', f: (l) => lineCalc(l).tax, fx: (r) => `=I${r}*H${r}` },
        { k: 'total', h: 'Total', w: 112, t: 'calc', f: (l) => lineCalc(l).total, fx: (r) => `=I${r}+J${r}` }, { k: 'pay', h: 'Pago', w: 112, t: 'select', o: PAY.filter((p) => p !== 'Crédito proveedor').concat(['Cargo a la habitación']) },
        { k: 'st', h: 'Estado', w: 128, t: 'calc', f: (l) => ({ borrador: 'Borrador', emitida: S.billing.status[l.inv]?.alegra ? 'En Alegra' : 'Emitida', anulada: 'Anulada' }[invStatus(l.inv)]) },
      ],
      totals: { qty: 1, sub: 1, tax: 1, total: 1 },
    };
  }
  if (SH.tab === 'compras') {
    const fromPurch = S.purchases.filter((p) => p.kind !== 'orden' && p.status !== 'anulada').sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)).slice(0, 40)
      .flatMap((p) => p.items.map((it) => ({ id: p.id + it.productId, date: p.purchasedAt, supplierId: p.supplierId, inv: p.invoice, productId: it.productId, qty: it.qty, price: it.unitCost, taxPct: p.subtotal ? Math.round((p.tax / p.subtotal) * 100) : 0, pay: p.payMethod, _st: p.status === 'aprobada' ? (p.alegraBillId ? 'En Alegra' : 'Aprobada') : 'Borrador', _locked: true })));
    const rows = [...S.billing.draftPurchases, ...fromPurch].filter((l) => !SH.q || normalize(`${l.inv} ${supById(l.supplierId)?.name || ''} ${prodById(l.productId)?.name || ''}`).includes(normalize(SH.q)));
    return {
      rows, locked: (l) => !!l._locked,
      cols: [
        { k: 'date', h: 'Fecha', w: 104, t: 'date' }, { k: 'supplierId', h: 'Proveedor', w: 170, t: 'supplier' }, { k: 'inv', h: 'Factura', w: 100, t: 'text' }, { k: 'productId', h: 'Producto', w: 220, t: 'product' },
        { k: 'qty', h: 'Cant.', w: 64, t: 'num' }, { k: 'unit', h: 'Unidad', w: 80, t: 'calc', f: (l) => prodById(l.productId)?.unit || '' }, { k: 'price', h: 'Costo unit.', w: 108, t: 'money' }, { k: 'taxPct', h: 'IVA', w: 90, t: 'tax' },
        { k: 'sub', h: 'Subtotal', w: 108, t: 'calc', f: (l) => lineCalc(l).sub, fx: (r) => `=E${r}*G${r}` }, { k: 'tax', h: 'IVA $', w: 92, t: 'calc', f: (l) => lineCalc(l).tax, fx: (r) => `=I${r}*H${r}` }, { k: 'total', h: 'Total', w: 112, t: 'calc', f: (l) => lineCalc(l).total, fx: (r) => `=I${r}+J${r}` },
        { k: 'pay', h: 'Pago', w: 120, t: 'select', o: PAY }, { k: 'st', h: 'Estado', w: 110, t: 'calc', f: (l) => l._st || 'Nueva' },
      ],
      totals: { qty: 1, sub: 1, tax: 1, total: 1 },
    };
  }
  // resumen por día
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = iso(Date.now() - i * DAY);
    const vl = S.billing.lines.filter((l) => l.date === d && invStatus(l.inv) === 'emitida');
    const ventas = vl.reduce((a, l) => a + lineCalc(l).sub, 0), imp = vl.reduce((a, l) => a + lineCalc(l).tax, 0);
    const costo = vl.reduce((a, l) => a + l.qty * (prodById(l.productId)?.avgCost || 0), 0);
    const compras = S.purchases.filter((p) => p.purchasedAt === d && p.status === 'aprobada' && p.kind !== 'orden').reduce((a, p) => a + p.total, 0);
    const gastos = S.expenses.filter((e) => e.date === d && e.status !== 'anulado').reduce((a, e) => a + e.amount, 0);
    days.push({ id: d, date: d, facturas: new Set(vl.map((l) => l.inv)).size, ventas, imp, costo, margen: ventas - costo, compras, gastos });
  }
  const money_ = can('costos.ver');
  return {
    rows: days, locked: () => true,
    cols: [{ k: 'date', h: 'Fecha', w: 110, t: 'date' }, { k: 'facturas', h: 'Facturas', w: 84, t: 'num' }, { k: 'ventas', h: 'Ventas (sin imp.)', w: 130, t: 'money' }, { k: 'imp', h: 'Impuestos', w: 110, t: 'money' },
      ...(money_ ? [{ k: 'costo', h: 'Costo de lo vendido', w: 140, t: 'money' }, { k: 'margen', h: 'Margen bruto', w: 120, t: 'calc', f: (r) => r.margen, fx: (r) => `=C${r}-E${r}` }, { k: 'compras', h: 'Compras', w: 120, t: 'money' }, { k: 'gastos', h: 'Gastos', w: 110, t: 'money' }] : [])],
    totals: { facturas: 1, ventas: 1, imp: 1, costo: 1, margen: 1, compras: 1, gastos: 1 },
  };
}
const cellVal = (col, row) => (col.t === 'calc' ? col.f(row) : row[col.k]);
function cellText(col, row) {
  const v = cellVal(col, row);
  if (v === '' || v == null) return '';
  if (col.t === 'product') return prodById(v)?.name || '';
  if (col.t === 'supplier') return supById(v)?.name || '';
  if (col.t === 'tax') return TAXES.find(([n]) => n === +v)?.[1] || v + ' %';
  if (col.t === 'money' || (col.t === 'calc' && typeof v === 'number')) return money(v);
  if (col.t === 'num') return num(v);
  if (col.t === 'date') return new Date(v + 'T12:00').toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return String(v);
}
const isNumCol = (c) => ['num', 'money'].includes(c.t) || (c.t === 'calc' && c.k !== 'st' && c.k !== 'unit');

RENDER.facturacion = () => {
  if (SH.tab === 'compras' && !can('costos.ver')) SH.tab = 'ventas';
  const d = sheetDef();
  const ref = `${COLS[SH.c]}${SH.r + 2}`;
  const row = d.rows[SH.r], col = d.cols[SH.c];
  const fx = row && col ? (col.fx ? col.fx(SH.r + 2) : ['calc', 'product', 'supplier', 'tax'].includes(col.t) ? cellText(col, row) : cellVal(col, row) ?? '') : '';
  const inv = SH.tab === 'ventas' && row ? row.inv : null;
  const invTot = inv ? S.billing.lines.filter((l) => l.inv === inv).reduce((a, l) => a + lineCalc(l).total, 0) : 0;
  const tabs = [['ventas', 'Ventas'], ...(can('costos.ver') ? [['compras', 'Compras']] : []), ['resumen', 'Resumen']];
  return `
  <div class="gs">
    <div class="gs-bar">
      <div class="gs-title">${ic('sheet')}<b>Facturación Capybara ${new Date().getFullYear()}</b><span class="muted small">${SH.tab === 'ventas' ? 'Ventas' : SH.tab === 'compras' ? 'Compras' : 'Resumen'}</span></div>
      <span class="spacer"></span>
      <input class="in gs-search" id="gs-q" placeholder="Buscar en la hoja" value="${esc(SH.q)}">
    </div>
    <div class="gs-tools">
      ${SH.tab === 'ventas' && can('facturacion.crear') ? `<button class="btn sm" id="gs-newinv">${ic('plus')} Nueva factura</button><button class="btn sm" id="gs-addrow" ${inv && invStatus(inv) === 'borrador' ? '' : 'disabled'}>${ic('plus')} Línea en ${esc(inv || '—')}</button>` : ''}
      ${SH.tab === 'compras' ? `<button class="btn sm" id="gs-addp">${ic('plus')} Nueva fila</button><button class="btn sm pri" id="gs-mkp" ${S.billing.draftPurchases.length ? '' : 'disabled'}>Crear entradas (${S.billing.draftPurchases.length})</button>` : ''}
      ${!d.locked(row || {}) ? `<button class="btn sm ghost" id="gs-delrow" title="Eliminar fila (solo borradores)">${ic('x')} Eliminar fila</button>` : ''}
      <span class="gs-sep"></span>
      <button class="btn sm ghost" id="gs-copy" title="Copiar la hoja para pegar en Google Sheets o Excel">${ic('copy')} Copiar hoja</button>
      <span class="spacer"></span>
      ${inv ? `<span class="small">Factura <b class="mono">${esc(inv)}</b> · ${esc(row.customer || '')} · <b class="num">${money(invTot)}</b></span>
        ${invStatus(inv) === 'borrador' && can('facturacion.emitir') ? `<button class="btn sm pri" id="gs-emit">${ic('check')} Emitir ${esc(inv)}</button>` : ''}
        ${invStatus(inv) === 'emitida' && !S.billing.status[inv]?.alegra && (can('alegra.gestionar') || can('alegra.enviar')) ? `<button class="btn sm" id="gs-alegra">Enviar a Alegra</button>` : ''}
        ${S.settings.mode === 'api' && invStatus(inv) === 'emitida' && can('facturacion.emitir') ? `<button class="btn sm bad" id="gs-void">Anular</button>` : ''}
        ${invStatus(inv) === 'borrador' && !can('facturacion.emitir') ? pill('Un supervisor la emite', 'p-info') : ''}` : ''}
    </div>
    <div class="gs-fx"><span class="gs-ref mono">${ref}</span><span class="gs-fxi">fx</span><span class="gs-fxv mono" id="gs-fxv">${esc(String(fx))}</span></div>
    <div class="gs-wrap" id="gs-grid" tabindex="0" role="grid" aria-label="Hoja de facturación">
      <table class="gs-t"><colgroup><col style="width:46px">${d.cols.map((c) => `<col style="width:${c.w}px">`).join('')}</colgroup>
      <thead><tr><th class="gs-corner"></th>${d.cols.map((c, j) => `<th class="gs-col ${j === SH.c ? 'on' : ''}">${COLS[j]}</th>`).join('')}</tr></thead>
      <tbody>
        <tr class="gs-head"><th class="gs-rn">1</th>${d.cols.map((c) => `<td class="${isNumCol(c) ? 'n' : ''}">${esc(c.h)}</td>`).join('')}</tr>
        ${d.rows.map((l, i) => { const lk = d.locked(l); return `<tr class="${lk ? 'gs-lock' : ''} ${SH.tab === 'ventas' && i > 0 && d.rows[i - 1].inv !== l.inv ? 'gs-break' : ''}"><th class="gs-rn ${i === SH.r ? 'on' : ''}">${i + 2}</th>${d.cols.map((c, j) => { const sel = i === SH.r && j === SH.c; const v = cellText(c, l); const st = c.k === 'st' ? ` gs-st-${normalize(v).replace(/\s/g, '-')}` : '';
          return `<td data-r="${i}" data-c="${j}" class="${isNumCol(c) ? 'n' : ''}${c.t === 'calc' ? ' gs-calc' : ''}${sel ? ' sel' : ''}${st}">${sel && SH.edit ? editorHtml(c, l) : esc(v)}</td>`; }).join('')}</tr>`; }).join('')}
        <tr class="gs-tot"><th class="gs-rn">${d.rows.length + 2}</th>${d.cols.map((c, j) => { if (j === 0) return '<td><b>Total</b></td>'; if (!d.totals[c.k]) return '<td></td>'; const s = d.rows.reduce((a, l) => a + (+cellVal(c, l) || 0), 0); return `<td class="n" title="=SUMA(${COLS[j]}2:${COLS[j]}${d.rows.length + 1})"><b>${c.t === 'num' ? num(s) : money(s)}</b></td>`; }).join('')}</tr>
        ${Array.from({ length: Math.max(3, 14 - d.rows.length) }, (_, k) => `<tr class="gs-empty"><th class="gs-rn">${d.rows.length + 3 + k}</th>${d.cols.map(() => '<td></td>').join('')}</tr>`).join('')}
      </tbody></table>
    </div>
    <div class="gs-tabs">${tabs.map(([k, l]) => `<button data-gt="${k}" class="${SH.tab === k ? 'on' : ''}">${l}</button>`).join('')}<span class="spacer"></span><span class="small muted hide-sm">Flechas para moverte · Enter para editar · Tab a la derecha · pega desde Excel con Ctrl+V</span></div>
  </div>
  ${SH.tab === 'ventas' ? `<p class="muted small" style="margin:0">Al emitir, cada línea descuenta el producto del inventario como <b>salida por venta</b> y queda bloqueada. El impuesto por defecto es INC 8 % para bar y restaurante, IVA 19 % para lo demás; cámbialo por línea si aplica. La factura electrónica ante la DIAN la genera Alegra al enviarla.</p>` : SH.tab === 'compras' ? `<p class="muted small" style="margin:0">Las filas grises son compras ya registradas. Escribe filas nuevas (proveedor, factura, producto, cantidad y costo) y pulsa <b>Crear entradas</b>: se agrupan por proveedor y factura y llegan como borrador a Registro de entradas.</p>` : ''}`;
};
function editorHtml(c, l) {
  const v = l[c.k] ?? '';
  if (c.t === 'product') return `<input class="gs-in" id="gs-ed" list="gs-prods" value="${esc(prodById(v)?.name || '')}"><datalist id="gs-prods">${S.products.filter((p) => p.status !== 'inactivo' && p.kind !== 'activo').map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>`;
  if (c.t === 'supplier') return `<select class="gs-in" id="gs-ed">${opt('', '—')}${S.suppliers.map((s) => opt(s.id, s.name, v)).join('')}</select>`;
  if (c.t === 'tax') return `<select class="gs-in" id="gs-ed">${TAXES.map(([n, t]) => opt(n, t, v)).join('')}</select>`;
  if (c.t === 'select') return `<select class="gs-in" id="gs-ed">${c.o.map((o) => opt(o, o, v)).join('')}</select>`;
  return `<input class="gs-in ${['num', 'money'].includes(c.t) ? 'num' : ''}" id="gs-ed" type="${c.t === 'date' ? 'date' : 'text'}" value="${esc(v)}" inputmode="${['num', 'money'].includes(c.t) ? 'decimal' : 'text'}">`;
}
function setCell(row, c, raw) {
  if (c.t === 'calc') return false;
  let v = raw;
  if (['num', 'money'].includes(c.t)) { v = Number(String(raw).replace(/[$\s]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); if (!Number.isFinite(v) || v < 0) { toast('Escribe un número válido.'); return false; } }
  if (c.t === 'product') { const p = S.products.find((x) => normalize(x.name) === normalize(raw)) || matchProduct(String(raw), catalogForParser())?.product; if (!p) { toast(`No encontré "${raw}" en el catálogo.`); return false; } v = p.id; if (SH.tab === 'ventas') { row.price = p.salePrice || row.price || 0; row.taxPct = defaultTax(p); } else { row.price = p.lastPrice || p.avgCost || 0; } }
  if (c.t === 'tax') v = +raw;
  if (c.t === 'date' && raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) { const m = String(raw).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); if (!m) { toast('Fecha en formato dd/mm/aaaa.'); return false; } v = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if (c.k === 'inv' && SH.tab === 'ventas' && invStatus(v) !== 'borrador') { toast(`La factura ${v} ya fue emitida.`); return false; }
  row[c.k] = v; return true;
}
function newInvoice() {
  const n = 'FV-' + String(S.billing.next++).padStart(4, '0');
  const last = S.billing.lines[S.billing.lines.length - 1];
  S.billing.lines.push({ id: uid('fl'), inv: n, date: iso(Date.now()), customer: 'Consumidor final', room: me().area === 'Bar' ? 'Bar' : '', productId: '', qty: 1, price: 0, taxPct: 8, pay: last?.pay || 'Efectivo' });
  SH.q = ''; SH.r = S.billing.lines.length - 1; SH.c = 2; SH.edit = false; log('factura.crear', n); save(); render(); toast(`${n} creada: escribe el cliente y presiona Tab`);
}
function emitInvoice(inv) {
  const lines = S.billing.lines.filter((l) => l.inv === inv);
  const bad = lines.filter((l) => !l.productId || !(l.qty > 0) || !(l.price >= 0));
  if (bad.length) return toast(`Completa producto, cantidad y precio en las ${bad.length} líneas de ${inv}.`);
  if (!lines[0].customer) return toast('Escribe el cliente o huésped.');
  const st = stockMap();
  const short = lines.filter((l) => prodById(l.productId).kind === 'consumible' && st[l.productId] < l.qty);
  for (const l of lines) {
    const p = prodById(l.productId);
    if (p.kind === 'servicio') continue;
    act.addMovement({ productId: l.productId, qty: l.qty, unit: p.unit, type: 'salida', source: 'manual', area: l.room ? (isNaN(+l.room) ? l.room : `Habitación ${l.room}`) : 'Recepción', reason: `Venta ${inv} · ${l.customer}`, evidence: inv, notes: `Factura ${inv}` }, { approve: can('movimientos.aprobar'), silent: true });
  }
  S.billing.status[inv] = { st: 'emitida', at: new Date().toISOString(), by: me().name };
  const total = lines.reduce((a, l) => a + lineCalc(l).total, 0);
  log('factura.emitir', `${inv} · ${lines[0].customer} · ${lines.length} líneas · ${money(total)}`);
  save(); render(); toast(`${inv} emitida por ${money(total)}${short.length ? ` · ojo: ${short.map((l) => prodById(l.productId).name).join(', ')} con stock insuficiente` : ''}`);
}
BIND.facturacion = (el) => {
  const g = $('#gs-grid', el);
  const d = sheetDef();
  const keepScroll = (fn) => { const sx = g.scrollLeft, sy = g.scrollTop; fn(); const n = $('#gs-grid'); if (n) { n.scrollLeft = sx; n.scrollTop = sy; if (!SH.edit) n.focus({ preventScroll: true }); } };
  const move = (dr, dc) => { SH.r = Math.max(0, Math.min(d.rows.length - 1, SH.r + dr)); SH.c = Math.max(0, Math.min(d.cols.length - 1, SH.c + dc)); SH.edit = false; keepScroll(render); scrollSel(); };
  const scrollSel = () => $('#gs-grid td.sel')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const startEdit = (seed) => { const row = d.rows[SH.r], c = d.cols[SH.c]; if (!row || c.t === 'calc') return; if (d.locked(row)) return toast(SH.tab === 'ventas' ? 'Factura emitida: no se puede editar.' : 'Fila bloqueada.'); SH.edit = true; keepScroll(render); const ed = $('#gs-ed'); if (ed) { ed.focus(); if (seed !== undefined && ed.tagName === 'INPUT' && ed.type !== 'date') ed.value = seed; } };
  const commit = (dr = 0, dc = 0) => { const ed = $('#gs-ed'); const row = d.rows[SH.r]; if (ed && row) { if (!setCell(row, d.cols[SH.c], ed.value)) { ed.focus(); return; } save(); } SH.edit = false; move(dr, dc); };
  g.addEventListener('click', (e) => { const td = e.target.closest('td[data-r]'); if (!td || e.target.id === 'gs-ed') return; const r = +td.dataset.r, c = +td.dataset.c; if (SH.edit) commit(); if (r === SH.r && c === SH.c) return startEdit(); SH.r = r; SH.c = c; SH.edit = false; keepScroll(render); });
  g.addEventListener('dblclick', (e) => { if (e.target.closest('td[data-r]')) startEdit(); });
  g.addEventListener('keydown', (e) => {
    if (SH.edit) {
      if (e.key === 'Enter') { e.preventDefault(); commit(1, 0); } else if (e.key === 'Tab') { e.preventDefault(); commit(0, e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') { e.preventDefault(); SH.edit = false; keepScroll(render); }
      return;
    }
    const k = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (k) { e.preventDefault(); return move(...k); }
    if (e.key === 'Tab') { e.preventDefault(); return move(0, e.shiftKey ? -1 : 1); }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); return startEdit(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && d.rows[SH.r] && !d.locked(d.rows[SH.r])) { const c = d.cols[SH.c]; if (c.t !== 'calc' && c.t !== 'product') { d.rows[SH.r][c.k] = ['num', 'money'].includes(c.t) ? 0 : ''; save(); keepScroll(render); } return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); startEdit(e.key); }
  });
  g.addEventListener('paste', (e) => {
    if (SH.edit) return;
    const txt = e.clipboardData?.getData('text/plain'); if (!txt) return; e.preventDefault();
    const grid = txt.replace(/\r/g, '').split('\n').filter((x) => x.length).map((x) => x.split('\t'));
    let ok = 0, skipped = 0;
    grid.forEach((cells, i) => {
      let row = d.rows[SH.r + i];
      if (!row) { if (SH.tab === 'ventas' && can('facturacion.crear')) { const base = d.rows[SH.r] || {}; row = { id: uid('fl'), inv: invStatus(base.inv) === 'borrador' ? base.inv : 'FV-' + String(S.billing.next++).padStart(4, '0'), date: iso(Date.now()), customer: base.customer || 'Consumidor final', room: base.room || '', productId: '', qty: 1, price: 0, taxPct: 8, pay: base.pay || 'Efectivo' }; S.billing.lines.push(row); } else if (SH.tab === 'compras') { row = { id: uid('dp'), date: iso(Date.now()), supplierId: '', inv: '', productId: '', qty: 1, price: 0, taxPct: 0, pay: 'Transferencia' }; S.billing.draftPurchases.push(row); } else return; }
      if (d.locked(row)) { skipped++; return; }
      cells.forEach((v, j) => { const c = d.cols[SH.c + j]; if (c && v.trim() !== '' && c.t !== 'calc') { if (setCell(row, c, v.trim())) ok++; else skipped++; } });
    });
    save(); keepScroll(render); toast(`Pegadas ${ok} celdas${skipped ? ` · ${skipped} omitidas` : ''}`);
  });
  $$('[data-gt]', el).forEach((b) => (b.onclick = () => { SH.tab = b.dataset.gt; SH.r = 0; SH.c = 0; SH.edit = false; render(); }));
  const q = $('#gs-q', el); q.oninput = () => { SH.q = q.value; SH.r = 0; render(); const n = $('#gs-q'); n.focus(); n.setSelectionRange(SH.q.length, SH.q.length); };
  $('#gs-newinv', el)?.addEventListener('click', newInvoice);
  $('#gs-addrow', el)?.addEventListener('click', () => { const base = d.rows[SH.r]; const idx = S.billing.lines.lastIndexOf(S.billing.lines.filter((l) => l.inv === base.inv).pop()); S.billing.lines.splice(idx + 1, 0, { id: uid('fl'), inv: base.inv, date: base.date, customer: base.customer, room: base.room, productId: '', qty: 1, price: 0, taxPct: 8, pay: base.pay }); SH.q = ''; SH.r = sheetDef().rows.findIndex((l) => l === S.billing.lines[idx + 1]); SH.c = 4; SH.edit = true; save(); render(); $('#gs-ed')?.focus(); });
  $('#gs-addp', el)?.addEventListener('click', () => { const prev = S.billing.draftPurchases[0]; S.billing.draftPurchases.unshift({ id: uid('dp'), date: iso(Date.now()), supplierId: prev?.supplierId || '', inv: prev?.inv || '', productId: '', qty: 1, price: 0, taxPct: 0, pay: prev?.pay || 'Transferencia' }); SH.r = 0; SH.c = prev ? 3 : 1; SH.edit = false; save(); render(); });
  $('#gs-delrow', el)?.addEventListener('click', () => { const row = d.rows[SH.r]; const arr = SH.tab === 'ventas' ? S.billing.lines : S.billing.draftPurchases; arr.splice(arr.indexOf(row), 1); SH.r = Math.max(0, SH.r - 1); save(); render(); });
  $('#gs-emit', el)?.addEventListener('click', () => emitInvoice(d.rows[SH.r].inv));
  $('#gs-void', el)?.addEventListener('click', async () => {
    const inv = d.rows[SH.r].inv, id = S.billing.status[inv]?.invoiceId;
    const reason = await ask({ title: `Anular ${inv}`, text: 'La factura queda anulada en Capybara. Si ya estaba en Alegra, anúlala también allá.', input: 'Motivo (obligatorio)', label: 'Anular factura', danger: true });
    if (!reason) return;
    if (reason.length < 3) return toast('Escribe un motivo de al menos 3 letras.');
    try { const r = await remote.req(`/api/v1/invoices/${id}/void`, { method: 'POST', body: { reason } }); await remote.load(); save(); render(); toast(`${inv} anulada. ${r.note || ''}`); } catch (e) { toast('No se pudo anular: ' + e.message); }
  });
  $('#gs-alegra', el)?.addEventListener('click', async (ev) => { const inv = d.rows[SH.r].inv;
    if (S.settings.mode === 'api') {
      ev.target.disabled = true;
      try { const r = await remote.req(`/api/v1/invoices/${S.billing.status[inv]?.invoiceId}/alegra`, { method: 'POST' }); await remote.load(); save(); render(); toast(`${inv} enviada a Alegra (factura ${r.alegraInvoiceId}).`); }
      catch (e) { ev.target.disabled = false; toast('No se envió a Alegra: ' + e.message); }
      return;
    } S.billing.status[inv].alegra = String(9000 + Object.keys(S.billing.status).length); S.alegra.log.unshift({ ts: new Date().toISOString(), action: 'venta.exportar', status: 'ok', detail: `${inv} → factura de venta ${S.billing.status[inv].alegra} (simulado)` }); log('alegra.venta', inv); save(); render(); toast(`${inv} enviada a Alegra (simulado)`); });
  $('#gs-mkp', el)?.addEventListener('click', () => {
    const groups = {}; const bad = [];
    for (const l of S.billing.draftPurchases) { if (!l.supplierId || !l.productId || !(l.qty > 0)) { bad.push(l); continue; } (groups[l.supplierId + '|' + (l.inv || '')] ||= []).push(l); }
    if (bad.length) return toast(`${bad.length} filas sin proveedor, producto o cantidad.`);
    for (const ls of Object.values(groups)) { const f = ls[0]; const items = ls.map((l) => ({ productId: l.productId, qty: l.qty, unit: prodById(l.productId).unit, unitCost: l.price, subtotal: l.qty * l.price })); const sub = items.reduce((a, i) => a + i.subtotal, 0); act.savePurchase({ supplierId: f.supplierId, invoice: f.inv, purchasedAt: f.date, receivedAt: f.date, items, tax: ls.reduce((a, l) => a + lineCalc(l).tax, 0), discount: 0, payMethod: f.pay, receivedBy: me().name, status: 'borrador', source: 'manual', notes: 'Registrada desde la hoja de Facturación', kind: 'compra' }, false); }
    const n = Object.keys(groups).length; S.billing.draftPurchases = []; save(); render(); toast(`${n} entrada${n > 1 ? 's' : ''} en borrador: apruébalas en Registro de entradas`);
  });
  $('#gs-copy', el).onclick = () => { const tsv = [d.cols.map((c) => c.h), ...d.rows.map((l) => d.cols.map((c) => { const v = cellVal(c, l); return c.t === 'product' || c.t === 'supplier' || c.t === 'tax' || c.k === 'st' ? cellText(c, l) : v ?? ''; }))].map((r) => r.join('\t')).join('\n'); navigator.clipboard.writeText(tsv).then(() => toast('Hoja copiada: pégala en Google Sheets o Excel'), () => toast('Tu navegador no permitió copiar.')); };
  if (SH.edit) { const ed = $('#gs-ed'); ed?.focus(); ed?.addEventListener('blur', (e) => { if (SH.edit && !e.relatedTarget?.closest?.('#gs-grid')) setTimeout(() => { if (SH.edit && document.activeElement?.id !== 'gs-ed') commit(); }, 120); }); }
  else g.focus({ preventScroll: true });
};

