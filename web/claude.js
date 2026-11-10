
/* ---------------- Datos en Claude (página publicada en claude.ai) ----------------
   Dentro de claude.ai la página no puede llamar a servidores externos, así que guarda en la base
   de datos del propio artefacto (capacidad `db`) y reconoce a cada persona con la capacidad `user`.
   Modelo:
     ccs/<clave>             estado general (configuración, conciliación, facturación sin líneas…)
     ccl_<lista>/b<NN>       registros de cada lista repartidos en "cubetas" { items: { id: json } }
     cca_s/<clave>           estado de administración (permisos por rol)   · solo Editores escriben
     cca_users/b<NN>         usuarios de Control de acceso                   · solo Editores escriben
     ccj/<id de la persona>  solicitud de ingreso de cada persona (la escribe ella misma)
   Las reglas de acceso van en el manifiesto de la publicación (ver supabase/../README). */
const CL_ADMIN = new Set(['users', 'rolePerms', 'permsV', 'usersV']);
const CL_NESTED = { billing: ['lines'] };
const CL_BUCKETS = { movements: 32, 'billing.lines': 32, counts: 16, audit: 8, inbox: 8, purchases: 8, expenses: 8, requests: 4 };
const clHash = (s, n) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) % n; };
const clErr = (e) => (e && e.code === 'quota_exceeded' ? 'la base de datos de Claude está llena' : e && e.code === 'invalid_argument' ? 'no tienes permiso para guardar este cambio' : (e && (e.message || e.code)) || 'error desconocido');
const cl = {
  active: false, db: null, user: null, myId: null, meInfo: null, owner: false, admin: false, write: true,
  ready: false, loading: false, snap: new Map(), seq: new Map(), known: new Set(), shape: { lists: {} },
  timer: null, busy: false, again: false, unsubs: [], renderT: null, status: 'off', lastSaved: null, joined: false,
  on: () => cl.active && cl.ready,
  /* ---- listas y su ubicación ---- */
  listKeys(state) {
    const out = [];
    for (const [k, v] of Object.entries(state)) if (k !== 'settings' && isRecordList(v)) out.push(k);
    for (const [k, subs] of Object.entries(CL_NESTED)) for (const sub of subs) if (state[k] && isRecordList(state[k][sub])) out.push(k + '.' + sub);
    return out;
  },
  getList: (k, st = S) => (k.includes('.') ? st[k.split('.')[0]]?.[k.split('.')[1]] : st[k]),
  setList(k, arr, st = S) { if (k.includes('.')) { const [a, b] = k.split('.'); (st[a] ||= {})[b] = arr; } else st[k] = arr; },
  coll: (k) => (CL_ADMIN.has(k) ? 'cca_' : 'ccl_') + k,
  buckets(k, n) { return (cl.shape.lists[k] ||= { b: CL_BUCKETS[k] || Math.max(1, Math.min(64, 2 ** Math.ceil(Math.log2(n / 200 + 1)))) }).b; },
  docPath: (k, id) => cl.coll(k) + '/b' + String(clHash(id, cl.buckets(k, 0))).padStart(2, '0'),
  stateDoc: (k) => (CL_ADMIN.has(k) ? 'cca_s/' : 'ccs/') + k,
  stateVal(k, v) { if (!CL_NESTED[k] || !v || typeof v !== 'object') return v; const o = { ...v }; for (const sub of CL_NESTED[k]) if (isRecordList(o[sub])) delete o[sub]; return o; },
  /** Estado → unidades guardables. Clave "L|lista|id" o "S|clave". */
  units(state) {
    const out = new Map();
    const lists = cl.listKeys(state);
    for (const k of lists) {
      const arr = cl.getList(k, state);
      cl.buckets(k, arr.length);
      let min = Infinity, max = -Infinity;
      for (const it of arr) { const s = cl.seq.get(k + '|' + it.id); if (s != null) { if (s < min) min = s; if (s > max) max = s; } }
      if (min === Infinity) { min = 0; max = -1; }
      arr.forEach((it, i) => {
        const sk = k + '|' + it.id;
        if (!cl.seq.has(sk)) { const s = i === 0 && arr.length > 1 && max >= min ? --min : ++max; cl.seq.set(sk, s); }
        out.set('L|' + sk, { list: k, id: it.id, path: cl.docPath(k, it.id), json: canon([cl.seq.get(sk), it]) });
      });
    }
    for (const [k, v] of Object.entries(state)) {
      if (k === 'settings' || lists.includes(k) || v === undefined || typeof v === 'function') continue;
      out.set('S|' + k, { key: k, path: cl.stateDoc(k), json: canon(cl.stateVal(k, v)) });
    }
    return out;
  },
  canWriteUnit: (u) => cl.write && (cl.admin || !(CL_ADMIN.has(u.list || u.key))),
  /* ---- estado de guardado ---- */
  setStatus(st) {
    cl.status = st; if (st === 'ok') cl.lastSaved = new Date();
    const el = $('#cloud-st'); if (el) el.innerHTML = cl.statusHtml();
    const ov = $('#cloud-ov'); if (ov) ov.hidden = !cl.loading;
  },
  statusHtml() {
    const t = cl.lastSaved ? cl.lastSaved.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
    return ({ off: pill('Sin datos', 'p-mut'), loading: pill('Cargando…', 'p-info'), saving: pill('Guardando…', 'p-info'), ok: pill(t ? 'Guardado ' + t : 'Al día', 'p-ok'), error: pill('Sin guardar', 'p-bad'), readonly: pill('Solo lectura', 'p-warn') })[cl.status] || '';
  },
  queue(delay = 700) { if (!cl.on()) return; clearTimeout(cl.timer); cl.timer = setTimeout(cl.flush, delay); },
  async flush() {
    if (!cl.on() || !cl.write) return;
    if (cl.busy) { cl.again = true; return; }
    cl.busy = true;
    try {
      const cur = cl.units(S);
      const docs = new Map(); // path → { items } | { state }
      for (const [key, u] of cur) {
        if (cl.snap.get(key) === u.json || !cl.canWriteUnit(u)) continue;
        if (u.list) ((docs.get(u.path) || docs.set(u.path, { items: {}, keys: [] }).get(u.path)).items[u.id] = u.json, docs.get(u.path).keys.push([key, u.json]));
        else docs.set(u.path, { state: u.json, keys: [[key, u.json]] });
      }
      for (const key of cl.snap.keys()) {
        if (cur.has(key) || !key.startsWith('L|')) continue;
        const [, list, ...rest] = key.split('|'); const id = rest.join('|');
        if (!cl.canWriteUnit({ list })) continue;
        const path = cl.docPath(list, id);
        (docs.get(path) || docs.set(path, { items: {}, keys: [] }).get(path)).items[id] = null;
        docs.get(path).keys.push([key, null]);
      }
      const shapeJson = canon(cl.shape);
      if (cl.snap.get('shape') !== shapeJson) docs.set('ccs/_shape', { raw: { shape: shapeJson }, keys: [['shape', shapeJson]] });
      if (!docs.size) { if (cl.status !== 'ok') cl.setStatus('ok'); return; }
      cl.setStatus('saving');
      for (const [path, d] of docs) {
        const ref = cl.db.doc(path);
        if (d.items) {
          if (cl.known.has(path)) await ref.update({ items: d.items });
          else { try { await ref.update({ items: d.items }); } catch (e) { if (e?.code !== 'invalid_argument') throw e; await ref.set({ items: d.items }); } cl.known.add(path); }
        } else if (d.raw) await ref.set(d.raw);
        else await ref.set({ v: d.state });
        for (const [key, json] of d.keys) { if (json === null) { cl.snap.delete(key); } else cl.snap.set(key, json); }
      }
      cl.setStatus('ok');
    } catch (e) {
      cl.setStatus('error');
      toast('No se guardó en Claude: ' + clErr(e) + (e?.code === 'unavailable' || e?.code === 'resource_exhausted' ? '. Se reintentará en 15 s.' : '.'));
      if (e?.code === 'unavailable' || e?.code === 'resource_exhausted') setTimeout(cl.flush, 15000);
    } finally {
      cl.busy = false;
      if (cl.again) { cl.again = false; cl.queue(100); }
    }
  },
  /* ---- lectura ---- */
  async readColl(path) { const q = await cl.db.collection(path).get(); return q.docs.filter((d) => d.exists).map((d) => ({ id: d.id, data: d.data() })); },
  /** Lee todo. Devuelve false si la base está vacía. */
  async load() {
    const [ccs, ccas] = await Promise.all([cl.readColl('ccs'), cl.readColl('cca_s')]);
    const shapeDoc = ccs.find((d) => d.id === '_shape');
    if (!shapeDoc) return false;
    cl.shape = JSON.parse(shapeDoc.data.shape || '{"lists":{}}'); cl.shape.lists ||= {};
    const st = {}; cl.snap = new Map(); cl.seq = new Map(); cl.known = new Set();
    cl.snap.set('shape', canon(cl.shape));
    for (const d of [...ccs, ...ccas]) if (d.id !== '_shape' && typeof d.data.v === 'string') st[d.id] = JSON.parse(d.data.v);
    const lists = Object.keys(cl.shape.lists);
    const got = await Promise.all(lists.map((k) => cl.readColl(cl.coll(k))));
    lists.forEach((k, i) => {
      const rows = [];
      for (const d of got[i]) {
        cl.known.add(cl.coll(k) + '/' + d.id);
        for (const [id, json] of Object.entries(d.data.items || {})) if (typeof json === 'string') { const [s, rec] = JSON.parse(json); rows.push([s, rec]); cl.seq.set(k + '|' + id, s); }
      }
      rows.sort((a, b) => a[0] - b[0]);
      cl.setList(k, rows.map((r) => r[1]), st);
    });
    const settings = S.settings;
    S = st; S.settings = settings;
    for (const [key, u] of cl.units(S)) cl.snap.set(key, u.json);
    upgradeState();
    return true;
  },
  /* ---- cambios de otras personas ---- */
  subscribe() {
    cl.unsubs.forEach((u) => u()); cl.unsubs = [];
    const onErr = (e) => { if (e?.code === 'revoked') { cl.write = false; cl.setStatus('readonly'); } };
    const watchState = (coll) => cl.unsubs.push(cl.db.collection(coll).onSnapshot((q) => {
      let changed = false;
      for (const ch of q.docChanges()) {
        const d = ch.doc, k = d.id;
        if (k === '_shape') { if (ch.type !== 'removed') { const sh = JSON.parse(d.data().shape || '{}'); for (const [lk, lv] of Object.entries(sh.lists || {})) if (!cl.shape.lists[lk]) { cl.shape.lists[lk] = lv; watchList(lk); } cl.snap.set('shape', canon(cl.shape)); } continue; }
        if (ch.type === 'removed' || typeof d.data().v !== 'string') continue;
        const json = canon(JSON.parse(d.data().v));
        if (cl.snap.get('S|' + k) === json) continue;
        const v = JSON.parse(d.data().v);
        if (CL_NESTED[k] && S[k]) for (const sub of CL_NESTED[k]) if (isRecordList(S[k][sub])) v[sub] = S[k][sub];
        S[k] = v; cl.snap.set('S|' + k, json); changed = true;
      }
      if (changed) cl.renderSoon();
    }, onErr));
    const watched = new Set();
    const watchList = (k) => {
      if (watched.has(k)) return; watched.add(k);
      cl.unsubs.push(cl.db.collection(cl.coll(k)).onSnapshot((q) => {
        let changed = false;
        for (const ch of q.docChanges()) {
          if (ch.type === 'removed') continue;
          cl.known.add(cl.coll(k) + '/' + ch.doc.id);
          for (const [id, json] of Object.entries(ch.doc.data().items || {})) {
            const key = 'L|' + k + '|' + id;
            const arr = cl.getList(k) || (cl.setList(k, []), cl.getList(k));
            if (json === null) {
              if (!cl.snap.has(key)) continue;
              cl.snap.delete(key); cl.seq.delete(k + '|' + id);
              const i = arr.findIndex((x) => x.id === id); if (i >= 0) arr.splice(i, 1);
              changed = true; continue;
            }
            if (cl.snap.get(key) === json) continue;
            const [s, rec] = JSON.parse(json);
            const i = arr.findIndex((x) => x.id === id);
            if (i >= 0) arr[i] = rec;
            else { let at = arr.length; for (let j = 0; j < arr.length; j++) if ((cl.seq.get(k + '|' + arr[j].id) ?? Infinity) > s) { at = j; break; } arr.splice(at, 0, rec); }
            cl.seq.set(k + '|' + id, s); cl.snap.set(key, json); changed = true;
          }
        }
        if (changed) cl.renderSoon();
      }, onErr));
    };
    watchState('ccs'); watchState('cca_s');
    Object.keys(cl.shape.lists).forEach(watchList);
    if (cl.admin) cl.unsubs.push(cl.db.collection('ccj').onSnapshot((q) => { for (const d of q.docs) if (d.exists) cl.admit(d.id, d.data()); }, onErr));
  },
  renderSoon() {
    clearTimeout(cl.renderT);
    cl.renderT = setTimeout(() => { if ($('#modal') || document.activeElement?.matches?.('input,textarea,select')) { cl.renderSoon(); return; } render(); }, 800);
  },
  /* ---- personas y perfiles ---- */
  myUser: () => S.users?.find((u) => u.claudeId && u.claudeId === cl.myId) || cl.byEmail(cl.meInfo?.email),
  /** Usuario creado a mano en Control de acceso (sin cuenta vinculada) con este correo. */
  byEmail: (email) => { const e = String(email || '').trim().toLowerCase(); return e ? S.users?.find((u) => !u.claudeId && (u.email || '').trim().toLowerCase() === e) : undefined; },
  /** Para `me()`: quien no es administrador siempre se ve a sí mismo; quien aún no tiene perfil entra como empleado. */
  meOverride() {
    if (!cl.on() || !cl.myId) return null;
    const u = cl.myUser();
    if (u && u.active !== false && u.role === 'ADMIN') return null;
    if (cl.owner) return u ? { ...u, role: 'ADMIN' } : { id: 'owner', name: cl.meInfo?.name || 'Administrador', role: 'ADMIN', area: '', areas: [] };
    if (u && u.active !== false) return u;
    return { id: 'pendiente', name: cl.meInfo?.name || 'Invitado', role: 'EMPLEADO', area: '', areas: [], pending: true };
  },
  /** Agrega a Control de acceso a quien pidió entrar (solo lo hace la vista de un administrador). */
  admit(claudeId, req) {
    if (!cl.admin || S.users?.some((u) => u.claudeId === claudeId)) return;
    const pre = cl.byEmail(req?.email);
    if (pre) {
      pre.claudeId = claudeId;
      log('usuario.vinculo', `${pre.name} entró con su cuenta de Claude (${ROLES[pre.role]})`, 'Sistema');
      toast(`${pre.name} entró a Capybara Control como ${ROLES[pre.role]}.`);
      save(); cl.renderSoon(); return;
    }
    const base = String(req?.name || '').trim().slice(0, 60) || 'Persona nueva';
    const name = S.users.some((u) => u.name === base) ? `${base} (${S.users.length + 1})` : base;
    S.users.push({ id: uid('u'), claudeId, name, email: String(req?.email || '').slice(0, 120), role: 'EMPLEADO', area: '', areas: [], phone: '', active: true });
    log('usuario.alta', `${name} entró por primera vez (Empleado)`, 'Sistema');
    toast(`${name} entró a Capybara Control como empleado. Asígnale su perfil en Control de acceso.`);
    save(); cl.renderSoon();
  },
  async identify(first = false) {
    const u = cl.myUser();
    if (cl.owner) {
      if (!u) {
        const name = cl.meInfo?.name || 'Administrador';
        S.users.push({ id: uid('u'), claudeId: cl.myId, name: S.users.some((x) => x.name === name) ? name + ' (dueño)' : name, email: cl.meInfo?.email || '', role: 'ADMIN', area: 'Administración', areas: [], phone: '', active: true });
      } else if (u.role !== 'ADMIN') u.role = 'ADMIN';
      S.settings.user = cl.myUser().name;
      return;
    }
    if (u && u.claudeId) { if (u.role === 'ADMIN') S.settings.user ||= u.name; return; }
    if (!cl.joined && cl.write) {
      cl.joined = true;
      try { await cl.db.doc('ccj/' + cl.myId).set({ name: cl.meInfo?.name || '', email: cl.meInfo?.email || '', at: new Date().toISOString() }); } catch { /* sin permiso de escritura */ }
    }
    if (u) return; // creado antes por correo: ya tiene perfil; el administrador vincula la cuenta al abrir
    if (first !== 'silent') toast('Entraste como empleado. El administrador puede asignarte tu perfil en Control de acceso.');
  },
  /** Deja el catálogo y vacía lo transaccional y de ejemplo (igual que en Supabase). */
  cleanStart() { cloud.cleanStart(); S.users = []; },
  /** Copia todo el estado a Supabase (tabla cc_records) con el conector de Supabase del administrador. */
  async backupToSupabase() {
    const mcp = await window.claude.use('mcp').catch(() => null);
    if (!mcp) { toast('Para guardar la copia, conecta el conector de Supabase en claude.ai (Configuración › Conectores).'); return false; }
    const project = (CLOUD_DEFAULT.url.match(/^https:\/\/([a-z0-9]+)\./) || [])[1];
    const rows = [...cloud.rows(S).values()];
    const all = rows.map((r) => JSON.stringify(r.data)).join('');
    let tag = 'cc'; while (all.includes('$' + tag + '$')) tag += 'x';
    const q = (s) => '$' + tag + '$' + s + '$' + tag + '$';
    const sql = (o) => mcp.callTool('Supabase', 'execute_sql', { project_id: project, query: o }, { cache: false });
    try {
      cl.setStatus('saving');
      let batch = [];
      for (let i = 0; i <= rows.length; i++) {
        const r = rows[i];
        if (r) batch.push(`(${q(r.collection)}, ${q(r.id)}, ${r.pos | 0}, ${q(JSON.stringify(r.data))}::jsonb)`);
        if (batch.length && (!r || batch.join(',').length > 90000)) {
          await sql(`insert into public.cc_records (collection, id, pos, data) values ${batch.join(',\n')} on conflict (collection, id) do update set pos = excluded.pos, data = excluded.data;`);
          batch = [];
        }
      }
      const byCol = {};
      for (const r of rows) (byCol[r.collection] ||= []).push(r.id);
      const cols = Object.keys(byCol);
      await sql(`delete from public.cc_records where collection <> all (array[${cols.map(q).join(',')}]::text[]);\n` + cols.map((c) => `delete from public.cc_records where collection = ${q(c)} and id <> all (array[${byCol[c].map(q).join(',')}]::text[]);`).join('\n'));
      cl.setStatus('ok');
      log('supabase.copia', `${rows.length} registros copiados a Supabase`);
      save();
      toast(`Copia guardada en Supabase: ${rows.length} registros.`);
      return true;
    } catch (e) {
      cl.setStatus('ok');
      const m = { consent_required: 'permite el conector de Supabase para esta página', approval_required: 'aprueba la operación cuando Claude lo pida', server_not_connected: 'conecta el conector de Supabase en claude.ai', not_in_manifest: 'esta versión de la página no tiene permiso para usar Supabase' }[e?.code];
      toast('No se guardó la copia en Supabase: ' + (m || e?.message || e?.code || 'error desconocido') + '.');
      return false;
    }
  },
  async boot() {
    if (!window.claude?.use) return;
    let db = null, user = null;
    try { [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]); } catch { /* sin capacidades */ }
    if (!db || !user) return;
    cl.db = db; cl.user = user; cl.active = true; cl.loading = true; cl.setStatus('loading');
    try {
      const [me, canEdit, canWrite] = await Promise.all([user.me(), user.canEdit(), user.can('data.write')]);
      cl.meInfo = me; cl.myId = me.id; cl.owner = !!me.isOwner; cl.admin = cl.owner || !!canEdit; cl.write = canWrite !== false;
      S.settings.cloud = { ...(S.settings.cloud || {}), on: false };
      let had = await cl.load();
      if (!had) {
        if (!cl.admin) { cl.loading = false; cl.active = false; cl.setStatus('off'); toast('El administrador todavía no ha iniciado los datos de Capybara Control. Se muestran datos de ejemplo.'); render(); return; }
        cl.loading = false; cl.setStatus('off');
        const how = await cloud.choose({
          title: 'Iniciar Capybara Control',
          text: `Los datos se guardarán en Claude y los verá todo el equipo con quien compartas esta página. <b>Catálogo del hostel</b>: ${S.products.length} productos y ${S.suppliers.length} proveedores del inventario transcrito, sin movimientos, compras, facturas, gastos ni histórico de ventas. <b>Datos de ejemplo</b>: todo lo que ves ahora, útil solo para probar.`,
          options: [{ label: 'Empezar con el catálogo del hostel', value: 'clean', pri: true }, { label: 'Usar datos de ejemplo', value: 'demo' }],
        });
        if (!how) { cl.active = false; toast('No se iniciaron los datos. Recarga la página cuando quieras empezar.'); render(); return; }
        cl.loading = true; cl.setStatus('saving');
        if (how === 'clean') cl.cleanStart();
        cl.snap = new Map(); cl.seq = new Map(); cl.known = new Set(); cl.shape = { lists: {} };
        cl.ready = true;
        await cl.identify(true);
        await cl.flush();
        if (cl.status !== 'ok') throw new Error('no se pudieron guardar los datos iniciales');
      } else {
        cl.ready = true;
        await cl.identify('silent');
        if (!cl.write) cl.setStatus('readonly'); else { cl.setStatus('ok'); cl.queue(); }
      }
      cl.subscribe();
    } catch (e) {
      cl.ready = false; cl.active = false; cl.setStatus('error');
      toast('No se pudieron cargar los datos de Claude: ' + clErr(e));
    } finally { cl.loading = false; cl.setStatus(cl.status); render(); }
  },
};
