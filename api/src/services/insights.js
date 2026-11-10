/* Inteligencia: arma el estado desde la base, calcula plan de reposición y señales,
 * y pide el resumen a Claude (con respaldo por reglas si no hay API key o falla). */
import Anthropic from '@anthropic-ai/sdk';
import { prisma, n, toCoreProduct, toCoreMovement } from '../db.js';
import { config } from '../config.js';
import { reorderPlan, purchaseSignals, suggestedOrders, buildDigest, summaryPrompt, ruleSummary } from '../core/insights.js';
import { reconcile } from '../core/core.js';

const client = config.ai.anthropicKey ? new Anthropic({ apiKey: config.ai.anthropicKey }) : null;

export async function loadState() {
  const since = new Date(Date.now() - 70 * 864e5);
  const [products, movements, suppliers, purchases, expenses, counts, inbox, openPOs] = await Promise.all([
    prisma.product.findMany({ include: { category: true, supplier: true } }),
    prisma.movement.findMany({ where: { ts: { gte: since } } }),
    prisma.supplier.findMany(),
    prisma.purchase.findMany({ where: { purchasedAt: { gte: since } } }),
    prisma.expense.findMany({ where: { date: { gte: since } } }),
    prisma.physicalCount.findMany({ where: { ts: { gte: since } } }),
    prisma.inboxItem.findMany({ where: { ts: { gte: since } }, select: { ts: true, status: true } }),
    prisma.purchase.findMany({ where: { status: 'borrador', kind: 'orden' }, include: { items: true } }),
  ]);
  const P = products.map(toCoreProduct);
  const M = movements.map(toCoreMovement);
  const onOrder = {};
  for (const po of openPOs) for (const it of po.items) onOrder[it.productId] = (onOrder[it.productId] || 0) + n(it.qty);
  const leadOf = Object.fromEntries(suppliers.map((s) => [s.id, s.leadDays ?? 2]));
  const plan = reorderPlan({ products: P, movements: M, stockOf: (p) => p.stockCurrent, leadDays: (p) => leadOf[p.supplierId] ?? 2, onOrder, service: config.rules.serviceLevel });
  // conciliación sobre todos los movimientos aprobados para no recortar el histórico
  const allApproved = (await prisma.movement.findMany({ where: { status: 'aprobado' } })).map(toCoreMovement);
  const recon = reconcile({ products: P, movements: allApproved, counts: counts.map((c) => ({ ...c, qty: n(c.qty) })) });
  const signals = purchaseSignals({ products: P, movements: M, plan, recon });
  return { products: P, movements: M, suppliers, purchases: purchases.map((p) => ({ ...p, total: n(p.total) })), expenses: expenses.map((e) => ({ ...e, amount: n(e.amount) })), inbox, plan, signals, recon };
}

export async function getReorder() { const s = await loadState(); return { plan: s.plan, orders: suggestedOrders(s.plan, s.suppliers) }; }
export async function getSignals() { const s = await loadState(); return s.signals; }

/** Resumen inteligente. period: day|week|month. question opcional. */
export async function summarize(period = 'day', question = '') {
  const s = await loadState();
  const digest = buildDigest({ period, ...s });
  let summary = null, by = 'reglas', error = null;
  if (client) {
    try {
      const msg = await client.messages.create({ model: config.ai.model, max_tokens: 2500, messages: [{ role: 'user', content: summaryPrompt(digest, question) }] });
      const text = msg.content.map((c) => c.text || '').join('');
      summary = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      by = config.ai.model;
    } catch (e) { error = e.message; }
  }
  if (!summary) summary = ruleSummary(digest);
  const report = await prisma.insightReport.create({ data: { period, question: question || null, generatedBy: by, summary, digest, error } });
  return { id: report.id, generatedBy: by, summary, digest, error };
}

/** Texto corto para WhatsApp (resumen diario al administrador) */
export function toWhatsAppText(sm) {
  const lines = [`*Capybara Control · ${sm.titular}*`, '', sm.resumen, ''];
  for (const r of (sm.recomendaciones || []).slice(0, 4)) lines.push(`• ${r.titulo}: ${r.accion}`);
  if (sm.compras) lines.push('', `Compras: ${sm.compras}`);
  return lines.join('\n').slice(0, 3800);
}
