import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDbUrl, dbUrlProblem } from '../src/config.js';

const URL = 'postgresql://postgres.abc:clave123@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

test('limpia errores típicos al pegar la dirección en un panel', () => {
  assert.equal(cleanDbUrl('DATABASE_URL', URL), URL);
  assert.equal(cleanDbUrl('DATABASE_URL', `  ${URL}\n`), URL);
  assert.equal(cleanDbUrl('DATABASE_URL', `"${URL}"`), URL);
  assert.equal(cleanDbUrl('DATABASE_URL', `'${URL}'`), URL);
  assert.equal(cleanDbUrl('DATABASE_URL', `DATABASE_URL=${URL}`), URL);
  assert.equal(cleanDbUrl('DATABASE_URL', `DATABASE_URL="${URL}"`), URL);
  assert.equal(cleanDbUrl('DIRECT_URL', undefined), undefined);
});

test('explica qué tiene mal la dirección sin mostrarla', () => {
  assert.equal(dbUrlProblem(URL), null);
  assert.match(dbUrlProblem(''), /no está definida/);
  assert.match(dbUrlProblem('aws-1-us-east-1.pooler.supabase.com:6543/postgres'), /postgresql:\/\//);
  assert.match(dbUrlProblem(URL.replace('clave123', '[YOUR-PASSWORD]')), /YOUR-PASSWORD/);
  assert.match(dbUrlProblem(URL.replace('clave123', 'cla ve')), /espacios/);
  for (const v of ['x', URL.replace('clave123', '[YOUR-PASSWORD]')]) assert.ok(!dbUrlProblem(v).includes('clave123'));
});

test('un token emitido antes del cierre de sesiones ya no vale', async () => {
  const { tokenRevoked } = await import('../src/middleware.js');
  const t = new Date('2026-11-14T15:00:00.400Z');
  const iat = Math.floor(t.getTime() / 1000);
  assert.equal(tokenRevoked(iat, null), false);
  assert.equal(tokenRevoked(iat - 60, t), true);   // sesión vieja
  assert.equal(tokenRevoked(iat, t), false);       // token nuevo entregado en el mismo segundo del cambio
  assert.equal(tokenRevoked(iat + 5, t), false);
});

test('rescata la dirección dentro de un comando y orienta sin mostrar el valor', () => {
  assert.equal(cleanDbUrl('DATABASE_URL', `psql "${URL}"`), URL);
  assert.equal(cleanDbUrl('DATABASE_URL', `export DATABASE_URL=${URL}`), URL);
  assert.equal(cleanDbUrl('DATABASE_URL', URL.replace('postgresql', 'PostgreSQL')), URL);
  assert.match(dbUrlProblem('jdbc:postgresql://x'), /JDBC/);
  assert.match(dbUrlProblem('host=aws-1 port=6543 user=postgres.abc'), /parámetros sueltos/);
  assert.match(dbUrlProblem('https://abc.supabase.co'), /dirección web/);
  assert.match(dbUrlProblem('sb_secret_xxxxx'), /clave de API/);
  assert.match(dbUrlProblem('MiClaveSecreta123'), /solo una contraseña/);
  assert.ok(!dbUrlProblem('MiClaveSecreta123').includes('MiClave'));
});
