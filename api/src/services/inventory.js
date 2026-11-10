/* Servicio de inventario: crear, aprobar y anular movimientos con trazabilidad total. */
import { prisma, n, toCoreMovement } from '../db.js';
import { MOVEMENT_TYPES, fingerprint, findDuplicates, weightedAvgCost } from '../core/core.js';
import { config } from '../config.js';
import { HttpError } from '../middleware.js';

/** Crea un movimiento PENDIENTE y devuelve posibles duplicados */
export async function proposeMovement(data, tx = prisma) {
  if (!MOVEMENT_TYPES[data.type]) throw new HttpError(422, `Tipo de movimiento desconocido: ${data.type}`);
  const product = await tx.product.findUnique({ where: { id: data.productId } });
  if (!product) throw new HttpError(404, 'Producto no encontrado');
  const ts = data.ts ? new Date(data.ts) : new Date();
  const fp = fingerprint({ ...data, ts });

  const since = new Date(ts.getTime() - config.rules.duplicateWindowHours * 36e5);
  const until = new Date(ts.getTime() + config.rules.duplicateWindowHours * 36e5);
  const nearby = await tx.movement.findMany({
    where: { productId: data.productId, ts: { gte: since, lte: until }, status: { in: ['pendiente', 'aprobado'] } },
  });
  const dups = findDuplicates({ ...data, ts, qty: Number(data.qty) }, nearby.map(toCoreMovement), config.rules.duplicateWindowHours);

  const movement = await tx.movement.create({
    data: {
      ...data, ts, qty: data.qty, unit: data.unit || product.unit, fingerprint: fp,
      status: dups.length && dups[0].score >= 0.9 ? 'duplicado' : 'pendiente',
    },
  });
  return { movement, duplicates: dups.map((d) => ({ id: d.b.id, reason: d.reason, score: d.score })) };
}

/** Aprueba un movimiento: actualiza stock y costo promedio dentro de una transacción */
export async function approveMovement(id, userId, edits = {}) {
  return prisma.$transaction(async (tx) => {
    const m = await tx.movement.findUnique({ where: { id } });
    if (!m) throw new HttpError(404, 'Movimiento no encontrado');
    if (m.status === 'aprobado') throw new HttpError(409, 'El movimiento ya estaba aprobado');
    if (m.status === 'anulado') throw new HttpError(409, 'No se puede aprobar un movimiento anulado');
    const data = { ...edits };
    const qty = Number(data.qty ?? m.qty);
    const type = data.type ?? m.type;
    const sign = MOVEMENT_TYPES[type].sign;

    const p = await tx.product.findUnique({ where: { id: data.productId ?? m.productId } });
    const stock = n(p.stockCurrent);
    const upd = { stockCurrent: stock + sign * qty };
    const unitCost = data.unitCost ?? n(m.unitCost);
    if (type === 'entrada' && unitCost) {
      upd.avgCost = weightedAvgCost(stock, n(p.avgCost), qty, unitCost);
      upd.lastPrice = unitCost;
      await tx.priceHistory.create({ data: { productId: p.id, price: unitCost, supplierId: p.supplierId } });
    }
    await tx.product.update({ where: { id: p.id }, data: upd });
    return tx.movement.update({
      where: { id },
      data: { ...data, status: 'aprobado', approvedById: userId, approvedAt: new Date(), fingerprint: fingerprint({ ...m, ...data, qty }) },
    });
  });
}

/** Anula un movimiento aprobado creando un contramovimiento (nunca se borra) */
export async function voidMovement(id, userId, reason) {
  return prisma.$transaction(async (tx) => {
    const m = await tx.movement.findUnique({ where: { id } });
    if (!m) throw new HttpError(404, 'Movimiento no encontrado');
    if (m.status !== 'aprobado') {
      return tx.movement.update({ where: { id }, data: { status: 'anulado', notes: `${m.notes || ''}\nAnulado: ${reason}`.trim() } });
    }
    const sign = MOVEMENT_TYPES[m.type].sign;
    const p = await tx.product.findUnique({ where: { id: m.productId } });
    await tx.product.update({ where: { id: p.id }, data: { stockCurrent: n(p.stockCurrent) - sign * n(m.qty) } });
    await tx.movement.update({ where: { id }, data: { status: 'anulado' } });
    return tx.movement.create({
      data: {
        productId: m.productId, qty: m.qty, unit: m.unit, type: sign > 0 ? 'ajuste_neg' : 'ajuste_pos',
        source: 'sistema', status: 'aprobado', reason: `Anulación de ${m.id}: ${reason}`, reversesId: m.id,
        userId, approvedById: userId, approvedAt: new Date(), fingerprint: `void-${m.id}`,
      },
    });
  });
}

/** Aprueba una compra: crea entradas aprobadas por ítem */
export async function approvePurchase(purchaseId, userId) {
  const pu = await prisma.purchase.findUnique({ where: { id: purchaseId }, include: { items: true } });
  if (!pu) throw new HttpError(404, 'Compra no encontrada');
  if (pu.status === 'aprobada') throw new HttpError(409, 'La compra ya estaba aprobada');
  const out = [];
  for (const it of pu.items) {
    const { movement } = await proposeMovement({
      productId: it.productId, qty: it.qty, unit: it.unit, type: 'entrada', unitCost: it.unitCost,
      source: pu.source, invoice: pu.invoice, purchaseId: pu.id, evidenceId: pu.attachmentId,
      ts: pu.receivedAt, userId, reason: `Compra ${pu.invoice || pu.id}`,
    });
    out.push(await approveMovement(movement.id, userId));
  }
  await prisma.purchase.update({ where: { id: pu.id }, data: { status: 'aprobada' } });
  return out;
}
