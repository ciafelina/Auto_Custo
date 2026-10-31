import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHmac} from 'node:crypto';
import {runSqlBrowser} from './sqlserver-browser.mjs';

const manifest=JSON.parse(await readFile(new URL('./.build/sqlserver/run.json',import.meta.url),'utf8'));
assert.match(manifest.database,/^AutoCusto_IT_\d{8}_[a-f0-9]{12}$/);
assert.equal(manifest.baseUrl,'http://127.0.0.1:19002');
const bridge=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./sqlserver-bridge.ps1',import.meta.url)),'-ConfigPath',manifest.configPath,'-ExpectedDatabase',manifest.database,'-RunId',manifest.runId],{windowsHide:true,stdio:['pipe','pipe','pipe']});
const pending=new Map();let nextId=0,readyResolve,readyReject,bridgeError='';
const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
bridge.stderr.setEncoding('utf8');bridge.stderr.on('data',data=>{bridgeError+=data;});
bridge.on('error',readyReject);
const lines=createInterface({input:bridge.stdout});
lines.on('line',line=>{
  try{const item=JSON.parse(line);if(item.ready){assert.equal(item.database,manifest.database);readyResolve();return;}const entry=pending.get(item.id);if(!entry)return;pending.delete(item.id);clearTimeout(entry.timeout);item.ok?entry.resolve(item.rows):entry.reject(new Error(`Bridge: ${item.error} (${item.number})`));}catch(error){readyReject(error);}
});
bridge.on('exit',code=>{if(code)readyReject(new Error('Bridge indisponível: '+bridgeError.slice(0,700)));for(const item of pending.values()){clearTimeout(item.timeout);item.reject(new Error('Bridge encerrada.'));}pending.clear();});
async function db(operation,parameters={}){await ready;const id=++nextId;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Timeout do SQL de teste.'));},35000);pending.set(id,{resolve,reject,timeout});bridge.stdin.write(JSON.stringify({id,operation,parameters})+'\n');});}
const one=async(operation,parameters)=>(await db(operation,parameters))[0];
const password='senha-ficticia-integracao-2026';
const actors={admin:{cpf:'11111111111',name:`Integração "Administrador" D'Ávila`},patient:{cpf:'22222222222',name:'Paciente fictício'},employee:{cpf:'33333333333',name:'Funcionário fictício'},other:{cpf:'44444444444',name:'Outro paciente fictício'}};
const tokens={};let serial=0,passed=0,failed=0;const outcomes=[];
async function test(name,fn){try{await fn();passed++;outcomes.push({name,ok:true});console.log('PASS SQL real: '+name);}catch(error){failed++;outcomes.push({name,ok:false,error:error.message});console.error('FAIL SQL real '+name+': '+error.message);}}
async function api(method,route,{token=tokens.admin,body,raw,headers={}}={}){
  const response=await fetch(manifest.baseUrl+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined||raw!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:raw??(body===undefined?undefined:JSON.stringify(body)),signal:AbortSignal.timeout(30000)});
  assert.equal(response.headers.get('X-AutoCusto-Integration'),'sqlserver','Porta não pertence à API isolada MSSQL.');
  const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{assert.fail('Resposta não é JSON válido: HTTP '+response.status);}
  return {status:response.status,data,text,headers:response.headers};
}
function status(response,want){assert.equal(response.status,want,JSON.stringify(response.data));return response.data;}
function error(response,want,code){status(response,want);assert.equal(response.data.sucesso,false);assert.equal(response.data.erro.codigo,code);assert.deepEqual(response.data.erro.detalhes,[]);assert.match(response.headers.get('Content-Type'),/^application\/json/i);}
async function register(cpf,name){return api('POST','/usuarios',{token:null,body:{cpf,nomeCompleto:name,email:`teste-${cpf}@example.test`,dataNascimento:'2000-01-01',senha:password,cargo:1,idCargo:1}});}
async function login(cpf,senha=password){return api('POST','/login',{token:null,body:{cpf,senha}});}
async function newMed(stock=10,min=2,extra={}){
  const details={nome:`ITSQL-${String(++serial).padStart(4,'0')}`,categoria:'Integração',dosagem:'10 mg',fabricante:'Fictício',descricao:'Somente teste',estoque:stock,estoqueMinimo:min,...extra};
  status(await api('POST','/admin/medicamentos',{body:details}),201);
  const row=await one('medByName',{nome:details.nome});assert.ok(row);return {id:row.idMedicamento,details};
}
async function order(med,quantity=2,token=tokens.patient){return api('POST','/solicitacoes',{token,body:{cpf:actors.patient.cpf,idMedicamento:med.id,quantidade:quantity}});}
async function seedRequest(med,from='Pendente',cpf=actors.patient.cpf,quantity=2){return (await one('seedRequest',{cpf,med:med?.id??null,qtd:quantity,status:from,obs:'Nota original'})).idSolicitacao;}
async function requestStatus(id,to,extra={}){return api('PATCH',`/admin/solicitacoes/${id}/status`,{body:{status:to,...extra}});}
function forged(cpf,secret='outra-chave-ficticia-incorreta',exp=Math.floor(Date.now()/1000)+3600){const h=Buffer.from('{"alg":"HS256"}').toString('base64url'),p=Buffer.from(JSON.stringify({cpf,exp,cargo:1})).toString('base64url');return `${h}.${p}.${createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;}
async function deletionRace(){const med=await newMed(10);const [request,deletion]=await Promise.all([order(med,1),api('DELETE',`/admin/medicamentos/${med.id}`)]);const rows=await db('requestsForMed',{id:med.id});assert.ok((request.status===201&&deletion.status===409)||(request.status===404&&deletion.status===204),JSON.stringify([request.status,deletion.status]));assert.equal(rows.length,request.status===201?1:0);if(rows.length)assert.ok(await one('med',{id:med.id}));}
async function userDeletionRace(){
  const cpf=String(80000000000+(++serial));
  status(await register(cpf,'Conta fictícia concorrente'),201);
  const token=status(await login(cpf),200).dados.token_jwt,med=await newMed(10);
  const [request,deletion]=await Promise.all([
    api('POST','/solicitacoes',{token,body:{cpf,idMedicamento:med.id,quantidade:1}}),
    api('DELETE',`/perfil/${cpf}`,{token})
  ]);
  assert.ok((request.status===201&&deletion.status===409)||(request.status===401&&deletion.status===204),JSON.stringify([request.status,deletion.status]));
  const rows=await db('requestsForUser',{cpf});
  assert.equal(rows.length,request.status===201?1:0);
  assert.equal((await one('med',{id:med.id})).quantidadeEstoque,request.status===201?9:10);
  assert.equal(Boolean(await one('user',{cpf})),request.status===201);
}
async function cancellationDeletionRace(){
  const med=await newMed(8),id=await seedRequest(med);
  const [cancel,deletion]=await Promise.all([requestStatus(id,'Cancelado'),api('DELETE',`/admin/medicamentos/${med.id}`)]);
  status(cancel,200);error(deletion,409,'HISTORICO_VINCULADO');
  assert.equal((await one('request',{id})).status,'Cancelado');
  assert.equal((await one('med',{id:med.id})).quantidadeEstoque,10);
}

try{
  await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Bridge não iniciou.')),15000))]);
  let running=false;
  for(let i=0;i<100;i++){try{const response=await fetch(manifest.baseUrl+'/__ready',{signal:AbortSignal.timeout(500)});if(response.headers.get('X-AutoCusto-Integration')==='sqlserver'){running=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  if(!running){const log=await readFile(new URL('./.build/sqlserver/server.log',import.meta.url),'utf8').catch(()=> '');throw new Error('API MSSQL não iniciou. '+log.slice(0,1500));}
  await test('schema copiado mantém FKs e compatibilidade 120',async()=>{const schema=await one('schema');assert.equal(schema.Tabelas,7);assert.equal(schema.Chaves,7);assert.equal(schema.Compatibilidade,120);});
  await test('banco de teste inicia sem registros de negócio',async()=>assert.deepEqual(await one('counts'),{Usuarios:0,Medicamentos:0,Solicitacoes:0}));
  await test('bridge recusa operações fora da lista',async()=>assert.rejects(()=>db('sqlArbitrario'),/Bridge:/));
  for(const [key,actor] of Object.entries(actors)){
    await test('cadastro público '+key+' permanece paciente',async()=>{status(await register(actor.cpf,actor.name),201);assert.equal((await one('user',{cpf:actor.cpf})).IdCargo,3);});
  }
  await db('role',{cpf:actors.admin.cpf,cargo:1});await db('role',{cpf:actors.employee.cpf,cargo:2});
  for(const [key,actor] of Object.entries(actors))await test('login real e token '+key,async()=>{const data=status(await login(actor.cpf),200);assert.equal(data.dados.nome,actor.name);assert.equal(data.dados.expira_em,28800);tokens[key]=data.dados.token_jwt;assert.ok(tokens[key]);});
  assert.ok(tokens.admin&&tokens.patient&&tokens.employee&&tokens.other,'Login básico falhou; testes de gravação interrompidos.');
  if(process.argv.includes('--race-only')){
    for(let i=0;i<10;i++)await test('diagnóstico exclusão versus pedido '+(i+1),deletionRace);
    for(let i=0;i<5;i++)await test('diagnóstico exclusão de conta versus pedido '+(i+1),userDeletionRace);
    for(let i=0;i<10;i++)await test('cancelamento versus exclusão de medicamento '+(i+1),cancellationDeletionRace);
  }else{
  const privateRoutes=[['GET','/produtos'],['GET','/perfil/22222222222'],['PUT','/perfil/22222222222'],['DELETE','/perfil/22222222222'],['GET','/dashboard/paciente/22222222222'],['POST','/solicitacoes'],['PATCH','/solicitacoes/1/retirada'],['GET','/admin/dashboard'],['GET','/admin/usuarios'],['POST','/admin/usuarios'],['PUT','/admin/usuarios/22222222222'],['PATCH','/admin/usuarios/22222222222/cargo'],['PATCH','/admin/usuarios/22222222222/status'],['GET','/admin/medicamentos'],['POST','/admin/medicamentos'],['PUT','/admin/medicamentos/1'],['PATCH','/admin/medicamentos/1/estoque'],['DELETE','/admin/medicamentos/1'],['GET','/admin/solicitacoes'],['PATCH','/admin/solicitacoes/1/status'],...['documentos','interessados','arquivos'].flatMap(p=>[['GET','/'+p],['POST','/'+p]])];
  for(const [method,route] of privateRoutes)await test('sem token '+method+' '+route,async()=>error(await api(method,route,{token:null,...(['POST','PUT','PATCH'].includes(method)?{body:{}}:{})}),401,'CREDENCIAIS_INVALIDAS'));
  await test('senha incorreta e login vazio preservam status HTTP',async()=>{error(await login(actors.patient.cpf,'errada'),401,'CREDENCIAIS_INVALIDAS');error(await api('POST','/login',{token:null,body:{}}),400,'REQUISICAO_INVALIDA');});
  await test('token adulterado é recusado',async()=>error(await api('GET','/produtos',{token:forged(actors.admin.cpf)}),401,'CREDENCIAIS_INVALIDAS'));
  await test('token expirado é recusado',async()=>error(await api('GET','/produtos',{token:forged(actors.admin.cpf,'chave-exclusiva-de-integracao-sqlserver-nao-usar-em-producao-2026',1)}),401,'CREDENCIAIS_INVALIDAS'));
  await test('paciente não acessa gestão nem perfil alheio',async()=>{error(await api('GET','/admin/usuarios',{token:tokens.patient}),403,'ACESSO_NEGADO');error(await api('GET',`/perfil/${actors.other.cpf}`,{token:tokens.patient}),403,'ACESSO_NEGADO');});
  await test('funcionário gerencia usuários mas não cargos',async()=>{status(await api('PUT',`/admin/usuarios/${actors.other.cpf}`,{token:tokens.employee,body:{nome:'Editado por funcionário',email:'outro@example.test'}}),200);assert.equal((await one('user',{cpf:actors.other.cpf})).nomeUsuario,'Editado por funcionário');error(await api('PATCH',`/admin/usuarios/${actors.other.cpf}/cargo`,{token:tokens.employee,body:{idCargo:1}}),403,'ACESSO_NEGADO');});
  await test('revogação de cargo vale na próxima chamada',async()=>{try{status(await api('PATCH',`/admin/usuarios/${actors.employee.cpf}/cargo`,{body:{idCargo:3}}),200);error(await api('GET','/admin/usuarios',{token:tokens.employee}),403,'ACESSO_NEGADO');}finally{await db('role',{cpf:actors.employee.cpf,cargo:2});}});
  await test('desativação revoga token imediatamente',async()=>{try{status(await api('PATCH',`/admin/usuarios/${actors.other.cpf}/status`,{body:{status:'Inativo'}}),200);error(await api('GET','/produtos',{token:tokens.other}),401,'CREDENCIAIS_INVALIDAS');}finally{await db('userStatus',{cpf:actors.other.cpf,status:'Ativo'});}});
  await test('perfil próprio persiste alterações',async()=>{status(await api('PUT',`/perfil/${actors.patient.cpf}`,{token:tokens.patient,body:{telefone:'11999990000',endereco:'Rua fictícia',dataNascimento:'2000-01-01',dadosSaude:'Teste'}}),200);assert.equal((await one('user',{cpf:actors.patient.cpf})).telefone,'11999990000');status(await api('GET',`/perfil/${actors.patient.cpf}`,{token:tokens.patient}),200);});
  await test('cadastro duplicado retorna erro estruturado',async()=>error(await register(actors.patient.cpf,'Duplicado'),400,'CPF_DUPLICADO'));
  await test('JSON inválido não grava e mantém envelope',async()=>{const before=await one('counts');error(await api('POST','/admin/medicamentos',{raw:'{"nome":'}),400,'REQUISICAO_INVALIDA');assert.deepEqual(await one('counts'),before);});

  await test('filtros/totais/paginação seguem o mínimo de cada medicamento',async()=>{
    const a=await newMed(3,2,{nome:'CLASSIF-A',categoria:'Classe'}),b=await newMed(6,10,{nome:'CLASSIF-B',categoria:'Classe'}),c=await newMed(10,10,{nome:'CLASSIF-C',categoria:'Classe'}),d=await newMed(0,0,{nome:'CLASSIF-D',categoria:'Classe'});
    for(const [filter,want] of [['available',[a.id]],['low',[b.id,c.id]],['out',[d.id]]]){const data=status(await api('GET','/produtos?'+new URLSearchParams({search:'CLASSIF-',categoria:'Classe',disponibilidade:filter,limit:'100'})),200).resultado;assert.equal(data.total_registros,want.length);assert.deepEqual(data.dados.map(r=>r.id),want);for(const row of data.dados)assert.equal(typeof row.estoqueMinimo,'number');}
    const page=status(await api('GET','/produtos?search=CLASSIF-&disponibilidade=low&page=2&limit=1'),200).resultado;assert.equal(page.total_registros,2);assert.deepEqual(page.dados.map(r=>r.id),[c.id]);
    const dashboard=status(await api('GET','/admin/dashboard'),200).dados;assert.equal(dashboard.estoqueCritico,2);assert.ok(dashboard.medicamentosZerados.includes('CLASSIF-D'));
  });
  await test('listagem administrativa aceita busca/paginação real',async()=>{const users=status(await api('GET','/admin/usuarios?search=Integração&page=1&limit=1'),200).dados;assert.equal(users.totalLista,1);assert.equal(users.lista[0].cpf,actors.admin.cpf);const meds=status(await api('GET','/admin/medicamentos?search=CLASSIF-&page=2&limit=2'),200).dados;assert.equal(meds.total,4);assert.equal(meds.lista.length,2);});
  await test('pedido reserva e persiste exatamente a quantidade',async()=>{const med=await newMed(10);status(await order(med,3),201);assert.equal((await one('med',{id:med.id})).quantidadeEstoque,7);const row=(await db('requestsForMed',{id:med.id}))[0];assert.equal(row.quantidade,3);assert.equal(row.status,'Pendente');assert.equal(row.idUsuarioCPF,Number(actors.patient.cpf));});
  for(const quantity of [0,-1,1.5,'2',null])await test('quantidade inválida '+JSON.stringify(quantity)+' não altera estoque',async()=>{const med=await newMed(4);const response=await order(med,quantity);assert.equal(response.status,400);assert.equal((await one('med',{id:med.id})).quantidadeEstoque,4);assert.deepEqual(await db('requestsForMed',{id:med.id}),[]);});
  await test('estoque insuficiente não grava pedido',async()=>{const med=await newMed(2);error(await order(med,3),409,'ESTOQUE_INSUFICIENTE');assert.equal((await one('med',{id:med.id})).quantidadeEstoque,2);assert.deepEqual(await db('requestsForMed',{id:med.id}),[]);});
  await test('falha real de INSERT desfaz reserva da mesma transação',async()=>{const med=await newMed(10);await db('failInsert');try{error(await order(med,2),500,'ERRO_GRAVACAO_BANCO');assert.equal((await one('med',{id:med.id})).quantidadeEstoque,10);assert.deepEqual(await db('requestsForMed',{id:med.id}),[]);}finally{await db('allowInsert');}});
  await test('edição cadastral ignora estoque antigo',async()=>{const med=await newMed(10);status(await order(med,3),201);status(await api('PUT',`/admin/medicamentos/${med.id}`,{body:{...med.details,nome:'Editado',estoque:10,estoqueMinimo:4}}),200);const saved=await one('med',{id:med.id});assert.equal(saved.quantidadeEstoque,7);assert.equal(saved.nome,'Editado');assert.equal(saved.estoqueMinimo,4);});
  await test('ajuste explícito altera saldo',async()=>{const med=await newMed(10);status(await api('PATCH',`/admin/medicamentos/${med.id}/estoque`,{token:tokens.employee,body:{estoque:14}}),200);assert.equal((await one('med',{id:med.id})).quantidadeEstoque,14);});
  await test('edição e pedido concorrentes preservam baixa',async()=>{const med=await newMed(10);const results=await Promise.all([order(med,2),api('PUT',`/admin/medicamentos/${med.id}`,{body:{...med.details,estoque:10}})]);assert.deepEqual(results.map(r=>r.status),[201,200]);assert.equal((await one('med',{id:med.id})).quantidadeEstoque,8);});
  const allowed={Pendente:['Aprovado','Cancelado'],Aprovado:['Retirado','Cancelado'],Retirado:[],Cancelado:[]};
  for(const from of Object.keys(allowed))for(const to of Object.keys(allowed))await test('transição '+from+' -> '+to,async()=>{
    const med=await newMed(8),id=await seedRequest(med,from);const valid=allowed[from].includes(to);const response=await requestStatus(id,to,{observacao:'Nota alterada'});status(response,valid?200:409);
    const row=await one('request',{id});assert.equal(row.status,valid?to:from);assert.equal(row.observacao,valid?'Nota alterada':'Nota original');assert.equal((await one('med',{id:med.id})).quantidadeEstoque,valid&&to==='Cancelado'?10:8);
  });
  await test('falha real ao devolver estoque desfaz status e nota',async()=>{const med=await newMed(8),id=await seedRequest(med);await db('failStock');try{error(await requestStatus(id,'Cancelado',{observacao:'Não gravar'}),500,'ERRO_GRAVACAO_BANCO');const row=await one('request',{id});assert.equal(row.status,'Pendente');assert.equal(row.observacao,'Nota original');assert.equal((await one('med',{id:med.id})).quantidadeEstoque,8);}finally{await db('allowStock');}});
  await test('retirada alheia não altera solicitação',async()=>{const med=await newMed(8),id=await seedRequest(med,'Aprovado');error(await api('PATCH',`/solicitacoes/${id}/retirada`,{token:tokens.other}),404,'RECURSO_NAO_ENCONTRADO');assert.equal((await one('request',{id})).status,'Aprovado');status(await api('PATCH',`/solicitacoes/${id}/retirada`,{token:tokens.patient}),204);assert.equal((await one('request',{id})).status,'Retirado');});
  await test('observação explícita só altera a solicitação alvo',async()=>{const med=await newMed(6),a=await seedRequest(med),b=await seedRequest(med);status(await requestStatus(a,'Aprovado',{observacao:`Nota "A" D'Ávila`}),200);assert.equal((await one('request',{id:a})).observacao,`Nota "A" D'Ávila`);assert.equal((await one('request',{id:b})).observacao,'Nota original');status(await requestStatus(b,'Aprovado'),200);assert.equal((await one('request',{id:b})).observacao,'Nota original');});
  await test('painel conta Cancelado e Reprovado legado sem perder paginação',async()=>{await seedRequest(await newMed(),'Reprovado');const expected=await one('countsForUser',{cpf:actors.patient.cpf});assert.equal(expected.Reprovados,7);const data=status(await api('GET',`/dashboard/paciente/${actors.patient.cpf}?page=1&limit=3`,{token:tokens.patient}),200).dados;assert.equal(data.total,expected.Total);assert.equal(data.pendentes,expected.Pendentes);assert.equal(data.aprovados,expected.Aprovados);assert.equal(data.reprovados,7,'Seis Cancelados e um Reprovado legado devem ser contados.');assert.equal(data.solicitacoes.length,3);});
  await test('20 pedidos simultâneos não vendem mais que 10 unidades',async()=>{const med=await newMed(10);const results=await Promise.all(Array.from({length:20},()=>order(med,1)));assert.equal(results.filter(r=>r.status===201).length,10,JSON.stringify(results.map(r=>r.status)));assert.equal(results.filter(r=>r.status===409).length,10);assert.equal((await one('med',{id:med.id})).quantidadeEstoque,0);assert.equal((await db('requestsForMed',{id:med.id})).length,10);});
  await test('10 cancelamentos simultâneos devolvem uma vez',async()=>{const med=await newMed(8),id=await seedRequest(med);const results=await Promise.all(Array.from({length:10},()=>requestStatus(id,'Cancelado')));assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,9);assert.equal((await one('med',{id:med.id})).quantidadeEstoque,10);});
  await test('retirada e cancelamento concorrentes têm um vencedor',async()=>{const med=await newMed(8),id=await seedRequest(med,'Aprovado');const [cancel,withdraw]=await Promise.all([requestStatus(id,'Cancelado'),api('PATCH',`/solicitacoes/${id}/retirada`,{token:tokens.patient})]);const row=await one('request',{id});assert.ok((cancel.status===200&&withdraw.status===404)||(cancel.status===409&&withdraw.status===204),JSON.stringify([cancel.status,withdraw.status]));assert.equal((await one('med',{id:med.id})).quantidadeEstoque,row.status==='Cancelado'?10:8);});
  for(const from of Object.keys(allowed))await test('histórico '+from+' bloqueia exclusão de medicamento',async()=>{const med=await newMed(8),id=await seedRequest(med,from);error(await api('DELETE',`/admin/medicamentos/${med.id}`),409,'HISTORICO_VINCULADO');assert.equal((await one('request',{id})).IdMedicamento,med.id);assert.ok(await one('med',{id:med.id}));});
  await test('conta com solicitações mantém cadastro e vínculos',async()=>{error(await api('DELETE',`/perfil/${actors.patient.cpf}`,{token:tokens.patient}),409,'HISTORICO_VINCULADO');assert.ok(await one('user',{cpf:actors.patient.cpf}));assert.ok((await db('requestsForUser',{cpf:actors.patient.cpf})).length>0);});
  await test('medicamento sem histórico pode ser excluído',async()=>{const med=await newMed();status(await api('DELETE',`/admin/medicamentos/${med.id}`),204);assert.equal(await one('med',{id:med.id}),undefined);});
  await test('conta sem histórico pode ser excluída',async()=>{const cpf='55555555555';status(await register(cpf,'Conta descartável fictícia'),201);const token=status(await login(cpf),200).dados.token_jwt;status(await api('DELETE',`/perfil/${cpf}`,{token}),204);assert.equal(await one('user',{cpf}),undefined);});
  for(let i=0;i<10;i++)await test('exclusão de medicamento concorrente com pedido '+(i+1),deletionRace);
  for(let i=0;i<5;i++)await test('exclusão de conta concorrente com pedido '+(i+1),userDeletionRace);
  for(let i=0;i<10;i++)await test('cancelamento versus exclusão de medicamento '+(i+1),cancellationDeletionRace);
  await test('documentos/interessados/arquivo persistem com FKs reais',async()=>{
    status(await api('POST','/interessados',{body:{documentoInteressado:'ITSQL-DOC',nomeInteressado:`Pessoa fictícia D'Ávila`}}),201);const interested=(await db('interested')).find(r=>r.documentoInteressado==='ITSQL-DOC');assert.ok(interested);
    status(await api('POST','/documentos',{body:{tipo:'Teste integrado',dataDoc:'2026-10-25',nivelEnsino:'Teste',serieAnoCicloModulo:'1',via:'1',observacao:'Fictício',anoRef:'2026',n_folhas:'1',idInteressado:interested.idInteressado}}),201);const document=(await db('documents'))[0];assert.equal(document.idUsuarioCPF,Number(actors.admin.cpf));
    status(await api('POST','/arquivos',{body:{prontuario:'ITSQL',caixa:'1',prateleiraCorredor:'A1',idDoc:document.idDoc}}),201);assert.equal((await db('archive'))[0].idDoc,document.idDoc);
    for(const route of ['/interessados','/documentos','/arquivos'])assert.ok(Array.isArray(status(await api('GET',route),200)));
  });
  const browserMed=await newMed(5,2,{nome:`UI SQL "D'Ávila" <img data-it-attack src=x onerror="window.__itAttack=1">`,descricao:'Descrição <svg data-it-attack onload="window.__itAttack=1"></svg>'});
  await runSqlBrowser({apiBase:manifest.baseUrl,actors,password,med:browserMed,test,db,one});
  }
}finally{
  bridge.stdin.end();
  await Promise.race([new Promise(resolve=>{if(bridge.exitCode!==null)resolve();else bridge.once('exit',resolve);}),new Promise(resolve=>setTimeout(()=>{bridge.kill();resolve();},3000))]);
  await writeFile(new URL('./.build/sqlserver/results.json',import.meta.url),JSON.stringify({passed,failed,outcomes},null,2));
}
console.log(`SQL Server real: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
