import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright');}catch{playwright=require(path.resolve(path.dirname(process.execPath),'..','node_modules/playwright'));}
const candidates=[process.env.AUTO_CUSTO_TEST_BROWSER,playwright.chromium.executablePath(),...['ProgramFiles(x86)','ProgramFiles'].flatMap(e=>process.env[e]?[path.join(process.env[e],'Microsoft/Edge/Application/msedge.exe'),path.join(process.env[e],'Google/Chrome/Application/chrome.exe')]:[])].filter(Boolean);
const executablePath=candidates.find(existsSync);assert.ok(executablePath);
const root=fileURLToPath(new URL('../Front_End/',import.meta.url));
const message=`Não foi possível salvar "D'Ávila". <img data-test-attack src=x onerror="window.__attack=true">`;
const failure={sucesso:false,erro:{codigo:'ERRO_TESTE',mensagem:message,detalhes:[]}};
const med={id:42,nome:'Medicamento teste',categoria:'Teste',estoque:10,estoqueMinimo:2};
const user={cpf:'22222222222',cpfFormatado:'222.222.222-22',nome:'Pessoa de teste',email:'teste@example.test',idCargo:3,status:'Ativo'};
const browser=await playwright.chromium.launch({headless:true,executablePath});
let passed=0,failed=0;
async function open(file,{failGet=false,htmlError=false}={}){
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],calls=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{localStorage.setItem('token_jwt','token-ficticio');localStorage.setItem('usuario_cpf','22222222222');localStorage.setItem('nome_usuario','Pessoa de teste');localStorage.setItem('usuario_cargo','1');window.__alerts=[];window.alert=m=>window.__alerts.push(m);window.confirm=()=>true;window.__attack=false;});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin==='http://autocusto.test'){
      if(url.pathname==='/config.js'){await route.fulfill({status:200,contentType:'application/javascript',body:"globalThis.AUTO_CUSTO_CONFIG={apiBaseUrl:'http://localhost:9000'};"});return;}
      const target=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\//,''));
      if(!target.startsWith(path.resolve(root)+path.sep)){await route.abort();return;}
      try{await route.fulfill({status:200,contentType:target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':'text/html',body:await readFile(target)});}catch{await route.fulfill({status:404,body:'Não encontrado'});}return;
    }
    if(url.origin==='http://localhost:9000'){
      const method=route.request().method();calls.push({method,route:url.pathname});
      const bad=failGet||method!=='GET';
      const success=url.pathname==='/produtos'?{sucesso:true,resultado:{dados:[med],total_registros:1}}:url.pathname==='/admin/medicamentos'?{sucesso:true,dados:{lista:[med],total:1}}:url.pathname==='/admin/usuarios'?{sucesso:true,dados:{lista:[user],total:1,totalAdmins:1,totalFuncionarios:0,totalPacientes:0,totalLista:1}}:url.pathname.startsWith('/perfil')?{sucesso:true,dados:{nomeCompleto:'Pessoa de teste',cpf:'22222222222',email:'teste@example.test',dataNascimento:'2000-01-01'}}:url.pathname==='/admin/dashboard'?{sucesso:true,dados:{totalUsuarios:1,totalMedicamentos:1,estoqueCritico:0,solicitacoesPendentes:0,medicamentosZerados:[]}}:url.pathname.startsWith('/dashboard')?{sucesso:true,dados:{total:0,solicitacoes:[]}}:{sucesso:true,dados:{lista:[],total:0}};
      await route.fulfill({status:bad?409:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'},contentType:bad&&htmlError?'text/html':'application/json',body:bad&&htmlError?'<html>ERRO_PROXY_PRIVADO</html>':JSON.stringify(bad?failure:success)});return;
    }
    await route.abort();
  });
  await page.goto('http://autocusto.test/'+file);
  if(file==='profile.html'&&!failGet)await page.waitForFunction(()=>document.getElementById('p-nome').textContent==='Pessoa de teste');
  return {context,page,errors,calls};
}
async function test(file,name,fn,options){const scope=await open(file,options);try{await fn(scope);assert.deepEqual(scope.errors,[]);assert.equal(await scope.page.locator('[data-test-attack]').count(),0);assert.equal(await scope.page.evaluate(()=>window.__attack),false);passed++;console.log('PASS erros navegador: '+name);}catch(e){failed++;console.error('FAIL erros navegador '+name+': '+e.message);}finally{await scope.context.close();}}
async function alertContains(page){await page.waitForFunction(()=>window.__alerts.length>0,null,{timeout:2500});assert.ok((await page.evaluate(()=>window.__alerts)).some(value=>value.includes(message)));}
const submit=async(page,id)=>page.locator(id).evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
try{
  for(const [file,selector] of [['admin-medications.html','#tabela-medicamentos'],['admin-users.html','#tabela-usuarios'],['admin-requests.html','#lista-solicitacoes'],['stock.html','#lista-medicamentos'],['patient-dashboard.html','#lista-solicitacoes']])await test(file,'lista '+file+' mostra erro.mensagem como texto',async({page})=>{await page.waitForFunction(({selector,message})=>document.querySelector(selector)?.textContent.includes(message),{selector,message},{timeout:2500});},{failGet:true});
  await test('admin-dashboard.html','painel administrativo avisa erro da API',async({page})=>alertContains(page),{failGet:true});
  await test('login.html','login mostra mensagem padronizada',async({page})=>{await page.locator('#usuario').fill('22222222222');await page.locator('#senha').fill('teste');await submit(page,'#form-login');await page.waitForFunction(m=>document.querySelector('#login-error').textContent.includes(m),message,{timeout:2500});});
  await test('login.html','resposta HTML não é exibida como mensagem de login',async({page})=>{await page.locator('#usuario').fill('22222222222');await page.locator('#senha').fill('teste');await submit(page,'#form-login');await page.waitForFunction(()=>!document.querySelector('#login-error').classList.contains('hidden'));assert.doesNotMatch(await page.locator('#login-error').textContent(),/ERRO_PROXY_PRIVADO|<html>/);},{htmlError:true});
  await test('register.html','cadastro mostra mensagem padronizada',async({page})=>{
    for(const [id,value] of [['r-name','Pessoa teste'],['r-email','teste@example.test'],['r-cpf','52998224725'],['r-senha','teste123'],['r-confirma-senha','teste123'],['r-birth','2000-01-01'],['r-phone','11999999999'],['r-address','Rua teste']])await page.locator('#'+id).fill(value);
    await submit(page,'#form-register');await alertContains(page);
  });
  await test('profile.html','carregamento de perfil mostra mensagem sem JSON bruto',async({page})=>{await alertContains(page);assert.doesNotMatch((await page.evaluate(()=>window.__alerts)).join(' '),/"sucesso":|"codigo":/);},{failGet:true});
  await test('profile.html','edição de perfil mostra mensagem sem JSON bruto',async({page})=>{await submit(page,'#form-edit-profile');await alertContains(page);assert.doesNotMatch((await page.evaluate(()=>window.__alerts)).join(' '),/"sucesso":|"codigo":/);});
  await test('admin-medications.html','salvar medicamento mostra mensagem padronizada',async({page})=>{await page.evaluate(m=>{abrirModalMedicamento(m);return salvarMedicamento({preventDefault(){}});},med);await alertContains(page);});
  await test('admin-medications.html','ajuste de estoque mostra mensagem padronizada',async({page})=>{await page.evaluate(()=>{abrirModalEstoque(42,'Medicamento',10);return salvarEstoque({preventDefault(){}});});await alertContains(page);});
  await test('admin-users.html','salvar usuário mostra mensagem padronizada',async({page})=>{await page.evaluate(u=>{abrirModalEditarUsuario(u);return salvarUsuario({preventDefault(){}});},user);await alertContains(page);});
  await test('admin-users.html','alterar cargo mostra mensagem padronizada',async({page})=>{await page.evaluate(()=>{abrirModalCargo('22222222222','Pessoa',3,'PT');return salvarCargo({preventDefault(){}});});await alertContains(page);});
  await test('admin-users.html','alterar status mostra mensagem padronizada',async({page})=>{await page.evaluate(()=>{abrirModalStatus('22222222222','Pessoa',true);return confirmarStatus();});await alertContains(page);});
  await test('admin-requests.html','status da solicitação mostra mensagem padronizada',async({page})=>{await page.evaluate(()=>alterarStatus(42,'Aprovado'));await alertContains(page);});
  await test('patient-dashboard.html','retirada recusada mostra mensagem padronizada',async({page})=>{await page.evaluate(()=>confirmarRetirada(42));await alertContains(page);});
}finally{await browser.close();}
console.log(`Erros navegador: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
