import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=require(path.resolve(path.dirname(process.execPath),'..','node_modules/playwright'));}
const candidates=[process.env.AUTO_CUSTO_TEST_BROWSER,playwright.chromium.executablePath(),...['ProgramFiles(x86)','ProgramFiles'].flatMap(e=>process.env[e]?[path.join(process.env[e],'Microsoft/Edge/Application/msedge.exe'),path.join(process.env[e],'Google/Chrome/Application/chrome.exe')]:[])].filter(Boolean);
const executablePath=candidates.find(p=>existsSync(p));assert.ok(executablePath,'Instale um navegador Chromium ou defina AUTO_CUSTO_TEST_BROWSER.');
const root=fileURLToPath(new URL('../Front_End/',import.meta.url));
const name=`D'Ávila "Especial" <img data-test-attack src=x onerror="window.__payloadExecuted++"> & Cia`;
const description=`Descrição 'com aspas' "duplas" <svg data-test-attack onload="window.__payloadExecuted++"></svg> & detalhes`;
const date=`25/10/2026 <img data-test-attack src=x onerror="window.__payloadExecuted++">`;
const med={id:42,nome:name,descricao:description,categoria:name,dosagem:'10 mg',fabricante:name,estoque:10,estoqueMinimo:2};
const user={cpf:'22222222222',cpfFormatado:'222.222.222-22',nome:name,email:description,idCargo:3,status:'Ativo'};
const request={id:71,medicamento:name,nomePaciente:name,cpfPaciente:user.cpfFormatado,quantidade:2,dataSolicitacao:date,dataAtualizacao:date,status:'Pendente',observacao:description};
function fixtures(){return {
 '/admin/medicamentos':{sucesso:true,dados:{lista:[structuredClone(med)],total:1}},
 '/produtos':{sucesso:true,resultado:{dados:[structuredClone(med)],total_registros:1}},
 '/admin/usuarios':{sucesso:true,dados:{lista:[structuredClone(user)],total:1,totalAdmins:0,totalFuncionarios:0,totalPacientes:1,totalLista:1}},
 '/admin/solicitacoes':{sucesso:true,dados:{lista:[structuredClone(request)],total:1}},
 '/dashboard/paciente/22222222222':{sucesso:true,dados:{total:1,pendentes:0,aprovados:1,reprovados:0,solicitacoes:[{id:71,medicamento:name,quantidade:2,data:date,status:'Aprovado'}]}},
 '/admin/dashboard':{sucesso:true,dados:{totalUsuarios:1,totalMedicamentos:2,estoqueCritico:2,solicitacoesPendentes:1,medicamentosZerados:[name,description]}}
};}
const browser=await playwright.chromium.launch({headless:true,executablePath});
let passed=0,failed=0;
async function open(file,overrides={}){
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 const responses=Object.assign(fixtures(),overrides),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{localStorage.setItem('token_jwt','token-ficticio');localStorage.setItem('usuario_cpf','22222222222');localStorage.setItem('nome_usuario','Pessoa de teste');localStorage.setItem('usuario_cargo','1');window.__payloadExecuted=0;window.confirm=()=>false;window.alert=()=>{};});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin==='http://autocusto.test'){
   if(url.pathname==='/config.js'){await route.fulfill({status:200,contentType:'application/javascript',body:"globalThis.AUTO_CUSTO_CONFIG={apiBaseUrl:'http://localhost:9000'};"});return;}
   const relative=decodeURIComponent(url.pathname).replace(/^\//,'');const target=path.resolve(root,relative);
   if(!target.startsWith(path.resolve(root)+path.sep)){await route.abort();return;}
   try{const body=await readFile(target);await route.fulfill({status:200,contentType:target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':'text/html',body});}catch{await route.fulfill({status:404,body:'Arquivo não encontrado'});}return;
  }
  if(url.origin==='http://localhost:9000'){
   const entry=responses[url.pathname]||{sucesso:true};
   await route.fulfill({status:entry.httpStatus||200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'},contentType:'application/json',body:JSON.stringify(entry.body||entry)});return;
  }
  await route.abort();
 });
 await page.goto('http://autocusto.test/'+file);
 return {page,context,errors};
}
async function rendered(page,selector){await page.waitForFunction(s=>document.querySelector(s)?.textContent.includes("D'Ávila"),selector,{timeout:5000});}
async function safe(page,selector='body'){
 assert.equal(await page.locator(selector+' [data-test-attack]').count(),0,'Texto da API criou elementos HTML.');
 assert.equal(await page.evaluate(()=>window.__payloadExecuted),0,'Conteúdo da API executou JavaScript.');
}
async function test(label,fn){let scope;try{scope=await fn(open);passed++;console.log('PASS exibição: '+label);}catch(e){failed++;console.error('FAIL exibição '+label+': '+e.message);}finally{if(scope)await scope.context.close();}}
async function withPage(file,fn,overrides){const scope=await open(file,overrides);try{await fn(scope);assert.deepEqual(scope.errors,[],'A tela gerou um erro JavaScript não tratado.');return scope;}catch(e){await scope.context.close();throw e;}}
try{
 await test('medicamentos mostram nomes e descrições literalmente',()=>withPage('admin-medications.html',async({page})=>{
  await rendered(page,'#tabela-medicamentos');await safe(page,'#tabela-medicamentos');
  assert.ok((await page.locator('#tabela-medicamentos').textContent()).includes(name));
  assert.equal(await page.locator('#tabela-medicamentos [title]').first().getAttribute('title'),description);
 }));
 await test('editar medicamento com apóstrofo abre o cadastro correto',()=>withPage('admin-medications.html',async({page})=>{
  await rendered(page,'#tabela-medicamentos');await page.locator('#tabela-medicamentos button').nth(0).click();
  assert.equal(await page.locator('#m-name').inputValue(),name);assert.equal(await page.locator('#m-desc').inputValue(),description);await safe(page);
 }));
 await test('botões de estoque e exclusão preservam o nome completo',()=>withPage('admin-medications.html',async({page})=>{
  await rendered(page,'#tabela-medicamentos');await page.locator('#tabela-medicamentos button').nth(1).click();assert.equal(await page.locator('#stock-med-name').textContent(),name);
  await page.evaluate(()=>fecharModal('modal-stock'));await page.locator('#tabela-medicamentos button').nth(2).click();assert.equal(await page.locator('#delete-med-name').textContent(),name);await safe(page);
 }));
 const secondMed={...med,id:43,nome:`Segundo D'Ávila "Outro" ${description}`};
 await test('cada linha de medicamento mantém seu objeto e seus botões',()=>withPage('admin-medications.html',async({page})=>{
  await rendered(page,'#tabela-medicamentos');const rows=page.locator('#tabela-medicamentos tr');assert.equal(await rows.count(),2);
  await rows.nth(1).locator('button').nth(0).click();assert.equal(await page.locator('#m-id').inputValue(),'43');assert.equal(await page.locator('#m-name').inputValue(),secondMed.nome);
  await page.evaluate(()=>fecharModal('modal-med'));await rows.nth(0).locator('button').nth(1).click();assert.equal(await page.locator('#stock-id').inputValue(),'42');assert.equal(await page.locator('#stock-med-name').textContent(),name);await safe(page);
 },{'/admin/medicamentos':{sucesso:true,dados:{lista:[med,secondMed],total:2}}}));
 await test('usuários mostram nome e email como texto',()=>withPage('admin-users.html',async({page})=>{
  await rendered(page,'#tabela-usuarios');await safe(page,'#tabela-usuarios');const text=await page.locator('#tabela-usuarios').textContent();assert.ok(text.includes(name));assert.ok(text.includes(description));
 }));
 await test('botões de usuário preservam nome, CPF e edição',()=>withPage('admin-users.html',async({page})=>{
  await rendered(page,'#tabela-usuarios');const buttons=page.locator('#tabela-usuarios button');
  await buttons.nth(0).click();assert.equal(await page.locator('#role-name').textContent(),name);assert.equal(await page.locator('#role-user-id').inputValue(),user.cpf);
  await page.evaluate(()=>fecharModal('modal-role'));await buttons.nth(1).click();assert.equal(await page.locator('#u-name').inputValue(),name);assert.equal(await page.locator('#u-email').inputValue(),description);
  await page.evaluate(()=>fecharModal('modal-user'));await buttons.nth(2).click();assert.equal(await page.locator('#st-user-name').textContent(),name);assert.equal(await page.locator('#st-user-cpf').inputValue(),user.cpf);await safe(page);
 }));
 await test('estoque mostra textos e botão Solicitar funciona com aspas',()=>withPage('stock.html',async({page})=>{
  await rendered(page,'#lista-medicamentos');await safe(page,'#lista-medicamentos');assert.ok((await page.locator('#lista-medicamentos').textContent()).includes(description));
  await page.locator('#lista-medicamentos button').click();assert.equal(await page.locator('#mod-nome-med').textContent(),`${name} 10 mg`);assert.equal(await page.locator('#mod-id-med').inputValue(),'42');await safe(page);
 }));
 await test('solicitações administrativas exibem nomes e datas como texto',()=>withPage('admin-requests.html',async({page})=>{
  await rendered(page,'#lista-solicitacoes');await safe(page,'#lista-solicitacoes');const text=await page.locator('#lista-solicitacoes').textContent();assert.ok(text.includes(name));assert.ok(text.includes(date));
 }));
 await test('detalhes de solicitação preservam aspas e datas',()=>withPage('admin-requests.html',async({page})=>{
  await rendered(page,'#lista-solicitacoes');await page.locator('#lista-solicitacoes button').nth(0).click();assert.equal(await page.locator('#mod-req-med').textContent(),name);assert.equal(await page.locator('#mod-req-obs').inputValue(),description);await safe(page,'#modal-detail');
 }));
 await test('status e datas do modal não criam marcação',()=>withPage('admin-requests.html',async({page})=>{
  await rendered(page,'#lista-solicitacoes');await page.evaluate(req=>abrirModalDetalhes(encodeURIComponent(JSON.stringify(req))),{...request,status:description});
  assert.equal(await page.locator('#mod-req-status').textContent(),description);await safe(page,'#modal-detail');
 }));
 await test('ações de solicitação recebem id e status corretos',()=>withPage('admin-requests.html',async({page})=>{
  await rendered(page,'#lista-solicitacoes');await page.evaluate(()=>{window.__actions=[];window.alterarStatus=(id,status)=>window.__actions.push({id,status});});
  await page.locator('#lista-solicitacoes button').nth(1).click();await page.locator('#lista-solicitacoes button').nth(2).click();
  assert.deepEqual(await page.evaluate(()=>window.__actions),[{id:71,status:'Aprovado'},{id:71,status:'Cancelado'}]);await safe(page);
 }));
 await test('ações de solicitações diferentes não trocam identificadores',()=>withPage('admin-requests.html',async({page})=>{
  await rendered(page,'#lista-solicitacoes');await page.evaluate(()=>{window.__actions=[];window.alterarStatus=(id,status)=>window.__actions.push({id,status});});
  const cards=page.locator('#lista-solicitacoes article');assert.equal(await cards.count(),2);
  await cards.nth(1).locator('button').nth(1).click();await cards.nth(0).locator('button').nth(2).click();
  assert.deepEqual(await page.evaluate(()=>window.__actions),[{id:72,status:'Retirado'},{id:71,status:'Cancelado'}]);await safe(page);
 },{'/admin/solicitacoes':{sucesso:true,dados:{lista:[request,{...request,id:72,status:'Aprovado'}],total:2}}}));
 await test('painel do paciente preserva textos e botão de retirada',()=>withPage('patient-dashboard.html',async({page})=>{
  await rendered(page,'#lista-solicitacoes');await safe(page,'#lista-solicitacoes');assert.ok((await page.locator('#lista-solicitacoes').textContent()).includes(name));
  await page.evaluate(()=>{window.__idRetirada=null;window.confirmarRetirada=id=>{window.__idRetirada=id;};});await page.locator('#lista-solicitacoes button').click();assert.equal(await page.evaluate(()=>window.__idRetirada),71);
 }));
 await test('alerta administrativo preserva nomes sem executar HTML',()=>withPage('admin-dashboard.html',async({page})=>{
  await rendered(page,'#out-of-stock-text');await safe(page,'#out-of-stock-text');const text=await page.locator('#out-of-stock-text').textContent();assert.ok(text.includes(name));assert.ok(text.includes(description));assert.equal(await page.locator('#out-of-stock-text strong').count(),2);
 }));
 for(const [file,selector,api] of [['admin-medications.html','#tabela-medicamentos','/admin/medicamentos'],['admin-users.html','#tabela-usuarios','/admin/usuarios'],['admin-requests.html','#lista-solicitacoes','/admin/solicitacoes'],['stock.html','#lista-medicamentos','/produtos']]){
  await test('mensagem de erro como texto em '+file,()=>withPage(file,async({page})=>{await rendered(page,selector);await safe(page,selector);assert.ok((await page.locator(selector).textContent()).includes(name));},{[api]:{httpStatus:500,body:{sucesso:false,mensagem:name}}}));
 }
}finally{await browser.close();}
console.log(`Exibição segura: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
