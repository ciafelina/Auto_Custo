import {fixtureCredential} from './session-claim.mjs';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const base='http://127.0.0.1:19001';
const header=Buffer.from('{"alg":"HS256"}').toString('base64url');
const payload=Buffer.from(JSON.stringify({credencial:fixtureCredential,cpf:'22222222222',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const jwt=`${header}.${payload}.${createHmac('sha256','chave-exclusiva-de-testes-nao-usar-em-producao-2026').update(`${header}.${payload}`).digest('base64url')}`;
const ready=await fetch(base+'/__ready');
assert.equal(ready.headers.get('X-AutoCusto-Test'),'isolated','Servidor de testes não identificado.');
const db=new DatabaseSync(fileURLToPath(new URL('./.build/autenticacao-test.sqlite',import.meta.url)));
db.exec('PRAGMA busy_timeout=10000');
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS pedido: '+name);}catch(e){failed++;console.error('FAIL pedido '+name+': '+e.message);}}
async function order(body){
 const response=await fetch(base+'/solicitacoes',{method:'POST',headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 return {status:response.status,text:await response.text()};
}
const seed=(id,stock)=>db.prepare('INSERT INTO Medicamentos(idMedicamento,quantidadeEstoque) VALUES (?,?)').run(id,stock);
const stock=id=>db.prepare('SELECT quantidadeEstoque AS estoque FROM Medicamentos WHERE idMedicamento=?').get(id)?.estoque;
const rows=id=>db.prepare('SELECT * FROM Solicitacoes WHERE IdMedicamento=?').all(id);
const body=(id,quantity)=>({cpf:'22222222222',idMedicamento:id,quantidade:quantity});
const badQuantities=[['zero',0],['negativa',-1],['fracionária',1.5],['texto','1'],['texto inválido','abc'],['nula',null],['booleana',true],['objeto',{}],['array',[]],['acima do limite inteiro',2147483648],['ausente',undefined]];
try{
 for(let i=0;i<badQuantities.length;i++){
  const [name,quantity]=badQuantities[i],id=200+i;
  seed(id,10);
  await test('quantidade '+name,async()=>{
   const response=await order(body(id,quantity));assert.equal(response.status,400,'Quantidade inválida deve retornar 400.');
   assert.equal(stock(id),10);assert.equal(rows(id).length,0);
  });
 }
 for(const [name,id] of [['ausente',undefined],['zero',0],['negativo',-1],['texto','1'],['fracionário',1.5],['nulo',null],['fora do intervalo',2147483648]]){
  await test('medicamento '+name,async()=>{
   const before=db.prepare('SELECT COUNT(*) AS total FROM Solicitacoes').get().total;
   const response=await order(body(id,1));assert.equal(response.status,400);
   assert.equal(db.prepare('SELECT COUNT(*) AS total FROM Solicitacoes').get().total,before);
  });
 }
 for(const invalid of [[],null])await test('corpo '+JSON.stringify(invalid),async()=>assert.equal((await order(invalid)).status,400));
 for(const [name,id,available,requested,expected] of [['válido',500,5,2,201],['limite exato',501,3,3,201],['insuficiente',502,2,3,409],['zerado',503,0,1,409],['negativo',504,-2,1,409],['indefinido',505,null,1,409],['máximo inteiro válido',506,10,2147483647,409]]){
  seed(id,available);
  await test('estoque '+name,async()=>{
   const response=await order(body(id,requested));assert.equal(response.status,expected);
   assert.equal(stock(id),expected===201?available-requested:available);
   const records=rows(id);assert.equal(records.length,expected===201?1:0);
   if(expected===201){assert.equal(records[0].quantidade,requested);assert.equal(records[0].idUsuarioCPF,22222222222);assert.equal(records[0].status,'Pendente');assert.ok(records[0].dataSolicitacao);}
   else{const error=JSON.parse(response.text);assert.equal(error.erro.codigo,'ESTOQUE_INSUFICIENTE');}
  });
 }
 await test('medicamento inexistente',async()=>{
  const response=await order(body(999999,1));assert.equal(response.status,404);assert.equal(rows(999999).length,0);
 });
 seed(507,4);
 db.exec("CREATE TRIGGER falha_pedido_teste BEFORE INSERT ON Solicitacoes WHEN NEW.IdMedicamento=507 BEGIN SELECT RAISE(ABORT,'falha proposital do teste'); END");
 await test('falha ao gravar pedido desfaz baixa',async()=>{
  const response=await order(body(507,2));assert.equal(response.status,500);assert.equal(stock(507),4);assert.equal(rows(507).length,0);
 });
 db.exec('DROP TRIGGER falha_pedido_teste');
 seed(508,5);
 await test('dois pedidos disputam cinco unidades',async()=>{
  const responses=await Promise.all([order(body(508,4)),order(body(508,4))]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal(stock(508),1);assert.equal(rows(508).length,1);
 });
 seed(509,10);
 await test('vinte pedidos simultâneos reservam só dez unidades',async()=>{
  const responses=await Promise.all(Array.from({length:20},()=>order(body(509,1))));
  const statusCounts=responses.reduce((counts,r)=>({...counts,[r.status]:(counts[r.status]||0)+1}),{});
  const diagnostics='Respostas recebidas: '+JSON.stringify(statusCounts)+' '+responses.filter(r=>r.status===500).slice(0,2).map(r=>r.text).join(' ');
  assert.equal(responses.filter(r=>r.status===201).length,10,diagnostics);assert.equal(responses.filter(r=>r.status===409).length,10,diagnostics);
  assert.equal(stock(509),0);assert.equal(rows(509).length,10);assert.equal(rows(509).reduce((sum,r)=>sum+r.quantidade,0),10);
 });
}finally{db.close();}
console.log(`Pedidos: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
