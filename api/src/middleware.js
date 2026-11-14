import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { prisma } from './db.js';

/* El token dice quién es; la base dice si sigue activo y con qué rol. Se consulta por petición con una caché corta
 * para que desactivar, cambiar el rol o la contraseña aplique en segundos sin esperar a que venza el token. */
const userCache = new Map();
const USER_TTL = 10_000;
export function forgetUser(id) { userCache.delete(id); }
async function sessionUser(id) {
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < USER_TTL) return hit.u;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, area: true, active: true, sessionsValidFrom: true } });
  userCache.set(id, { at: Date.now(), u });
  return u;
}
/** ¿El token se emitió antes del último cierre de sesiones? (iat va en segundos) */
export const tokenRevoked = (iat, validFrom) => !!validFrom && iat < Math.floor(new Date(validFrom).getTime() / 1000);

/** Autenticación JWT: Authorization: Bearer <token> */
export async function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Falta el token de acceso' });
  let payload;
  try { payload = jwt.verify(token, config.jwtSecret); } catch { return res.status(401).json({ error: 'Token inválido o vencido' }); }
  try {
    const u = await sessionUser(payload.sub);
    if (!u || !u.active) return res.status(401).json({ error: 'Tu usuario está inactivo. Habla con el administrador.' });
    if (tokenRevoked(payload.iat, u.sessionsValidFrom)) return res.status(401).json({ error: 'Tu sesión se cerró porque cambió tu contraseña o tu acceso. Vuelve a iniciar sesión.' });
    req.user = { ...payload, role: u.role, name: u.name, area: u.area };
    next();
  } catch (e) { next(e); }
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
  if (err.name === 'MulterError') return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo es muy grande (máximo 20 MB para fotos y facturas, 15 MB para Excel)' : `Archivo no válido: ${err.message}` });
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Error interno' });
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; this.expose = true; }
}
