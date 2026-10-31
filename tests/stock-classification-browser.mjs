import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stockCases} from './stock-cases.mjs';

const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=require(path.resolve(path.dirname(process.execPath),'..','node_modules/playwright'));}
const candidates=[process.env.AUTO_CUSTO_TEST_BROWSER,playwright.chromium.executablePath(),...['ProgramFiles(x86)','ProgramFiles'].flatMap(e=>process.env[e]?[path.join(process.env[e],'Microsoft/Edge/Application/msedge.exe'),path.join(process.env[e],'Google/Chrome/Application/chrome.exe')]:[])].filter(Boolean);
const executablePath=candidates.find(existsSync);assert.ok(executablePath,'Navegador de teste não encontrado.');
const root=fileURLToPath(new URL('../Front_End/',import.meta.url));
const browser=await playwright.chromium.launch({headless:true,executablePath});
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS classificação navegador: '+name);}catch(e){failed++;console.error('FAIL classificação navegador '+name+': '+e.message);}}
async function open(file){
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],queries=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{localStorage.setItem('token_jwt','token-ficticio');localStorage.setItem('usuario_cpf','22222222222');localStorage.setItem('nome_usuario','Pessoa de teste');localStorage.setItem('usuario_cargo','1');window.confirm=()=>false;window.alert=()=>{};});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin==='http://autocusto.test'){
      if(url.pathname==='/config.js'){await route.fulfill({status:200,contentType:'application/javascript',body:"globalThis.AUTO_CUSTO_CONFIG={apiBaseUrl:'http://localhost:9000'};"});return;}
      const target=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\//,''));
      if(!target.startsWith(path.resolve(root)+path.sep)){await route.abort();return;}
      try{await route.fulfill({status:200,contentType:target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':'text/html',body:await readFile(target)});}catch{await route.fulfill({status:404,body:'Não encontrado'});}return;
    }
    if(url.origin==='http://localhost:9000'){
      queries.push({route:url.pathname,params:Object.fromEntries(url.searchParams)});
      const result=url.pathname==='/produtos'?{sucesso:true,resultado:{dados:stockCases,total_registros:15}}:{sucesso:true,dados:{lista:stockCases,total:15}};
      await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,OPTIONS'},contentType:'application/json',body:JSON.stringify(result)});return;
    }
    await route.abort();
  });
  await page.goto('http://autocusto.test/'+file);
  await page.waitForFunction(()=>document.querySelectorAll('#lista-medicamentos article, #tabela-medicamentos tr').length===15);
  return {context,page,errors,queries};
}
try{
  for(const file of ['stock.html','admin-medications.html']){
    const scope=await open(file),{page,errors,queries}=scope;
    try{
      for(const [index,row] of stockCases.entries())await test(`${file} saldo ${row.estoque}, mínimo ${row.estoqueMinimo} => ${row.want}`,async()=>{
        const labels={out:'Indisponível',low:'Crítico',available:'Disponível'},colors={out:'text-red-600',low:'text-orange-600',available:'text-green-600'};
        if(file==='stock.html'){
          const card=page.locator('#lista-medicamentos article').nth(index);
          assert.equal(await card.locator('.stock-box > p').nth(1).textContent(),labels[row.want]);
          assert.ok((await card.locator('.stock-box').getAttribute('class')).split(' ').includes(row.want==='out'?'unavailable':row.want));
          assert.ok((await card.locator('.stock-num').getAttribute('class')).split(' ').includes(colors[row.want]));
          assert.equal(await card.locator('button').isDisabled(),row.want==='out');
        }else{
          const tableRow=page.locator('#tabela-medicamentos tr').nth(index);
          assert.equal(await tableRow.locator('.badge').textContent(),labels[row.want]);
          assert.ok((await tableRow.locator('.badge').getAttribute('class')).split(' ').includes('badge-'+(row.want==='out'?'unavailable':row.want)));
          assert.ok((await tableRow.locator('td').nth(4).locator('span').getAttribute('class')).split(' ').includes(colors[row.want]));
        }
        assert.deepEqual(errors,[]);
      });
      if(file==='stock.html'){
        await test('estoque crítico ainda permite abrir pedido com saldo correto',async()=>{
          await page.locator('#lista-medicamentos article').nth(5).locator('button').click();
          assert.equal(await page.locator('#mod-id-med').inputValue(),'9006');assert.equal(await page.locator('#req-qty').getAttribute('max'),'6');
          await page.evaluate(()=>fecharModal());
        });
        for(const status of ['available','low','out'])await test(`seletor envia filtro ${status} para a API`,async()=>{
          const response=page.waitForResponse(r=>new URL(r.url()).searchParams.get('disponibilidade')===status);
          await page.locator('#f-avail').selectOption(status);await response;
          assert.equal(queries.at(-1).params.disponibilidade,status);assert.equal(queries.at(-1).params.page,'1');assert.deepEqual(errors,[]);
        });
      }
    }finally{await scope.context.close();}
  }
}finally{await browser.close();}
console.log(`Classificação navegador: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
