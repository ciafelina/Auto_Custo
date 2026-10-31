import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url);let pw;
try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
const executablePath=[pw.chromium.executablePath(),...['ProgramFiles(x86)','ProgramFiles'].map(e=>path.join(process.env[e]||'','Microsoft/Edge/Application/msedge.exe'))].find(existsSync);
const root=path.resolve('Front_End'),output=path.resolve('tests/.build/password-recovery-browser');await mkdir(output,{recursive:true});
assert.ok(existsSync(path.join(root,'recuperar-senha.html')),'Tela de recuperação ausente');
assert.ok(existsSync(path.join(root,'redefinir-senha.html')),'Tela de redefinição ausente');
const browser=await pw.chromium.launch({executablePath,headless:true});let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
try{
for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:920},colorScheme:'dark'}),page=await context.newPage(),calls=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));let status=202,reply={sucesso:true,mensagem:'Se os dados corresponderem a uma conta ativa, enviaremos um link para o e-mail cadastrado.'};
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='recuperacao-api.test'){
   calls.push({url:u.href,method:route.request().method(),body:route.request().postDataJSON()});
   return route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(reply)});
  }
  if(u.hostname!=='recuperacao.test')return route.abort();
  if(u.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:"globalThis.AUTO_CUSTO_CONFIG={apiBaseUrl:'https://recuperacao-api.test/api'};"});
  try{const name=u.pathname.slice(1)||'index.html';const body=await readFile(path.join(root,name));return route.fulfill({body,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});}catch{return route.fulfill({status:404,body:'missing'});}
 });
 await test(`link Esqueci minha senha no login (${width})`,async()=>{
  await page.goto('http://recuperacao.test/login.html');await page.getByRole('link',{name:'Esqueci minha senha'}).click();await page.waitForURL('**/recuperar-senha.html');
 });
 await test(`solicitação e resposta genérica (${width})`,async()=>{
  await page.locator('#rec-cpf').fill('90000000001');await page.locator('#rec-email').fill('teste@example.invalid');
  await page.getByRole('button',{name:'Enviar link de recuperação'}).click();await page.locator('#rec-mensagem').filter({hasText:'Se os dados'}).waitFor();
  assert.equal(calls.at(-1).url,'https://recuperacao-api.test/api/senha/recuperar');assert.equal(calls.at(-1).method,'POST');
  assert.equal(calls.at(-1).body.cpf,'90000000001');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 });
 await test(`token removido da URL e senha confirmada antes do envio (${width})`,async()=>{
  await page.goto('http://recuperacao.test/redefinir-senha.html#token='+'a'.repeat(64));
  await page.locator('#nova-senha').waitFor();assert.equal(new URL(page.url()).hash,'');const before=calls.length;
  await page.locator('#nova-senha').fill('NovaSenha2026!');await page.locator('#confirma-senha').fill('Diferente2026!');await page.getByRole('button',{name:'Salvar nova senha'}).click();
  await page.locator('#rec-mensagem').filter({hasText:'não coincidem'}).waitFor();assert.equal(calls.length,before);
  await page.locator('#confirma-senha').fill('NovaSenha2026!');status=200;reply={sucesso:true,mensagem:'Senha alterada. Entre com a nova senha.'};
  await page.getByRole('button',{name:'Salvar nova senha'}).click();await page.locator('#rec-mensagem').filter({hasText:'Senha alterada'}).waitFor();
  assert.equal(calls.at(-1).url,'https://recuperacao-api.test/api/senha/redefinir');assert.equal(calls.at(-1).body.token,'a'.repeat(64));
  assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('a'.repeat(64)));
 });
 await test(`link ausente não envia nenhuma redefinição (${width})`,async()=>{
  const before=calls.length;await page.goto('http://recuperacao.test/redefinir-senha.html');await page.locator('#rec-mensagem').filter({hasText:'inválido'}).waitFor();assert.equal(calls.length,before);
 });
 await test(`erro da API é texto e não executa HTML (${width})`,async()=>{
  await page.goto('http://recuperacao.test/recuperar-senha.html');await page.locator('#rec-cpf').fill('90000000001');await page.locator('#rec-email').fill('teste@example.invalid');
  status=429;reply={sucesso:false,erro:{mensagem:'<img src=x onerror="window.invadiu=true"> Aguarde.'}};
  await page.getByRole('button',{name:'Enviar link de recuperação'}).click();await page.locator('#rec-mensagem').filter({hasText:'Aguarde.'}).waitFor();
  assert.equal(await page.evaluate(()=>!!window.invadiu),false);assert.equal(await page.locator('#rec-mensagem img').count(),0);assert.deepEqual(errors,[]);
 });
 await page.goto('http://recuperacao.test/recuperar-senha.html');
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.auth-box')).opacity==='1');
 await page.screenshot({path:path.join(output,`recuperar-${width}.png`),fullPage:true});await context.close();
}
console.log(`Telas de recuperação: ${passed} aprovados, 0 falhas.`);
}finally{await browser.close();}
