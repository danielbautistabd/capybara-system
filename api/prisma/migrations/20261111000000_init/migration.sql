-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPERVISOR', 'CAJERO', 'EMPLEADO', 'SOCIO', 'AUDITOR');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('entrada', 'devolucion', 'ajuste_pos', 'salida', 'marchado', 'consumo_interno', 'cortesia', 'danado', 'vencido', 'perdida', 'ajuste_neg');

-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('pendiente', 'aprobado', 'rechazado', 'anulado', 'duplicado', 'requiere_info');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('manual', 'whatsapp', 'whatsapp_foto', 'whatsapp_audio', 'factura', 'sheets', 'conteo', 'sistema', 'alegra');

-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('pendiente_analisis', 'pendiente_aprobacion', 'aprobado', 'rechazado', 'duplicado', 'procesado', 'requiere_info');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLEADO',
    "area" TEXT,
    "areas" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "contact" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "leadDays" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "alegraId" TEXT,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'consumible',
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "stockInit" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "stockCurrent" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "stockMin" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "stockMax" DECIMAL(14,3),
    "avgCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lastPrice" DECIMAL(14,2),
    "supplierId" TEXT,
    "location" TEXT,
    "expiresAt" TIMESTAMP(3),
    "photoUrl" TEXT,
    "salePrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saleTaxPct" DECIMAL(5,2),
    "packSize" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "alegraItemId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'activo',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "unitCost" DECIMAL(14,2),
    "userId" TEXT,
    "reportedBy" TEXT,
    "area" TEXT,
    "reason" TEXT,
    "source" "Source" NOT NULL,
    "evidenceId" TEXT,
    "status" "MovementStatus" NOT NULL DEFAULT 'pendiente',
    "confidence" DOUBLE PRECISION,
    "fingerprint" TEXT NOT NULL,
    "invoice" TEXT,
    "purchaseId" TEXT,
    "inboxItemId" TEXT,
    "importRowId" TEXT,
    "reversesId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalCount" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countedBy" TEXT NOT NULL,
    "sessionId" TEXT,
    "notes" TEXT,

    CONSTRAINT "PhysicalCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoice" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "payMethod" TEXT NOT NULL,
    "receivedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'borrador',
    "kind" TEXT NOT NULL DEFAULT 'compra',
    "source" "Source" NOT NULL DEFAULT 'manual',
    "alegraBillId" TEXT,
    "alegraSyncedAt" TIMESTAMP(3),
    "requestedBy" TEXT,
    "attachmentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "price" DECIMAL(14,2) NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "supplierId" TEXT,
    "payMethod" TEXT NOT NULL,
    "source" "Source" NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'registrado',
    "attachmentId" TEXT,
    "fingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "extracted" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppChat" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxItem" (
    "id" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "fromName" TEXT,
    "ts" TIMESTAMP(3) NOT NULL,
    "msgType" TEXT NOT NULL,
    "text" TEXT,
    "transcript" TEXT,
    "attachmentId" TEXT,
    "analysis" JSONB,
    "confidence" DOUBLE PRECISION,
    "status" "InboxStatus" NOT NULL DEFAULT 'pendiente_analisis',
    "reviewNote" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "headerRow" INTEGER NOT NULL DEFAULT 1,
    "mapping" JSONB NOT NULL,
    "keyColumns" TEXT[],
    "cron" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SheetSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "mapped" JSONB,
    "status" TEXT NOT NULL DEFAULT 'nuevo',
    "error" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "trigger" TEXT NOT NULL,
    "stats" JSONB,
    "error" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byUserId" TEXT,
    "totals" JSONB NOT NULL,
    "rows" JSONB NOT NULL,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightReport" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period" TEXT NOT NULL,
    "question" TEXT,
    "generatedBy" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "digest" JSONB NOT NULL,
    "error" TEXT,

    CONSTRAINT "InsightReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlegraSyncLog" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "ref" TEXT,

    CONSTRAINT "AlegraSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "role" "Role" NOT NULL,
    "perms" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role")
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "reason" TEXT,
    "requestedBy" TEXT NOT NULL,
    "area" TEXT,
    "status" TEXT NOT NULL DEFAULT 'abierta',
    "purchaseId" TEXT,

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerDoc" TEXT,
    "room" TEXT,
    "payMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'borrador',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "issuedBy" TEXT,
    "issuedAt" TIMESTAMP(3),
    "alegraInvoiceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "taxPct" DECIMAL(5,2) NOT NULL,
    "movementId" TEXT,

    CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_taxId_key" ON "Supplier"("taxId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_alegraId_key" ON "Supplier"("alegraId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_alegraItemId_key" ON "Product"("alegraItemId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Movement_reversesId_key" ON "Movement"("reversesId");

-- CreateIndex
CREATE INDEX "Movement_productId_ts_idx" ON "Movement"("productId", "ts");

-- CreateIndex
CREATE INDEX "Movement_fingerprint_idx" ON "Movement"("fingerprint");

-- CreateIndex
CREATE INDEX "Movement_status_idx" ON "Movement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_alegraBillId_key" ON "Purchase"("alegraBillId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_supplierId_invoice_kind_key" ON "Purchase"("supplierId", "invoice", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_sha256_key" ON "Attachment"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "InboxItem_waMessageId_key" ON "InboxItem"("waMessageId");

-- CreateIndex
CREATE INDEX "InboxItem_status_idx" ON "InboxItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_sourceId_rowKey_key" ON "ImportRow"("sourceId", "rowKey");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_number_key" ON "SalesInvoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_alegraInvoiceId_key" ON "SalesInvoice"("alegraInvoiceId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_inboxItemId_fkey" FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "ImportRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "Movement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalCount" ADD CONSTRAINT "PhysicalCount_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "WhatsAppChat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SheetSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SheetSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

