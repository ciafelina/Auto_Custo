import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const base='http://127.0.0.1:19001',h=Buffer.from('{"alg":"HS256"}').toString('base64url'),p=Buffer.from(JSON.stringify({cpf:'44444444444',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const jwt=`${h}.${p}.${createHmac('sha256','chave-exclusiva-de-testes-nao-usar-em-producao-2026').update(`${h}.${p}`).digest('base64url')}`;
assert.equal((await fetch(base+'/__ready')).headers.get('X-AutoCusto-Test'),'isolated');
const db=new DatabaseSync(fileURLToPath(new URL('./.build/autenticacao-test.sqlite',import.meta.url)));db.exec('PRAGMA busy_timeout=10000');
let next=8000,passed=0,failed=0;
const get=id=>db.prepare('SELECT * FROM Solicitacoes WHERE idSolicitacao=?').get(id);
function seed(){const a=next++,b=next++;for(const [id,note] of [[a,'Nota original A'],[b,'Nota original B']])db.prepare("INSERT INTO Solicitacoes(idSolicitacao,idUsuarioCPF,IdMedicamento,quantidade,status,observacao) VALUES (?,22222222222,1,1,'Pendente',?)").run(id,note);return{a,b};}
async function patch(id,extra={}){const response=await fetch(base+`/admin/solicitacoes/${id}/status`,{method:'PATCH',headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify({status:'Aprovado',...extra}),signal:AbortSignal.timeout(10000)});return {status:response.status,text:await response.text()};}
async function test(name,fn){try{await fn();passed++;console.log('PASS observação API: '+name);}catch(e){failed++;console.error('FAIL observação API '+name+': '+e.message);}}
try{
 await test('campo omitido mantém a nota existente',async()=>{const{a,b}=seed(),before=get(b);assert.equal((await patch(a)).status,200);assert.equal(get(a).observacao,'Nota original A');assert.equal(get(a).status,'Aprovado');assert.deepEqual(get(b),before);});
 await test('texto explícito atualiza somente a solicitação alvo',async()=>{const{a,b}=seed(),before=get(b),note=`Nota D'Ávila "com aspas" <img src=x>`;assert.equal((await patch(a,{observacao:note})).status,200);assert.equal(get(a).observacao,note);assert.deepEqual(get(b),before);});
 await test('texto vazio permite limpar somente a nota alvo',async()=>{const{a,b}=seed(),before=get(b);assert.equal((await patch(a,{observacao:''})).status,200);assert.equal(get(a).observacao,'');assert.deepEqual(get(b),before);});
 await test('null mantém a nota existente',async()=>{const{a,b}=seed(),before=get(b);assert.equal((await patch(a,{observacao:null})).status,200);assert.equal(get(a).observacao,'Nota original A');assert.deepEqual(get(b),before);});
 for(const value of [7,[],{}])await test('tipo inválido '+JSON.stringify(value)+' não altera dados',async()=>{const{a,b}=seed(),beforeA=get(a),beforeB=get(b);assert.equal((await patch(a,{observacao:value})).status,400);assert.deepEqual(get(a),beforeA);assert.deepEqual(get(b),beforeB);});
 await test('transição recusada não altera observação',async()=>{const{a,b}=seed();db.prepare("UPDATE Solicitacoes SET status='Retirado' WHERE idSolicitacao=?").run(a);const beforeA=get(a),beforeB=get(b);assert.equal((await patch(a,{observacao:'Não gravar'})).status,409);assert.deepEqual(get(a),beforeA);assert.deepEqual(get(b),beforeB);});
}finally{db.close();}
console.log(`Observações API: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
