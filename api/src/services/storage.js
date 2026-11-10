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
  } else {
    // Conecta aquí S3 (@aws-sdk/client-s3) o GCS (@google-cloud/storage)
    throw new Error(`STORAGE_DRIVER=${config.storage.driver} aún no configurado`);
  }
  const attachment = await prisma.attachment.create({ data: { kind, mime, url, sha256 } });
  return { attachment, reused: false };
}
