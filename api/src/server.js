import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import { config, dbUrlProblem } from './config.js';
import { prisma } from './db.js';
import routes from './routes.js';
import routes2, { dailyInsightJob } from './routes2.js';
import routesBilling from './routes-billing.js';
import routesImport from './routes-import.js';
import * as alegra from './services/alegra.js';
import { errorHandler } from './middleware.js';
import { verifySignature, handleWebhook } from './services/whatsapp.js';
import { previewSync } from './services/sheets.js';
import { signedFileUrl } from './services/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : true, credentials: true }));

/* -------- Webhook de WhatsApp (Meta) --------
 * Configúralo en: developers.facebook.com > App > WhatsApp > Configuración
 *   URL de devolución:  {PUBLIC_URL}/webhooks/whatsapp
 *   Token de verificación: WHATSAPP_VERIFY_TOKEN
 *   Campos suscritos: messages
 */
app.get('/webhooks/whatsapp', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.whatsapp.verifyToken) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});
app.post('/webhooks/whatsapp', express.raw({ type: 'application/json', limit: '5mb' }), (req, res) => {
  if (!verifySignature(req.body, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  res.sendStatus(200); // Meta exige respuesta < 10 s: procesamos en segundo plano
  let payload;
  try { payload = JSON.parse(req.body.toString('utf8')); } catch { return; }
  handleWebhook(payload).then((r) => r.length && console.log('[whatsapp]', JSON.stringify(r))).catch((e) => console.error('[whatsapp]', e));
});

app.use(express.json({ limit: '2mb' }));

/* -------- Webhook de Alegra (new-bill, edit-bill, delete-bill, new-item, edit-item) -------- */
app.post('/webhooks/alegra/:secret', (req, res) => {
  if (req.params.secret !== config.alegra.webhookSecret) return res.sendStatus(403);
  res.sendStatus(200);
  alegra.handleWebhook(req.body).catch((e) => console.error('[alegra]', e.message));
});
app.use('/api/', rateLimit({ windowMs: 60_000, max: 600 }));
app.get('/health', async (_q, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ ok: true, db: 'ok', ts: new Date() }); }
  catch (e) {
    const p = dbUrlProblem(process.env.DATABASE_URL);
    res.status(503).json({ ok: false, db: p ? `DATABASE_URL ${p}` : e.message });
  }
});
/* -------- Tareas programadas por ruta (Supabase Cron + pg_net, o cualquier programador) --------
 * POST /api/v1/jobs/alegra-import | insights-daily | sheets-sync   con  Authorization: Bearer {CRON_SECRET} */
const JOBS = {
  'alegra-import': () => (alegra.isConfigured() ? alegra.importBills({ since: new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10) }) : { skipped: 'Alegra no está configurado' }),
  'insights-daily': () => dailyInsightJob().then((r) => ({ generatedBy: r.generatedBy })),
  'sheets-sync': async () => { const out = []; for (const s of await prisma.sheetSource.findMany({ where: { active: true, cron: { not: null } } })) out.push({ source: s.name, stats: (await previewSync(s.id, 'cron')).stats }); return out; },
};
app.post('/api/v1/jobs/:job', async (req, res, next) => {
  const ok = config.cronSecret && req.get('authorization') === `Bearer ${config.cronSecret}`;
  if (!ok || !JOBS[req.params.job]) return res.status(404).json({ error: 'No encontrado' });
  try { res.json({ job: req.params.job, ok: true, result: await JOBS[req.params.job]() }); } catch (e) { next(e); }
});
app.use('/api/v1', routesImport);
app.use('/api/v1', routes);
app.use('/api/v1', routes2);
app.use('/api/v1', routesBilling);
app.use('/uploads', express.static(path.resolve(config.storage.dir)));
/* Archivos en Supabase Storage: redirige a un enlace firmado que vence en 5 minutos */
app.get('/files/:file', async (req, res, next) => { try { const u = await signedFileUrl(req.params.file); if (!u) return res.status(404).end(); res.redirect(302, u); } catch (e) { next(e); } });
app.get('/openapi.yaml', (_q, res) => res.sendFile(path.join(__dirname, '..', 'openapi.yaml')));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(errorHandler);

/* -------- Sincronizaciones programadas de Google Sheets -------- */
async function scheduleSheets() {
  try {
    const sources = await prisma.sheetSource.findMany({ where: { active: true, cron: { not: null } } });
    for (const s of sources) {
      if (!cron.validate(s.cron)) { console.warn(`[sheets] cron inválido en ${s.name}: ${s.cron}`); continue; }
      cron.schedule(s.cron, () => previewSync(s.id, 'cron').then((r) => console.log(`[sheets] ${s.name}`, r.stats)).catch((e) => console.error(`[sheets] ${s.name}`, e.message)), { timezone: process.env.TZ || 'America/Bogota' });
      console.log(`[sheets] ${s.name} programada: ${s.cron}`);
    }
  } catch (e) { console.warn('[sheets] no se pudieron programar sincronizaciones:', e.message); }
}

function scheduleOthers() {
  const tz = process.env.TZ || 'America/Bogota';
  if (alegra.isConfigured() && cron.validate(config.alegra.syncCron)) {
    cron.schedule(config.alegra.syncCron, () => alegra.importBills({ since: new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10) }).then((r) => console.log('[alegra]', r)).catch((e) => console.error('[alegra]', e.message)), { timezone: tz });
    console.log(`[alegra] importación programada: ${config.alegra.syncCron}`);
  }
  if (cron.validate(config.insights.dailyCron)) {
    cron.schedule(config.insights.dailyCron, () => dailyInsightJob().then((r) => console.log('[insights] resumen diario', r.generatedBy)).catch((e) => console.error('[insights]', e.message)), { timezone: tz });
  }
}

export default app;

/* Servidor propio (local, Docker): escucha y programa las tareas en el proceso.
 * En Vercel (VERCEL=1) la app se exporta como función y las tareas llegan por /api/v1/jobs. */
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`Capybara Control API escuchando en :${config.port}`);
    scheduleSheets();
    scheduleOthers();
  });
}
