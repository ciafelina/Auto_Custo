import assert from 'node:assert/strict';
const base = process.env.TEST_API_URL || 'http://127.0.0.1:9000';
for (let attempt = 0; attempt < 30; attempt++) {
  try { await fetch(base + '/__ready', {signal: AbortSignal.timeout(1000)}); break; }
  catch { await new Promise(resolve => setTimeout(resolve, 100)); }
}
const paths = ['/produtos', '/admin/usuarios', '/admin/medicamentos', '/admin/solicitacoes', '/admin/dashboard', '/perfil/11111111111', '/dashboard/paciente/11111111111', '/documentos', '/interessados', '/arquivos'];
let failures = 0;
for (const path of paths) {
  try {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 401, `${path}: esperado 401, recebido ${response.status}`);
    console.log(`PASS GET ${path}: 401`);
  } catch (error) { failures++; console.error(`FAIL ${error.message}`); }
}
process.exitCode = failures ? 1 : 0;
