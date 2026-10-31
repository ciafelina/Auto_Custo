import assert from 'node:assert/strict';
import readline from 'node:readline';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {allowTestWrite} from './azure-e2e-write-scope.mjs';

const base='https://autocusto.duckdns.org', api=base+'/api';
const output=process.env.AUTO_CUSTO_E2E_OUTPUT;
assert.ok(output);
const lines=readline.createInterface({input:process.stdin});
const pending=new Map();let nextId=0, receiveBootstrap;
const boot=new Promise(resolve=>receiveBootstrap=resolve);
lines.on('line',line=>{
  const message=JSON.parse(line);
  if(message.type==='bootstrap')receiveBootstrap(message);
  else { const resolve=pending.get(message.id); if(resolve){pending.delete(message.id);resolve(message);} }
});
function send(message){process.stdout.write(JSON.stringify(message)+'\n');}
async function db(operation){
  const id=String(++nextId);
  const response=new Promise(resolve=>pending.set(id,resolve));
  send({type:'db',id,operation});
  const reply=await response;
  if(!reply.ok)throw new Error(reply.error);
  return reply.result;
}
const {plan,password}=await boot;
const actors=Object.fromEntries(plan.actors.map(actor=>[actor.key,actor]));
const owned={medicineId:null,requests:new Set()};
const results=[], timeline=[];let failed=0, passed=0, cleanup;
const pageErrors=[], blockedWrites=[];
function redact(text){return String(text).replaceAll(password,'[TEST_PASSWORD]').replace(/[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/g,'[TEST_TOKEN]');}
async function test(name,fn){
  try { await fn(); passed++;results.push({name,ok:true});send({type:'log',message:'PASS Azure E2E: '+name}); }
  catch(error){failed++;results.push({name,ok:false,error:redact(error.message)});send({type:'log',message:'FAIL Azure E2E: '+name+': '+redact(error.message)});throw error;}
}
async function state(label){
  const value=await db('state');
  if(value.medicines.length)owned.medicineId=value.medicines[0].id;
  for(const request of value.requests)owned.requests.add(request.id);
  if(label)timeline.push({label,state:value});
  return value;
}
async function request(route,{method='GET',token,body}={}){
  const address=api+route;
  allowTestWrite(plan,owned,address,method,body);
  const response=await fetch(address,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const text=await response.text();let data;
  if(text){try{data=JSON.parse(text);}catch{throw new Error('Non-JSON API response, HTTP '+response.status);}}
  return {status:response.status,data};
}
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright');}catch{playwright=require(path.resolve(path.dirname(process.execPath),'..','node_modules/playwright'));}
const executablePath=[process.env.AUTO_CUSTO_TEST_BROWSER,playwright.chromium.executablePath(),
  ...['ProgramFiles(x86)','ProgramFiles'].flatMap(key=>process.env[key]?[path.join(process.env[key],'Microsoft/Edge/Application/msedge.exe')]:[])].filter(Boolean).find(existsSync);
assert.ok(executablePath,'Edge/Chromium unavailable.');
const browser=await playwright.chromium.launch({headless:true,executablePath});
const contexts=[];
async function pageForTest(){
  const context=await browser.newContext({serviceWorkers:'block'});contexts.push(context);
  await context.addInitScript(marker=>{
    window.__testAlerts=[];window.alert=value=>window.__testAlerts.push(value);window.confirm=()=>true;
    document.addEventListener('DOMContentLoaded',()=>{
      for(const id of ['f-search','med-search']){const input=document.getElementById(id);if(input)input.value=marker;}
    });
  },plan.marker);
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==base)return route.abort();
    if(req.method()==='GET'&&['/api/produtos','/api/admin/medicamentos','/api/admin/solicitacoes'].includes(url.pathname)){
      url.searchParams.set('search',plan.marker);
      return route.continue({url:url.href});
    }
    if(!['GET','HEAD','OPTIONS'].includes(req.method())){
      try { allowTestWrite(plan,owned,url.href,req.method(),req.postData()?req.postDataJSON():{}); }
      catch(error){blockedWrites.push(error.message);return route.abort();}
    }
    return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(25000);page.setDefaultNavigationTimeout(60000);
  page.on('pageerror',error=>pageErrors.push(error.message));
  return {page,context};
}
async function register(actor){
  const scope=await pageForTest();const {page}=scope;
  try{
    await page.goto(base+'/register.html');
    for(const [id,value] of [['r-name',actor.name],['r-email',actor.email],['r-cpf',actor.cpf],
      ['r-birth','2000-01-01'],['r-phone','11999990000'],['r-address','Endereco ficticio de homologacao'],
      ['r-health','Dado ficticio de teste automatizado'],['r-senha',password],['r-confirma-senha',password]])await page.locator('#'+id).fill(value);
    const response=page.waitForResponse(r=>r.url()===api+'/usuarios'&&r.request().method()==='POST');
    await page.locator('#form-register button[type="submit"]').click();
    assert.equal((await response).status(),201);
    await page.waitForURL('**/login.html');
  }finally{await scope.context.close();}
}
async function login(actor){
  const scope=await pageForTest();const {page}=scope;
  await page.goto(base+'/login.html');await page.locator('#usuario').fill(actor.cpf);await page.locator('#senha').fill(password);
  await Promise.all([page.waitForURL('**/'+(actor.role===3?'patient-dashboard.html':'admin-dashboard.html')),
    page.locator('#form-login button[type="submit"]').click()]);
  const stored=await page.evaluate(()=>({token:localStorage.getItem('token_jwt'),role:Number(localStorage.getItem('usuario_cargo')),cpf:localStorage.getItem('usuario_cpf')}));
  assert.equal(stored.role,actor.role);assert.equal(stored.cpf,actor.cpf);assert.ok(stored.token);
  return {...scope,token:stored.token};
}
let patient,other,staff,firstId,secondId;
const note=plan.marker+' nota aprovada D\'Avila "QA"';
const details={nome:plan.medicineName,categoria:plan.marker,dosagem:'UNIDADE DE TESTE',fabricante:'QA AUTOMATICO',
  estoqueMinimo:2,descricao:plan.marker+' ITEM FICTICIO. NAO UTILIZAR. TESTE AUTOMATIZADO.'};
try{
  await test('domínio real e rota privada disponíveis',async()=>{
    assert.equal((await fetch(base+'/',{signal:AbortSignal.timeout(20000)})).status,200);
    assert.equal((await request('/produtos')).status,401);
  });
  for(const actor of plan.actors)await test('cadastro público pelo navegador: '+actor.key,()=>register(actor));
  await test('SQL confirma três pacientes ativos com BCrypt',async()=>{
    const value=await state('registered');assert.equal(value.users.length,3);
    assert.ok(value.users.every(u=>u.role===3&&u.status==='Ativo'&&u.passwordHashOK===1));
  });
  await test('preparação limitada à conta fictícia de funcionário',async()=>{
    const value=await db('promote-test-operator');assert.equal(value.users.find(u=>u.cpf===actors.staff.cpf).role,2);
    assert.ok(value.users.filter(u=>u.cpf!==actors.staff.cpf).every(u=>u.role===3));
  });
  await test('login do paciente pelo navegador',async()=>patient=await login(actors.patient));
  await test('login do segundo paciente pelo navegador',async()=>other=await login(actors.other));
  await test('login do funcionário pelo navegador',async()=>staff=await login(actors.staff));
  await test('funcionário cadastra medicamento fictício pela tela',async()=>{
    const {page}=staff;await page.goto(base+'/admin-medications.html');
    await page.getByRole('button',{name:/Novo Medicamento/}).click();
    for(const [id,value] of [['m-name',details.nome],['m-cat',details.categoria],['m-dos',details.dosagem],['m-mfr',details.fabricante],['m-stock','5'],['m-min','2'],['m-desc',details.descricao]])await page.locator('#'+id).fill(value);
    const response=page.waitForResponse(r=>r.url()===api+'/admin/medicamentos'&&r.request().method()==='POST');
    await page.locator('#form-med button[type="submit"]').click();assert.equal((await response).status(),201);
    const value=await state('medicine-created');assert.equal(value.medicines.length,1);assert.equal(value.medicines[0].stock,5);
  });
  await test('quantidade inválida e falta de saldo não gravam pedidos',async()=>{
    for(const [quantity,expected] of [[0,400],[-1,400],[1.5,400],[6,409],[2147483648,400]]){
      const result=await request('/solicitacoes',{method:'POST',token:patient.token,body:{cpf:actors.patient.cpf,idMedicamento:owned.medicineId,quantidade:quantity}});
      assert.equal(result.status,expected,'quantity='+quantity);
    }
    const value=await state();assert.equal(value.medicines[0].stock,5);assert.equal(value.requests.length,0);
  });
  await test('paciente não acessa gestão de solicitações',async()=>assert.equal((await request('/admin/solicitacoes?search='+plan.marker,{token:patient.token})).status,403));
  await test('estoque mostra nome com aspas e permite solicitar',async()=>{
    const {page}=patient;await page.goto(base+'/stock.html');
    const card=page.locator('#lista-medicamentos article');await card.waitFor();assert.equal(await card.count(),1);
    assert.equal(await card.locator('h3').textContent(),plan.medicineName);
    await card.locator('button').click();assert.equal(await page.locator('#mod-id-med').inputValue(),String(owned.medicineId));
  });
  await test('pedido pelo navegador reserva duas unidades no Azure',async()=>{
    const {page}=patient;await page.locator('#req-qty').fill('2');
    const response=page.waitForResponse(r=>r.url()===api+'/solicitacoes'&&r.request().method()==='POST');
    await page.locator('#form-solicitar button[type="submit"]').click();assert.equal((await response).status(),201);
    await page.locator('#pedido-aviso:not(.hidden)').waitFor();
    const value=await state('pending');assert.equal(value.medicines[0].stock,3);assert.equal(value.requests.length,1);
    const row=value.requests[0];firstId=row.id;assert.equal(row.cpf,actors.patient.cpf);assert.equal(row.quantity,2);assert.equal(row.status,'Pendente');
  });
  await test('retirada antes da aprovação é recusada',async()=>{
    assert.equal((await request(`/solicitacoes/${firstId}/retirada`,{method:'PATCH',token:patient.token})).status,404);
    assert.equal((await state()).requests[0].status,'Pendente');
  });
  await test('edição pela tela oculta estoque e preserva o saldo reservado',async()=>{
    const {page}=staff;await page.goto(base+'/admin-medications.html');
    const row=page.locator('#tabela-medicamentos tr');await row.waitFor();assert.equal(await row.count(),1);
    await row.locator('button').first().click();assert.equal(await page.locator('#m-stock').isDisabled(),true);
    assert.equal(await page.locator('#m-stock-field').isVisible(),false);
    await page.locator('#m-desc').fill(details.descricao+' EDITADO');
    const response=page.waitForResponse(r=>r.url()===api+`/admin/medicamentos/${owned.medicineId}`&&r.request().method()==='PUT');
    await page.locator('#form-med button[type="submit"]').click();assert.equal((await response).status(),200);
    assert.equal((await state()).medicines[0].stock,3);
  });
  await test('PUT com saldo antigo também preserva o estoque no banco',async()=>{
    assert.equal((await request(`/admin/medicamentos/${owned.medicineId}`,{method:'PUT',token:staff.token,body:{...details,estoque:5}})).status,200);
    assert.equal((await state()).medicines[0].stock,3);
  });
  await test('mínimo2 mantém saldo3 disponível',async()=>{
    await patient.page.goto(base+'/stock.html');
    await patient.page.waitForFunction(()=>document.querySelector('.stock-num')?.textContent==='3');
    assert.ok((await patient.page.locator('.stock-box').textContent()).includes('Disponível'));
  });
  await test('paciente não consegue aprovar o próprio pedido',async()=>{
    assert.equal((await request(`/admin/solicitacoes/${firstId}/status`,{method:'PATCH',token:patient.token,body:{status:'Aprovado'}})).status,403);
    assert.equal((await state()).requests[0].status,'Pendente');
  });
  await test('funcionário aprova pela tela com observação correta',async()=>{
    const {page}=staff;await page.goto(base+'/admin-requests.html');
    const card=page.locator('#lista-solicitacoes article');await card.waitFor();assert.equal(await card.count(),1);
    await card.locator('button').first().click();assert.equal(await page.locator('#mod-req-id').inputValue(),String(firstId));
    await page.locator('#mod-req-obs').fill(note);
    const response=page.waitForResponse(r=>r.url()===api+`/admin/solicitacoes/${firstId}/status`&&r.request().method()==='PATCH');
    await page.locator('#mod-req-actions button').filter({hasText:'Aprovar'}).click();assert.equal((await response).status(),200);
    const value=await state('approved');assert.equal(value.requests[0].status,'Aprovado');assert.equal(value.requests[0].observation,note);assert.equal(value.medicines[0].stock,3);
  });
  await test('outro paciente não confirma retirada alheia',async()=>{
    assert.equal((await request(`/solicitacoes/${firstId}/retirada`,{method:'PATCH',token:other.token})).status,404);
    assert.equal((await state()).requests[0].status,'Aprovado');
  });
  await test('titular confirma retirada pela tela e mantém baixa única',async()=>{
    const {page}=patient;await page.goto(base+'/patient-dashboard.html');
    const card=page.locator('#lista-solicitacoes article').filter({hasText:plan.medicineName});await card.waitFor();
    const response=page.waitForResponse(r=>r.url()===api+`/solicitacoes/${firstId}/retirada`&&r.request().method()==='PATCH');
    await card.getByRole('button',{name:'Confirmar Retirada'}).click();assert.equal((await response).status(),204);
    const value=await state('withdrawn');assert.equal(value.requests[0].status,'Retirado');assert.equal(value.medicines[0].stock,3);
    await page.waitForFunction(()=>document.querySelector('#lista-solicitacoes').textContent.includes('Retirado'));
  });
  await test('retirada repetida e cancelamento após retirada são recusados',async()=>{
    assert.equal((await request(`/solicitacoes/${firstId}/retirada`,{method:'PATCH',token:patient.token})).status,404);
    assert.equal((await request(`/admin/solicitacoes/${firstId}/status`,{method:'PATCH',token:staff.token,body:{status:'Cancelado'}})).status,409);
    const value=await state();assert.equal(value.requests[0].status,'Retirado');assert.equal(value.requests[0].observation,note);assert.equal(value.medicines[0].stock,3);
  });
  await test('histórico impede exclusão do medicamento e da conta',async()=>{
    assert.equal((await request(`/admin/medicamentos/${owned.medicineId}`,{method:'DELETE',token:staff.token})).status,409);
    assert.equal((await request(`/perfil/${actors.patient.cpf}`,{method:'DELETE',token:patient.token})).status,409);
    const value=await state();assert.equal(value.users.length,3);assert.equal(value.medicines.length,1);assert.equal(value.requests.length,1);
  });
  await test('segundo pedido reserva uma unidade e classifica saldo2 como crítico',async()=>{
    assert.equal((await request('/solicitacoes',{method:'POST',token:patient.token,body:{cpf:actors.patient.cpf,idMedicamento:owned.medicineId,quantidade:1}})).status,201);
    const value=await state('second-pending');assert.equal(value.requests.length,2);assert.equal(value.medicines[0].stock,2);
    secondId=value.requests.find(row=>row.id!==firstId).id;
    await patient.page.goto(base+'/stock.html');await patient.page.waitForFunction(()=>document.querySelector('.stock-num')?.textContent==='2');
    assert.ok((await patient.page.locator('.stock-box').textContent()).includes('Crítico'));
  });
  await test('cancelamento devolve somente a reserva e preserva observação de outro pedido',async()=>{
    assert.equal((await request(`/admin/solicitacoes/${secondId}/status`,{method:'PATCH',token:staff.token,body:{status:'Cancelado'}})).status,200);
    const value=await state('cancelled');assert.equal(value.medicines[0].stock,3);
    assert.equal(value.requests.find(row=>row.id===secondId).status,'Cancelado');assert.equal(value.requests.find(row=>row.id===firstId).observation,note);
  });
  await test('cancelamento repetido não devolve estoque novamente',async()=>{
    assert.equal((await request(`/admin/solicitacoes/${secondId}/status`,{method:'PATCH',token:staff.token,body:{status:'Cancelado'}})).status,409);
    assert.equal((await state()).medicines[0].stock,3);
  });
  await test('telas finais sem erros ou escritas fora do escopo',async()=>{
    await patient.page.goto(base+'/patient-dashboard.html');
    await patient.page.waitForFunction(()=>document.querySelector('#lista-solicitacoes').textContent.includes('Cancelado'));
    await patient.page.screenshot({path:path.join(output,'patient-final.png'),fullPage:true,animations:'disabled'});
    await staff.page.goto(base+'/admin-requests.html');await staff.page.waitForFunction(()=>document.querySelectorAll('#lista-solicitacoes article').length===2);
    await staff.page.screenshot({path:path.join(output,'staff-final.png'),fullPage:true,animations:'disabled'});
    assert.deepEqual(pageErrors,[]);assert.deepEqual(blockedWrites,[]);
  });
  await test('limpeza remove somente os dados fictícios e preserva as sete tabelas originais',async()=>{
    cleanup=await db('cleanup');assert.equal(cleanup.remaining,0);assert.equal(cleanup.originalDataPreserved,true);
  });
  await test('contas removidas deixam de autorizar os tokens de teste',async()=>{
    for(const [key,session] of [['patient',patient],['other',other],['staff',staff]]){
      assert.equal((await request('/perfil/'+actors[key].cpf,{token:session.token})).status,401);
    }
  });
}catch(error){
  if(!failed){failed++;results.push({name:'Runner setup/execution',ok:false,error:redact(error.message)});send({type:'log',message:'FAIL Azure E2E setup: '+redact(error.message)});}
}finally{
  try{cleanup=await db('cleanup');assert.equal(cleanup.remaining,0);assert.equal(cleanup.originalDataPreserved,true);}
  catch(error){failed++;results.push({name:'Mandatory final cleanup',ok:false,error:redact(error.message)});send({type:'log',message:'FAIL Azure E2E cleanup: '+redact(error.message)});}
  await Promise.allSettled(contexts.map(context=>context.close()));await browser.close();
  await writeFile(path.join(output,'results.json'),JSON.stringify({passed,failed,runId:plan.runId,results,timeline,cleanup,blockedWrites,pageErrors},null,2));
  send({type:'log',message:`Azure E2E: ${passed} aprovados; ${failed} falhas.`});
  lines.close();process.stdin.destroy();process.exitCode=failed?1:0;
}
