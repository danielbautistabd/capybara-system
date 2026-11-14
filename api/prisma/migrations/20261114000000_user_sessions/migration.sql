-- Cierra las sesiones abiertas de un usuario: los tokens emitidos antes de esta fecha dejan de valer
-- (cambio de contraseña, desactivación o cambio de rol). La tabla ya tiene RLS activada.
ALTER TABLE "User" ADD COLUMN "sessionsValidFrom" TIMESTAMP(3);
