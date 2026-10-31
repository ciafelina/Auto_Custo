import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHmac} from 'node:crypto';
const base='https://102.37.16.34';
let passed=0,failed=0;const results=[];
async function test(name,fn){try{await fn();passed++;results.push({name,ok:true});console.log('PASS publicação: '+name);}catch(error){failed++;results.push({name,ok:false,error:error.message});console.error('FAIL publicação '+name+': '+error.message);}}
const request=(route,options={})=>fetch(base+route,{...options,signal:AbortSignal.timeout(15000)});
await test('HTTP redireciona temporariamente para HTTPS',async()=>{const r=await fetch('http://102.37.16.34/',{redirect:'manual',signal:AbortSignal.timeout(10000)});assert.equal(r.status,307);assert.equal(r.headers.get('location'),base+'/');});
await test('HTTPS válido abre a tela de login',async()=>{const r=await request('/');assert.equal(r.status,200);assert.match(await r.text(),/form-login/);});
for(const page of ['login.html','register.html','stock.html','profile.html','patient-dashboard.html','admin-dashboard.html','admin-medications.html','admin-users.html','admin-requests.html'])await test('página publicada '+page,async()=>{const r=await request('/'+page);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.match(await r.text(),/api-client\.js/);});
await test('configuração pública usa a API HTTPS da mesma origem',async()=>{const r=await request('/config.js');assert.equal(r.status,200);const script=await r.text();assert.ok(script.includes("location.origin + '/api'"));assert.ok(!script.includes('localhost'));assert.ok(!script.includes('9000'));});
// IDs zero and empty bodies ensure no real record could be changed even if auth regressed.
const privateRoutes=[['GET','/produtos'],['GET','/perfil/0'],['PUT','/perfil/0'],['DELETE','/perfil/0'],['GET','/dashboard/paciente/0'],['POST','/solicitacoes'],['PATCH','/solicitacoes/0/retirada'],['GET','/admin/dashboard'],['GET','/admin/usuarios'],['POST','/admin/usuarios'],['PUT','/admin/usuarios/0'],['PATCH','/admin/usuarios/0/cargo'],['PATCH','/admin/usuarios/0/status'],['GET','/admin/medicamentos'],['POST','/admin/medicamentos'],['PUT','/admin/medicamentos/0'],['PATCH','/admin/medicamentos/0/estoque'],['DELETE','/admin/medicamentos/0'],['GET','/admin/solicitacoes'],['PATCH','/admin/solicitacoes/0/status'],...['documentos','interessados','arquivos'].flatMap(p=>[['GET','/'+p],['POST','/'+p]])];
for(const [method,route] of privateRoutes)await test('sem token '+method+' '+route,async()=>{const r=await request('/api'+route,{method,...(['POST','PUT','PATCH'].includes(method)?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});assert.equal(r.status,401,'Rota privada deve exigir login.');const data=await r.json();assert.equal(data.sucesso,false);assert.equal(data.erro.codigo,'CREDENCIAIS_INVALIDAS');});
await test('assinatura JWT de outra chave é recusada',async()=>{const header=Buffer.from('{"alg":"HS256"}').toString('base64url'),payload=Buffer.from(JSON.stringify({cpf:'11111111111',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');const signature=createHmac('sha256','chave-ficticia-de-outro-emissor-2026').update(`${header}.${payload}`).digest('base64url');const r=await request('/api/produtos',{headers:{Authorization:`Bearer ${header}.${payload}.${signature}`}});assert.equal(r.status,401);});
await test('credenciais fictícias retornam 401 após consulta ao banco',async()=>{const r=await request('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cpf:'90909090909',senha:'senha-ficticia-da-verificacao-de-publicacao'})});assert.equal(r.status,401);assert.equal((await r.json()).erro.codigo,'CREDENCIAIS_INVALIDAS');});
for(const target of ['/config.ini','/.env','/providers/Conexao.pas'])await test('arquivo privado não é servido '+target,async()=>{const r=await request(target);assert.ok([403,404].includes(r.status));});
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright');}catch{playwright=require(path.resolve(path.dirname(process.execPath),'..','node_modules/playwright'));}
const candidates=[process.env.AUTO_CUSTO_TEST_BROWSER,playwright.chromium.executablePath(),...['ProgramFiles(x86)','ProgramFiles'].flatMap(e=>process.env[e]?[path.join(process.env[e],'Microsoft/Edge/Application/msedge.exe'),path.join(process.env[e],'Google/Chrome/Application/chrome.exe')]:[])].filter(Boolean);
const executablePath=candidates.find(existsSync);assert.ok(executablePath,'Navegador não encontrado.');
const browser=await playwright.chromium.launch({headless:true,executablePath});
try{
 const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await test('navegador abre login com certificado válido',async()=>{await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.locator('#form-login').waitFor();assert.equal(await page.evaluate(()=>Api.url('/login')),base+'/api/login');assert.deepEqual(errors,[]);});
 await test('navegador envia login à API publicada e mostra erro seguro',async()=>{await page.locator('#usuario').fill('90909090909');await page.locator('#senha').fill('senha-ficticia-da-verificacao-de-publicacao');const response=page.waitForResponse(r=>r.url()===base+'/api/login'&&r.request().method()==='POST');await page.locator('#form-login button[type="submit"]').click();assert.equal((await response).status(),401);await page.waitForFunction(()=>document.body.textContent.includes('CPF ou senha inválidos'));assert.deepEqual(errors,[]);});
 await page.screenshot({path:new URL('./.build/deploy/public-login.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
 await context.close();
}finally{await browser.close();}
await writeFile(new URL('./.build/deploy/public-results.json',import.meta.url),JSON.stringify({passed,failed,realDatabaseWrites:false,results},null,2));
console.log(`Publicação: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
