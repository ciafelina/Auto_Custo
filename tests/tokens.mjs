import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';

const base = 'http://127.0.0.1:19001';
const key = 'chave-exclusiva-de-testes-nao-usar-em-producao-2026';
const encode = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const claims = {cpf:'11111111111',nome:'Paciente',cargo:3,sub:'SCHOOLER_API',exp:Math.floor(Date.now()/1000)+3600};
function signed(header, payload, secret=key, hash='sha256') {
  const input = `${encode(header)}.${encode(payload)}`;
  return `${input}.${createHmac(hash,secret).update(input).digest('base64url')}`;
}
const good = signed({alg:'HS256',typ:'JWT'},claims);
const [h,p,s] = good.split('.');
const changedSignature = `${s[0] === 'A' ? 'B' : 'A'}${s.slice(1)}`;
const invalidTokens = [
  ['assinatura de outra chave',signed({alg:'HS256'},claims,'chave-incorreta')],
  ['um byte da assinatura alterado',`${h}.${p}.${changedSignature}`],
  ['CPF adulterado mantendo assinatura',`${h}.${encode({...claims,cpf:'22222222222'})}.${s}`],
  ['cargo adulterado mantendo assinatura',`${h}.${encode({...claims,cargo:1})}.${s}`],
  ['expiração adulterada mantendo assinatura',`${h}.${encode({...claims,exp:claims.exp+86400})}.${s}`],
  ['cabeçalho adulterado mantendo assinatura',`${encode({alg:'HS256',typ:'JWT',kid:'outro'})}.${p}.${s}`],
  ['assinatura ausente',`${h}.${p}.`],
  ['assinatura truncada',`${h}.${p}.${s.slice(0,-2)}`],
  ['alg none sem assinatura',`${encode({alg:'none'})}.${p}.`],
  ['alg none com assinatura',signed({alg:'none'},claims)],
  ['HS384 mesmo com assinatura correta',signed({alg:'HS384'},claims,key,'sha384')],
  ['HS512 mesmo com assinatura correta',signed({alg:'HS512'},claims,key,'sha512')],
  ['RS256 com assinatura HMAC',signed({alg:'RS256'},claims)],
  ['alg ausente',signed({typ:'JWT'},claims)],
  ['alg desconhecido',signed({alg:'invalido'},claims)],
  ['cabeçalho vazio',`.${p}.${s}`],
  ['payload vazio',`${h}..${s}`],
  ['duas partes',`${h}.${p}`],
  ['quatro partes',`${good}.extra`],
  ['cinco partes','a.b.c.d.e'],
  ['JSON de cabeçalho inválido',signed('{',{...claims})],
  ['JSON de payload inválido',signed({alg:'HS256'},'{')],
  ['cabeçalho como array',signed([],claims)],
  ['payload como array',signed({alg:'HS256'},[])],
  ['caractere inválido na assinatura',`${good}!`],
  ['assinatura com padding',`${good}=`],
  ['token expirado',signed({alg:'HS256'},{...claims,exp:1})],
  ['expiração ausente',signed({alg:'HS256'},{cpf:claims.cpf})],
];

let ready=false;
for(let i=0;i<40;i++) {
  try {
    const response=await fetch(base+'/__ready',{signal:AbortSignal.timeout(1000)});
    assert.equal(response.headers.get('X-AutoCusto-Test'),'isolated','Servidor de testes não identificado; execução cancelada.');
    ready=true;break;
  } catch(e) {
    if(e.code==='ERR_ASSERTION') throw e;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
}
assert.ok(ready,'Servidor de testes não iniciou.');
const db = new DatabaseSync(fileURLToPath(new URL('./.build/autenticacao-test.sqlite',import.meta.url)),{readOnly:true});
const getPhone=()=>db.prepare('SELECT telefone FROM Usuarios WHERE idUsuarioCPF=11111111111').get().telefone;
let passed=0,failed=0;
async function check(name,token,expected,phone='operacao-negada') {
  try {
    const before=getPhone();
    const response=await fetch(base+'/perfil/11111111111',{
      method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({telefone:phone,dataNascimento:'2000-01-01'}),signal:AbortSignal.timeout(5000)
    });
    assert.equal(response.status,expected,`${name}: esperado ${expected}, recebido ${response.status}`);
    if(expected===401) {
      const error=await response.json();
      assert.equal(error.sucesso,false);
      assert.equal(error.erro.codigo,'CREDENCIAIS_INVALIDAS');
      assert.equal(getPhone(),before,'Token recusado alterou o banco.');
    } else assert.equal(getPhone(),phone,'Token válido não executou a operação.');
    passed++;console.log('PASS '+name);
  } catch(e) { failed++;console.error('FAIL '+e.message); }
}
await check('HS256 válido executa operação',good,200,'token-valido');
for(const [name,token] of invalidTokens) await check(name,token,401);
await check('token válido continua aceito após tentativas inválidas',good,200,'sessao-preservada');
db.close();
console.log(`Tokens: ${passed} aprovados; ${failed} falhas.`);
process.exitCode=failed?1:0;
