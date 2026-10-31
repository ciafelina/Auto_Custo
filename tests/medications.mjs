import {fixtureCredential} from './session-claim.mjs';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const base='http://127.0.0.1:19001';
function token(cpf){
 const h=Buffer.from('{"alg":"HS256"}').toString('base64url');
 const p=Buffer.from(JSON.stringify({credencial:fixtureCredential,cpf,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
 return `${h}.${p}.${createHmac('sha256','chave-exclusiva-de-testes-nao-usar-em-producao-2026').update(`${h}.${p}`).digest('base64url')}`;
}
assert.equal((await fetch(base+'/__ready')).headers.get('X-AutoCusto-Test'),'isolated','Servidor de testes não identificado.');
const db=new DatabaseSync(fileURLToPath(new URL('./.build/autenticacao-test.sqlite',import.meta.url)));
db.exec('PRAGMA busy_timeout=10000');
const seed=(id,stock)=>db.prepare('INSERT INTO Medicamentos(idMedicamento,quantidadeEstoque,nome) VALUES (?,?,?)').run(id,stock,'Medicamento original');
const get=id=>db.prepare('SELECT * FROM Medicamentos WHERE idMedicamento=?').get(id);
const details={nome:'Medicamento editado',categoria:'Categoria editada',dosagem:'20 mg',fabricante:'Fabricante editado',estoqueMinimo:4,descricao:'Descrição editada'};
async function call(method,route,body,cpf='44444444444'){
 const response=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token(cpf),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const text=await response.text();
 assert.ok(response.ok,`${method} ${route}: HTTP ${response.status}`);
 return {status:response.status,text};
}
const edit=(id,extra={})=>call('PUT',`/admin/medicamentos/${id}`,{...details,...extra});
const reserve=(id,quantity)=>call('POST','/solicitacoes',{cpf:'22222222222',idMedicamento:id,quantidade:quantity},'22222222222');
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS edição: '+name);}catch(e){failed++;console.error('FAIL edição '+name+': '+e.message);}}
try{
 seed(800,10);
 await test('saldo antigo após pedido não volta ao salvar',async()=>{
  await reserve(800,3);assert.equal(get(800).quantidadeEstoque,7);
  await edit(800,{estoque:10});assert.equal(get(800).quantidadeEstoque,7);
  const med=get(800);for(const [field,value] of Object.entries(details))assert.equal(med[field],value);
  const order=db.prepare('SELECT quantidade,status FROM Solicitacoes WHERE IdMedicamento=800').get();
  assert.equal(order.quantidade,3);assert.equal(order.status,'Pendente');
 });
 seed(801,5);
 await test('saldo antigo após ajuste não substitui saldo atual',async()=>{
  await call('PATCH','/admin/medicamentos/801/estoque',{estoque:12});
  await edit(801,{estoque:5});assert.equal(get(801).quantidadeEstoque,12);
 });
 for(const [name,id,extra] of [['omitido',802,{}],['nulo',803,{estoque:null}],['texto inválido',804,{estoque:'inválido'}],['negativo',805,{estoque:-50}],['nome alternativo',806,{quantidadeEstoque:999}]]){
  seed(id,6);
  await test('PUT ignora estoque '+name,async()=>{await edit(id,extra);assert.equal(get(id).quantidadeEstoque,6);assert.equal(get(id).nome,details.nome);});
 }
 seed(807,0);
 await test('edição não repõe estoque zerado',async()=>{await edit(807,{estoque:20});assert.equal(get(807).quantidadeEstoque,0);});
 seed(808,10);
 await test('edição e pedido simultâneos preservam movimentações',async()=>{
  await call('PATCH','/admin/medicamentos/808/estoque',{estoque:7});
  await Promise.all([reserve(808,1),edit(808,{estoque:10})]);
  assert.equal(get(808).quantidadeEstoque,6);assert.equal(get(808).nome,details.nome);
  assert.equal(db.prepare('SELECT SUM(quantidade) AS total FROM Solicitacoes WHERE IdMedicamento=808').get().total,1);
 });
 await test('cadastro mantém estoque inicial',async()=>{
  const response=await call('POST','/admin/medicamentos',{...details,nome:'Cadastro novo teste item 5',estoque:11});assert.equal(response.status,201);
  const med=db.prepare('SELECT * FROM Medicamentos WHERE nome=?').get('Cadastro novo teste item 5');assert.equal(med.quantidadeEstoque,11);assert.equal(med.estoqueMinimo,4);
 });
 await test('ação específica continua alterando estoque',async()=>{
  await call('PATCH','/admin/medicamentos/802/estoque',{estoque:3});assert.equal(get(802).quantidadeEstoque,3);assert.equal(get(802).nome,details.nome);
 });
}finally{db.close();}
console.log(`Medicamentos: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
