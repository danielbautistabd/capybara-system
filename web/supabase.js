
/* ---------------- Supabase (datos en la nube) ----------------
   Toda la lógica de inventario sigue corriendo en el navegador. Cada colección del estado
   (productos, movimientos, compras…) se guarda fila por fila en la tabla public.cc_records,
   y los cambios de otros usuarios llegan en vivo por Realtime. */
const CLOUD_TABLE = 'cc_records';
// Proyecto de Supabase de Capybara Hostel. La clave anon es pública por diseño: sin sesión no da acceso a nada (RLS).
const CLOUD_DEFAULT = { url: 'https://ghedaeyshfvlvvkafbyd.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZWRhZXlzaGZ2bHZ2a2FmYnlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNjgzNDYsImV4cCI6MjEwOTg0NDM0Nn0.Db2V1P6GXUgODYMFBi7ymclDdzGGuMPST1KuIptq4jM' };
const CLOUD_SKIP = new Set(['settings']);
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((kk) => [kk, v[kk]])) : v));
const isRecordList = (v) => Array.isArray(v) && v.every((x) => x && typeof x === 'object' && typeof x.id === 'string' && x.id);
const cloud = {
  sb: null, sbUrl: '', user: null, ready: false, loading: false, snap: new Map(),
  timer: null, retry: null, busy: false, again: false, chan: null, renderT: null,
  status: 'off', lastSaved: null, lastError: '',
  cfg: () => S.settings.cloud || (S.settings.cloud = { on: false, url: CLOUD_DEFAULT.url, key: CLOUD_DEFAULT.key }),
  on: () => !!(cloud.cfg().on && cloud.sb && cloud.user && cloud.ready),
  client() {
    const c = cloud.cfg();
    if (!window.supabase?.createClient) throw new Error('no cargó la librería de Supabase; revisa la conexión a internet');
    if (!c.url || !c.key) throw new Error('falta la URL del proyecto o la clave anon');
    if (!cloud.sb || cloud.sbUrl !== c.url + '|' + c.key) {
      cloud.sb = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'capybara-control-sb' } });
      cloud.sbUrl = c.url + '|' + c.key;
    }
    return cloud.sb;
  },
  /** Estado → filas. Clave "colección|id"; json = lo que se compara para saber si cambió. */
  rows(state) {
    const out = new Map();
    const lists = [];
    for (const [k, v] of Object.entries(state)) {
      if (CLOUD_SKIP.has(k) || v === undefined || typeof v === 'function') continue;
      if (isRecordList(v)) {
        lists.push(k);
        v.forEach((item, pos) => { const r = { collection: k, id: item.id, pos, data: item }; r.json = canon([pos, item]); out.set(k + '|' + item.id, r); });
      } else {
        const r = { collection: '_state', id: k, pos: 0, data: { v } }; r.json = canon([0, r.data]); out.set('_state|' + k, r);
      }
    }
    const shape = { collection: '_shape', id: 'lists', pos: 0, data: { lists: lists.sort() } }; shape.json = canon([0, shape.data]); out.set('_shape|lists', shape);
    return out;
  },
  takeSnapshot() { cloud.snap = new Map([...cloud.rows(S)].map(([k, r]) => [k, r.json])); },
  setStatus(st, err = '') {
    cloud.status = st; cloud.lastError = err;
    if (st === 'ok') cloud.lastSaved = new Date();
    const el = $('#cloud-st'); if (el) el.innerHTML = cloud.statusHtml();
    const ov = $('#cloud-ov'); if (ov) ov.hidden = !cloud.loading;
  },
  statusHtml() {
    const t = cloud.lastSaved ? cloud.lastSaved.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
    return ({ off: pill('Sin conectar', 'p-mut'), loading: pill('Cargando…', 'p-info'), saving: pill('Guardando…', 'p-info'), ok: pill(t ? 'Guardado ' + t : 'Al día', 'p-ok'), error: pill('Sin guardar', 'p-bad') })[cloud.status] || '';
  },
  queue(delay = 700) { if (!cloud.on()) return; clearTimeout(cloud.timer); cloud.timer = setTimeout(cloud.flush, delay); },
  async flush() {
    if (!cloud.on()) return;
    if (cloud.busy) { cloud.again = true; return; }
    cloud.busy = true; clearTimeout(cloud.retry);
    const sb = cloud.sb;
    try {
      const cur = cloud.rows(S);
      const up = [...cur.values()].filter((r) => cloud.snap.get(r.collection + '|' + r.id) !== r.json);
      const gone = [...cloud.snap.keys()].filter((k) => !cur.has(k));
      if (!up.length && !gone.length) { if (cloud.status !== 'ok') cloud.setStatus('ok'); return; }
      cloud.setStatus('saving');
      for (let i = 0; i < up.length; i += 400) {
        const { error } = await sb.from(CLOUD_TABLE).upsert(up.slice(i, i + 400).map(({ collection, id, pos, data }) => ({ collection, id, pos, data })), { onConflict: 'collection,id' });
        if (error) throw error;
      }
      const byCol = {};
      gone.forEach((k) => { const j = k.indexOf('|'); (byCol[k.slice(0, j)] ||= []).push(k.slice(j + 1)); });
      for (const [col, ids] of Object.entries(byCol)) for (let i = 0; i < ids.length; i += 200) {
        const { error } = await sb.from(CLOUD_TABLE).delete().eq('collection', col).in('id', ids.slice(i, i + 200));
        if (error) throw error;
      }
      up.forEach((r) => cloud.snap.set(r.collection + '|' + r.id, r.json));
      gone.forEach((k) => cloud.snap.delete(k));
      cloud.setStatus('ok');
    } catch (e) {
      cloud.setStatus('error', e.message);
      toast('No se guardó en Supabase: ' + e.message + '. Se reintentará en 15 s.');
      cloud.retry = setTimeout(cloud.flush, 15000);
    } finally {
      cloud.busy = false;
      if (cloud.again) { cloud.again = false; cloud.queue(100); }
    }
  },
  /** Lee todo de Supabase. Devuelve false si la tabla está vacía. */
  async fetchAll() {
    const sb = cloud.client(), all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(CLOUD_TABLE).select('collection,id,pos,data').order('collection').order('id').range(from, from + 999);
      if (error) throw error;
      all.push(...data);
      if (data.length < 1000) break;
    }
    return all;
  },
  async load() {
    cloud.loading = true; cloud.setStatus('loading');
    try {
      const all = await cloud.fetchAll();
      if (!all.length) return false;
      const st = {}, lists = {};
      let shape = [];
      for (const r of all) {
        if (r.collection === '_shape') shape = r.data?.lists || [];
        else if (r.collection === '_state') st[r.id] = r.data?.v;
        else (lists[r.collection] ||= []).push(r);
      }
      shape.forEach((k) => (st[k] = []));
      for (const [k, arr] of Object.entries(lists)) st[k] = arr.sort((a, b) => a.pos - b.pos).map((r) => r.data);
      const settings = S.settings;
      S = st; S.settings = settings;
      cloud.takeSnapshot();
      upgradeState();
      cloud.identify();
      cloud.ready = true;
      cloud.setStatus('ok');
      cloud.queue(); // sube lo que upgradeState haya completado
      return true;
    } finally { cloud.loading = false; cloud.setStatus(cloud.status); }
  },
  subscribe() {
    if (cloud.chan) cloud.sb.removeChannel(cloud.chan);
    cloud.chan = cloud.sb.channel('cc-records')
      .on('postgres_changes', { event: '*', schema: 'public', table: CLOUD_TABLE }, (p) => cloud.applyRemote(p))
      .subscribe();
  },
  applyRemote(p) {
    if (!cloud.ready) return;
    const row = p.eventType === 'DELETE' ? p.old : p.new;
    if (!row?.collection || row.collection === '_shape') return;
    const key = row.collection + '|' + row.id;
    if (p.eventType === 'DELETE') {
      if (!cloud.snap.has(key)) return;
      cloud.snap.delete(key);
      if (row.collection === '_state') delete S[row.id];
      else if (Array.isArray(S[row.collection])) S[row.collection] = S[row.collection].filter((x) => x.id !== row.id);
    } else {
      const json = canon([row.collection === '_state' ? 0 : row.pos, row.data]);
      if (cloud.snap.get(key) === json) return; // eco de un cambio propio
      if (row.collection === '_state') S[row.id] = row.data?.v;
      else {
        const arr = Array.isArray(S[row.collection]) ? S[row.collection] : (S[row.collection] = []);
        const i = arr.findIndex((x) => x.id === row.id);
        if (i >= 0) arr[i] = row.data; else arr.splice(Math.min(row.pos ?? arr.length, arr.length), 0, row.data);
      }
      cloud.snap.set(key, json);
    }
    cloud.renderSoon();
  },
  renderSoon() {
    clearTimeout(cloud.renderT);
    cloud.renderT = setTimeout(() => { if ($('#modal') || document.activeElement?.matches?.('input,textarea,select')) { cloud.renderSoon(); return; } render(); }, 800);
  },
  async login(email, password) {
    const sb = cloud.client();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'correo o contraseña incorrectos' : error.message);
    cloud.user = data.user;
    return data.user;
  },
  /** Conecta: sesión → carga → (si está vacía) pregunta con qué datos empezar. */
  async connect() {
    const had = await cloud.load();
    if (!had) {
      const how = await cloud.choose({
        title: 'La base de datos está vacía',
        text: `Elige con qué empezar. <b>Catálogo del hostel</b>: ${S.products.length} productos y ${S.suppliers.length} proveedores del inventario transcrito, sin movimientos, compras, facturas, gastos ni histórico de ventas. <b>Datos de ejemplo</b>: todo lo que ves ahora, útil solo para probar.`,
        options: [{ label: 'Empezar con el catálogo del hostel', value: 'clean', pri: true }, { label: 'Subir los datos de ejemplo', value: 'demo' }],
      });
      if (!how) { cloud.ready = false; throw new Error('no se eligió con qué datos empezar; la conexión quedó pendiente'); }
      if (how === 'clean') cloud.cleanStart();
      cloud.identify(true);
      cloud.snap = new Map(); cloud.ready = true; cloud.setStatus('saving');
      await cloud.flush();
      if (cloud.status !== 'ok') throw new Error(cloud.lastError || 'no se pudieron subir los datos');
    }
    cloud.subscribe();
  },
  /** Deja el catálogo (productos, proveedores, permisos, configuración) y vacía todo lo transaccional y de ejemplo. */
  cleanStart() {
    const settings = S.settings;
    seedState();
    S.settings = settings;
    Object.assign(S, { movements: [], purchases: [], expenses: [], counts: [], audit: [], inbox: [], requests: [], recon: null, lastSync: null, users: [], usersV: 1 });
    S.insights = { ...(S.insights || {}), reports: [] };
    S.sheet = { ...S.sheet, rows: [], imported: {}, history: [], preview: null };
    S.alegra = { ...S.alegra, configured: false, lastSync: null, supplierLinks: {}, items: [], itemLinks: {}, bills: [], log: [] };
    S.billing = { ...S.billing, next: 1, status: {}, lines: [], draftPurchases: [], history: [], historyV: 2 };
    log('sistema.inicio', 'Base de datos iniciada con el catálogo del hostel', cloud.user?.email || 'Sistema');
  },
  /** Asocia la sesión de Supabase con un usuario de Control de acceso. El primero en conectar queda como administrador. */
  identify(first = false) {
    const email = (cloud.user?.email || '').toLowerCase();
    if (!email) return;
    S.users ||= [];
    let u = S.users.find((x) => (x.email || '').toLowerCase() === email);
    if (!u) {
      const nm = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const name = S.users.some((x) => x.name === nm) ? email : nm;
      u = { id: uid('u'), name, email, role: first || !S.users.length ? 'ADMIN' : 'EMPLEADO', area: '', areas: [], phone: '', active: true };
      S.users.push(u);
      log('usuario.alta', `${email} entró por primera vez (${u.role})`, email);
      if (u.role !== 'ADMIN') toast('Entraste como empleado. Un administrador puede cambiar tu rol en Control de acceso.');
    } else if (first && u.role !== 'ADMIN') u.role = 'ADMIN';
    S.settings.user = u.name;
  },
  /** Diálogo con varias opciones; resuelve el valor elegido o null si se cierra. */
  choose({ title, text, options }) {
    return new Promise((res) => {
      let done = false;
      const fin = (v) => { if (done) return; done = true; closeModal(); res(v); };
      const m = modal({ title, body: `<p style="margin:0">${text}</p>`, foot: `<button class="btn ghost" data-close>Cancelar</button>` + options.map((o, i) => `<button class="btn ${o.pri ? 'pri' : ''}" data-ch="${i}">${esc(o.label)}</button>`).join('') });
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-ch]'); if (b) fin(options[+b.dataset.ch].value); });
      new MutationObserver((_, ob) => { if (!document.body.contains(m)) { ob.disconnect(); fin(null); } }).observe(document.body, { childList: true });
    });
  },
  async disconnect() {
    try { if (cloud.chan) await cloud.sb.removeChannel(cloud.chan); await cloud.sb?.auth.signOut(); } catch { /* sin red */ }
    cloud.chan = null; cloud.user = null; cloud.ready = false; cloud.snap = new Map();
    cloud.cfg().on = false;
    const keep = { ...S.settings };
    S = store.get(LS_KEY, null) || seedState(); S.settings = keep; upgradeState();
    cloud.setStatus('off'); save(); render();
  },
  /** Al abrir la página: si estaba conectada y la sesión sigue viva, carga desde Supabase. */
  async boot() {
    if (!cloud.cfg().on) return;
    cloud.loading = true; cloud.setStatus('loading');
    try {
      const sb = cloud.client();
      const { data } = await sb.auth.getSession();
      if (!data.session) { cloud.loading = false; cloud.setStatus('off'); toast('Tu sesión de Supabase terminó. Inicia sesión en Integraciones.'); return; }
      cloud.user = data.session.user;
      await cloud.connect();
      render();
    } catch (e) {
      cloud.loading = false; cloud.ready = false; cloud.setStatus('error', e.message);
      toast('No se pudo cargar desde Supabase: ' + e.message);
      render();
    }
  },
};
