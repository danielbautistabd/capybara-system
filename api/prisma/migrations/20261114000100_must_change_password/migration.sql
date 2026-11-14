-- Contraseña temporal: quien la tiene debe cambiarla al entrar antes de usar el sistema.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
