import {fixtureCredential} from './session-claim.mjs';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const base='http://127.0.0.1:19001';
function token(cpf){const h=Buffer.from('{"alg":"HS256"}').toString('base64url'),p=Buffer.from(JSON.stringify({credencial:fixtureCredential,cpf,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return `${h}.${p}.${createHmac('sha256','chave-exclusiva-de-testes-nao-usar-em-producao-2026').update(`${h}.${p}`).digest('base64url')}`;}
const admin=token('44444444444');
assert.equal((await fetch(base+'/__ready')).headers.get('X-AutoCusto-Test'),'isolated');
const db=new DatabaseSync(fileURLToPath(new URL('./.build/autenticacao-test.sqlite',import.meta.url)));db.exec('PRAGMA busy_timeout=10000');
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS erros JSON: '+name);}catch(e){failed++;console.error('FAIL erros JSON '+name+': '+e.message);}}
async function call(method,route,{auth=admin,body,contentType='application/json'}={}){
  const response=await fetch(base+route,{method,headers:{...(auth?{Authorization:'Bearer '+auth}:{}),...(contentType?{'Content-Type':contentType}:{})},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  return {status:response.status,type:response.headers.get('content-type'),text:await response.text()};
}
function error(result,status,code){
  assert.equal(result.status,status,result.text.slice(0,160));assert.match(result.type??'',/^application\/json\s*;\s*charset=utf-8$/i);
  const json=JSON.parse(result.text);assert.deepEqual(Object.keys(json).sort(),['erro','sucesso']);assert.equal(json.sucesso,false);
  assert.deepEqual(Object.keys(json.erro).sort(),['codigo','detalhes','mensagem']);assert.equal(json.erro.codigo,code);assert.equal(typeof json.erro.mensagem,'string');assert.ok(json.erro.mensagem.trim());assert.deepEqual(json.erro.detalhes,[]);return json;
}
// O transporte de emoji é testado na rota de escape, sem depender da collation do banco.
const cpf='88888888881',senha='senha-apenas-de-teste',nome=`D'Ávila "Nome" \\ pasta\nLinha 2\tÁé`;
try{
  const cadastro=await call('POST','/usuarios',{auth:null,body:{cpf,nomeCompleto:nome,senha,dataNascimento:'2000-01-01'}});assert.equal(cadastro.status,201);
  await test('login com nome especial gera JSON válido e UTF-8',async()=>{
    const response=await call('POST','/login',{auth:null,body:{cpf,senha}});assert.equal(response.status,200);assert.match(response.type??'',/^application\/json/i);
    const json=JSON.parse(response.text);assert.equal(json.sucesso,true);assert.equal(json.dados.nome,nome);assert.equal(json.dados.cpf,cpf);assert.equal(json.dados.tipo,'Bearer');assert.equal(json.dados.cargo,3);assert.equal(json.dados.expira_em,28800);assert.equal(typeof json.dados.expira_em,'number');assert.ok(json.dados.token_jwt);
  });
  await test('escape de código e mensagem preserva aspas e controles',async()=>{
    const codigo='CODIGO_"TESTE"\\A',mensagem='O "CPF" é inválido.\nC:\\pasta\tÁé 🚀';
    const json=error(await call('GET','/__tests/erro?'+new URLSearchParams({codigo,mensagem})),400,codigo);assert.equal(json.erro.mensagem,mensagem);
  });
  for(const route of ['/__tests/inesperado','/__tests/parcial'])await test(route+' oculta detalhes internos e resposta parcial',async()=>{
    const response=await call('GET',route);error(response,500,'ERRO_INTERNO_SERVIDOR');assert.doesNotMatch(response.text,/SEGREDO_FICTICIO|SQL interno|NAO_ENVIAR|C:\\banco/);
  });
  for(const [body,code] of [[{},'REQUISICAO_INVALIDA'],[{cpf},'PARAMETRO_AUSENTE'],[{senha},'PARAMETRO_AUSENTE'],[{cpf:[],senha},'REQUISICAO_INVALIDA']])await test('login inválido '+JSON.stringify(body)+' retorna 400',async()=>error(await call('POST','/login',{auth:null,body}),400,code));
  await test('credenciais incorretas retornam 401 padronizado',async()=>error(await call('POST','/login',{auth:null,body:{cpf,senha:'incorreta'}}),401,'CREDENCIAIS_INVALIDAS'));
  await test('conta inativa retorna 401 padronizado',async()=>error(await call('POST','/login',{auth:null,body:{cpf:'55555555555',senha}}),401,'CREDENCIAIS_INVALIDAS'));
  for(const body of ['{','{"cpf":','{} lixo','[1,2]','null','42','"texto"'])await test('JSON inválido/raiz imprópria '+body,async()=>error(await call('POST','/login',{auth:null,body}),400,'REQUISICAO_INVALIDA'));
  const bodyRoutes=[['POST','/usuarios'],['PUT','/perfil/22222222222'],['POST','/admin/usuarios'],['PUT','/admin/usuarios/22222222222'],['PATCH','/admin/usuarios/22222222222/cargo'],['PATCH','/admin/usuarios/22222222222/status'],['POST','/admin/medicamentos'],['PUT','/admin/medicamentos/11001'],['PATCH','/admin/medicamentos/11001/estoque'],['PATCH','/admin/solicitacoes/11001/status'],['POST','/solicitacoes'],...['documentos','interessados','arquivos'].map(p=>['POST','/'+p])];
  db.prepare("INSERT INTO Medicamentos(idMedicamento,nome,quantidadeEstoque,estoqueMinimo) VALUES(11001,'Item 11',10,2)").run();
  const before=()=>JSON.stringify({users:db.prepare('SELECT idUsuarioCPF,nomeUsuario,IdCargo,status,telefone FROM Usuarios ORDER BY idUsuarioCPF').all(),meds:db.prepare('SELECT * FROM Medicamentos ORDER BY idMedicamento').all(),requests:db.prepare('SELECT * FROM Solicitacoes ORDER BY idSolicitacao').all()});
  for(const [method,route] of bodyRoutes)await test('corpo ausente '+method+' '+route,async()=>{
    const snapshot=before();const auth=route.startsWith('/perfil')||route==='/solicitacoes'?token('22222222222'):admin;
    error(await call(method,route,{auth,contentType:null}),400,'REQUISICAO_INVALIDA');assert.equal(before(),snapshot);
  });
  await test('Content-Type inadequado é recusado sem gravar',async()=>{const snapshot=before();error(await call('POST','/admin/medicamentos',{body:'{"nome":"Não gravar"}',contentType:'text/plain'}),415,'FORMATO_NAO_SUPORTADO');assert.equal(before(),snapshot);});
  await test('JSON com charset e caixa diferente é aceito',async()=>{
    const response=await call('POST','/__tests/eco',{body:'  '+JSON.stringify({texto:'Áé "aspas"',ativo:true,n:7})+'  ',contentType:'Application/JSON; charset=utf-8'});
    assert.equal(response.status,200);assert.deepEqual(JSON.parse(response.text),{sucesso:true,dados:{texto:'Áé "aspas"',ativo:true,n:7}});
  });
  await test('autenticação precede parsing e retorna JSON',async()=>error(await call('POST','/admin/medicamentos',{auth:null,body:'{'}),401,'CREDENCIAIS_INVALIDAS'));
  await test('permissão recusada mantém formato',async()=>error(await call('GET','/admin/dashboard',{auth:token('22222222222')}),403,'ACESSO_NEGADO'));
  await test('recurso inexistente mantém formato',async()=>error(await call('DELETE','/admin/medicamentos/2147483646'),404,'RECURSO_NAO_ENCONTRADO'));
  await test('rota inexistente tem 404 JSON',async()=>error(await call('GET','/rota-item11-inexistente'),404,'RECURSO_NAO_ENCONTRADO'));
  await test('método não permitido tem 405 JSON',async()=>error(await call('DELETE','/produtos'),405,'METODO_NAO_PERMITIDO'));
  await test('erro de banco no login retorna 500 seguro',async()=>{
    db.exec('ALTER TABLE Usuarios RENAME COLUMN senha TO senha_ausente_item11');
    try{const response=await call('POST','/login',{auth:null,body:{cpf,senha}});error(response,500,'ERRO_INTERNO_SERVIDOR');assert.doesNotMatch(response.text,/senha_ausente|FireDAC|SELECT|no such column/);}finally{db.exec('ALTER TABLE Usuarios RENAME COLUMN senha_ausente_item11 TO senha');}
  });
  await test('falha de INSERT de usuário não se apresenta como CPF duplicado',async()=>{
    db.exec("CREATE TRIGGER item11_user_failure BEFORE INSERT ON Usuarios BEGIN SELECT RAISE(ABORT,'SEGREDO_FICTICIO SQL'); END");
    try{const response=await call('POST','/admin/usuarios',{body:{cpf:'88888888882',nome:'Teste',senha}});error(response,500,'ERRO_GRAVACAO_BANCO');assert.doesNotMatch(response.text,/SEGREDO_FICTICIO|duplicado|cadastrado/);}finally{db.exec('DROP TRIGGER item11_user_failure');}
  });
  await test('erro do banco no cadastro público não vaza detalhes',async()=>{
    db.exec("CREATE TRIGGER item11_public_failure BEFORE INSERT ON Usuarios BEGIN SELECT RAISE(ABORT,'SEGREDO_FICTICIO SQL'); END");
    try{const response=await call('POST','/usuarios',{auth:null,body:{cpf:'88888888883',nomeCompleto:'Teste',senha,dataNascimento:'2000-01-01'}});error(response,500,'ERRO_GRAVACAO_BANCO');assert.doesNotMatch(response.text,/SEGREDO_FICTICIO|FireDAC|SQL/);}finally{db.exec('DROP TRIGGER item11_public_failure');}
  });
  await test('CPF duplicado público é erro de entrada',async()=>error(await call('POST','/usuarios',{auth:null,body:{cpf,nomeCompleto:'Duplicado',senha,dataNascimento:'2000-01-01'}}),400,'CPF_DUPLICADO'));
  await test('CPF duplicado administrativo é erro de entrada',async()=>error(await call('POST','/admin/usuarios',{body:{cpf,nome:'Duplicado',senha}}),400,'CPF_DUPLICADO'));
  await test('204 de retirada continua vazio, sem corpo JSON',async()=>{
    db.exec("INSERT INTO Solicitacoes(idSolicitacao,idUsuarioCPF,IdMedicamento,quantidade,status) VALUES(11001,22222222222,11001,1,'Aprovado')");
    const result=await call('PATCH','/solicitacoes/11001/retirada',{auth:token('22222222222'),contentType:null});assert.equal(result.status,204);assert.equal(result.text,'');
  });
  await test('preflight continua público e vazio',async()=>{const result=await call('OPTIONS','/admin/usuarios',{auth:null,contentType:null});assert.equal(result.status,204);assert.equal(result.text,'');});
}finally{db.close();}
console.log(`Erros JSON: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
