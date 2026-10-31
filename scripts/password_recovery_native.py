"""Focused Linux tests: real ACBr TLS and candidate API against one owned Azure account."""
import concurrent.futures, configparser, email, email.policy, hashlib, http.client, json
import os, pathlib, re, secrets, signal, socket, socketserver, ssl, subprocess, threading, time

def command(args,timeout=35):
    r=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if r.returncode: raise RuntimeError('Command failed: '+pathlib.Path(args[0]).name)
    return r.stdout.strip()

def private(path,data,mode=0o640):
    path.write_bytes(data if isinstance(data,bytes) else data.encode());path.chmod(mode)
    import grp
    os.chown(path,0,grp.getgrnam('autocusto').gr_gid)

def read_config(path):
    c=configparser.ConfigParser(interpolation=None);c.read(path,encoding='utf-8-sig');return c

class SMTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address=True;daemon_threads=True
    def __init__(self,cert,key,tls=True):
        self.messages=[];self.auths=0;self.tls=tls
        self.context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);self.context.load_cert_chain(cert,key)
        super().__init__(('127.0.0.1',0),SMTPHandler)
    def get_request(self):
        sock,addr=super().get_request();sock.settimeout(8)
        if self.tls:
            try:sock=self.context.wrap_socket(sock,server_side=True)
            except Exception:sock.close();raise
        return sock,addr
    def handle_error(self,*_):pass

class SMTPHandler(socketserver.StreamRequestHandler):
    def handle(self):
        try:
            self.wfile.write(b'220 recovery.test ESMTP\r\n');data=False;body=[]
            while True:
                line=self.rfile.readline(16384)
                if not line:return
                if data:
                    if line==b'.\r\n':
                        self.server.messages.append(b''.join(body));data=False;self.wfile.write(b'250 queued\r\n')
                    else:body.append(line[1:] if line.startswith(b'..') else line)
                elif line.upper().startswith(b'EHLO'):self.wfile.write(b'250-recovery.test\r\n250 AUTH PLAIN\r\n')
                elif line.upper().startswith(b'AUTH PLAIN'):self.server.auths+=1;self.wfile.write(b'235 authenticated\r\n')
                elif line.upper().startswith((b'MAIL FROM:',b'RCPT TO:')):self.wfile.write(b'250 ok\r\n')
                elif line.upper().startswith(b'DATA'):data=True;body=[];self.wfile.write(b'354 continue\r\n')
                elif line.upper().startswith(b'QUIT'):self.wfile.write(b'221 bye\r\n');return
                else:self.wfile.write(b'500 unsupported\r\n')
        except (OSError,ssl.SSLError):pass

def certificates(folder):
    for name,host in [('server','localhost'),('other','untrusted.invalid')]:
        command(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1',
                 '-subj','/CN='+host,'-addext','subjectAltName=DNS:'+host,
                 '-keyout',str(folder/(name+'.key')),'-out',str(folder/(name+'.crt'))])
        (folder/(name+'.key')).chmod(0o600)
        (folder/(name+'.crt')).chmod(0o644)

def mail_config(folder,port,ca,host='localhost'):
    target=folder/'test-email.ini'
    private(target,f'[SMTP]\nServidor={host}\nPorta={port}\nUsuario=sender@example.invalid\nSenha=senha-ficticia-teste\nRemetente=sender@example.invalid\nNome=Alto Custo\nModoTLS=SSL\nCertificadosCA={ca}\n[Recuperacao]\nURLPublica=https://altocusto.duckdns.org\n')
    return target

def transport_tests(folder,probe):
    certificates(folder);results=[]
    for name,ca,host,tls,success in [
        ('TLS com cadeia e hostname válidos','server.crt','localhost',True,True),
        ('Cadeia não confiável rejeitada','other.crt','localhost',True,False),
        ('Hostname incorreto rejeitado','server.crt','127.0.0.1',True,False),
        ('Servidor sem TLS rejeitado','server.crt','localhost',False,False)]:
        server=SMTPServer(folder/'server.crt',folder/'server.key',tls)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            cfg=mail_config(folder,server.server_address[1],folder/ca,host)
            env=os.environ.copy();env['AUTO_CUSTO_EMAIL_CONFIG']=str(cfg)
            r=subprocess.run(['runuser','-u','autocusto','--',str(probe),'recipient@example.invalid'],env=env,capture_output=True,text=True,timeout=30)
            ok=r.returncode==0
            assert ok==success,name
            if success:
                assert len(server.messages)==1 and server.auths==1
                message=email.message_from_bytes(server.messages[0],policy=email.policy.default)
                part=message.get_body(preferencelist=('plain',));assert part is not None,'Missing text/plain body.'
                text=part.get_content()
                assert 'redefinir-senha.html#token='+'0'*64 in text and '15 minutos' in text
                assert 'solicitação' in text and 'única vez' in text
            else:assert server.auths==0 and not server.messages,name
            results.append({'name':name,'passed':True})
        finally:server.shutdown();server.server_close();thread.join(timeout=3)
    return results

def connect_db(ini):
    import pyodbc
    c=read_config(ini)
    def val(key):return c['Base'][key].strip().strip('"\'')
    assert val('Servidor')=='db-altocusto.database.windows.net' and val('Banco')=='db-altocusto'
    assert not c.getboolean('Base','ConfiarCertificadoServidor',fallback=False)
    def quote(s):return '{'+s.replace('}','}}')+'}'
    return pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};SERVER='+quote(val('Servidor')+','+val('Porta'))+';DATABASE='+quote(val('Banco'))+';UID='+quote(val('Usuario'))+';PWD='+quote(val('Senha'))+';Encrypt=yes;TrustServerCertificate=no;Connection Timeout=15',autocommit=True)

def request(port,route,body=None,token=None):
    c=http.client.HTTPConnection('127.0.0.1',port,timeout=25)
    try:
        headers={'Content-Type':'application/json'}
        if token:headers['Authorization']='Bearer '+token
        c.request('POST' if body is not None else 'GET',route,json.dumps(body) if body is not None else None,headers)
        r=c.getresponse();data=r.read();return r.status,json.loads(data) if data else None
    finally:c.close()

def snapshot(db):
    result={}
    for table,key in [('Cargos','IdCargo'),('Usuarios','idUsuarioCPF'),('Medicamentos','idMedicamento'),('Solicitacoes','idSolicitacao'),('Interessados','idInteressado'),('Documentos','idDoc'),('Arquivo','prontuario,idDoc,idUsuarioCPF,caixa,prateleiraCorredor,dataHora')]:
        result[table]=db.cursor().execute("SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',CAST((SELECT * FROM dbo."+table+" ORDER BY "+key+" FOR JSON PATH,INCLUDE_NULL_VALUES) AS nvarchar(max))),2)").fetchone()[0]
    return result

def api_tests(folder,binary,ini,migration):
    db=connect_db(ini);before=snapshot(db);process=None;server=None;created=False;results=[]
    marker='ALTOCUSTO_RECUPERACAO_'+folder.name
    cpf='000'+''.join(str(secrets.randbelow(10)) for _ in range(8));identity=int(cpf)
    address='r'+secrets.token_hex(5)+'@autocusto.invalid'
    old='Teste-'+secrets.token_hex(12);new='Nova-'+secrets.token_hex(12)
    cur=db.cursor();assert not cur.execute('SELECT 1 FROM Usuarios WHERE idUsuarioCPF=?',identity).fetchone()
    def check(name,condition):assert condition,name;results.append({'name':name,'passed':True})
    try:
        existing=cur.execute("SELECT OBJECT_ID(N'dbo.RecuperacoesSenha',N'U')").fetchone()[0]
        if existing:
            columns={r[0] for r in cur.execute("SELECT name FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.RecuperacoesSenha')")}
            assert columns=={'tokenHash','idUsuarioCPF','emailVinculo','senhaVinculo','criadoEm','expiraEm','usado'}
        cur.execute(migration.read_text(encoding='utf-8-sig'))
        server=SMTPServer(folder/'server.crt',folder/'server.key');thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        cfg=mail_config(folder,server.server_address[1],folder/'server.crt')
        sock=socket.socket();sock.bind(('127.0.0.1',19002));sock.close()
        env=os.environ.copy()
        for key in ['AUTO_CUSTO_JWT_SECRET','SSL_CERT_FILE','SSL_CERT_DIR']:env.pop(key,None)
        env.update(AUTO_CUSTO_CONFIG=str(ini),AUTO_CUSTO_PORT='19002',AUTO_CUSTO_EMAIL_CONFIG=str(cfg))
        process=subprocess.Popen(['runuser','-u','autocusto','--',str(binary)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
        for _ in range(40):
            if process.poll() is not None:raise RuntimeError('Candidate API stopped.')
            try:
                if request(19002,'/produtos')[0]==401:break
            except OSError:time.sleep(.2)
        else:raise RuntimeError('Candidate API did not start.')
        code,_=request(19002,'/usuarios',{'cpf':cpf,'nomeCompleto':marker,'email':address,'senha':old,'dataNascimento':'2000-01-01'})
        check('Cadastro exclusivo de teste',code==201);created=True
        check('Conta de teste pertence a esta execução',tuple(cur.execute('SELECT nomeUsuario,email FROM Usuarios WHERE idUsuarioCPF=?',identity).fetchone())==(marker,address))
        code,data=request(19002,'/login',{'cpf':cpf,'senha':old});check('Login anterior',code==200);session=data['dados']['token_jwt']
        code,response=request(19002,'/senha/recuperar',{'cpf':cpf,'email':address});check('Solicitação pública',code==202)
        code,other=request(19002,'/senha/recuperar',{'cpf':cpf,'email':'outro@autocusto.invalid'});check('Resposta não revela conta',code==202 and response==other)
        for _ in range(100):
            if server.messages:break
            time.sleep(.1)
        check('E-mail recebido pelo SMTP TLS',len(server.messages)==1)
        message=email.message_from_bytes(server.messages[0],policy=email.policy.default);text=message.get_body(preferencelist=('plain',)).get_content()
        token=re.search(r'redefinir-senha\.html#token=([a-f0-9]{64})',text)[1]
        tokenhash=hashlib.sha256(token.encode()).hexdigest()
        row=cur.execute('SELECT tokenHash,expiraEm-criadoEm,usado FROM RecuperacoesSenha WHERE idUsuarioCPF=?',identity).fetchone()
        check('Banco guarda hash e validade de 900 segundos',row[0]==tokenhash and row[0]!=token and row[1]==900 and not row[2])
        now=int(time.time());cur.execute('UPDATE RecuperacoesSenha SET criadoEm=?,expiraEm=? WHERE tokenHash=? AND idUsuarioCPF=?',now-901,now-1,tokenhash,identity)
        check('Expiração recusada no SQL Server',request(19002,'/senha/redefinir',{'token':token,'senha':new})[0]==400)
        cur.execute('UPDATE RecuperacoesSenha SET criadoEm=?,expiraEm=? WHERE tokenHash=? AND idUsuarioCPF=?',now,now+900,tokenhash,identity)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            codes=sorted(pool.map(lambda _:request(19002,'/senha/redefinir',{'token':token,'senha':new})[0],range(2)))
        check('Concorrência MSSQL permite um único uso',codes==[200,400])
        check('Reutilização recusada',request(19002,'/senha/redefinir',{'token':token,'senha':old})[0]==400)
        check('Senha anterior recusada',request(19002,'/login',{'cpf':cpf,'senha':old})[0]==401)
        code,data=request(19002,'/login',{'cpf':cpf,'senha':new});check('Nova senha aceita',code==200)
        check('Sessão anterior revogada',request(19002,'/perfil/'+cpf,token=session)[0]==401)
        check('Sessão nova autorizada',request(19002,'/perfil/'+cpf,token=data['dados']['token_jwt'])[0]==200)
    finally:
        if process:
            if process.poll() is None:
                os.killpg(process.pid,signal.SIGTERM)
                try:process.wait(timeout=8)
                except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=3)
        if server:server.shutdown();server.server_close();thread.join(timeout=3)
        if created or cur.execute('SELECT 1 FROM Usuarios WHERE idUsuarioCPF=?',identity).fetchone():
            assert tuple(cur.execute('SELECT nomeUsuario,email FROM Usuarios WHERE idUsuarioCPF=?',identity).fetchone())==(marker,address),'Ownership changed; refusing cleanup.'
            for table in ['Solicitacoes','Documentos','Arquivo']:
                assert cur.execute('SELECT COUNT(*) FROM '+table+' WHERE idUsuarioCPF=?',identity).fetchone()[0]==0,'External reference; refusing cleanup.'
            cur.execute('DELETE FROM RecuperacoesSenha WHERE idUsuarioCPF=?',identity)
            cur.execute('DELETE FROM Usuarios WHERE idUsuarioCPF=? AND nomeUsuario=? AND email=?',identity,marker,address)
            assert not cur.execute('SELECT 1 FROM Usuarios WHERE idUsuarioCPF=?',identity).fetchone()
        after=snapshot(db);db.close()
        if before!=after:raise RuntimeError('Database snapshot changed outside the owned test account; manual review required.')
    return {'checks':results,'temporaryAccountRemoved':True,'originalDataPreserved':before==after}
