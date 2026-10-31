// Public checks use only GET or deliberately invalid unauthenticated inputs.
import assert from 'node:assert/strict';
import {createHash, createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const base='https://autocusto.duckdns.org';
const preflight=process.argv.includes('--preflight');
const manifest=JSON.parse(await readFile(new URL('./.build/deploy-domain/release.json',import.meta.url),'utf8'));
let passed=0, failed=0;
const results=[];
async function test(name, fn) {
  try { await fn(); passed++; results.push({name,ok:true}); console.log('PASS domínio: '+name); }
  catch(error) { failed++; const message=error.cause?.message||error.message; results.push({name,ok:false,error:message}); console.error('FAIL domínio '+name+': '+message); }
}
const request=(route, options={})=>fetch(base+route,{...options,signal:AbortSignal.timeout(18000)});

await test('HTTP mantém o domínio ao redirecionar para HTTPS',async()=>{
  const response=await fetch('http://autocusto.duckdns.org/',{redirect:'manual',signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,307); assert.equal(response.headers.get('location'),base+'/');
});
await test('HTTPS válido abre a página inicial nova',async()=>{
  const response=await request('/'); assert.equal(response.status,200);
  assert.equal(response.url,base+'/'); const html=await response.text();
  assert.match(html,/hero-title/); assert.match(html,/js\/theme\.js/);
});

if (!preflight) {
  for(const [relative, expected] of Object.entries(manifest.files)) await test('arquivo publicado corresponde ao validado: '+relative,async()=>{
    const response=await request('/'+relative); assert.equal(response.status,200);
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),expected);
  });
  const privateRoutes=[['GET','/produtos'],['GET','/perfil/0'],['PUT','/perfil/0'],['DELETE','/perfil/0'],
    ['GET','/dashboard/paciente/0'],['POST','/solicitacoes'],['PATCH','/solicitacoes/0/retirada'],
    ['GET','/admin/dashboard'],['GET','/admin/usuarios'],['POST','/admin/usuarios'],['PUT','/admin/usuarios/0'],
    ['PATCH','/admin/usuarios/0/cargo'],['PATCH','/admin/usuarios/0/status'],['GET','/admin/medicamentos'],
    ['POST','/admin/medicamentos'],['PUT','/admin/medicamentos/0'],['PATCH','/admin/medicamentos/0/estoque'],
    ['DELETE','/admin/medicamentos/0'],['GET','/admin/solicitacoes'],['PATCH','/admin/solicitacoes/0/status'],
    ...['documentos','interessados','arquivos'].flatMap(name=>[['GET','/'+name],['POST','/'+name]])];
  for(const [method, route] of privateRoutes) await test('sem token bloqueia '+method+' '+route,async()=>{
    const response=await request('/api'+route,{method,...(['POST','PUT','PATCH'].includes(method)?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});
    assert.equal(response.status,401); const data=await response.json();
    assert.equal(data.sucesso,false); assert.equal(data.erro.codigo,'CREDENCIAIS_INVALIDAS');
  });
  await test('JWT de chave fictícia é recusado',async()=>{
    const header=Buffer.from('{"alg":"HS256"}').toString('base64url');
    const payload=Buffer.from(JSON.stringify({cpf:'11111111111',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
    const signature=createHmac('sha256','chave-ficticia-de-outro-emissor-2026').update(header+'.'+payload).digest('base64url');
    assert.equal((await request('/api/produtos',{headers:{Authorization:'Bearer '+header+'.'+payload+'.'+signature}})).status,401);
  });
  await test('login fictício consulta Azure e retorna erro seguro',async()=>{
    const response=await request('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cpf:'90909090909',senha:'senha-ficticia-da-verificacao-de-publicacao'})});
    assert.equal(response.status,401); assert.equal((await response.json()).erro.codigo,'CREDENCIAIS_INVALIDAS');
  });
  for(const target of ['/config.ini','/.env','/providers/Conexao.pas']) await test('arquivo privado não é servido '+target,async()=>{
    assert.ok([403,404].includes((await request(target)).status));
  });

  const require=createRequire(import.meta.url);
  let playwright;
  try { playwright=require('playwright'); }
  catch { playwright=require(path.resolve(path.dirname(process.execPath),'..','node_modules/playwright')); }
  const candidates=[process.env.AUTO_CUSTO_TEST_BROWSER,playwright.chromium.executablePath(),
    ...['ProgramFiles(x86)','ProgramFiles'].flatMap(name=>process.env[name]?[path.join(process.env[name],'Microsoft/Edge/Application/msedge.exe')]:[])].filter(Boolean);
  const executablePath=candidates.find(existsSync); assert.ok(executablePath);
  const browser=await playwright.chromium.launch({headless:true,executablePath});
  try {
    const context=await browser.newContext({serviceWorkers:'block'}), page=await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    // Only application traffic is needed for these checks; external fonts are optional.
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await test('navegador abre domínio e alterna tema',async()=>{
      await page.goto(base+'/'); await page.locator('#hero-title').waitFor();
      const previous=await page.locator('html').getAttribute('data-theme');
      await page.locator('#alternar-tema').click();
      assert.notEqual(await page.locator('html').getAttribute('data-theme'),previous);
      await page.screenshot({path:new URL('./.build/deploy-domain/home.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true,animations:'disabled'});
    });
    await test('login usa API HTTPS da mesma origem',async()=>{
      const theme=await page.locator('html').getAttribute('data-theme');
      await page.goto(base+'/login.html'); await page.locator('#form-login').waitFor();
      assert.equal(await page.evaluate(()=>Api.url('/login')),base+'/api/login');
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
    });
    await test('login no navegador apresenta mensagem segura sem erro JavaScript',async()=>{
      await page.locator('#usuario').fill('90909090909'); await page.locator('#senha').fill('senha-ficticia-da-verificacao-de-publicacao');
      const response=page.waitForResponse(r=>r.url()===base+'/api/login'&&r.request().method()==='POST');
      await page.locator('#form-login button[type="submit"]').click(); assert.equal((await response).status(),401);
      await page.waitForFunction(()=>document.body.textContent.includes('CPF ou senha inválidos'));
      assert.deepEqual(errors,[]);
      await page.screenshot({path:new URL('./.build/deploy-domain/login.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true,animations:'disabled'});
    });
    await test('página inicial em celular permanece no domínio e sem rolagem lateral',async()=>{
      await page.setViewportSize({width:390,height:844}); await page.goto(base+'/');
      assert.equal(new URL(page.url()).origin,base);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      assert.deepEqual(errors,[]);
    });
    await context.close();
  } finally { await browser.close(); }
}

await writeFile(new URL('./.build/deploy-domain/'+(preflight?'public-red.json':'public-results.json'),import.meta.url),
  JSON.stringify({passed,failed,realDatabaseWrites:false,results},null,2));
console.log(`Domínio AutoCusto: ${passed} aprovados; ${failed} falhas.`);
process.exitCode=failed?1:0;
