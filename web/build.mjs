import fs from 'node:fs';
const W = new URL('.', import.meta.url).pathname, A = W + '../api/';
const strip = (s) => s.replace(/^import .*$/gm, '').replace(/^export /gm, '');
const shell = fs.readFileSync(W + 'shell.html', 'utf8');
const app = ['app1.js', 'app2.js', 'app3.js', 'app4.js', 'supabase.js', 'app5.js', 'app6.js', 'app7.js', 'app8.js'].map((f) => fs.readFileSync(W + f, 'utf8')).join('\n');
const out = shell
  .replace('/*STYLES*/', () => fs.readFileSync(W + 'styles.css', 'utf8'))
  .replace('/*CORE*/', () => ['core.js', 'insights.js', 'permissions.js', 'productImport.js'].map((f) => strip(fs.readFileSync(A + 'src/core/' + f, 'utf8'))).join('\n'))
  .replace('/*SEED*/', () => strip(fs.readFileSync(A + 'prisma/seed-data.js', 'utf8')))
  .replace('/*APP*/', () => app);
fs.mkdirSync(W + '../dist', { recursive: true });
fs.writeFileSync(W + '../dist/capybara-control.html', out);
fs.mkdirSync(A + 'public', { recursive: true });
const page = (extra) => `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#1E4A37">\n${extra}</head>\n<body>\n${out}\n</body>\n</html>\n`;
// servido por el backend: conecta con la API del mismo origen y pide iniciar sesión
fs.writeFileSync(A + 'public/index.html', page('<link rel="manifest" href="manifest.webmanifest">\n<script>window.CAPYBARA_API = location.origin;</script>\n'));
// independiente: abre con doble clic o cualquier servidor estático, en modo demostración
fs.writeFileSync(W + '../dist/index.html', page(''));
console.log('ok', (out.length / 1024).toFixed(0) + ' KB');
