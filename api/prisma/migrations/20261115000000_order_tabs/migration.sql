-- Pedidos con cuenta abierta: cada pedido es una fila; al cerrar la cuenta se genera una factura.
CREATE TABLE "OrderTab" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerDoc" TEXT,
    "room" TEXT,
    "status" TEXT NOT NULL DEFAULT 'abierta',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedBy" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "payMethod" TEXT,
    "invoiceId" TEXT,
    "voidReason" TEXT,
    "notes" TEXT,
    CONSTRAINT "OrderTab_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "tabId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "taxPct" INTEGER NOT NULL,
    "waiter" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pedido',
    "voidReason" TEXT,
    "voidedBy" TEXT,
    "notes" TEXT,
    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderTab_number_key" ON "OrderTab"("number");
CREATE UNIQUE INDEX "OrderTab_invoiceId_key" ON "OrderTab"("invoiceId");
CREATE INDEX "OrderTab_status_openedAt_idx" ON "OrderTab"("status", "openedAt");
CREATE INDEX "OrderLine_tabId_idx" ON "OrderLine"("tabId");
CREATE INDEX "OrderLine_ts_idx" ON "OrderLine"("ts");

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "OrderTab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Solo el backend (dueño de las tablas) las lee; nada expuesto a la API pública de Supabase.
ALTER TABLE "OrderTab" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderLine" ENABLE ROW LEVEL SECURITY;
