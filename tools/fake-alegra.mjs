// Alegra simulado para pruebas locales: registra cada llamada y responde con ids.
import http from 'node:http';
import fs from 'node:fs';
const LOG = process.env.FAKE_ALEGRA_LOG || new URL('../api/uploads/alegra-simulado.json', import.meta.url).pathname;
const calls = [];
// ítems de ejemplo: uno con referencia igual al código de Capybara, otros solo por nombre
const ITEMS = [
  { id: 301, name: 'Cerveza Club Colombia x330', reference: 'BEB-001' },
  { id: 302, name: 'Cerveza Aguila 330', reference: '' },
  { id: 303, name: 'Agua Cristal 600', reference: '' },
  { id: 320, name: 'Hielo bolsa 2kg', reference: 'BEB-005' },
];
let next = Number(String(Date.now()).slice(-8)); // ids que no se repiten entre reinicios
const AUTH = 'Basic ' + Buffer.from('pruebas@capybarahostel.com:token-de-prueba').toString('base64');
http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), auth: req.headers.authorization === AUTH, body });
    fs.mkdirSync(LOG.replace(/[^/]+$/, ''), { recursive: true }); fs.writeFileSync(LOG, JSON.stringify(calls, null, 1));
    const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', 'X-Rate-Limit-Remaining': '140', 'X-Rate-Limit-Reset': '60' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== AUTH) return send(401, { message: 'Credenciales inválidas' });
    const p = url.pathname.replace(/^\/api\/v1/, '');
    if (req.method === 'GET' && p === '/company') return send(200, { name: 'Capybara Hostel SAS' });
    if (req.method === 'GET' && p === '/items') { const s = +(url.searchParams.get('start') || 0), l = +(url.searchParams.get('limit') || 30); return send(200, ITEMS.slice(s, s + l)); }
    if (req.method === 'GET') return send(200, []);
    if (req.method === 'POST' && ['/invoices', '/bills', '/payments', '/contacts', '/purchase-orders'].includes(p)) return send(201, { id: next++ });
    send(404, { message: 'no simulado: ' + p });
  });
}).listen(8098, () => console.log('Alegra simulado en :8098'));
