/* Almacenamiento de evidencias con deduplicación por SHA-256 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../db.js';
import { config } from '../config.js';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a' };

export async function saveAttachment(buffer, mime, kind) {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const existing = await prisma.attachment.findUnique({ where: { sha256 } });
  if (existing) return { attachment: existing, reused: true };

  let url;
  if (config.storage.driver === 'local') {
    await fs.mkdir(config.storage.dir, { recursive: true });
    const file = `${sha256}.${EXT[mime] || 'bin'}`;
    await fs.writeFile(path.join(config.storage.dir, file), buffer);
    url = `/uploads/${file}`;
  } else if (config.storage.driver === 'supabase') {
    const file = `${sha256}.${EXT[mime] || 'bin'}`;
    await supabaseStorage('POST', `object/${config.storage.bucket}/${file}`, buffer, { 'Content-Type': mime, 'x-upsert': 'true' });
    url = `/files/${file}`; // el nombre es el SHA-256 del archivo: no se puede adivinar
  } else {
    throw new Error(`STORAGE_DRIVER=${config.storage.driver} no es válido (usa local o supabase)`);
  }
  const attachment = await prisma.attachment.create({ data: { kind, mime, url, sha256 } });
  return { attachment, reused: false };
}

/** Llamada a la API de Storage de Supabase con la clave de servicio (solo servidor). */
async function supabaseStorage(method, path, body, headers = {}) {
  const { supabaseUrl, supabaseKey } = config.storage;
  if (!supabaseUrl || !supabaseKey) throw new Error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para guardar archivos');
  const r = await fetch(`${supabaseUrl}/storage/v1/${path}`, { method, headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey, ...headers }, body });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Storage de Supabase respondió ${r.status}: ${data.message || data.error || ''}`.trim());
  return data;
}

/** Enlace firmado y temporal a un archivo guardado en Supabase Storage. */
export async function signedFileUrl(file, expiresIn = 300) {
  if (!/^[a-f0-9]{64}\.[a-z0-9]{2,4}$/.test(file)) return null;
  const d = await supabaseStorage('POST', `object/sign/${config.storage.bucket}/${file}`, JSON.stringify({ expiresIn }), { 'Content-Type': 'application/json' });
  return d.signedURL ? `${config.storage.supabaseUrl}/storage/v1${d.signedURL}` : null;
}
