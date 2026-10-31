import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
const output=path.resolve('tests/.build/password-recovery');
const base='http://127.0.0.1:19001';
let passed=0,sequence=0;
async function request(route,body,ip=`203.0.113.${++sequence}`){
 const res=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Real-IP':ip},body:JSON.stringify(body)});
 assert.equal(res.headers.get('X-AutoCusto-Test'),'isolated');
 return {status:res.status,body:await res.json()};
}
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
for(let attempt=0;attempt<40;attempt++){
 try{const r=await fetch(base+'/__ready');assert.equal(r.headers.get('X-AutoCusto-Test'),'isolated');break;}catch(e){if(attempt===39)throw e;await new Promise(r=>setTimeout(r,100));}
}
const cpf='90000000001',email='recuperacao@example.invalid',oldPassword='TesteInicial2026!',newPassword='NovaSenha2026!';
assert.equal((await request('/usuarios',{cpf,nomeCompleto:'TESTE recuperação isolada',email,dataNascimento:'2000-01-01',telefone:'',endereco:'',dadosSaude:'',senha:oldPassword})).status,201);
await test('recuperação pública com confirmação genérica',async()=>{
 const r=await request('/senha/recuperar',{cpf,email});assert.equal(r.status,202);assert.equal(r.body.sucesso,true);assert.match(r.body.mensagem,/Se os dados corresponderem/);
});
assert.ok(existsSync(path.join(output,'recovery-mail.jsonl')),'E-mail de teste não gerado');
const db=new DatabaseSync(path.join(output,'autenticacao-test.sqlite'));
const messages=()=>readFileSync(path.join(output,'recovery-mail.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse);
const token=messages().at(-1).token;
const state=()=>db.prepare('SELECT senha FROM Usuarios WHERE idUsuarioCPF=?').get(cpf).senha;
const initialHash=state();
await test('token aleatório armazenado somente como hash e validade de 15 minutos',async()=>{
 assert.match(token,/^[a-f0-9]{64}$/);const row=db.prepare('SELECT * FROM RecuperacoesSenha WHERE idUsuarioCPF=?').get(cpf);
 assert.notEqual(row.tokenHash,token);assert.equal(row.expiraEm-row.criadoEm,900);assert.equal(row.usado,0);assert.ok(!JSON.stringify(row).includes(email));
});
await test('conta inexistente, e-mail divergente e conta inativa recebem a mesma resposta',async()=>{
 const good=(await request('/senha/recuperar',{cpf,email})).body;
 for(const fields of [{cpf:'90000000002',email},{cpf,email:'outro@example.invalid'},{cpf:'55555555555',email}]){let r=await request('/senha/recuperar',fields);assert.equal(r.status,202);assert.deepEqual(r.body,good);}
 assert.equal(messages().length,1);assert.equal(state(),initialHash);
});
await test('dados malformados ou com tipos incorretos recusados',async()=>{
 for(const fields of [{cpf:123,email},{cpf,email:'a\r\nBcc:a@b.com'},{cpf:'abc',email},{cpf,email:''}])assert.equal((await request('/senha/recuperar',fields)).status,400);
});
const login=await request('/login',{cpf,senha:oldPassword});assert.equal(login.status,200);const session=login.body.dados.token_jwt;
await test('link inválido e senhas fora dos limites preservam a credencial',async()=>{
 for(const body of [{token:'0'.repeat(64),senha:newPassword},{token,senha:'curta'},{token,senha:'á'.repeat(40)},{token,senha:42}])assert.equal((await request('/senha/redefinir',body)).status,400);
 assert.equal(state(),initialHash);
});
await test('link expirado não altera senha',async()=>{
 db.prepare('UPDATE RecuperacoesSenha SET expiraEm=1').run();assert.equal((await request('/senha/redefinir',{token,senha:newPassword})).status,400);assert.equal(state(),initialHash);db.prepare('UPDATE RecuperacoesSenha SET expiraEm=criadoEm+900').run();
});
await test('troca de e-mail invalida o link',async()=>{
 db.prepare('UPDATE Usuarios SET email=? WHERE idUsuarioCPF=?').run('mudou@example.invalid',cpf);assert.equal((await request('/senha/redefinir',{token,senha:newPassword})).status,400);db.prepare('UPDATE Usuarios SET email=? WHERE idUsuarioCPF=?').run(email,cpf);
});
await test('usos concorrentes permitem uma única redefinição',async()=>{
 const results=await Promise.all([request('/senha/redefinir',{token,senha:newPassword}),request('/senha/redefinir',{token,senha:newPassword})]);assert.deepEqual(results.map(x=>x.status).sort(),[200,400]);assert.notEqual(state(),initialHash);assert.match(state(),/^\$2/);
});
await test('token consumido não é reutilizado',async()=>assert.equal((await request('/senha/redefinir',{token,senha:oldPassword})).status,400));
await test('senha antiga falha e nova permite login',async()=>{
 assert.equal((await request('/login',{cpf,senha:oldPassword})).status,401);assert.equal((await request('/login',{cpf,senha:newPassword})).status,200);
});
await test('sessão anterior é revogada',async()=>{
 const r=await fetch(base+'/perfil/'+cpf,{headers:{Authorization:'Bearer '+session}});assert.equal(r.status,401);
});
await test('corpo excessivo é recusado antes do JSON e rotas semelhantes permanecem privadas',async()=>{
 assert.equal((await request('/senha/recuperar',{cpf,email,extra:'x'.repeat(9000)})).status,413);
 assert.equal((await request('/senha/recuperar/extra',{cpf,email})).status,401);
 assert.equal((await fetch(base+'/senha/recuperar')).status,401);
});
await test('conta desativada ou removida após envio não é recuperada',async()=>{
 db.prepare('UPDATE RecuperacoesSenha SET criadoEm=criadoEm-61 WHERE idUsuarioCPF=?').run(cpf);
 await request('/senha/recuperar',{cpf,email});const current=messages().at(-1).token;
 db.prepare("UPDATE Usuarios SET status='Inativo' WHERE idUsuarioCPF=?").run(cpf);
 assert.equal((await request('/senha/redefinir',{token:current,senha:oldPassword})).status,400);
 db.prepare("UPDATE Usuarios SET status='Ativo' WHERE idUsuarioCPF=?").run(cpf);
 const original=db.prepare('SELECT * FROM Usuarios WHERE idUsuarioCPF=?').get(cpf);
 db.prepare('DELETE FROM Usuarios WHERE idUsuarioCPF=?').run(cpf);
 assert.equal((await request('/senha/redefinir',{token:current,senha:oldPassword})).status,400);
 const keys=Object.keys(original);db.prepare(`INSERT INTO Usuarios (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>original[k]));
});
await test('indisponibilidade do envio retorna erro genérico e fila cheia não entrega link',async()=>{
 const disabled=path.join(output,'mail-disabled'),full=path.join(output,'mail-full');
 writeFileSync(disabled,'');try{assert.equal((await request('/senha/recuperar',{cpf,email})).status,503);}finally{unlinkSync(disabled);}
 db.prepare('UPDATE RecuperacoesSenha SET criadoEm=criadoEm-61 WHERE idUsuarioCPF=?').run(cpf);
 const count=messages().length,rows=db.prepare('SELECT COUNT(*) AS qtd FROM RecuperacoesSenha').get().qtd;
 writeFileSync(full,'');try{assert.equal((await request('/senha/recuperar',{cpf,email})).status,202);}finally{unlinkSync(full);}
 assert.equal(messages().length,count);assert.equal(db.prepare('SELECT COUNT(*) AS qtd FROM RecuperacoesSenha').get().qtd,rows);
});
await test('máximo de cinco mensagens por hora e conta, sem revelar o limite',async()=>{
 const other='90000000003';assert.equal((await request('/usuarios',{cpf:other,nomeCompleto:'Teste limite',email,senha:oldPassword,dataNascimento:'2000-01-01'})).status,201);
 const before=messages().length;
 for(let i=0;i<6;i++){
  assert.equal((await request('/senha/recuperar',{cpf:other,email})).status,202);
  db.prepare('UPDATE RecuperacoesSenha SET criadoEm=criadoEm-61 WHERE idUsuarioCPF=?').run(other);
 }
 assert.equal(messages().length-before,5);
});
await test('tentativas por IP são limitadas mesmo com CPF inexistente',async()=>{
 for(let i=0;i<30;i++)assert.equal((await request('/senha/recuperar',{cpf:'90000000002',email},'198.51.100.99')).status,202);
 assert.equal((await request('/senha/recuperar',{cpf:'90000000002',email},'198.51.100.99')).status,429);
});
db.close();console.log(`Recuperação: ${passed} aprovados, 0 falhas.`);
