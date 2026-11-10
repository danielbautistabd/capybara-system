// API falsa en memoria para probar el frontend en modo API sin base de datos.
// Uso (desde la raíz): npm run dev:fake   (requiere haber hecho antes: cd api && npm install)
// Abre http://localhost:8097  ·  usuarios: admin@x.co, caja@x.co, socio@x.co  ·  contraseña: clave123
import { createRequire } from 'node:module';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const express = require('express');
import fs from 'node:fs';
const app = express(); app.use(express.json());
const P = [{ id: 'a1', code: 'BEB-001', name: 'Cerveza Club Colombia 330 ml', aliases: ['cerveza'], category: 'Bebidas', kind: 'consumible', unit: 'botella', stockInit: 50, stockCurrent: 50, stockMin: 24, stockMax: 120, avgCost: 3200, lastPrice: 3200, salePrice: 7000, status: 'activo', supplierId: 's1', location: 'Bar' },
  { id: 'a2', code: 'HOS-001', name: 'Noche en dormitorio compartido', aliases: [], category: 'Hospedaje', kind: 'servicio', unit: 'cama-noche', stockInit: 0, stockCurrent: 0, stockMin: 0, avgCost: 0, salePrice: 55000, status: 'activo' }];
const inv = []; let seq = 0; const mv = [];
const U = { 'admin@x.co': { id: 'u0', name: 'Admin Real', role: 'ADMIN' }, 'caja@x.co': { id: 'u5', name: 'Cajero Real', role: 'CAJERO', area: 'Recepción' }, 'socio@x.co': { id: 'u7', name: 'Socio Real', role: 'SOCIO' } };
const who = (req) => Object.values(U).find((u) => req.get('authorization') === 'Bearer t-' + u.id);
app.get('/health', (q, r) => r.json({ ok: true }));
app.post('/api/v1/auth/login', (q, r) => { const u = U[q.body.email]; if (!u || q.body.password !== 'clave123') return r.status(401).json({ error: 'Correo o contraseña incorrectos' }); r.json({ token: 't-' + u.id, user: u }); });
app.use('/api/v1', (q, r, n) => (who(q) ? n() : r.status(401).json({ error: 'Falta el token' })));
app.get('/api/v1/products', (q, r) => r.json(P));
app.get('/api/v1/movements', (q, r) => r.json(mv));
app.get('/api/v1/suppliers', (q, r) => r.json([{ id: 's1', name: 'Distribuidora Bavaria' }]));
app.get('/api/v1/purchases', (q, r) => r.json([]));
app.get('/api/v1/expenses', (q, r) => (who(q).role === 'ADMIN' ? r.json([{ id: 'e1', date: new Date().toISOString(), category: 'Arriendo', description: 'Arriendo', amount: 8500000, status: 'registrado', payMethod: 'Transferencia' }]) : r.status(403).json({ error: 'no' })));
app.get('/api/v1/whatsapp/inbox', (q, r) => r.json([]));
app.get('/api/v1/categories', (q, r) => r.json([{ id: 'c1', name: 'Bebidas' }]));
app.get('/api/v1/users', (q, r) => (who(q).role === 'ADMIN' ? r.json(Object.entries(U).map(([email, u]) => ({ ...u, email, active: true }))) : r.status(403).json({ error: 'no' })));
app.get('/api/v1/roles', (q, r) => r.status(403).json({ error: 'no' }));
app.get('/api/v1/invoices', (q, r) => r.json(inv.flatMap((i) => i.lines.map((l, k) => ({ id: i.id + k, inv: i.number, invoiceId: i.id, date: i.date, customer: i.customerName, room: i.room, productId: l.productId, qty: l.qty, price: l.price, taxPct: l.taxPct, pay: i.payMethod, status: i.status, issuedBy: i.issuedBy })))));
app.post('/api/v1/invoices', (q, r) => { const i = { id: 'i' + ++seq, number: 'FV-' + String(seq).padStart(4, '0'), status: 'borrador', ...q.body }; inv.push(i); r.status(201).json(i); });
app.post('/api/v1/invoices/:id/issue', (q, r) => { const i = inv.find((x) => x.id === q.params.id); i.status = 'emitida'; i.issuedBy = who(q).name; for (const l of i.lines) mv.push({ id: 'm' + mv.length, productId: l.productId, qty: l.qty, type: 'salida', status: 'aprobado', source: 'manual', ts: new Date().toISOString(), unit: 'u' }); r.json({ invoice: i, warnings: [] }); });
app.use((q, r, n) => (q.path === '/' ? r.type('html').send(fs.readFileSync(new URL('../api/public/index.html', import.meta.url), 'utf8')) : n()));
app.listen(8097, () => console.log('fake api on 8097'));
