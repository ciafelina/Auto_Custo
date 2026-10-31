import {fixtureCredential} from './session-claim.mjs';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const base='http://127.0.0.1:19001';
function token(cpf){const h=Buffer.from('{"alg":"HS256"}').toString('base64url'),p=Buffer.from(JSON.stringify({credencial:fixtureCredential,cpf:String(cpf),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return `${h}.${p}.${createHmac('sha256','chave-exclusiva-de-testes-nao-usar-em-producao-2026').update(`${h}.${p}`).digest('base64url')}`;}
assert.equal((await fetch(base+'/__ready')).headers.get('X-AutoCusto-Test'),'isolated');
const db=new DatabaseSync(fileURLToPath(new URL('./.build/autenticacao-test.sqlite',import.meta.url)));db.exec('PRAGMA busy_timeout=10000');
let next=5000,passed=0,failed=0;
const user=cpf=>db.prepare('SELECT * FROM Usuarios WHERE idUsuarioCPF=?').get(cpf);
const med=id=>db.prepare('SELECT * FROM Medicamentos WHERE idMedicamento=?').get(id);
const requests=cpf=>db.prepare('SELECT * FROM Solicitacoes WHERE idUsuarioCPF=? ORDER BY idSolicitacao').all(cpf);
function seed(status='none'){
 const id=next++,cpf=30000000000+id;
 db.prepare("INSERT INTO Usuarios(idUsuarioCPF,nomeUsuario,IdCargo,status,email) VALUES (?, 'Pessoa preservada',3,'Ativo','historico@example.test')").run(cpf);
 db.prepare("INSERT INTO Medicamentos(idMedicamento,quantidadeEstoque,nome,descricao) VALUES (?,7,'Medicamento preservado','Descrição preservada')").run(id);
 if(status!=='none')db.prepare("INSERT INTO Solicitacoes(idSolicitacao,idUsuarioCPF,IdMedicamento,quantidade,status,observacao,dataSolicitacao) VALUES (?,?,?,3,?,'histórico preservado','2026-10-25 10:00:00')").run(id,cpf,id,status);
 return {id,cpf};
}
async function call(method,path,cpf,body){const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token(cpf),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});return {status:response.status,text:await response.text()};}
async function test(name,fn){try{await fn();passed++;console.log('PASS histórico: '+name);}catch(e){failed++;console.error('FAIL histórico '+name+': '+e.message);}}
try{
 for(const status of ['Retirado','Cancelado','Pendente','Aprovado','Legado',null]){
  const {id,cpf}=seed(status),beforeUser=user(cpf),beforeMed=med(id),beforeRequests=requests(cpf);
  await test('conta com solicitação '+String(status)+' não é excluída',async()=>{
   const result=await call('DELETE',`/perfil/${cpf}`,cpf);assert.equal(result.status,409);assert.equal(JSON.parse(result.text).erro.codigo,'HISTORICO_VINCULADO');
   assert.deepEqual(user(cpf),beforeUser);assert.deepEqual(requests(cpf),beforeRequests);assert.deepEqual(med(id),beforeMed);
  });
 }
 for(const status of ['Retirado','Cancelado','Pendente','Aprovado','Legado',null]){
  const {id,cpf}=seed(status),beforeUser=user(cpf),beforeMed=med(id),beforeRequests=requests(cpf);
  await test('medicamento com solicitação '+String(status)+' mantém vínculo',async()=>{
   const result=await call('DELETE',`/admin/medicamentos/${id}`,'44444444444');assert.equal(result.status,409);assert.equal(JSON.parse(result.text).erro.codigo,'HISTORICO_VINCULADO');
   assert.deepEqual(med(id),beforeMed);assert.deepEqual(requests(cpf),beforeRequests);assert.deepEqual(user(cpf),beforeUser);
  });
 }
 const noUserHistory=seed();await test('conta sem solicitações pode ser excluída',async()=>{
  assert.equal((await call('DELETE',`/perfil/${noUserHistory.cpf}`,noUserHistory.cpf)).status,204);assert.equal(user(noUserHistory.cpf),undefined);assert.equal(requests(noUserHistory.cpf).length,0);assert.ok(med(noUserHistory.id));
  assert.equal((await call('DELETE',`/perfil/${noUserHistory.cpf}`,noUserHistory.cpf)).status,401);
 });
 const noMedHistory=seed();await test('medicamento sem solicitações pode ser excluído',async()=>{
  assert.equal((await call('DELETE',`/admin/medicamentos/${noMedHistory.id}`,'44444444444')).status,204);assert.equal(med(noMedHistory.id),undefined);assert.ok(user(noMedHistory.cpf));
 });
 await test('medicamento inexistente retorna 404',async()=>assert.equal((await call('DELETE','/admin/medicamentos/1999999999','44444444444')).status,404));
 const failedUser=seed();db.exec(`CREATE TRIGGER falha_exclusao_usuario BEFORE DELETE ON Usuarios WHEN OLD.idUsuarioCPF=${failedUser.cpf} BEGIN SELECT RAISE(ABORT,'falha proposital do teste'); END`);
 await test('falha de exclusão de conta mantém seus dados',async()=>{const before=user(failedUser.cpf);assert.equal((await call('DELETE',`/perfil/${failedUser.cpf}`,failedUser.cpf)).status,500);assert.deepEqual(user(failedUser.cpf),before);});db.exec('DROP TRIGGER falha_exclusao_usuario');
 const failedMed=seed();db.exec(`CREATE TRIGGER falha_exclusao_medicamento BEFORE DELETE ON Medicamentos WHEN OLD.idMedicamento=${failedMed.id} BEGIN SELECT RAISE(ABORT,'falha proposital do teste'); END`);
 await test('falha de exclusão de medicamento mantém seus dados',async()=>{const before=med(failedMed.id);assert.equal((await call('DELETE',`/admin/medicamentos/${failedMed.id}`,'44444444444')).status,500);assert.deepEqual(med(failedMed.id),before);});db.exec('DROP TRIGGER falha_exclusao_medicamento');
 await test('histórico continua legível com nomes e vínculos preservados',async()=>{
  const row=db.prepare("SELECT s.observacao,u.nomeUsuario,m.nome,m.descricao FROM Solicitacoes s JOIN Usuarios u ON u.idUsuarioCPF=s.idUsuarioCPF JOIN Medicamentos m ON m.idMedicamento=s.IdMedicamento WHERE s.status='Retirado' AND u.email='historico@example.test' LIMIT 1").get();
  assert.ok(row);assert.equal(row.nomeUsuario,'Pessoa preservada');assert.equal(row.nome,'Medicamento preservado');assert.equal(row.descricao,'Descrição preservada');assert.equal(row.observacao,'histórico preservado');
 });
 await test('exclusão de medicamento disputando pedido não cria órfão',async()=>{
  for(let i=0;i<5;i++){
   const {id,cpf}=seed();const [removed,ordered]=await Promise.all([call('DELETE',`/admin/medicamentos/${id}`,'44444444444'),call('POST','/solicitacoes',cpf,{cpf:String(cpf),idMedicamento:id,quantidade:2})]);
   if(ordered.status===201){assert.equal(removed.status,409);assert.ok(med(id));assert.equal(requests(cpf).length,1);assert.equal(med(id).quantidadeEstoque,5);}
   else{assert.equal(removed.status,204);assert.equal(ordered.status,404);assert.equal(med(id),undefined);assert.equal(requests(cpf).length,0);}
  }
 });
 await test('exclusão de conta disputando pedido não apaga nem deixa pedido órfão',async()=>{
  for(let i=0;i<5;i++){
   const {id,cpf}=seed();const [removed,ordered]=await Promise.all([call('DELETE',`/perfil/${cpf}`,cpf),call('POST','/solicitacoes',cpf,{cpf:String(cpf),idMedicamento:id,quantidade:2})]);
   if(ordered.status===201){assert.equal(removed.status,409);assert.ok(user(cpf));assert.equal(requests(cpf).length,1);assert.equal(med(id).quantidadeEstoque,5);}
   else{assert.equal(removed.status,204);assert.ok([401,404].includes(ordered.status));assert.equal(user(cpf),undefined);assert.equal(requests(cpf).length,0);assert.equal(med(id).quantidadeEstoque,7);}
  }
 });
}finally{db.close();}
console.log(`Histórico: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
