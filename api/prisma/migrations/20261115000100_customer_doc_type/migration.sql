-- Tipo de documento del cliente (CC, CE, NIT, PP, DIE) para crearlo en Alegra con su identificación.
ALTER TABLE "OrderTab" ADD COLUMN "customerDocType" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN "customerDocType" TEXT;
