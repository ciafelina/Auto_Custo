import {fixtureCredential} from './session-claim.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHmac} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright');}catch{playwright=require(path.resolve(path.dirname(process.execPath),'..','node_modules/playwright'));}
const candidates=[process.env.AUTO_CUSTO_TEST_BROWSER,playwright.chromium.executablePath(),...['ProgramFiles(x86)','ProgramFiles'].flatMap(e=>process.env[e]?[path.join(process.env[e],'Microsoft/Edge/Application/msedge.exe'),path.join(process.env[e],'Google/Chrome/Application/chrome.exe')]:[])].filter(Boolean);
const executablePath=candidates.find(existsSync);assert.ok(executablePath);
const root=fileURLToPath(new URL('../Front_End/',import.meta.url));
const remote='https://api.example.test:9443/farmacia/v1';
const med={id:42,nome:'Medicamento teste',categoria:'Teste',dosagem:'10 mg',fabricante:'Teste',descricao:'Descrição',estoque:10,estoqueMinimo:2};
const user={cpf:'22222222222',cpfFormatado:'222.222.222-22',nome:'Pessoa de teste',email:'teste@example.test',idCargo:3,status:'Ativo'};
const req={id:71,medicamento:'Medicamento',nomePaciente:'Pessoa',cpfPaciente:'22222222222',quantidade:1,status:'Pendente',observacao:''};
const browser=await playwright.chromium.launch({headless:true,executablePath});
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS endereço navegador: '+name);}catch(e){failed++;console.error('FAIL endereço navegador '+name+': '+e.message);}}
function fixture(route){
  if(route==='/produtos')return {sucesso:true,resultado:{dados:[med],total_registros:1}};
  if(route==='/admin/medicamentos')return {sucesso:true,dados:{lista:[med],total:1}};
  if(route==='/admin/usuarios')return {sucesso:true,dados:{lista:[user],total:1,totalLista:1}};
  if(route==='/admin/solicitacoes')return {sucesso:true,dados:{lista:[req],total:1}};
  if(route.startsWith('/perfil/'))return {sucesso:true,dados:{nomeCompleto:user.nome,cpf:user.cpf,email:user.email,dataNascimento:'2000-01-01'}};
  if(route==='/admin/dashboard')return {sucesso:true,dados:{totalUsuarios:1,totalMedicamentos:1,estoqueCritico:0,solicitacoesPendentes:0,medicamentosZerados:[]}};
  return {sucesso:true,dados:{total:0,solicitacoes:[]}};
}
async function open(file,{front='http://autocusto.test',base=remote}={}){
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),calls=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{localStorage.setItem('token_jwt','token-ficticio');localStorage.setItem('usuario_cpf','22222222222');localStorage.setItem('nome_usuario','Pessoa de teste');localStorage.setItem('usuario_cargo','1');window.alert=()=>{};window.confirm=()=>true;});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===front){
      if(url.pathname==='/config.js'){await route.fulfill({status:200,contentType:'application/javascript',body:'globalThis.AUTO_CUSTO_CONFIG='+JSON.stringify({apiBaseUrl:base})+';'});return;}
      const target=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\//,''));
      if(!target.startsWith(path.resolve(root)+path.sep)){await route.abort();return;}
      try{await route.fulfill({status:200,contentType:target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':'text/html',body:await readFile(target)});}catch{await route.fulfill({status:404,body:'Não encontrado'});}return;
    }
    // Também interceptar o endereço antigo: um erro de roteamento nunca acessa a API real.
    if(['api.example.test','localhost','192.0.2.20'].includes(url.hostname)){
      const method=route.request().method();
      if(method==='OPTIONS'){await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'}});return;}
      const routePath=url.pathname.startsWith('/farmacia/v1/')?url.pathname.slice('/farmacia/v1'.length):url.pathname;
      calls.push({url:url.href,method,headers:route.request().headers(),body:route.request().postData()?route.request().postDataJSON():undefined});
      await route.fulfill({status:method==='GET'?200:409,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify(method==='GET'?fixture(routePath):{sucesso:false,erro:{codigo:'TESTE',mensagem:'Resposta de teste',detalhes:[]}})});return;
    }
    await route.abort();
  });
  await page.goto(front+'/'+file);
  if(file==='profile.html')await page.waitForFunction(()=>document.getElementById('p-nome').textContent==='Pessoa de teste');
  return {context,page,calls,errors};
}
async function check(file,name,fn,options){await test(name,async()=>{const scope=await open(file,options);try{await fn(scope);assert.deepEqual(scope.errors,[]);}finally{await scope.context.close();}});}
function expectCall(calls,method,route,{publicRoute=false,body}={}){
  const found=calls.find(call=>call.method===method&&new URL(call.url).pathname.endsWith(route));assert.ok(found,'Chamada ausente: '+method+' '+route);
  const url=new URL(found.url);assert.equal(url.origin,'https://api.example.test:9443');assert.equal(url.pathname,'/farmacia/v1'+route);
  assert.equal(found.headers.authorization,publicRoute?undefined:'Bearer token-ficticio');
  if(body){for(const [key,value] of Object.entries(body))assert.deepEqual(found.body?.[key],value);assert.match(found.headers['content-type'],/application\/json/);}
  return found;
}
async function submit(page,selector,route){const pending=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(route));await page.locator(selector).evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await pending;}
try{
  for(const [file,route] of [['admin-dashboard.html','/admin/dashboard'],['admin-medications.html','/admin/medicamentos'],['admin-users.html','/admin/usuarios'],['admin-requests.html','/admin/solicitacoes'],['patient-dashboard.html','/dashboard/paciente/22222222222'],['profile.html','/perfil/22222222222'],['stock.html','/produtos']])await check(file,'carregamento '+file+' usa domínio/porta/prefixo configurados',async({page,calls})=>{
    if(!calls.length)await page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(route));
    const found=expectCall(calls,'GET',route);
    if(['stock.html','admin-medications.html','admin-users.html','admin-requests.html','patient-dashboard.html'].includes(file)){assert.equal(new URL(found.url).searchParams.get('page'),'1');assert.ok(new URL(found.url).searchParams.has('limit'));}
  });
  await check('login.html','login público usa destino configurado',async({page,calls})=>{await page.locator('#usuario').fill('22222222222');await page.locator('#senha').fill('teste');await submit(page,'#form-login','/login');expectCall(calls,'POST','/login',{publicRoute:true,body:{cpf:'22222222222',senha:'teste'}});});
  await check('register.html','cadastro público usa destino configurado',async({page,calls})=>{
    for(const [id,value] of [['r-name','Pessoa teste'],['r-email','teste@example.test'],['r-cpf','52998224725'],['r-senha','teste123'],['r-confirma-senha','teste123'],['r-birth','2000-01-01'],['r-phone','11999999999'],['r-address','Rua teste']])await page.locator('#'+id).fill(value);
    await submit(page,'#form-register','/usuarios');expectCall(calls,'POST','/usuarios',{publicRoute:true,body:{cpf:'52998224725',nomeCompleto:'Pessoa teste'}});
  });
  await check('admin-medications.html','criar medicamento usa destino configurado',async({page,calls})=>{await page.evaluate(()=>{abrirModalMedicamento();document.getElementById('m-name').value='Novo';document.getElementById('m-stock').value='12';return salvarMedicamento({preventDefault(){}});});expectCall(calls,'POST','/admin/medicamentos',{body:{nome:'Novo',estoque:12}});});
  await check('admin-medications.html','editar medicamento usa destino configurado',async({page,calls})=>{await page.evaluate(m=>{abrirModalMedicamento(m);return salvarMedicamento({preventDefault(){}});},med);const found=expectCall(calls,'PUT','/admin/medicamentos/42',{body:{nome:med.nome}});assert.equal(Object.hasOwn(found.body,'estoque'),false);});
  await check('admin-medications.html','ajustar estoque usa destino configurado',async({page,calls})=>{await page.evaluate(()=>{abrirModalEstoque(42,'Med',10);return salvarEstoque({preventDefault(){}});});expectCall(calls,'PATCH','/admin/medicamentos/42/estoque',{body:{estoque:10}});});
  await check('admin-medications.html','excluir medicamento usa destino configurado',async({page,calls})=>{await page.evaluate(()=>{abrirModalExcluir(42,'Med');return confirmarExclusao();});expectCall(calls,'DELETE','/admin/medicamentos/42');});
  await check('admin-users.html','criar usuário usa destino configurado',async({page,calls})=>{await page.evaluate(()=>{abrirModalNovoUsuario();document.getElementById('u-name').value='Novo';document.getElementById('u-email').value='teste@example.test';document.getElementById('u-cpf').value='52998224725';document.getElementById('u-pass').value='teste123';return salvarUsuario({preventDefault(){}});});expectCall(calls,'POST','/admin/usuarios',{body:{nome:'Novo',cpf:'52998224725'}});});
  await check('admin-users.html','editar usuário usa destino configurado',async({page,calls})=>{await page.evaluate(u=>{abrirModalEditarUsuario(u);return salvarUsuario({preventDefault(){}});},user);expectCall(calls,'PUT','/admin/usuarios/22222222222',{body:{nome:user.nome}});});
  await check('admin-users.html','cargo usa destino configurado',async({page,calls})=>{await page.evaluate(()=>{abrirModalCargo('22222222222','Pessoa',3,'PT');return salvarCargo({preventDefault(){}});});expectCall(calls,'PATCH','/admin/usuarios/22222222222/cargo',{body:{idCargo:3}});});
  await check('admin-users.html','status de usuário usa destino configurado',async({page,calls})=>{await page.evaluate(()=>{abrirModalStatus('22222222222','Pessoa',true);return confirmarStatus();});expectCall(calls,'PATCH','/admin/usuarios/22222222222/status',{body:{status:'Inativo'}});});
  await check('admin-requests.html','status de solicitação usa destino configurado',async({page,calls})=>{await page.evaluate(()=>alterarStatus(71,'Aprovado'));expectCall(calls,'PATCH','/admin/solicitacoes/71/status',{body:{status:'Aprovado'}});});
  await check('stock.html','pedido usa destino configurado',async({page,calls})=>{await page.evaluate(()=>{abrirModal(42,'Med',10);document.getElementById('req-qty').value='2';return realizarPedido({preventDefault(){}});});expectCall(calls,'POST','/solicitacoes',{body:{cpf:'22222222222',idMedicamento:42,quantidade:2}});});
  await check('profile.html','salvar perfil usa destino configurado',async({page,calls})=>{await submit(page,'#form-edit-profile','/perfil/22222222222');expectCall(calls,'PUT','/perfil/22222222222',{body:{dataNascimento:'2000-01-01'}});});
  await check('profile.html','excluir perfil usa destino configurado',async({page,calls})=>{await page.evaluate(()=>excluirConta());expectCall(calls,'DELETE','/perfil/22222222222');});
  await check('patient-dashboard.html','retirada usa destino configurado',async({page,calls})=>{await page.evaluate(()=>confirmarRetirada(71));expectCall(calls,'PATCH','/solicitacoes/71/retirada');});
  await check('stock.html','sem configuração a página LAN usa o próprio servidor',async({page,calls})=>{if(!calls.length)await page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/produtos'));assert.equal(calls[0].url,'http://192.0.2.20:9000/produtos?page=1&limit=4');},{front:'http://192.0.2.20:5500',base:''});

  const actualApi='http://127.0.0.1:19001';
  assert.equal((await fetch(actualApi+'/__ready')).headers.get('X-AutoCusto-Test'),'isolated','Teste real só pode usar o harness.');
  const preflight=await fetch(actualApi+'/__tests/eco',{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:45000','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
  await test('preflight permite Authorization e Content-Type explicitamente',async()=>{assert.equal(preflight.status,204);const headers=preflight.headers.get('Access-Control-Allow-Headers').toLowerCase().split(/\s*,\s*/);assert.ok(headers.includes('authorization'));assert.ok(headers.includes('content-type'));});
  await test('preflight permite os métodos usados pelas telas',async()=>{const methods=preflight.headers.get('Access-Control-Allow-Methods').toUpperCase().split(/\s*,\s*/);for(const method of ['GET','POST','PUT','PATCH','DELETE','OPTIONS'])assert.ok(methods.includes(method));});

  const server=createServer(async(request,response)=>{
    const url=new URL(request.url,'http://127.0.0.1');
    if(url.pathname==='/config.js'){response.writeHead(200,{'Content-Type':'application/javascript'});response.end('globalThis.AUTO_CUSTO_CONFIG='+JSON.stringify({apiBaseUrl:actualApi})+';');return;}
    const target=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\//,''));
    if(!target.startsWith(path.resolve(root)+path.sep)){response.writeHead(403);response.end();return;}
    try{const body=await readFile(target);response.writeHead(200,{'Content-Type':target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':'text/html'});response.end(body);}catch{response.writeHead(404);response.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const front='http://127.0.0.1:'+server.address().port;
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  const h=Buffer.from('{"alg":"HS256"}').toString('base64url'),p=Buffer.from(JSON.stringify({credencial:fixtureCredential,cpf:'44444444444',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const jwt=`${h}.${p}.${createHmac('sha256','chave-exclusiva-de-testes-nao-usar-em-producao-2026').update(`${h}.${p}`).digest('base64url')}`;
  await context.addInitScript(token=>{localStorage.setItem('token_jwt',token);localStorage.setItem('usuario_cpf','44444444444');localStorage.setItem('nome_usuario','Teste');localStorage.setItem('usuario_cargo','1');window.alert=()=>{};},jwt);
  await context.route('**/*',route=>[front,actualApi].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
  try{
    await test('navegador consulta API real do harness em outra origem com Bearer',async()=>{await page.goto(front+'/admin-dashboard.html');await page.waitForFunction(()=>Number(document.getElementById('stat-usuarios').textContent)>0,null,{timeout:4000});});
    await test('navegador envia JSON com Bearer após preflight real',async()=>{const result=await page.evaluate(async token=>{const response=await fetch(Api.url('/__tests/eco'),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({texto:'Teste CORS'})});return {status:response.status,body:await response.json()};},jwt);assert.equal(result.status,200);assert.deepEqual(result.body,{sucesso:true,dados:{texto:'Teste CORS'}});});
  }finally{await context.close();await new Promise(resolve=>server.close(resolve));}
}finally{await browser.close();}
console.log(`Endereço navegador: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
