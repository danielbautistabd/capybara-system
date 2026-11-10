/* IA: lectura de facturas/fotos con Claude y transcripción de notas de voz.
 * Todo lo que extrae la IA queda como PROPUESTA; nunca descuenta inventario por sí sola. */
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const client = config.ai.anthropicKey ? new Anthropic({ apiKey: config.ai.anthropicKey }) : null;

const INVOICE_PROMPT = `Eres el asistente de inventario de Capybara Hostel (Colombia, moneda COP).
Analiza la imagen o PDF. Puede ser una factura, recibo, comprobante de pago, lista escrita a mano o captura de pantalla.
Responde SOLO con JSON válido con esta forma:
{
  "documentType": "factura|recibo|comprobante_pago|lista_manual|captura|otro",
  "supplier": {"name": string|null, "taxId": string|null},
  "invoiceNumber": string|null,
  "date": "YYYY-MM-DD"|null,
  "paymentMethod": "efectivo|transferencia|tarjeta|credito|nequi|daviplata"|null,
  "items": [{"description": string, "qty": number, "unit": string, "unitPrice": number|null, "total": number|null}],
  "subtotal": number|null, "tax": number|null, "discount": number|null, "total": number|null,
  "movementHint": "entrada|marchado|consumo_interno|danado|perdida|gasto|conteo",
  "confidence": number  // 0 a 1, tu seguridad global
}
No inventes valores: usa null cuando no se lea.`;

export async function extractDocument(buffer, mime) {
  if (!client) return { error: 'ANTHROPIC_API_KEY no configurada', confidence: 0 };
  const isPdf = mime === 'application/pdf';
  const block = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data: buffer.toString('base64') } };
  const msg = await client.messages.create({
    model: config.ai.model, max_tokens: 2000,
    messages: [{ role: 'user', content: [block, { type: 'text', text: INVOICE_PROMPT }] }],
  });
  const text = msg.content.map((c) => c.text || '').join('');
  try { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); }
  catch { return { error: 'Respuesta no interpretable', raw: text, confidence: 0 }; }
}

/** Respaldo con IA cuando el intérprete por reglas no alcanza el umbral */
export async function interpretWithAI(text, catalog) {
  if (!client) return null;
  const names = catalog.slice(0, 400).map((p) => `${p.id}|${p.name}|${(p.aliases || []).join(',')}`).join('\n');
  const msg = await client.messages.create({
    model: config.ai.model, max_tokens: 800,
    messages: [{ role: 'user', content: `En Capybara Hostel "marchar" significa entregar, despachar o consumir un producto del inventario.
Catálogo (id|nombre|alias):\n${names}\n\nMensaje: "${text}"\n
Responde SOLO JSON: {"type":"marchado|consumo_interno|cortesia|danado|vencido|perdida|entrada|devolucion|solicitud_compra|otro","area":string|null,"items":[{"productId":string|null,"rawText":string,"qty":number,"unit":string,"confidence":number}]}` }],
  });
  const t = msg.content.map((c) => c.text || '').join('');
  try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return null; }
}

/** Transcribe una nota de voz (ogg/opus de WhatsApp) */
export async function transcribe(buffer, mime) {
  if (config.ai.stt === 'openai' && config.ai.openaiKey) {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime }), 'nota.ogg');
    form.append('model', 'whisper-1');
    form.append('language', 'es');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${config.ai.openaiKey}` }, body: form });
    return (await r.json()).text;
  }
  if (config.ai.stt === 'google') {
    // Google Speech-to-Text v1 (OGG_OPUS 16 kHz). Requiere habilitar la API en el proyecto de la cuenta de servicio.
    const { google } = await import('googleapis');
    const authClient = new google.auth.JWT({ email: config.google.email, key: config.google.key, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const speech = google.speech({ version: 'v1', auth: authClient });
    const { data } = await speech.speech.recognize({
      requestBody: { config: { encoding: 'OGG_OPUS', sampleRateHertz: 16000, languageCode: 'es-CO' }, audio: { content: buffer.toString('base64') } },
    });
    return (data.results || []).map((r) => r.alternatives?.[0]?.transcript).join(' ');
  }
  return null;
}
