import {fixtureCredential} from './session-claim.mjs';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const base='http://127.0.0.1:19001';
function token(cpf){const h=Buffer.from('{"alg":"HS256"}').toString('base64url'),p=Buffer.from(JSON.stringify({credencial:fixtureCredential,cpf,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return `${h}.${p}.${createHmac('sha256','chave-exclusiva-de-testes-nao-usar-em-producao-2026').update(`${h}.${p}`).digest('base64url')}`;}
assert.equal((await fetch(base+'/__ready')).headers.get('X-AutoCusto-Test'),'isolated','Servidor de testes não identificado.');
const db=new DatabaseSync(fileURLToPath(new URL('./.build/autenticacao-test.sqlite',import.meta.url)));db.exec('PRAGMA busy_timeout=10000');
let passed=0,failed=0,next=2000;
const get=id=>db.prepare('SELECT * FROM Solicitacoes WHERE idSolicitacao=?').get(id);
const stock=id=>db.prepare('SELECT quantidadeEstoque AS saldo FROM Medicamentos WHERE idMedicamento=?').get(id)?.saldo;
function seed(status,{quantity=3,balance=7,medicine='present'}={}){
 const id=next++;if(medicine==='present')db.prepare('INSERT INTO Medicamentos(idMedicamento,quantidadeEstoque) VALUES (?,?)').run(id,balance);
 db.prepare('INSERT INTO Solicitacoes(idSolicitacao,idUsuarioCPF,status,IdMedicamento,quantidade,observacao) VALUES (?,22222222222,?,?,?,?)').run(id,status,medicine==='null'?null:id,quantity,'original');return id;
}
async function change(id,status,observation='observação de teste'){
 const response=await fetch(base+`/admin/solicitacoes/${id}/status`,{method:'PATCH',headers:{Authorization:'Bearer '+token('44444444444'),'Content-Type':'application/json'},body:JSON.stringify({status,observacao:observation}),signal:AbortSignal.timeout(15000)});return {status:response.status,text:await response.text()};
}
async function test(name,fn){try{await fn();passed++;console.log('PASS status: '+name);}catch(e){failed++;console.error('FAIL status '+name+': '+e.message);}}
try{
 const allowed=new Set(['Pendente>Aprovado','Pendente>Cancelado','Aprovado>Retirado','Aprovado>Cancelado']);
 for(const from of ['Pendente','Aprovado','Retirado','Cancelado'])for(const to of ['Pendente','Aprovado','Retirado','Cancelado']){
  const id=seed(from),valid=allowed.has(`${from}>${to}`);
  await test(`${from} → ${to}`,async()=>{
   const result=await change(id,to);assert.equal(result.status,valid?200:409);
   assert.equal(get(id).status,valid?to:from);assert.equal(get(id).observacao,valid?'observação de teste':'original');
   assert.equal(stock(id),valid&&to==='Cancelado'?10:7);
   if(!valid)assert.equal(JSON.parse(result.text).erro.codigo,'TRANSICAO_STATUS_INVALIDA');
  });
 }
 for(const status of ['Inexistente','Reprovado','aprovado','',null,7,{},[]]){
  const id=seed('Pendente');await test('entrada inválida '+JSON.stringify(status),async()=>{
   const result=await change(id,status);assert.equal(result.status,400);assert.equal(get(id).status,'Pendente');assert.equal(stock(id),7);
  });
 }
 for(const id of [0,-1,'abc',2147483648])await test('identificador inválido '+id,async()=>assert.equal((await change(id,'Cancelado')).status,400));
 await test('solicitação inexistente',async()=>assert.equal((await change(1999999999,'Cancelado')).status,404));
 const repeated=seed('Pendente');await test('cancelamento não permite reabrir e devolver de novo',async()=>{
  assert.equal((await change(repeated,'Cancelado','cancelamento original')).status,200);assert.equal(stock(repeated),10);
  assert.equal((await change(repeated,'Pendente','não gravar')).status,409);
  assert.equal((await change(repeated,'Cancelado','não gravar')).status,409);
  assert.equal(stock(repeated),10);assert.equal(get(repeated).observacao,'cancelamento original');
 });
 for(const [name,options] of [['quantidade zero',{quantity:0}],['quantidade negativa',{quantity:-2}],['quantidade nula',{quantity:null}],['quantidade acima do limite',{quantity:2147483648}],['medicamento inexistente',{medicine:'missing'}],['medicamento desvinculado',{medicine:'null'}],['estoque nulo',{balance:null}],['estoque negativo',{balance:-1}],['devolução excede limite inteiro',{balance:2147483646}]]){
  const id=seed('Pendente',options),before=stock(id);await test('estorno inválido '+name,async()=>{
   assert.equal((await change(id,'Cancelado')).status,409);assert.equal(get(id).status,'Pendente');assert.equal(get(id).observacao,'original');assert.equal(stock(id),before);
  });
 }
 const rollback=seed('Pendente');db.exec(`CREATE TRIGGER falha_estorno_teste BEFORE UPDATE ON Medicamentos WHEN OLD.idMedicamento=${rollback} BEGIN SELECT RAISE(ABORT,'falha proposital do teste'); END`);
 await test('falha na devolução desfaz status e observação',async()=>{
  const response=await change(rollback,'Cancelado');assert.equal(response.status,500);assert.equal(stock(rollback),7);assert.equal(get(rollback).status,'Pendente');assert.equal(get(rollback).observacao,'original');
 });db.exec('DROP TRIGGER falha_estorno_teste');
 const duplicate=seed('Pendente');await test('dez cancelamentos simultâneos devolvem uma vez',async()=>{
  const responses=await Promise.all(Array.from({length:10},()=>change(duplicate,'Cancelado')));
  assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===409).length,9);assert.equal(stock(duplicate),10);assert.equal(get(duplicate).status,'Cancelado');
 });
 const approval=seed('Pendente');await test('aprovações simultâneas não repetem a transição',async()=>{
  const responses=await Promise.all([change(approval,'Aprovado'),change(approval,'Aprovado')]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(stock(approval),7);assert.equal(get(approval).status,'Aprovado');
 });
 const competing=seed('Pendente');await test('aprovação e cancelamento concorrentes não duplicam estoque',async()=>{
  const [approve,cancel]=await Promise.all([change(competing,'Aprovado'),change(competing,'Cancelado')]);assert.ok([200,409].includes(approve.status));assert.equal(cancel.status,200);assert.equal(stock(competing),10);assert.equal(get(competing).status,'Cancelado');
 });
 const withdrawal=seed('Aprovado');await test('retirada do paciente e cancelamento competem pelo status',async()=>{
  const [cancel,withdraw]=await Promise.all([change(withdrawal,'Cancelado'),fetch(base+`/solicitacoes/${withdrawal}/retirada`,{method:'PATCH',headers:{Authorization:'Bearer '+token('22222222222')},signal:AbortSignal.timeout(15000)})]);
  if(get(withdrawal).status==='Cancelado'){assert.equal(cancel.status,200);assert.equal(withdraw.status,404);assert.equal(stock(withdrawal),10);}
  else{assert.equal(get(withdrawal).status,'Retirado');assert.equal(cancel.status,409);assert.equal(withdraw.status,204);assert.equal(stock(withdrawal),7);}
 });
}finally{db.close();}
console.log(`Status: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
