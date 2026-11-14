import './config.js'; // limpia DATABASE_URL antes de crear el cliente
import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

/** Convierte Decimals de Prisma a números para JSON y para el núcleo */
export const n = (d) => (d === null || d === undefined ? null : Number(d));
export const toCoreProduct = (p) => ({
  ...p,
  stockInit: n(p.stockInit), stockCurrent: n(p.stockCurrent), stockMin: n(p.stockMin),
  stockMax: n(p.stockMax), avgCost: n(p.avgCost), lastPrice: n(p.lastPrice),
  category: p.category?.name ?? p.categoryId,
});
export const toCoreMovement = (m) => ({ ...m, qty: n(m.qty), unitCost: n(m.unitCost), evidence: m.evidenceId });
