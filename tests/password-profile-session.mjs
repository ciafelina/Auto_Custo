import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url);let pw;
try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
const executablePath=[pw.chromium.executablePath(),...['ProgramFiles(x86)','ProgramFiles'].map(e=>path.join(process.env[e]||'','Microsoft/Edge/Application/msedge.exe'))].find(existsSync);
const browser=await pw.chromium.launch({executablePath,headless:true});let passed=0;
try{
for(const password of ['NovaSenha2026!','']){
 const context=await browser.newContext(),page=await context.newPage();let gets=0;page.setDefaultTimeout(1500);
 await context.addInitScript(()=>{
  if(!sessionStorage.seed){localStorage.setItem('token_jwt','token-ficticio');localStorage.setItem('usuario_cpf','90000000001');localStorage.setItem('usuario_cargo','3');sessionStorage.seed='1';}
  window.alert=()=>{};
 });
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='profile-api.test'){
   if(route.request().method()==='GET')gets++;
   return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({sucesso:true,dados:{nomeCompleto:'Teste perfil',cpf:'90000000001',email:'teste@example.invalid',dataNascimento:'2000-01-01'}})});
  }
  if(u.hostname!=='profile.test')return route.abort();
  if(u.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:"globalThis.AUTO_CUSTO_CONFIG={apiBaseUrl:'https://profile-api.test'};"});
  const name=u.pathname.slice(1);return route.fulfill({body:await readFile(path.resolve('Front_End',name)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('http://profile.test/profile.html');await page.getByText('Teste perfil',{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'Editar Perfil'}).click();if(password)await page.locator('#pe-pass').fill(password);
 await page.getByRole('button',{name:'Salvar Alterações'}).click();
 if(password){await page.waitForURL('**/login.html');assert.equal(await page.evaluate(()=>localStorage.getItem('token_jwt')),null);assert.equal(gets,1);}
 else{await page.locator('#view-section').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>localStorage.getItem('token_jwt')),'token-ficticio');assert.equal(gets,2);}
 passed++;console.log('PASS perfil: '+(password?'troca de senha encerra sessão e abre login':'edição sem senha mantém sessão'));
 await context.close();
}
console.log(`Perfil/sessão: ${passed} aprovados, 0 falhas.`);
}finally{await browser.close();}
