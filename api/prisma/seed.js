import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { CATEGORIES, SUPPLIERS, PRODUCTS } from './seed-data.js';

const prisma = new PrismaClient();

async function main() {
  const cats = {};
  for (const name of CATEGORIES) cats[name] = (await prisma.category.upsert({ where: { name }, update: {}, create: { name } })).id;

  const sup = {};
  for (const s of SUPPLIERS) {
    const { id, ...data } = s;
    data.leadDays = { s1: 2, s2: 2, s3: 1, s4: 3, s5: 1, s6: 1 }[id] ?? 2;
    sup[id] = (await prisma.supplier.upsert({ where: { taxId: s.taxId }, update: {}, create: data })).id;
  }

  for (const p of PRODUCTS) {
    const { category, supplierId, expDays, example, ...data } = p;
    data.salePrice = { 'HOS-001': 55000, 'HOS-002': 165000, 'BEB-001': 7000, 'BEB-002': 6000, 'BEB-003': 4000, 'BEB-004': 5000, 'LIC-001': 95000, 'LIC-002': 85000, 'ALI-005': 18000, 'AME-001': 3000, 'AME-002': 4000 }[p.code] || 0;
    data.packSize = { 'BEB-001': 24, 'BEB-002': 24, 'BEB-003': 12, 'BEB-004': 12, 'ALI-001': 30, 'ASE-002': 12 }[p.code] || 1;
    await prisma.product.upsert({
      where: { code: p.code },
      update: {},
      create: {
        ...data, categoryId: cats[category], supplierId: supplierId ? sup[supplierId] : null,
        stockCurrent: p.stockInit, lastPrice: p.avgCost || null,
        expiresAt: expDays ? new Date(Date.now() + expDays * 864e5) : null,
        notes: example ? 'Producto de ejemplo: ajusta stock y costo reales' : 'Inventario manuscrito (hojas del proyecto)',
      },
    });
  }

  // Contraseñas: nunca en el código. SEED_ADMIN_PASSWORD la fija; si falta, se genera una al azar y se muestra una sola vez.
  const adminPw = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const created = !(await prisma.user.findUnique({ where: { email: 'admin@capybarahostel.com' } }));
  await prisma.user.upsert({
    where: { email: 'admin@capybarahostel.com' },
    update: {},
    create: { name: 'Administrador', email: 'admin@capybarahostel.com', passwordHash: await bcrypt.hash(adminPw, 10), role: 'ADMIN' },
  });
  if (created && !process.env.SEED_ADMIN_PASSWORD) console.log(`Administrador creado: admin@capybarahostel.com / ${adminPw}  (cámbiala al entrar)`);
  // personal de ejemplo: solo en desarrollo (SEED_DEMO_USERS=true), con SEED_STAFF_PASSWORD
  if (process.env.SEED_DEMO_USERS === 'true') for (const [name, email, role, area, phone] of [
    ['Andrés Pérez', 'recepcion@capybarahostel.com', 'SUPERVISOR', 'Recepción', '573112223344'],
    ['Cajero 1', 'caja1@capybarahostel.com', 'CAJERO', 'Recepción', null],
    ['Cajero 2', 'caja2@capybarahostel.com', 'CAJERO', 'Bar', null],
    ['Socio 1', 'socio1@capybarahostel.com', 'SOCIO', null, null],
    ['Socio 2', 'socio2@capybarahostel.com', 'SOCIO', null, null],
    ['Camila Rojas', 'bar@capybarahostel.com', 'EMPLEADO', 'Bar', '573001112233'],
    ['Luz Marina', 'housekeeping@capybarahostel.com', 'EMPLEADO', 'Limpieza', '573004445566'],
    ['Jhon Fredy', 'cocina@capybarahostel.com', 'EMPLEADO', 'Cocina', '573205556677'],
  ]) await prisma.user.upsert({ where: { email }, update: {}, create: { name, email, role, area, phone, passwordHash: await bcrypt.hash(process.env.SEED_STAFF_PASSWORD || crypto.randomBytes(9).toString('base64url'), 10) } });
  console.log(`Semilla lista: ${CATEGORIES.length} categorías, ${SUPPLIERS.length} proveedores, ${PRODUCTS.length} productos.`);
}

main().finally(() => prisma.$disconnect());
