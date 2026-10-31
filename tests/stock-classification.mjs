import {fixtureCredential} from './session-claim.mjs';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {stockCases} from './stock-cases.mjs';

const base='http://127.0.0.1:19001';
const header=Buffer.from('{"alg":"HS256"}').toString('base64url');
const payload=Buffer.from(JSON.stringify({credencial:fixtureCredential,cpf:'44444444444',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const token=`${header}.${payload}.${createHmac('sha256','chave-exclusiva-de-testes-nao-usar-em-producao-2026').update(`${header}.${payload}`).digest('base64url')}`;
assert.equal((await fetch(base+'/__ready')).headers.get('X-AutoCusto-Test'),'isolated','Este teste altera exclusivamente a base fictícia.');
const db=new DatabaseSync(fileURLToPath(new URL('./.build/autenticacao-test.sqlite',import.meta.url)));
db.exec('PRAGMA busy_timeout=10000; BEGIN; DELETE FROM Solicitacoes; DELETE FROM Medicamentos;');
for(const row of stockCases)db.prepare('INSERT INTO Medicamentos(idMedicamento,nome,quantidadeEstoque,estoqueMinimo,categoria,dosagem,fabricante,descricao) VALUES (?,?,?,?,?,?,?,?)').run(row.id,row.nome,row.estoque,row.estoqueMinimo,row.categoria,row.dosagem,row.fabricante,row.descricao);
db.exec("INSERT INTO Solicitacoes(idSolicitacao,idUsuarioCPF,IdMedicamento,quantidade,status) VALUES (9501,22222222222,9002,1,'Pendente'),(9502,22222222222,9002,1,'Aprovado'),(9503,22222222222,9002,1,'Cancelado'); COMMIT;");
let passed=0,failed=0;
async function request(route,options={}) {
  const response=await fetch(base+route,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200,`${route}: HTTP ${response.status}`);
  const result=await response.json();assert.equal(result.sucesso,true);return result;
}
const products=async params=>(await request('/produtos?'+new URLSearchParams({limit:'100',...params}))).resultado;
const ids=rows=>rows.map(row=>row.id).sort((a,b)=>a-b);
async function test(name,fn){try{await fn();passed++;console.log('PASS classificação API: '+name);}catch(e){failed++;console.error('FAIL classificação API '+name+': '+e.message);}}
try {
  for(const row of stockCases)await test(`${row.nome}: saldo ${row.estoque}, mínimo ${row.estoqueMinimo} => ${row.want}`,async()=>{
    const result=await products({search:row.nome});assert.equal(result.total_registros,1);assert.equal(result.dados.length,1);
    assert.equal(result.dados[0].estoqueMinimo,row.estoqueMinimo??0);
    for(const status of ['available','low','out']){
      const filtered=await products({search:row.nome,disponibilidade:status});
      assert.equal(filtered.total_registros,status===row.want?1:0,status);assert.deepEqual(ids(filtered.dados),status===row.want?[row.id]:[],status);
    }
  });
  for(const [status,want] of [['available',[9004,9005,9008,9010,9011,9015]],['low',[9002,9003,9006,9009]],['out',[9001,9007,9012,9013,9014]]])await test(`filtro ${status} tem total e registros corretos`,async()=>{
    const result=await products({disponibilidade:status});assert.equal(result.total_registros,want.length);assert.deepEqual(ids(result.dados),want);
  });
  await test('categoria e busca continuam combinadas ao mínimo',async()=>{
    const result=await products({search:'Item10-900',categoria:'Categoria A',disponibilidade:'low'});assert.equal(result.total_registros,2);assert.deepEqual(ids(result.dados),[9002,9006]);
  });
  await test('paginação crítica preserva total e não repete registros',async()=>{
    const a=await products({disponibilidade:'low',limit:'2',page:'1'}),b=await products({disponibilidade:'low',limit:'2',page:'2'}),c=await products({disponibilidade:'low',limit:'2',page:'3'});
    assert.equal(a.total_registros,4);assert.equal(b.total_registros,4);assert.deepEqual(a.dados.map(r=>r.id),[9002,9003]);assert.deepEqual(b.dados.map(r=>r.id),[9006,9009]);assert.deepEqual(c.dados,[]);
  });
  await test('gestão retorna os mesmos saldos e mínimos da consulta',async()=>{
    const result=(await request('/admin/medicamentos?limit=100')).dados;assert.equal(result.total,15);
    assert.deepEqual(result.lista.map(({id,estoque,estoqueMinimo})=>({id,estoque,estoqueMinimo})),stockCases.map(row=>({id:row.id,estoque:row.estoque??0,estoqueMinimo:row.estoqueMinimo??0})));
  });
  await test('painel conta críticos e lista indisponíveis separadamente',async()=>{
    const result=(await request('/admin/dashboard')).dados;assert.equal(result.totalMedicamentos,15);assert.equal(result.totalUsuarios,db.prepare('SELECT COUNT(*) AS total FROM Usuarios').get().total);
    assert.equal(result.solicitacoesPendentes,1);assert.equal(result.estoqueCritico,4);assert.deepEqual(result.medicamentosZerados,['Item10-9001','Item10-9007','Item10-9012','Item10-9013','Item10-9014']);
  });
  await test('mudança do mínimo atualiza filtro e painel sem mudar saldo',async()=>{
    const med=stockCases.find(row=>row.id===9006);
    try{
      await request('/admin/medicamentos/9006',{method:'PUT',body:JSON.stringify({...med,estoqueMinimo:2})});
      assert.equal(db.prepare('SELECT quantidadeEstoque FROM Medicamentos WHERE idMedicamento=9006').get().quantidadeEstoque,6);
      assert.equal((await products({search:med.nome,disponibilidade:'low'})).total_registros,0);assert.equal((await products({search:med.nome,disponibilidade:'available'})).total_registros,1);
      assert.equal((await request('/admin/dashboard')).dados.estoqueCritico,3);
    }finally{db.prepare('UPDATE Medicamentos SET estoqueMinimo=10 WHERE idMedicamento=9006').run();}
  });
  await test('painel e filtros funcionam com catálogo vazio',async()=>{
    db.exec('DELETE FROM Solicitacoes; DELETE FROM Medicamentos;');
    const result=(await request('/admin/dashboard')).dados;assert.equal(result.totalMedicamentos,0);assert.equal(result.estoqueCritico,0);assert.equal(result.solicitacoesPendentes,0);assert.deepEqual(result.medicamentosZerados,[]);
    for(const status of ['available','low','out']){const filtered=await products({disponibilidade:status});assert.equal(filtered.total_registros,0);assert.deepEqual(filtered.dados,[]);}
  });
}finally{db.close();}
console.log(`Classificação API: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
