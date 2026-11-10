
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
  /** Conecta: sesión → carga → (si está vacía) ofrece subir los datos actuales. */
  async connect() {
    const had = await cloud.load();
    if (!had) {
      const up = await ask({ title: 'La base de datos está vacía', text: 'Puedes subir los datos que ves ahora en esta página como punto de partida. Después podrás editarlos o borrarlos desde la app.', label: 'Subir datos actuales' });
      if (!up) { cloud.ready = false; throw new Error('no se subieron datos; la conexión quedó pendiente'); }
      cloud.snap = new Map(); cloud.ready = true; cloud.setStatus('saving');
      await cloud.flush();
      if (cloud.status !== 'ok') throw new Error(cloud.lastError || 'no se pudieron subir los datos');
    }
    cloud.subscribe();
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
