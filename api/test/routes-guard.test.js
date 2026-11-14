import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Regla del proyecto: toda ruta que escribe exige un permiso (perm o can). Solo quedan fuera las acciones de la propia
// cuenta: iniciar sesión y cambiar la propia contraseña (exige sesión y la contraseña actual).
test('toda ruta de escritura exige permiso', () => {
  const sin = [];
  const cuenta = ["r.post('/auth/login'", "r.post('/auth/password'"];
  for (const f of fs.readdirSync(new URL('../src/', import.meta.url)).filter((x) => /^routes.*\.js$/.test(x))) {
    for (const line of fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8').split('\n')) {
      if (/^r\.(post|put|patch|delete)\(/.test(line) && !/perm\(|can\(/.test(line) && !cuenta.some((c) => line.startsWith(c))) sin.push(`${f}: ${line.slice(0, 80)}`);
    }
  }
  assert.deepEqual(sin, []);
});
