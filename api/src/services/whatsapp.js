/* WhatsApp Business Cloud API: validación de firma, descarga de medios,
 * análisis de mensajes y respuesta al remitente. */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { prisma, toCoreProduct } from '../db.js';
import { parseInstruction } from '../core/core.js';
import { saveAttachment } from './storage.js';
import { extractDocument, interpretWithAI, transcribe } from './ai.js';
import { proposeMovement, approveMovement } from './inventory.js';

/** Verifica X-Hub-Signature-256 con el App Secret (requiere el body crudo) */
export function verifySignature(rawBody, header) {
  if (!config.whatsapp.appSecret) return config.env !== 'production';
  if (!header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', config.whatsapp.appSecret).update(rawBody).digest('hex');
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function graph(path, init = {}) {
  const r = await fetch(`${config.whatsapp.graph}/${path}`, {
    ...init, headers: { Authorization: `Bearer ${config.whatsapp.token}`, ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`Graph API ${r.status}: ${await r.text()}`);
  return r;
}

export async function downloadMedia(mediaId) {
  const meta = await (await graph(mediaId)).json();         // { url, mime_type, sha256, file_size }
  // meta.url es temporal (≈5 min) y exige el mismo token
  const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${config.whatsapp.token}` } });
  if (!bin.ok) throw new Error(`Descarga de medio falló: ${bin.status}`);
  return { buffer: Buffer.from(await bin.arrayBuffer()), mime: meta.mime_type };
}

export async function sendText(to, body) {
  if (!config.whatsapp.token || !config.whatsapp.phoneNumberId) return;
  await graph(`${config.whatsapp.phoneNumberId}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
}

/** ¿El remitente/chat está autorizado? */
async function isAuthorized(from, chatId) {
  if (config.whatsapp.allowed.includes(from)) return true;
  const u = await prisma.user.findFirst({ where: { phone: from, active: true } });
  if (u) return true;
  const chat = await prisma.whatsAppChat.findUnique({ where: { id: chatId } });
  return !!chat?.authorized;
}

/**
 * Procesa un payload del webhook. Idempotente por waMessageId.
 * Flujo: guardar crudo → autorizar → extraer texto (texto / transcripción / OCR) →
 * interpretar → crear movimientos PENDIENTES → (opcional) auto-aplicar ≥ umbral → responder.
 */
export async function handleWebhook(payload) {
  const results = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const contacts = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const msg of v.messages || []) results.push(await handleMessage(msg, contacts, v));
    }
  }
  return results;
}

async function handleMessage(msg, contacts, value) {
  const exists = await prisma.inboxItem.findUnique({ where: { waMessageId: msg.id } });
  if (exists) return { id: exists.id, skipped: 'ya procesado' };

  const from = msg.from;
  const chatId = msg.context?.group_id || msg.group_id || from; // grupos: según la versión de la API
  if (!(await isAuthorized(from, chatId))) return { skipped: 'remitente no autorizado', from };

  await prisma.whatsAppChat.upsert({ where: { id: chatId }, update: {}, create: { id: chatId, name: contacts[from] || from, authorized: true } });

  const item = await prisma.inboxItem.create({
    data: {
      waMessageId: msg.id, chatId, from, fromName: contacts[from], ts: new Date(Number(msg.timestamp) * 1000),
      msgType: msg.type, text: msg.text?.body || msg.image?.caption || msg.document?.caption || null, raw: msg,
    },
  });

  try {
    let text = item.text || '';
    let doc = null;
    let attachmentId = null;
    const media = msg.image || msg.audio || msg.voice || msg.document;
    if (media?.id) {
      const { buffer, mime } = await downloadMedia(media.id);
      const kind = msg.type === 'audio' ? 'audio' : msg.type === 'image' ? 'foto' : 'pdf';
      const { attachment, reused } = await saveAttachment(buffer, mime, kind);
      attachmentId = attachment.id;
      if (reused) {
        await prisma.inboxItem.update({ where: { id: item.id }, data: { attachmentId, status: 'duplicado', reviewNote: 'Archivo idéntico ya recibido' } });
        return { id: item.id, status: 'duplicado' };
      }
      if (msg.type === 'audio') {
        const t = await transcribe(buffer, mime);
        text = [text, t].filter(Boolean).join(' ');
        await prisma.inboxItem.update({ where: { id: item.id }, data: { transcript: t } });
      } else {
        doc = await extractDocument(buffer, mime);
        await prisma.attachment.update({ where: { id: attachment.id }, data: { extracted: doc } });
      }
    }

    const catalog = (await prisma.product.findMany({ where: { status: 'activo' }, include: { category: true } })).map(toCoreProduct);
    let analysis;
    if (doc && !doc.error) {
      // Factura / foto: proponer entrada (o el tipo sugerido) por cada ítem
      analysis = { type: doc.movementHint === 'gasto' ? 'gasto' : (doc.movementHint || 'entrada'), document: doc, items: [] };
      for (const it of doc.items || []) {
        const p = parseInstruction(`${it.qty} ${it.description}`, catalog).items[0];
        analysis.items.push({ ...p, qty: it.qty, unitCost: it.unitPrice, confidence: Math.min(p?.confidence ?? 0, doc.confidence ?? 0.7) });
      }
      analysis.confidence = analysis.items.length ? Math.min(...analysis.items.map((i) => i.confidence)) : 0;
    } else {
      analysis = parseInstruction(text, catalog);
      if (analysis.confidence < config.rules.autoApplyConfidence) {
        const ai = await interpretWithAI(text, catalog);
        if (ai?.items?.length) analysis = { ...analysis, ai };
      }
    }

    const created = [];
    if (analysis.type !== 'gasto') {
      for (const it of analysis.items.filter((i) => i.productId)) {
        const { movement, duplicates } = await proposeMovement({
          productId: it.productId, qty: it.qty, unit: it.unit, type: analysis.type, unitCost: it.unitCost,
          source: msg.type === 'image' ? 'whatsapp_foto' : msg.type === 'audio' ? 'whatsapp_audio' : 'whatsapp',
          reportedBy: contacts[from] || from, area: analysis.area, confidence: it.confidence,
          evidenceId: attachmentId, inboxItemId: item.id, invoice: doc?.invoiceNumber || null, ts: item.ts,
          notes: `WhatsApp: "${text.slice(0, 280)}"`,
        });
        created.push({ movement, duplicates });
        if (config.rules.autoApplyEnabled && it.confidence >= config.rules.autoApplyConfidence && movement.status === 'pendiente') {
          await approveMovement(movement.id, null);
        }
      }
    }

    const status = !analysis.items.length ? 'requiere_info' : created.some((c) => c.movement.status === 'duplicado') ? 'duplicado' : 'pendiente_aprobacion';
    await prisma.inboxItem.update({ where: { id: item.id }, data: { analysis, confidence: analysis.confidence, status, attachmentId } });

    if (config.whatsapp.sendAck) {
      const lines = analysis.items.map((i) => `• ${i.qty} ${i.unit} ${i.productName || `"${i.rawText}" (no reconocido)`}`);
      await sendText(from, lines.length
        ? `Capybara Control recibió:\n${lines.join('\n')}\nQueda pendiente de aprobación.`
        : 'Capybara Control no pudo identificar productos en tu mensaje. Escribe, por ejemplo: "Marchar 3 cervezas y 2 aguas a la habitación 203".');
    }
    return { id: item.id, status, movements: created.length };
  } catch (e) {
    await prisma.inboxItem.update({ where: { id: item.id }, data: { status: 'requiere_info', reviewNote: String(e.message).slice(0, 500) } });
    return { id: item.id, error: e.message };
  }
}
