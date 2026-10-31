import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function runSqlBrowser({apiBase,actors,password,med,test,db,one}){
  const require=createRequire(import.meta.url);let playwright;
  try{playwright=require('playwright');}catch{playwright=require(path.resolve(path.dirname(process.execPath),'..','node_modules/playwright'));}
  const candidates=[process.env.AUTO_CUSTO_TEST_BROWSER,playwright.chromium.executablePath(),...['ProgramFiles(x86)','ProgramFiles'].flatMap(e=>process.env[e]?[path.join(process.env[e],'Microsoft/Edge/Application/msedge.exe'),path.join(process.env[e],'Google/Chrome/Application/chrome.exe')]:[])].filter(Boolean);
  const executablePath=candidates.find(existsSync);assert.ok(executablePath,'Navegador Chromium/Edge não localizado.');
  const root=fileURLToPath(new URL('../Front_End/',import.meta.url));
  const server=createServer(async(request,response)=>{
    const url=new URL(request.url,'http://127.0.0.1');
    if(url.pathname==='/config.js'){response.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});response.end('globalThis.AUTO_CUSTO_CONFIG='+JSON.stringify({apiBaseUrl:apiBase})+';');return;}
    const target=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\//,''));
    if(!target.startsWith(path.resolve(root)+path.sep)){response.writeHead(403);response.end();return;}
    try{const content=await readFile(target);response.writeHead(200,{'Content-Type':target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store'});response.end(content);}catch{response.writeHead(404);response.end();}
  });
  let origin,browser;
  const contexts=[];let patient,admin,id;
  async function session(actor,destination){
    const context=await browser.newContext({serviceWorkers:'block'});contexts.push(context);
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await context.addInitScript(()=>{window.__itAttack=0;window.alert=()=>{};window.confirm=()=>true;});
    await context.route('**/*',route=>[origin,apiBase].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
    await page.goto(origin+'/login.html');await page.locator('#usuario').fill(actor.cpf);await page.locator('#senha').fill(password);
    await Promise.all([page.waitForURL('**/'+destination),page.locator('#form-login button[type="submit"]').click()]);
    return {page,errors};
  }
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    origin='http://127.0.0.1:'+server.address().port;
    browser=await playwright.chromium.launch({headless:true,executablePath});
    await test('navegador: login do paciente consulta painel MSSQL real',async()=>{patient=await session(actors.patient,'patient-dashboard.html');await patient.page.waitForFunction(()=>Number(document.getElementById('stats-total').textContent)>0);assert.deepEqual(patient.errors,[]);});
    if(!patient)throw new Error('Sessão de navegador paciente indisponível.');
    await test('navegador: estoque real exibe aspas/HTML como texto',async()=>{
      const {page}=patient;await page.goto(origin+'/stock.html');await page.locator('#f-search').fill('UI SQL');
      await page.waitForFunction(name=>document.querySelector('#lista-medicamentos')?.textContent.includes(name),med.details.nome);
      assert.equal(await page.locator('#lista-medicamentos [data-it-attack]').count(),0);assert.equal(await page.evaluate(()=>window.__itAttack),0);
      assert.equal(await page.locator('#lista-medicamentos h3').textContent(),med.details.nome);
    });
    await test('navegador: paciente solicita e SQL reserva duas unidades',async()=>{
      const {page}=patient;await page.locator('#lista-medicamentos article button').click();await page.locator('#req-qty').fill('2');
      const response=page.waitForResponse(r=>r.url()===apiBase+'/solicitacoes'&&r.request().method()==='POST');
      await page.locator('#form-solicitar button[type="submit"]').click();assert.equal((await response).status(),201);
      const rows=await db('requestsForMed',{id:med.id});assert.equal(rows.length,1);id=rows[0].idSolicitacao;assert.equal((await one('med',{id:med.id})).quantidadeEstoque,3);
    });
    await test('navegador: administrador aprova com observação no registro correto',async()=>{
      admin=await session(actors.admin,'admin-dashboard.html');const {page}=admin;await page.goto(origin+'/admin-requests.html');await page.locator('#f-search').fill('UI SQL');
      await page.waitForFunction(()=>document.querySelectorAll('#lista-solicitacoes article').length===1&&document.querySelector('#lista-solicitacoes').textContent.includes('UI SQL'));
      await page.locator('#lista-solicitacoes article button').first().click();await page.locator('#mod-req-obs').fill(`Nota "aprovada" D'Ávila`);
      const response=page.waitForResponse(r=>r.url()===apiBase+`/admin/solicitacoes/${id}/status`&&r.request().method()==='PATCH');
      await page.locator('#mod-req-actions button').nth(1).click();assert.equal((await response).status(),200);
      const row=await one('request',{id});assert.equal(row.status,'Aprovado');assert.equal(row.observacao,`Nota "aprovada" D'Ávila`);assert.deepEqual(admin.errors,[]);
    });
    await test('navegador: paciente confirma retirada e mantém baixa no SQL',async()=>{
      const {page}=patient;await page.goto(origin+'/patient-dashboard.html');
      const card=page.locator('#lista-solicitacoes article').filter({hasText:med.details.nome});await card.waitFor();
      const response=page.waitForResponse(r=>r.url()===apiBase+`/solicitacoes/${id}/retirada`&&r.request().method()==='PATCH');
      await card.locator('button').click();assert.equal((await response).status(),204);
      assert.equal((await one('request',{id})).status,'Retirado');assert.equal((await one('med',{id:med.id})).quantidadeEstoque,3);assert.deepEqual(patient.errors,[]);
    });
  }finally{
    await Promise.allSettled(contexts.map(context=>context.close()));
    try{if(browser)await browser.close();}finally{if(server.listening)await new Promise(resolve=>server.close(resolve));}
  }
}
