/* Datos iniciales de Capybara Hostel.
 * - MENAJE y EQUIPOS: transcritos de las dos hojas de inventario manuscritas del proyecto.
 * - CONSUMIBLES: ejemplos con precios estimados en COP. Reemplázalos con tu catálogo real
 *   (o impórtalos desde Google Sheets en el módulo Drive). */

export const CATEGORIES = ['Alimentos', 'Bebidas', 'Licores', 'Productos de aseo', 'Lavandería', 'Amenities', 'Cocina', 'Mantenimiento', 'Papelería', 'Servicios', 'Hospedaje', 'Equipos y mobiliario', 'Otros'];

export const SUPPLIERS = [
  { id: 's1', name: 'Distribuidora Bavaria', taxId: '860005224-6', phone: '6014389000', contact: 'Preventa zona centro' },
  { id: 's2', name: 'Coca-Cola FEMSA', taxId: '890903858-7', phone: '018000512020', contact: 'Asesor comercial' },
  { id: 's3', name: 'Mercados del Puerto', taxId: '900123456-1', phone: '3104567890', contact: 'Doña Marta' },
  { id: 's4', name: 'Aseo Total SAS', taxId: '901234567-2', phone: '3157654321', contact: 'Julián' },
  { id: 's5', name: 'Hielo Polar', taxId: '900987654-3', phone: '3009876543', contact: 'Ruta 4' },
  { id: 's6', name: 'Licorera La 14', taxId: '800111222-4', phone: '3201112233', contact: 'Andrés' },
];

// [código, nombre, categoría, unidad, stock, mínimo, costo, alias[], proveedor, ubicación, tipo, vence(días)]
const C = (code, name, cat, unit, stock, min, cost, aliases = [], sup = null, loc = null, kind = 'consumible', expDays = null) =>
  ({ code, name, category: cat, unit, stockInit: stock, stockMin: min, avgCost: cost, aliases, supplierId: sup, location: loc, kind, expDays, example: kind === 'consumible' });

export const PRODUCTS = [
  // ---------- Consumibles (ejemplo) ----------
  C('BEB-001', 'Cerveza Club Colombia 330 ml', 'Bebidas', 'botella', 96, 36, 3200, ['cerveza', 'cervezas', 'club colombia', 'pola', 'club'], 's1', 'Bar · nevera 1'),
  C('BEB-002', 'Cerveza Águila 330 ml', 'Bebidas', 'botella', 72, 24, 2700, ['aguila', 'aguilita'], 's1', 'Bar · nevera 1'),
  C('BEB-003', 'Agua en botella 600 ml', 'Bebidas', 'botella', 60, 24, 1300, ['agua', 'aguas', 'botella de agua'], 's2', 'Bar · nevera 2'),
  C('BEB-004', 'Coca-Cola 400 ml', 'Bebidas', 'botella', 48, 24, 2400, ['coca cola', 'coca', 'gaseosa'], 's2', 'Bar · nevera Coca-Cola'),
  C('BEB-005', 'Bolsa de hielo 2 kg', 'Bebidas', 'bolsa', 14, 10, 4500, ['hielo', 'bolsa de hielo'], 's5', 'Cocina · congelador', 'consumible', 30),
  C('LIC-001', 'Ron Medellín 3 años 750 ml', 'Licores', 'botella', 9, 4, 42000, ['ron', 'medellin', 'botella de ron'], 's6', 'Bar · estante alto'),
  C('LIC-002', 'Aguardiente Antioqueño 750 ml', 'Licores', 'botella', 12, 4, 38000, ['aguardiente', 'guaro', 'antioqueño'], 's6', 'Bar · estante alto'),
  C('ALI-001', 'Huevos AA', 'Alimentos', 'unidad', 150, 60, 550, ['huevo', 'huevos'], 's3', 'Cocina · nevera', 'consumible', 12),
  C('ALI-002', 'Pan tajado', 'Alimentos', 'paquete', 8, 4, 6800, ['pan'], 's3', 'Cocina · despensa', 'consumible', 5),
  C('ALI-003', 'Café molido 500 g', 'Alimentos', 'paquete', 6, 3, 18500, ['cafe'], 's3', 'Cocina · despensa', 'consumible', 120),
  C('ALI-004', 'Leche entera 1 L', 'Alimentos', 'caja', 14, 8, 4200, ['leche'], 's3', 'Cocina · nevera', 'consumible', 8),
  C('ALI-005', 'Desayuno huésped', 'Servicios', 'porción', 0, 0, 7500, ['desayuno', 'desayunos'], null, 'Cocina', 'servicio'),
  C('ALI-006', 'Limón tahití', 'Alimentos', 'unidad', 80, 30, 300, ['limon', 'limones'], 's3', 'Bar', 'consumible', 10),
  C('ASE-001', 'Desengrasante multiusos 1 L', 'Productos de aseo', 'unidad', 10, 4, 12500, ['desengrasante', 'producto de aseo', 'productos de aseo', 'limpiador'], 's4', 'Cuarto de aseo'),
  C('ASE-002', 'Papel higiénico doble hoja', 'Productos de aseo', 'rollo', 96, 48, 1400, ['papel higienico', 'papel', 'rollo de papel'], 's4', 'Cuarto de aseo'),
  C('ASE-003', 'Bolsas de basura 90×110', 'Productos de aseo', 'paquete', 6, 3, 9800, ['bolsas de basura', 'bolsa de basura'], 's4', 'Cuarto de aseo'),
  C('LAV-001', 'Detergente en polvo 3 kg', 'Lavandería', 'bolsa', 4, 2, 32000, ['detergente', 'jabon de ropa'], 's4', 'Lavandería'),
  C('LAV-002', 'Toalla de baño', 'Lavandería', 'unidad', 64, 40, 28000, ['toalla', 'toallas'], null, 'Lavandería · estante A', 'menaje'),
  C('LAV-003', 'Juego de sábanas sencillo', 'Lavandería', 'juego', 48, 30, 65000, ['sabana', 'sabanas', 'juego de sabanas'], null, 'Lavandería · estante B', 'menaje'),
  C('AME-001', 'Jabón amenity 20 g', 'Amenities', 'unidad', 180, 80, 650, ['jabon', 'jaboncito', 'jabon amenity'], 's4', 'Recepción · bodega'),
  C('AME-002', 'Shampoo amenity 30 ml', 'Amenities', 'unidad', 150, 80, 900, ['shampoo', 'champu'], 's4', 'Recepción · bodega'),
  C('COC-090', 'Vaso de vidrio 12 oz', 'Cocina', 'unidad', 48, 30, 4500, ['vaso', 'vasos'], null, 'Bar', 'menaje'),
  C('PAP-001', 'Rollo papel térmico 80 mm', 'Papelería', 'rollo', 12, 6, 3500, ['rollo termico', 'papel impresora', 'rollo de impresora'], null, 'Recepción'),

  // ---------- Hospedaje (servicios que se facturan, no se inventarían) ----------
  C('HOS-001', 'Noche en dormitorio compartido', 'Hospedaje', 'cama-noche', 0, 0, 0, ['noche dormitorio', 'cama', 'dormitorio'], null, 'Recepción', 'servicio'),
  C('HOS-002', 'Noche en habitación privada', 'Hospedaje', 'hab-noche', 0, 0, 0, ['noche privada', 'habitacion privada', 'privada'], null, 'Recepción', 'servicio'),

  // ---------- Menaje de cocina y bar (hoja manuscrita 1) ----------
  C('COC-001', 'Vitrina de cristal', 'Cocina', 'unidad', 1, 1, 0, [], null, 'Cocina', 'activo'),
  C('COC-002', 'Prensa francesa', 'Cocina', 'unidad', 3, 2, 0, ['prensa'], null, 'Cocina', 'menaje'),
  C('COC-003', 'Juego de coctelería completo', 'Cocina', 'juego', 2, 2, 0, ['cocteleria', 'coctelera'], null, 'Bar', 'menaje'),
  C('COC-004', 'Pocillo americano', 'Cocina', 'unidad', 18, 12, 0, ['pocillo', 'taza americano'], null, 'Cocina', 'menaje'),
  C('COC-005', 'Pocillo capuchino', 'Cocina', 'unidad', 20, 12, 0, ['taza capuchino'], null, 'Cocina', 'menaje'),
  C('COC-006', 'Plato pequeño (café)', 'Cocina', 'unidad', 14, 10, 0, ['plato de cafe', 'platico'], null, 'Cocina', 'menaje'),
  C('COC-007', 'Plato de ensalada', 'Cocina', 'unidad', 44, 30, 0, [], null, 'Cocina', 'menaje'),
  C('COC-008', 'Copa de cerveza Stella', 'Cocina', 'unidad', 5, 4, 0, ['copa stella'], null, 'Bar', 'menaje'),
  C('COC-009', 'Copa de whisky', 'Cocina', 'unidad', 22, 12, 0, ['vaso whisky', 'copa whisky'], null, 'Bar', 'menaje'),
  C('COC-010', 'Copa Club Colombia', 'Cocina', 'unidad', 2, 2, 0, ['copa club'], null, 'Bar', 'menaje'),
  C('COC-011', 'Cubeta hielera de acero', 'Cocina', 'unidad', 7, 4, 0, ['hielera acero', 'cubeta acero'], null, 'Bar', 'menaje'),
  C('COC-012', 'Cubeta hielera de plástico', 'Cocina', 'unidad', 4, 2, 0, ['hielera plastico', 'cubeta plastico'], null, 'Bar', 'menaje'),
  C('COC-013', 'Tabla de picar plástica verde', 'Cocina', 'unidad', 1, 1, 0, ['tabla verde'], null, 'Cocina', 'menaje'),
  C('COC-014', 'Tabla de picar de acero', 'Cocina', 'unidad', 1, 1, 0, ['tabla acero'], null, 'Cocina', 'menaje'),
  C('COC-015', 'Cuchara', 'Cocina', 'unidad', 60, 40, 0, ['cucharas'], null, 'Cocina', 'menaje'),
  C('COC-016', 'Tenedor', 'Cocina', 'unidad', 60, 40, 0, ['tenedores'], null, 'Cocina', 'menaje'),
  C('COC-017', 'Cuchillo de mesa', 'Cocina', 'unidad', 56, 40, 0, ['cuchillo', 'cuchillos'], null, 'Cocina', 'menaje'),
  C('COC-018', 'Cuchara pequeña', 'Cocina', 'unidad', 20, 15, 0, ['cucharita', 'cucharitas'], null, 'Cocina', 'menaje'),
  C('COC-019', 'Bandeja', 'Cocina', 'unidad', 5, 3, 0, ['bandejas'], null, 'Cocina', 'menaje'),
  C('COC-020', 'Plato hondo grande', 'Cocina', 'unidad', 42, 30, 0, ['plato hondo'], null, 'Cocina', 'menaje'),
  C('COC-021', 'Plato de sopa', 'Cocina', 'unidad', 40, 30, 0, [], null, 'Cocina', 'menaje'),
  C('COC-022', 'Plato de ensalada de cristal', 'Cocina', 'unidad', 5, 4, 0, [], null, 'Cocina', 'menaje'),
  C('COC-023', 'Salsero grande', 'Cocina', 'unidad', 8, 6, 0, [], null, 'Cocina', 'menaje'),
  C('COC-024', 'Salsero pequeño', 'Cocina', 'unidad', 7, 6, 0, [], null, 'Cocina', 'menaje'),
  C('COC-025', 'Plato blanco', 'Cocina', 'unidad', 30, 20, 0, [], null, 'Cocina', 'menaje'),
  C('COC-026', 'Plato de hojas', 'Cocina', 'unidad', 18, 12, 0, [], null, 'Cocina', 'menaje'),
  C('COC-027', 'Plato blanco delgado', 'Cocina', 'unidad', 21, 15, 0, [], null, 'Cocina', 'menaje'),
  C('COC-028', 'Plato blanco pequeño', 'Cocina', 'unidad', 40, 25, 0, [], null, 'Cocina', 'menaje'),
  C('COC-029', 'Freidora eléctrica', 'Cocina', 'unidad', 1, 1, 0, ['freidora'], null, 'Cocina', 'activo'),
  C('COC-030', 'Jarra pequeña plateada', 'Cocina', 'unidad', 1, 1, 0, [], null, 'Cocina', 'menaje'),
  C('COC-031', 'Jarra pequeña negra Imusa', 'Cocina', 'unidad', 1, 1, 0, ['jarra imusa'], null, 'Cocina', 'menaje'),
  C('COC-032', 'Olla grande (limonada)', 'Cocina', 'unidad', 1, 1, 0, ['olla limonada'], null, 'Cocina', 'menaje'),
  C('COC-033', 'Olla mediana', 'Cocina', 'unidad', 1, 1, 0, [], null, 'Cocina', 'menaje'),
  C('COC-034', 'Jarra de vidrio para agua', 'Cocina', 'unidad', 4, 3, 0, ['jarra de agua', 'jarra vidrio'], null, 'Cocina', 'menaje'),
  C('COC-035', 'Garrafón de agua', 'Cocina', 'unidad', 5, 3, 0, ['garrafon', 'garrafones'], null, 'Cocina', 'menaje'),

  // ---------- Equipos y mobiliario (hoja manuscrita 2) ----------
  C('EQU-001', 'Computador', 'Equipos y mobiliario', 'unidad', 2, 2, 0, [], null, 'Recepción', 'activo'),
  C('EQU-002', 'Televisor', 'Equipos y mobiliario', 'unidad', 1, 1, 0, ['tv'], null, 'Zona social', 'activo'),
  C('EQU-003', 'Tablet', 'Equipos y mobiliario', 'unidad', 1, 1, 0, [], null, 'Recepción', 'activo'),
  C('EQU-004', 'Impresora de facturas', 'Equipos y mobiliario', 'unidad', 1, 1, 0, ['impresora'], null, 'Recepción', 'activo'),
  C('EQU-005', 'Amplificador de sonido 1.er piso', 'Equipos y mobiliario', 'unidad', 1, 1, 0, ['amplificador'], null, 'Piso 1', 'activo'),
  C('EQU-006', 'Sistema de sonido BOSE', 'Equipos y mobiliario', 'unidad', 1, 1, 0, ['bose'], null, 'Zona social', 'activo'),
  C('EQU-007', 'Aire acondicionado', 'Equipos y mobiliario', 'unidad', 4, 4, 0, [], null, 'Habitaciones', 'activo'),
  C('EQU-008', 'Ventilador personalizado', 'Equipos y mobiliario', 'unidad', 26, 26, 0, [], null, 'Habitaciones', 'activo'),
  C('EQU-009', 'Ventilador de piso', 'Equipos y mobiliario', 'unidad', 2, 2, 0, [], null, 'Zona social', 'activo'),
  C('EQU-010', 'Ventilador de asta', 'Equipos y mobiliario', 'unidad', 1, 1, 0, [], null, 'Zona social', 'activo'),
  C('EQU-011', 'Estufa de inducción', 'Equipos y mobiliario', 'unidad', 1, 1, 0, [], null, 'Cocina', 'activo'),
  C('EQU-012', 'Sala en mimbre (sofá 3 puestos + 2 poltronas)', 'Equipos y mobiliario', 'juego', 1, 1, 0, ['sala mimbre'], null, 'Zona social', 'activo'),
  C('EQU-013', 'Silla tapizada verde', 'Equipos y mobiliario', 'unidad', 13, 13, 0, ['silla verde'], null, 'Comedor', 'activo'),
  C('EQU-014', 'Sofá de recepción', 'Equipos y mobiliario', 'unidad', 1, 1, 0, [], null, 'Recepción', 'activo'),
  C('EQU-015', 'Nevecón industrial', 'Equipos y mobiliario', 'unidad', 1, 1, 0, ['nevecon'], null, 'Cocina', 'activo'),
  C('EQU-016', 'Estufa industrial de 6 puestos', 'Equipos y mobiliario', 'unidad', 1, 1, 0, [], null, 'Cocina', 'activo'),
  C('EQU-017', 'Plancha industrial de 1 m', 'Equipos y mobiliario', 'unidad', 1, 1, 0, ['plancha'], null, 'Cocina', 'activo'),
  C('EQU-018', 'Refrigerador Coca-Cola grande (del proveedor)', 'Equipos y mobiliario', 'unidad', 1, 1, 0, [], 's2', 'Bar', 'activo'),
  C('EQU-019', 'Refrigerador Coca-Cola pequeño (del proveedor)', 'Equipos y mobiliario', 'unidad', 1, 1, 0, [], 's2', 'Bar', 'activo'),
  C('EQU-020', 'Mesa en acero inoxidable', 'Equipos y mobiliario', 'unidad', 5, 5, 0, ['mesa acero'], null, 'Cocina', 'activo'),
  C('EQU-021', 'Trampa de grasa en acero inoxidable', 'Equipos y mobiliario', 'unidad', 1, 1, 0, [], null, 'Cocina', 'activo'),
  C('EQU-022', 'Extractor de 20 pulgadas', 'Equipos y mobiliario', 'unidad', 1, 1, 0, ['extractor'], null, 'Cocina', 'activo'),
  C('EQU-023', 'Barra coctelera', 'Equipos y mobiliario', 'unidad', 2, 2, 0, [], null, 'Bar', 'activo'),
  C('EQU-024', 'Escultura de pared Roa Iregui', 'Equipos y mobiliario', 'unidad', 1, 1, 0, ['escultura'], null, 'Zona social', 'activo'),
  C('EQU-025', 'Vitrina de artesanías (del proveedor)', 'Equipos y mobiliario', 'unidad', 1, 1, 0, ['vitrina artesanias'], null, 'Recepción', 'activo'),
];
