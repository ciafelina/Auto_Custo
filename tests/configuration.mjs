import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHmac} from 'node:crypto';

const executable=fileURLToPath(new URL('./.build/AuthHarness.exe',import.meta.url));
const testRoot=await mkdtemp(path.join(tmpdir(),'autocusto-config-test-'));
const fakeKey='chave-exclusiva-de-testes-nao-usar-em-producao-2026';
const alternateKey='outra-chave-exclusiva-de-testes-com-mais-de-32-bytes';
let passed=0,failed=0;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function probeKey(key) {
 return async()=>{
  for(const [secret,status] of [[key,200],['chave-incorreta-para-esta-configuracao',401]]) {
   const h=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url');
   const p=Buffer.from(JSON.stringify({cpf:'11111111111',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
   const jwt=`${h}.${p}.${createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;
   const response=await fetch('http://127.0.0.1:19001/perfil/11111111111',{
    method:'PUT',headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json'},
    body:JSON.stringify({telefone:'config-test',dataNascimento:'2000-01-01'}),signal:AbortSignal.timeout(1000)
   });
   assert.equal(response.status,status,'A API não usou a chave da configuração selecionada.');
  }
 };
}
async function scenario(name,{content,env={},running,error,probe}={}) {
 const dir=path.join(testRoot,String(passed+failed));
 await mkdir(path.join(dir,'AutoCusto'),{recursive:true});
 const config=path.join(dir,'AutoCusto','config.ini');
 if(content!==undefined)await writeFile(config,content,'utf8');
 const childEnv={...process.env,LOCALAPPDATA:dir};
 delete childEnv.AUTO_CUSTO_JWT_SECRET;delete childEnv.AUTO_CUSTO_CONFIG;
 Object.assign(childEnv,env);
 const child=spawn(executable,[],{env:childEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='',ended=false,code;
 child.stdout.on('data',data=>{output+=data.toString();});
 child.stderr.on('data',data=>{output+=data.toString();});
 const completion=new Promise((resolve,reject)=>{
  child.once('error',reject);
  child.once('close',exit=>{ended=true;code=exit;resolve();});
 });
 try {
  if(running) {
   let ready=false;
   for(let i=0;i<40&&!ended;i++) {
    try {
     const response=await fetch('http://127.0.0.1:19001/__ready',{signal:AbortSignal.timeout(300)});
     if(response.headers.get('X-AutoCusto-Test')==='isolated'){ready=true;break;}
    }catch{}
    await sleep(75);
   }
   assert.ok(ready,'API não iniciou com configuração válida.');
   if(probe)await probe();
  }else {
   await Promise.race([completion,sleep(1800)]);
   assert.ok(ended,'API iniciou mesmo com configuração de segurança inválida.');
   assert.equal(code,1,'Falha de configuração deve encerrar com código 1.');
   if(error)assert.match(output,error);
  }
  assert.ok(!output.includes(fakeKey)&&!output.includes(alternateKey),'Saída expôs uma chave de teste.');
  passed++;console.log('PASS configuração: '+name);
 }catch(e){failed++;console.error('FAIL configuração '+name+': '+e.message);}
 finally {
  if(!ended)child.kill();
  await completion;
 }
}
try {
 await scenario('sem arquivo e sem variável',{error:/configura|chave/i});
 await scenario('arquivo sem chave',{content:'[Base]\nBanco=Teste\n',error:/chave|JWT/i});
 await scenario('chave vazia',{content:'[Seguranca]\nJwtSecret=\n',error:/chave|JWT/i});
 await scenario('chave curta no arquivo',{content:'[Seguranca]\nJwtSecret=curta\n',error:/32/});
 await scenario('chave curta na variável',{env:{AUTO_CUSTO_JWT_SECRET:'curta'},error:/32/});
 await scenario('variável inválida não usa arquivo válido',{content:`[Seguranca]\nJwtSecret=${fakeKey}\n`,env:{AUTO_CUSTO_JWT_SECRET:'curta'},error:/32/});
 await scenario('arquivo externo padrão válido',{content:`[Seguranca]\nJwtSecret=${fakeKey}\n`,running:true,probe:probeKey(fakeKey)});
 await scenario('variável válida sem arquivo',{env:{AUTO_CUSTO_JWT_SECRET:fakeKey},running:true,probe:probeKey(fakeKey)});
 await scenario('variável tem prioridade sobre arquivo inválido',{content:'[Seguranca]\nJwtSecret=curta\n',env:{AUTO_CUSTO_JWT_SECRET:fakeKey},running:true});
 const custom=path.join(testRoot,'config-alternativa.ini');
 await writeFile(custom,`[Seguranca]\nJwtSecret=${alternateKey}\n`);
 await scenario('caminho alternativo',{env:{AUTO_CUSTO_CONFIG:custom},running:true,probe:probeKey(alternateKey)});
 await scenario('caminho alternativo inexistente',{env:{AUTO_CUSTO_CONFIG:path.join(testRoot,'inexistente.ini')},error:/configura|arquivo|chave/i});
 await scenario('variável válida prevalece sobre outra chave válida',{content:`[Seguranca]\nJwtSecret=${fakeKey}\n`,env:{AUTO_CUSTO_JWT_SECRET:alternateKey},running:true,probe:probeKey(alternateKey)});
 await scenario('limite de 31 bytes recusado',{env:{AUTO_CUSTO_JWT_SECRET:'A'.repeat(31)},error:/32/});
 await scenario('limite de 32 bytes aceito',{env:{AUTO_CUSTO_JWT_SECRET:'A'.repeat(32)},running:true,probe:probeKey('A'.repeat(32))});
 await scenario('chave com apenas espaços recusada',{env:{AUTO_CUSTO_JWT_SECRET:' '.repeat(40)},error:/chave|JWT/i});
 await scenario('tamanho medido em bytes UTF-8',{env:{AUTO_CUSTO_JWT_SECRET:'á'.repeat(16)},running:true,probe:probeKey('á'.repeat(16))});
 await scenario('caminho relativo recusado',{env:{AUTO_CUSTO_CONFIG:'relativo.ini'},error:/absoluto/i});
 await scenario('caminho relativo à unidade recusado',{env:{AUTO_CUSTO_CONFIG:'C:relativo.ini'},error:/absoluto/i});
 await scenario('caminho relativo à raiz recusado',{env:{AUTO_CUSTO_CONFIG:'\\relativo.ini'},error:/absoluto/i});
 const probeExe=fileURLToPath(new URL('./.build/ConfigurationProbe.exe',import.meta.url));
 const probeConfig=path.join(testRoot,'banco-teste.ini');
 await writeFile(probeConfig,'[Base]\nServidor=servidor-ficticio\nPorta=1500\nBanco=BancoTeste\nUsuario=usuario-ficticio\nSenha=senha-ficticia\n');
 try {
  const probe=spawn(probeExe,[],{env:{...process.env,AUTO_CUSTO_CONFIG:probeConfig},windowsHide:true,stdio:'ignore'});
  const code=await new Promise((resolve,reject)=>{probe.once('error',reject);probe.once('close',resolve);});
  assert.equal(code,0,'Provider não carregou os campos do arquivo externo de banco.');
  passed++;console.log('PASS configuração: provider real usa arquivo externo sem conectar ao banco');
 }catch(e){failed++;console.error('FAIL configuração provider de banco: '+e.message);}
 await writeFile(probeConfig,'[Base]\nServidor="servidor-ficticio"\nPorta=\'1500\'\nBanco="BancoTeste"\nUsuario="usuario-ficticio"\nSenha="senha-ficticia"\n');
 try {
  const probe=spawn(probeExe,[],{env:{...process.env,AUTO_CUSTO_CONFIG:probeConfig},windowsHide:true,stdio:'ignore'});
  const code=await new Promise((resolve,reject)=>{probe.once('error',reject);probe.once('close',resolve);});
  assert.equal(code,0,'Provider mudou a interpretação dos valores legados entre aspas.');
  passed++;console.log('PASS configuração: credenciais legadas entre aspas preservadas');
 }catch(e){failed++;console.error('FAIL configuração credenciais legadas: '+e.message);}
} finally {await rm(testRoot,{recursive:true,force:true});}
console.log(`Configuração: ${passed} aprovados; ${failed} falhas.`);
process.exitCode=failed?1:0;
