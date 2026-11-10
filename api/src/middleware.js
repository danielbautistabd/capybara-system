import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { prisma } from './db.js';

/** Autenticación JWT: Authorization: Bearer <token> */
export function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Falta el token de acceso' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o vencido' });
  }
}

/** Permisos por rol */
export const can = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) || req.user?.role === 'ADMIN'
    ? next()
    : res.status(403).json({ error: 'Tu rol no tiene permiso para esta acción' });

/** Bitácora: registra quién hizo qué, con estado antes/después */
export async function audit(req, action, entity, entityId, before, after) {
  await prisma.auditLog.create({
    data: { action, entity, entityId, before: before ?? undefined, after: after ?? undefined, userId: req.user?.sub, ip: req.ip },
  });
}

/** Valida body con zod */
export const validate = (schema) => (req, res, next) => {
  const r = schema.safeParse(req.body);
  if (!r.success) return res.status(422).json({ error: 'Datos inválidos', details: r.error.flatten() });
  req.body = r.data;
  next();
};

export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, req, res, _next) {
  console.error(err);
  if (err.code === 'P2002') return res.status(409).json({ error: 'Registro duplicado', target: err.meta?.target });
  if (err.code === 'P2025') return res.status(404).json({ error: 'No encontrado' });
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Error interno' });
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; this.expose = true; }
}
