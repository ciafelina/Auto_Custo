import {fixtureCredential} from './session-claim.mjs';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const base = 'http://127.0.0.1:19001';
const key = 'chave-exclusiva-de-testes-nao-usar-em-producao-2026';
function token(cpf, cargo = 3, secret = key, exp = Math.floor(Date.now()/1000)+3600) {
  const h = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const p = Buffer.from(JSON.stringify({credencial:fixtureCredential,cpf,nome:'Teste',cargo,exp,sub:'SCHOOLER_API'})).toString('base64url');
  return `${h}.${p}.${createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;
}
const patient = token('11111111111'), employee = token('33333333333',2), admin = token('44444444444',1);
let passed=0, failed=0;
function verify(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch(e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
async function check(name, method, path, auth, body, expected) {
  try {
    const response = await fetch(base + path, {method, headers:{...(auth ? {Authorization:auth}:{}), ...(body ? {'Content-Type':'application/json'}:{})}, body:body ? JSON.stringify(body):undefined, signal:AbortSignal.timeout(5000)});
    if (response.status !== expected) {
      const detail = response.status >= 400 ? (await response.text()).slice(0,1500) : '';
      assert.fail(`${name}: esperado ${expected}, recebido ${response.status}. ${detail}`);
    }
    passed++; console.log(`PASS ${name}`);
  } catch(e) { failed++; console.error(`FAIL ${e.message}`); }
}
let ready = false;
for (let i=0;i<40;i++) {
  try {
    const response = await fetch(base+'/__ready', {signal:AbortSignal.timeout(1000)});
    assert.equal(response.headers.get('X-AutoCusto-Test'), 'isolated', 'A porta 19001 não pertence ao servidor de testes; execução cancelada.');
    ready=true; break;
  } catch(e) {
    if (e.code === 'ERR_ASSERTION') throw e;
    await new Promise(r=>setTimeout(r,100));
  }
}
assert.ok(ready, 'Servidor de testes não iniciou.');
const db = new DatabaseSync(fileURLToPath(new URL('./.build/autenticacao-test.sqlite', import.meta.url)), {readOnly:true});
const privateRoutes = [
 ['GET','/produtos'], ['GET','/perfil/11111111111'], ['PUT','/perfil/11111111111'], ['DELETE','/perfil/11111111111'],
 ['GET','/dashboard/paciente/11111111111'], ['POST','/solicitacoes'], ['PATCH','/solicitacoes/1/retirada'],
 ['GET','/admin/dashboard'], ['GET','/admin/usuarios'], ['POST','/admin/usuarios'], ['PUT','/admin/usuarios/22222222222'], ['PATCH','/admin/usuarios/22222222222/cargo'], ['PATCH','/admin/usuarios/22222222222/status'],
 ['GET','/admin/medicamentos'], ['POST','/admin/medicamentos'], ['PUT','/admin/medicamentos/1'], ['PATCH','/admin/medicamentos/1/estoque'], ['DELETE','/admin/medicamentos/1'],
 ['GET','/admin/solicitacoes'], ['PATCH','/admin/solicitacoes/1/status'],
 ...['documentos','interessados','arquivos'].flatMap(p=>[['GET','/'+p],['POST','/'+p]])
];
for (const [method,path] of privateRoutes) await check(`sem token ${method} ${path}`,method,path,null,method==='GET'?null:{},401);
verify('negações sem token não alteram o banco',()=>{
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM Usuarios').get().total,7);
  assert.equal(db.prepare('SELECT quantidadeEstoque AS estoque FROM Medicamentos WHERE idMedicamento=1').get().estoque,10);
  assert.equal(db.prepare('SELECT status FROM Solicitacoes WHERE idSolicitacao=1').get().status,'Aprovado');
});
await check('login público valida corpo','POST','/login',null,{},400);
await check('cadastro público valida corpo','POST','/usuarios',null,{},400);
await check('preflight público','OPTIONS','/admin/usuarios',null,null,204);
await check('GET usuarios não vira público','GET','/usuarios',null,null,401);
await check('prefixo login não vira público','POST','/login/extra',null,{},401);
for (const [name,auth] of [
 ['token malformado','Bearer abc'], ['assinatura inválida','Bearer '+token('11111111111',3,'outra-chave')],
 ['expirado','Bearer '+token('11111111111',3,key,1)], ['sem Bearer',patient], ['CPF vazio','Bearer '+token('')],
 ['CPF inválido','Bearer '+token('abc')], ['inativo','Bearer '+token('55555555555',1)], ['excluído','Bearer '+token('99999999999',1)],
 ['cargo desconhecido','Bearer '+token('66666666666',99)]
]) await check(name,'GET','/produtos',auth,null,401);
for (const [method,path] of privateRoutes.filter(([,p])=>p.startsWith('/admin/') || /^\/(documentos|interessados|arquivos)$/.test(p)))
  await check(`paciente bloqueado ${method} ${path}`,method,path,'Bearer '+patient,method==='GET'?null:{},403);
for (const method of ['GET','PUT','DELETE']) await check(`perfil alheio ${method}`,method,'/perfil/22222222222','Bearer '+patient,method==='PUT'?{}:null,403);
await check('painel alheio','GET','/dashboard/paciente/22222222222','Bearer '+patient,null,403);
await check('pedido em CPF alheio','POST','/solicitacoes','Bearer '+patient,{cpf:'22222222222',idMedicamento:1,quantidade:1},403);
await check('retirada alheia','PATCH','/solicitacoes/2/retirada','Bearer '+patient,{},404);
verify('retirada alheia preserva o pedido',()=>assert.equal(db.prepare('SELECT status FROM Solicitacoes WHERE idSolicitacao=2').get().status,'Aprovado'));
await check('retirada própria','PATCH','/solicitacoes/1/retirada','Bearer '+patient,{},204);
await check('retirada repetida','PATCH','/solicitacoes/1/retirada','Bearer '+patient,{},404);
await check('retirada pendente','PATCH','/solicitacoes/3/retirada','Bearer '+patient,{},404);
await check('perfil próprio','PUT','/perfil/11111111111','Bearer '+patient,{telefone:'123',dataNascimento:'2000-01-01'},200);
await check('CPF com zero e máscara','PUT','/perfil/012.345.678-90','Bearer '+token('1234567890'),{telefone:'123',dataNascimento:'2000-01-01'},200);
verify('CPF com zero atualiza o titular correto',()=>assert.equal(db.prepare('SELECT telefone FROM Usuarios WHERE idUsuarioCPF=1234567890').get().telefone,'123'));
await check('funcionário edita usuário','PUT','/admin/usuarios/22222222222','Bearer '+employee,{nome:'Editado',email:'teste@example.test'},200);
await check('funcionário altera estoque','PATCH','/admin/medicamentos/1/estoque','Bearer '+employee,{estoque:12},200);
await check('funcionário não muda cargo','PATCH','/admin/usuarios/33333333333/cargo','Bearer '+employee,{idCargo:1},403);
await check('barras extras não contornam cargo','PATCH','/admin//usuarios/33333333333/cargo/','Bearer '+employee,{idCargo:1},403);
await check('cargo no JWT não concede acesso','PATCH','/admin/usuarios/11111111111/cargo','Bearer '+token('11111111111',1),{idCargo:1},403);
verify('mutações autorizadas persistem e negadas não persistem',()=>{
  assert.equal(db.prepare('SELECT status FROM Solicitacoes WHERE idSolicitacao=1').get().status,'Retirado');
  assert.equal(db.prepare('SELECT status FROM Solicitacoes WHERE idSolicitacao=3').get().status,'Pendente');
  assert.equal(db.prepare('SELECT nomeUsuario AS nome FROM Usuarios WHERE idUsuarioCPF=22222222222').get().nome,'Editado');
  assert.equal(db.prepare('SELECT IdCargo AS cargo FROM Usuarios WHERE idUsuarioCPF=33333333333').get().cargo,2);
  assert.equal(db.prepare('SELECT IdCargo AS cargo FROM Usuarios WHERE idUsuarioCPF=11111111111').get().cargo,3);
  assert.equal(db.prepare('SELECT quantidadeEstoque AS estoque FROM Medicamentos WHERE idMedicamento=1').get().estoque,12);
});
await check('administrador muda cargo','PATCH','/admin/usuarios/33333333333/cargo','Bearer '+admin,{idCargo:3},200);
await check('cargo revogado vale imediatamente','PUT','/admin/usuarios/22222222222','Bearer '+employee,{nome:'Não permitido'},403);
await check('administrador desativa conta','PATCH','/admin/usuarios/11111111111/status','Bearer '+admin,{status:'Inativo'},200);
await check('conta desativada perde acesso','PUT','/perfil/11111111111','Bearer '+patient,{},401);
await check('cadastro público não aceita cargo administrativo','POST','/usuarios',null,{cpf:'77777777777',nomeCompleto:'Paciente de teste',dataNascimento:'2000-01-01',senha:'senha-apenas-de-teste',idCargo:1,cargo:1},201);
verify('cadastro público mantém cargo paciente',()=>assert.equal(db.prepare('SELECT IdCargo AS cargo FROM Usuarios WHERE idUsuarioCPF=77777777777').get().cargo,3));
try {
  const login=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credencial:fixtureCredential,cpf:'77777777777',senha:'senha-apenas-de-teste'})});
  assert.equal(login.status,200);
  const data=await login.json();
  assert.equal(data.sucesso,true);
  assert.ok(data.dados.token_jwt);
  passed++; console.log('PASS login real emite token');
  await check('token emitido no login acessa perfil próprio','PUT','/perfil/77777777777','Bearer '+data.dados.token_jwt,{telefone:'456',dataNascimento:'2000-01-01'},200);
  await check('token emitido no login não acessa administração','PUT','/admin/usuarios/22222222222','Bearer '+data.dados.token_jwt,{nome:'Não permitido'},403);
} catch(e) { failed++; console.error('FAIL fluxo cadastro/login: '+e.message); }
db.close();
console.log(`Resultado: ${passed} aprovados; ${failed} falhas.`);
process.exitCode = failed ? 1 : 0;
