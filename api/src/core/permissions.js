/* Roles y permisos de Capybara Control (backend + frontend).
 * ADMIN: todo. SUPERVISOR: opera y aprueba, sin configuración ni usuarios.
 * EMPLEADO: registra (queda pendiente), cuenta y consulta su área, sin costos ni dinero.
 * AUDITOR: solo lectura de todo, incluida la bitácora. */

export const ROLES = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Manager',
  CAJERO: 'Cajero',
  EMPLEADO: 'Empleado',
  SOCIO: 'Socio',
  AUDITOR: 'Auditor',
};

export const PERMISSIONS = {
  'tablero.ver': 'Ver el tablero general',
  'costos.ver': 'Ver costos, precios y valores en pesos',
  'inventario.ver': 'Consultar inventario',
  'inventario.editar': 'Crear y editar productos',
  'movimientos.crear': 'Registrar movimientos y marchados',
  'movimientos.aprobar': 'Aprobar, rechazar y anular movimientos',
  'entradas.crear': 'Registrar entradas (borrador)',
  'entradas.aprobar': 'Aprobar entradas de compra',
  'conteos.crear': 'Registrar conteos físicos',
  'whatsapp.revisar': 'Revisar la bandeja de WhatsApp',
  'sheets.sincronizar': 'Sincronizar Google Drive y Sheets',
  'alegra.gestionar': 'Sincronizar y configurar Alegra',
  'conciliacion.ver': 'Ver y ejecutar la conciliación',
  'inteligencia.ver': 'Resúmenes con IA, punto de reorden y señales de compra',
  'proveedores.gestionar': 'Gestionar proveedores',
  'gastos.gestionar': 'Registrar y ver gastos',
  'bitacora.ver': 'Ver la bitácora',
  'usuarios.gestionar': 'Gestionar usuarios y permisos',
  'integraciones.configurar': 'Configurar integraciones y reglas',
  'solicitudes.crear': 'Solicitar compras',
  'facturacion.crear': 'Facturar ventas (crear y editar borradores)',
  'facturacion.emitir': 'Emitir facturas y descontar inventario',
  'caja.ver': 'Ver la caja del día (cuadre por forma de pago)',
  'socios.ver': 'Ver el módulo de socios: ingresos, resultados y KPIs',
};

export const DEFAULT_ROLE_PERMS = {
  ADMIN: Object.keys(PERMISSIONS),
  SUPERVISOR: ['tablero.ver', 'costos.ver', 'inventario.ver', 'inventario.editar', 'movimientos.crear', 'movimientos.aprobar', 'entradas.crear', 'entradas.aprobar', 'conteos.crear', 'whatsapp.revisar', 'sheets.sincronizar', 'conciliacion.ver', 'inteligencia.ver', 'proveedores.gestionar', 'gastos.gestionar', 'bitacora.ver', 'solicitudes.crear', 'facturacion.crear', 'facturacion.emitir', 'caja.ver'],
  CAJERO: ['inventario.ver', 'movimientos.crear', 'facturacion.crear', 'facturacion.emitir', 'caja.ver', 'solicitudes.crear'],
  EMPLEADO: ['inventario.ver', 'movimientos.crear', 'entradas.crear', 'conteos.crear', 'solicitudes.crear', 'facturacion.crear'],
  SOCIO: ['socios.ver'],
  AUDITOR: ['tablero.ver', 'costos.ver', 'inventario.ver', 'conciliacion.ver', 'inteligencia.ver', 'bitacora.ver'],
};

/** ¿El rol tiene el permiso? `overrides` permite ajustar la matriz desde Control de acceso. */
export function hasPerm(role, perm, overrides = null) {
  if (role === 'ADMIN') return true;
  const list = (overrides && overrides[role]) || DEFAULT_ROLE_PERMS[role] || [];
  return list.includes(perm);
}

/** Campos de dinero que se ocultan a quien no tiene costos.ver */
export const MONEY_FIELDS = ['avgCost', 'lastPrice', 'unitCost', 'valorDisponible', 'subtotal', 'total', 'tax', 'discount', 'amount', 'valor', 'estCost', 'prices'];
export function maskMoney(obj) {
  if (Array.isArray(obj)) return obj.map(maskMoney);
  if (!obj || typeof obj !== 'object' || obj instanceof Date) return obj;
  const o = {};
  for (const [k, v] of Object.entries(obj)) { if (MONEY_FIELDS.includes(k)) continue; o[k] = typeof v === 'object' ? maskMoney(v) : v; }
  return o;
}
