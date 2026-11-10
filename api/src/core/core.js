/* =====================================================================
 * Capybara Control — núcleo compartido (backend + frontend)
 * ---------------------------------------------------------------------
 *  - parseInstruction(): interpreta mensajes tipo "Marchar 3 cervezas y 2 aguas"
 *  - fingerprint() / findDuplicates(): evita registrar el mismo movimiento
 *    que llega por WhatsApp, foto, factura y fila de Excel
 *  - theoreticalStock() / reconcile(): motor de conciliación
 *  - weightedAvgCost(): costo promedio ponderado
 * Sin dependencias. El build del frontend incrusta este archivo quitando
 * las palabras "export".
 * ===================================================================== */

export const AUTO_APPLY_CONFIDENCE = 0.85;

/* Tipos de movimiento y su signo sobre el inventario */
export const MOVEMENT_TYPES = {
  entrada:         { label: 'Entrada',          sign: +1 },
  devolucion:      { label: 'Devolución',       sign: +1 },
  ajuste_pos:      { label: 'Ajuste (+)',       sign: +1 },
  salida:          { label: 'Salida',           sign: -1 },
  marchado:        { label: 'Marchado',         sign: -1 },
  consumo_interno: { label: 'Consumo interno',  sign: -1 },
  cortesia:        { label: 'Cortesía',         sign: -1 },
  danado:          { label: 'Dañado',           sign: -1 },
  vencido:         { label: 'Vencido',          sign: -1 },
  perdida:         { label: 'Pérdida',          sign: -1 },
  ajuste_neg:      { label: 'Ajuste (−)',       sign: -1 },
};

/* ---------------------------------------------------------------- texto */
export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s.,/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function singular(w) {
  if (w.length <= 3) return w;
  if (/ces$/.test(w)) return w.slice(0, -3) + 'z';      // luces -> luz
  if (/(a|e|i|o|u)s$/.test(w)) return w.slice(0, -1);   // cervezas -> cerveza
  if (/(r|l|n|d|j)es$/.test(w)) return w.slice(0, -2);  // limones -> limon
  return w;
}

const NUMBER_WORDS = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20,
  treinta: 30, cuarenta: 40, cincuenta: 50, media: 0.5, medio: 0.5,
  docena: 12, par: 2,
};

/* Verbos → tipo de movimiento (orden = prioridad) */
const VERB_RULES = [
  { re: /\b(cortesia|regal(o|ar|ado)|invita(r|cion))\b/, type: 'cortesia', w: 0.95 },
  { re: /\b(se )?(dan(o|aron|ado|ados|ada|adas)|romp(io|ieron)|rot[oa]s?|quebr(o|aron|ado|ados)|partio)\b/, type: 'danado', w: 0.95 },
  { re: /\b(venci(o|eron|do|dos|da|das)|caduc(o|aron|ado))\b/, type: 'vencido', w: 0.95 },
  { re: /\b(perd(io|ieron|ida|ido)|extravi(o|aron|ado|ados)|falta(n)?|robar?on|no aparece(n)?)\b/, type: 'perdida', w: 0.9 },
  { re: /\b(devol(vio|vieron|ver|ucion)|regres(o|aron|ar))\b/, type: 'devolucion', w: 0.9 },
  { re: /\b(lleg(o|aron)|recibi(mos|o|eron)?|compr(e|amos|aron|o)|ingres(o|aron|ar)|entr(o|aron)|surtir)\b/, type: 'entrada', w: 0.9 },
  { re: /\b(utiliz(o|aron|ar|amos)|us(o|aron|ar|amos)|se usaron|consum(io|ieron|ir|imos)|gast(o|aron|amos))\b/, type: 'consumo_interno', w: 0.9 },
  { re: /\b(march(a|ar|ame|en|o|aron|ado|ados)|envi(a|ar|o|aron|en)|entreg(a|ar|o|aron|ue|uen)|sac(a|ar|o|aron|amos)|despach(a|ar|o|aron)|llev(a|ar|o|aron)|baj(a|ar|o|aron)|retir(a|ar|o|aron)|pas(a|ar|o|aron))\b/, type: 'marchado', w: 0.92 },
];

const AREA_RULES = [
  { re: /\bhabitacion(?:es)? ?(\d{1,4})\b/, area: (m) => `Habitación ${m[1]}` },
  { re: /\bhab\.? ?(\d{1,4})\b/, area: (m) => `Habitación ${m[1]}` },
  { re: /\bdorm(?:itorio)? ?(\d{1,3})\b/, area: (m) => `Dormitorio ${m[1]}` },
  { re: /\b(cocina)\b/, area: () => 'Cocina' },
  { re: /\b(bar|barra)\b/, area: () => 'Bar' },
  { re: /\b(limpieza|aseo|housekeeping)\b/, area: () => 'Limpieza' },
  { re: /\b(recepcion)\b/, area: () => 'Recepción' },
  { re: /\b(lavanderia)\b/, area: () => 'Lavandería' },
  { re: /\b(piscina|terraza|rooftop)\b/, area: (m) => m[1][0].toUpperCase() + m[1].slice(1) },
  { re: /\b(mantenimiento)\b/, area: () => 'Mantenimiento' },
];

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'a', 'al', 'en', 'con', 'por', 'se', 'y', 'e', 'que', 'mas', 'porfa', 'favor', 'por favor', 'unidad', 'unidades', 'und', 'un', 'una', 'uno']);

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function wordSim(a, b) {
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.9;
  const d = levenshtein(a, b);
  return Math.max(0, 1 - d / Math.max(a.length, b.length));
}
// medidas que aparecen en el nombre ("600 ml", "2 kg") y no ayudan a identificar el producto
const SIZE = new Set(['ml', 'g', 'gr', 'kg', 'l', 'lt', 'oz', 'cm', 'mm', 'm', 'x', 'aa', 'aaa']);
function tokens(s) {
  return normalize(s).split(' ').filter((w) => w && !STOP.has(w) && !SIZE.has(w) && !/^\d+([.,]\d+)?$/.test(w)).map(singular);
}

/**
 * Busca el producto del catálogo que mejor coincide con un fragmento de texto.
 * Usa nombre + alias. Devuelve { product, score } o null.
 */
export function matchProduct(fragment, catalog) {
  const ft = tokens(fragment);
  if (!ft.length) return null;
  let best = null;
  for (const p of catalog) {
    if (p.status === 'inactivo') continue;
    const names = [p.name, ...(p.aliases || [])];
    for (const nm of names) {
      const pt = tokens(nm);
      if (!pt.length) continue;
      // cobertura: qué tanto del nombre del producto aparece en el fragmento
      let sum = 0;
      for (const t of pt) sum += Math.max(...ft.map((f) => wordSim(f, t)));
      const coverage = sum / pt.length;
      // precisión: qué tanto del fragmento corresponde al producto
      let sum2 = 0;
      for (const f of ft) sum2 += Math.max(...pt.map((t) => wordSim(f, t)));
      const precision = sum2 / ft.length;
      const score = 0.7 * coverage + 0.3 * precision;
      if (!best || score > best.score) best = { product: p, score };
    }
  }
  return best && best.score >= 0.55 ? best : null;
}

function readQty(frag) {
  const m = frag.match(/(\d+(?:[.,]\d+)?)/);
  if (m) return { qty: parseFloat(m[1].replace(',', '.')), certain: true, rest: frag.replace(m[0], ' ') };
  const words = frag.split(' ');
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w in NUMBER_WORDS) {
      let q = NUMBER_WORDS[w];
      if ((w === 'docena' || w === 'par') && i > 0 && words[i - 1] in NUMBER_WORDS) continue;
      if (w === 'media' && words[i + 1] === 'docena') { q = 6; words.splice(i + 1, 1); }
      else if (i + 1 < words.length && (words[i + 1] === 'docena' || words[i + 1] === 'docenas')) { q *= 12; words.splice(i + 1, 1); }
      else if (i + 1 < words.length && (words[i + 1] === 'par' || words[i + 1] === 'pares')) { q *= 2; words.splice(i + 1, 1); }
      words.splice(i, 1);
      return { qty: q, certain: true, rest: words.join(' ') };
    }
  }
  return { qty: 1, certain: false, rest: frag };
}

const UNIT_RULES = [
  [/\b(kilo|kilos|kg|kgs)\b/, 'kg'], [/\b(gramo|gramos|gr|g)\b/, 'g'],
  [/\b(litro|litros|lt|l)\b/, 'L'], [/\b(ml)\b/, 'ml'],
  [/\b(caja|cajas)\b/, 'caja'], [/\b(paquete|paquetes|paq)\b/, 'paquete'],
  [/\b(bolsa|bolsas)\b/, 'bolsa'], [/\b(botella|botellas)\b/, 'botella'],
  [/\b(lata|latas)\b/, 'lata'], [/\b(rollo|rollos)\b/, 'rollo'],
];

/**
 * Interpreta una instrucción de operación en lenguaje natural.
 * @param {string} text   Mensaje original
 * @param {Array} catalog Productos [{id,name,aliases,unit,status}]
 * @returns {{type, typeConfidence, area, items:[{productId, productName, rawText, qty, unit, confidence, matched}], confidence}}
 */
export function parseInstruction(text, catalog) {
  const n = normalize(text);
  let type = null, tw = 0.6;
  for (const r of VERB_RULES) { if (r.re.test(n)) { type = r.type; tw = r.w; break; } }
  if (!type) { type = 'marchado'; tw = 0.6; } // por defecto en el hostel "marchar"

  let area = null;
  for (const r of AREA_RULES) { const m = n.match(r.re); if (m) { area = r.area(m); break; } }

  // quitar verbos y destino para aislar la lista de productos
  let body = n;
  for (const r of VERB_RULES) body = body.replace(r.re, ' ');
  body = body
    .replace(/\b(a|para|en|hacia) (la |el )?(habitacion(es)?|hab\.?|dorm(itorio)?) ?\d{1,4}\b/g, ' ')
    .replace(/\b(habitacion(es)?|hab\.?) ?\d{1,4}\b/g, ' ')
    .replace(/\b(para|en|a|al|del|de la) (la |el )?(cocina|bar|barra|limpieza|aseo|recepcion|lavanderia|piscina|terraza|rooftop|mantenimiento)\b/g, ' ')
    .replace(/\bcomo\b/g, ' ')
    .replace(/\bse\b/g, ' ');

  const parts = body.split(/,|;|\by\b|\be\b|\+|\n|\bmas\b/).map((s) => s.trim()).filter(Boolean);
  const items = [];
  for (const part of parts) {
    const { qty, certain, rest } = readQty(part);
    let unit = null;
    for (const [re, u] of UNIT_RULES) if (re.test(rest)) { unit = u; break; }
    const m = matchProduct(rest, catalog);
    if (!m && !tokens(rest).length) continue;
    const qtyConf = certain ? 1 : 0.7;
    const conf = m ? Math.min(1, m.score) * qtyConf * tw : 0.3 * qtyConf * tw;
    items.push({
      productId: m ? m.product.id : null,
      productName: m ? m.product.name : null,
      rawText: part,
      qty,
      unit: unit || (m ? m.product.unit : 'unidad'),
      confidence: Math.round(conf * 100) / 100,
      matched: !!m,
    });
  }
  const confidence = items.length ? Math.min(...items.map((i) => i.confidence)) : 0;
  return { type, typeConfidence: tw, area, items, confidence };
}

/* ------------------------------------------------- deduplicación */
function dayKey(ts) { return new Date(ts).toISOString().slice(0, 10); }

/** Huella estable de un movimiento: producto + tipo + cantidad + día (+ factura) */
export function fingerprint(m) {
  const base = [m.productId, m.type, Number(m.qty).toFixed(3), dayKey(m.ts), (m.invoice || '').toUpperCase().replace(/\s/g, '')].join('|');
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < base.length; i++) { h ^= base.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Detecta posibles duplicados entre fuentes (WhatsApp, foto, factura, Sheets, manual).
 * Dos movimientos son candidatos si: mismo producto, mismo signo, misma cantidad,
 * y diferencia de tiempo <= windowHours; o misma factura y mismo producto.
 * Devuelve [{a, b, reason, score}]
 */
export function findDuplicates(candidate, existing, windowHours = 12) {
  const out = [];
  const sc = MOVEMENT_TYPES[candidate.type]?.sign;
  for (const e of existing) {
    if (e.id === candidate.id || e.status === 'anulado' || e.status === 'rechazado') continue;
    if (e.productId !== candidate.productId) continue;
    if (MOVEMENT_TYPES[e.type]?.sign !== sc) continue;
    const dt = Math.abs(new Date(e.ts) - new Date(candidate.ts)) / 36e5;
    if (candidate.invoice && e.invoice && candidate.invoice.toUpperCase() === e.invoice.toUpperCase()) {
      out.push({ a: candidate, b: e, reason: 'Misma factura y producto', score: 0.98 }); continue;
    }
    if (Number(e.qty) === Number(candidate.qty) && dt <= windowHours) {
      const crossSource = e.source !== candidate.source;
      // misma fuente y < 1 h: casi seguro un reenvío; distinta fuente: el mismo hecho reportado dos veces
      const base = crossSource ? 0.93 : dt <= 1 ? 0.92 : 0.75;
      const score = base - dt / (windowHours * 10);
      out.push({ a: candidate, b: e, reason: crossSource ? `Mismo movimiento desde ${e.source}` : 'Movimiento repetido en la misma fuente', score: Math.round(score * 100) / 100 });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/* ------------------------------------------------- costo promedio */
export function weightedAvgCost(stock, avgCost, qtyIn, unitCost) {
  const s = Math.max(0, stock);
  if (s + qtyIn <= 0) return unitCost;
  return (s * avgCost + qtyIn * unitCost) / (s + qtyIn);
}

/* ------------------------------------------------- conciliación */
/**
 * Inventario teórico = inicial + entradas aprobadas + devoluciones
 *   − salidas − marchados − daños − vencimientos − pérdidas (± ajustes)
 * Solo cuentan movimientos con status 'aprobado'.
 */
export function theoreticalStock(product, movements, untilTs = null) {
  const b = { inicial: Number(product.stockInit) || 0, entradas: 0, devoluciones: 0, salidas: 0, marchados: 0, consumos: 0, cortesias: 0, danos: 0, vencidos: 0, perdidas: 0, ajustes: 0 };
  for (const m of movements) {
    if (m.productId !== product.id || m.status !== 'aprobado') continue;
    if (untilTs && new Date(m.ts) > new Date(untilTs)) continue;
    const q = Number(m.qty) || 0;
    switch (m.type) {
      case 'entrada': b.entradas += q; break;
      case 'devolucion': b.devoluciones += q; break;
      case 'salida': b.salidas += q; break;
      case 'marchado': b.marchados += q; break;
      case 'consumo_interno': b.consumos += q; break;
      case 'cortesia': b.cortesias += q; break;
      case 'danado': b.danos += q; break;
      case 'vencido': b.vencidos += q; break;
      case 'perdida': b.perdidas += q; break;
      case 'ajuste_pos': b.ajustes += q; break;
      case 'ajuste_neg': b.ajustes -= q; break;
    }
  }
  b.teorico = b.inicial + b.entradas + b.devoluciones + b.ajustes - b.salidas - b.marchados - b.consumos - b.cortesias - b.danos - b.vencidos - b.perdidas;
  return b;
}

export const RECON_STATUS = {
  coincide: 'Coincide',
  menor: 'Diferencia menor',
  importante: 'Diferencia importante',
  duplicado: 'Movimiento duplicado',
  sin_respaldo: 'Movimiento sin respaldo',
  no_registrado: 'Producto no registrado',
  sin_conteo: 'Sin conteo físico',
};

/**
 * Concilia todo el catálogo.
 * @param {object} p { products, movements, counts:[{productId, qty, ts}], unmatched:[{rawText, source}], minorPct=0.05, minorAbs=1 }
 * @returns {rows, totals}
 */
export function reconcile({ products, movements, counts, unmatched = [], minorPct = 0.05, minorAbs = 1 }) {
  const rows = [];
  const lastCount = {};
  for (const c of counts) if (!lastCount[c.productId] || new Date(c.ts) > new Date(lastCount[c.productId].ts)) lastCount[c.productId] = c;

  for (const p of products) {
    if (p.status === 'inactivo') continue;
    const count = lastCount[p.id];
    const t = theoreticalStock(p, movements, count ? count.ts : null);
    const pm = movements.filter((m) => m.productId === p.id && m.status === 'aprobado');
    const dups = [];
    for (let i = 0; i < pm.length; i++) {
      const d = findDuplicates(pm[i], pm.slice(i + 1), 6);
      if (d.length && d[0].score >= 0.8) dups.push(d[0]);
    }
    // sin respaldo: reportes informales (WhatsApp) aprobados sin evidencia ni fila de hoja que los soporte
    const noBacking = pm.filter((m) => !m.evidence && !m.importRef && !m.importRowId && String(m.source).startsWith('whatsapp'));
    const physical = count ? Number(count.qty) : null;
    const diff = physical === null ? null : physical - t.teorico;
    const value = diff === null ? 0 : diff * (Number(p.avgCost) || 0);
    let status;
    if (physical === null) status = 'sin_conteo';
    else if (dups.length && diff !== 0) status = 'duplicado';
    else if (diff === 0) status = 'coincide';
    else if (noBacking.length && Math.abs(diff) > minorAbs) status = 'sin_respaldo';
    else if (Math.abs(diff) <= Math.max(minorAbs, Math.abs(t.teorico) * minorPct)) status = 'menor';
    else status = 'importante';
    rows.push({ productId: p.id, name: p.name, category: p.category, unit: p.unit, ...t, fisico: physical, diferencia: diff, valor: Math.round(value), status, duplicates: dups, sinRespaldo: noBacking.length, countTs: count?.ts || null });
  }
  for (const u of unmatched) {
    rows.push({ productId: null, name: u.rawText, category: '—', unit: '—', teorico: null, fisico: null, diferencia: null, valor: 0, status: 'no_registrado', source: u.source });
  }
  const totals = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    if (r.valor < 0) acc.perdida += -r.valor; else acc.sobrante += r.valor;
    return acc;
  }, { perdida: 0, sobrante: 0 });
  return { rows, totals };
}
