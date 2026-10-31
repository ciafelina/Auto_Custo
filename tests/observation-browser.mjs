import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);let playwright;try{playwright=require('playwright');}catch{playwright=require(path.resolve(path.dirname(process.execPath),'..','node_modules/playwright'));}
const candidates=[process.env.AUTO_CUSTO_TEST_BROWSER,playwright.chromium.executablePath(),...['ProgramFiles(x86)','ProgramFiles'].flatMap(e=>process.env[e]?[path.join(process.env[e],'Microsoft/Edge/Application/msedge.exe'),path.join(process.env[e],'Google/Chrome/Application/chrome.exe')]:[])].filter(Boolean);
const executablePath=candidates.find(existsSync);assert.ok(executablePath,'Navegador de teste não encontrado.');
const root=fileURLToPath(new URL('../Front_End/',import.meta.url)),browser=await playwright.chromium.launch({headless:true,executablePath});
let passed=0,failed=0;
async function open(){
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),patches=[],errors=[];
 const rows=[71,72].map(id=>({id,medicamento:`Medicamento ${id}`,nomePaciente:'Pessoa de teste',cpfPaciente:'222.222.222-22',quantidade:1,dataSolicitacao:'25/10/2026',status:'Pendente',observacao:`Nota original ${id}`}));
 let gate=null,waiters=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{localStorage.setItem('token_jwt','token-ficticio');localStorage.setItem('usuario_cpf','22222222222');localStorage.setItem('nome_usuario','Pessoa de teste');localStorage.setItem('usuario_cargo','1');window.__alerts=[];window.confirm=()=>true;window.alert=message=>window.__alerts.push(message);});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin==='http://autocusto.test'){
   if(url.pathname==='/config.js'){await route.fulfill({status:200,contentType:'application/javascript',body:"globalThis.AUTO_CUSTO_CONFIG={apiBaseUrl:'http://localhost:9000'};"});return;}
   const target=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\//,''));
   if(!target.startsWith(path.resolve(root)+path.sep)){await route.abort();return;}
   try{await route.fulfill({status:200,contentType:target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':'text/html',body:await readFile(target)});}catch{await route.fulfill({status:404,body:'Não encontrado'});}return;
  }
  if(url.origin==='http://localhost:9000'){
   let result;
   if(route.request().method()==='PATCH'){
    const id=Number(url.pathname.split('/')[3]),body=route.request().postDataJSON();patches.push({id,body});for(const waiter of waiters)waiter();waiters=[];
    if(gate){const waiting=gate;gate=null;await waiting;}
    const row=rows.find(r=>r.id===id);if(row){row.status=body.status;if(Object.hasOwn(body,'observacao'))row.observacao=body.observacao;}result={sucesso:true};
   }else result={sucesso:true,dados:{lista:rows,total:rows.length}};
   await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,PATCH,OPTIONS'},contentType:'application/json',body:JSON.stringify(result)});return;
  }
  await route.abort();
 });
 await page.goto('http://autocusto.test/admin-requests.html');await page.waitForFunction(()=>document.querySelectorAll('#lista-solicitacoes article').length===2);
 return {page,context,rows,patches,errors,waitPatch:()=>patches.length?Promise.resolve():new Promise(resolve=>waiters.push(resolve)),deferPatch:()=>{let release;gate=new Promise(resolve=>{release=resolve;});return release;}};
}
async function test(name,fn){const scope=await open();try{await fn(scope);assert.deepEqual(scope.errors,[]);passed++;console.log('PASS observação navegador: '+name);}catch(e){failed++;console.error('FAIL observação navegador '+name+': '+e.message);}finally{await scope.context.close();}}
async function modal(page,index=0){await page.locator('#lista-solicitacoes article').nth(index).locator('button').first().click();}
try{
 await test('fechar limpa identidade e rascunho do modal',async({page})=>{await modal(page);await page.locator('#mod-req-obs').fill('Rascunho A');await page.evaluate(()=>fecharModal('modal-detail'));assert.equal(await page.locator('#mod-req-id').inputValue(),'');assert.equal(await page.locator('#mod-req-obs').inputValue(),'');});
 await test('ação rápida B não envia nota do modal A fechado',async({page,patches,rows})=>{await modal(page);await page.locator('#mod-req-obs').fill('Rascunho A');await page.evaluate(()=>fecharModal('modal-detail'));await page.evaluate(()=>alterarStatus(72,'Aprovado'));assert.deepEqual(patches,[{id:72,body:{status:'Aprovado'}}]);assert.equal(rows[1].observacao,'Nota original 72');assert.equal(rows[0].observacao,'Nota original 71');});
 await test('ação rápida não consome nem fecha modal de outro registro',async({page,patches})=>{await modal(page);await page.locator('#mod-req-obs').fill('Rascunho A');await page.evaluate(()=>alterarStatus(72,'Aprovado'));assert.deepEqual(patches,[{id:72,body:{status:'Aprovado'}}]);assert.equal(await page.locator('#mod-req-id').inputValue(),'71');assert.equal(await page.locator('#mod-req-obs').inputValue(),'Rascunho A');assert.equal(await page.locator('#modal-detail').evaluate(e=>e.classList.contains('hidden')),false);});
 await test('ação do modal envia o texto apenas para seu registro',async({page,patches,rows})=>{await modal(page);await page.locator('#mod-req-obs').fill(`Nota A "editada" D'Ávila`);await page.locator('#mod-req-actions button').nth(1).click();await page.waitForFunction(()=>document.querySelector('#modal-detail').classList.contains('hidden'));assert.deepEqual(patches,[{id:71,body:{status:'Aprovado',observacao:`Nota A "editada" D'Ávila`}}]);assert.equal(rows[1].observacao,'Nota original 72');});
 await test('limpeza explícita do modal envia texto vazio',async({page,patches})=>{await modal(page);await page.locator('#mod-req-obs').fill('');await page.locator('#mod-req-actions button').nth(1).click();await page.waitForFunction(()=>document.querySelector('#modal-detail').classList.contains('hidden'));assert.equal(patches[0].body.observacao,'');});
 await test('ação de modal com id divergente é recusada',async({page,patches})=>{await modal(page);await page.locator('#mod-req-obs').fill('Rascunho A');await page.evaluate(()=>alterarStatus(72,'Aprovado',true));assert.equal(patches.length,0);assert.equal(await page.locator('#mod-req-id').inputValue(),'71');});
 await test('ação explícita de modal fechado não envia texto residual',async({page,patches})=>{await page.evaluate(()=>{document.getElementById('mod-req-id').value='71';document.getElementById('mod-req-obs').value='Residual';return alterarStatus(71,'Aprovado',true);});assert.equal(patches.length,0);});
 await test('cancelar confirmação mantém rascunho sem gravar',async({page,patches})=>{await modal(page);await page.locator('#mod-req-obs').fill('Rascunho A');await page.evaluate(()=>{window.confirm=()=>false;return alterarStatus(71,'Aprovado',true);});assert.equal(patches.length,0);assert.equal(await page.locator('#mod-req-obs').inputValue(),'Rascunho A');});
 await test('resposta atrasada de A não limpa modal B',async({page,patches,rows,waitPatch,deferPatch})=>{await modal(page);await page.locator('#mod-req-obs').fill('Rascunho A');const release=deferPatch();await page.evaluate(()=>{window.__pending=alterarStatus(71,'Aprovado',true);});await waitPatch();await page.evaluate(row=>abrirModalDetalhes(row),rows[1]);await page.locator('#mod-req-obs').fill('Rascunho B');release();await page.evaluate(async()=>await window.__pending);assert.equal(patches[0].body.observacao,'Rascunho A');assert.equal(await page.locator('#mod-req-id').inputValue(),'72');assert.equal(await page.locator('#mod-req-obs').inputValue(),'Rascunho B');assert.equal(await page.locator('#modal-detail').evaluate(e=>e.classList.contains('hidden')),false);});
}finally{await browser.close();}
console.log(`Observações navegador: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
