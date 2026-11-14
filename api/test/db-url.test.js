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
