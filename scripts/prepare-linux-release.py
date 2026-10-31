"""Prepare only this project's immutable release; never activate or change data."""
import pathlib,sys,os,getpass,uuid,json,configparser,secrets,io,base64,shlex,hashlib,tarfile,stat,ssl,datetime
root=pathlib.Path(__file__).resolve().parent.parent
build=root/'tests/.build/deploy'
probe_only='--probe-only' in sys.argv[1:]
temporary_trust_authorized='--temporary-trust-authorized' in sys.argv[1:]
if any(arg not in ['--probe-only','--temporary-trust-authorized'] for arg in sys.argv[1:]) or (probe_only and temporary_trust_authorized):raise SystemExit('Invalid preparation option')
sys.path.insert(0,str(build/'py-libs'))
import paramiko
from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa
manifest_path=build/'release.json'
if manifest_path.exists():
 manifest=json.loads(manifest_path.read_text());release_id=manifest['releaseId']
else:
 release_id='20261025-'+uuid.uuid4().hex[:12];manifest={'releaseId':release_id}
 manifest_path.write_text(json.dumps(manifest))
assert release_id.startswith('20261025-') and len(release_id)==21 and all(c in '0123456789abcdef' for c in release_id[9:])
stage='/home/projetoaltocusto/autocusto-deploy/stage-'+release_id
release='/opt/autocusto/releases/'+release_id
configuration='/etc/autocusto/releases/'+release_id+'.ini'
static_archive=build/'frontend.tar.gz'
with tarfile.open(static_archive,'w:gz') as tar:
 for file in sorted((root/'Front_End').rglob('*')):
  if file.is_file() and not file.is_symlink() and file.suffix.lower() in {'.html','.js','.css','.svg','.png','.jpg','.jpeg','.ico','.woff','.woff2','.webp'}:
   tar.add(file,arcname=str(file.relative_to(root/'Front_End')).replace('\\','/'),recursive=False)
active_config=pathlib.Path(os.environ['LOCALAPPDATA'])/'AutoCusto/config.ini'
cfg=configparser.RawConfigParser();cfg.optionxform=str;cfg.read(active_config,encoding='utf-8-sig')
assert cfg['Base']['Banco'].strip()=='Projeto_JoseThiago','Use only the already approved current database.'
for field in ['Servidor','Porta','Banco','Usuario','Senha']:
 value=cfg['Base'].get(field,'').strip()
 if len(value)>=2 and value[0]==value[-1] and value[0] in ('"',"'"):value=value[1:-1]
 cfg['Base'][field]=value
cfg['Seguranca']['JwtSecret']=secrets.token_urlsafe(48)
cfg['Base']['NomeCertificadoServidor']='SSL_Self_Signed_Fallback'
cfg['Base']['ConfiarCertificadoServidor']='1' if temporary_trust_authorized else '0'
database_host=cfg['Base']['Servidor'];database_port=int(cfg['Base']['Porta'])
certificate_hash='4b0d7ab7038998d378459407a2e5a03c78f212fdc5bb3e5ad1a4ea3a59699eb4'
assert hashlib.sha256(ssl.PEM_cert_to_DER_cert((build/'database-server.pem').read_text())).hexdigest()==certificate_hash
key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
name=x509.Name([x509.NameAttribute(x509.oid.NameOID.COMMON_NAME,'SSL_Self_Signed_Fallback')])
now=datetime.datetime.now(datetime.timezone.utc)
wrong=(x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(days=1)).not_valid_after(now+datetime.timedelta(days=1)).add_extension(x509.BasicConstraints(ca=True,path_length=None),critical=True).sign(key,hashes.SHA256()))
(build/'wrong-database-ca.pem').write_bytes(wrong.public_bytes(serialization.Encoding.PEM))
del key
config_stream=io.StringIO();cfg.write(config_stream,space_around_delimiters=False)
config_bytes=config_stream.getvalue().encode('utf-8');config_stream.close();cfg.clear()
binary_hash=hashlib.sha256((build/'ProjetoFaculdade').read_bytes()).hexdigest()
remote_source='''
import pathlib,subprocess,tarfile,hashlib,os,json,ssl,socket,struct
stage=pathlib.Path(__STAGE__);release=pathlib.Path(__RELEASE__);configuration=pathlib.Path(__CONFIG__)
assert stage.parent==pathlib.Path('/home/projetoaltocusto/autocusto-deploy') and stage.name.startswith('stage-20261025-')
assert release.parent==pathlib.Path('/opt/autocusto/releases') and configuration.parent==pathlib.Path('/etc/autocusto/releases')
assert hashlib.sha256((stage/'ProjetoFaculdade').read_bytes()).hexdigest()==__HASH__
service=subprocess.run(['systemctl','show','autocusto.service','-p','ExecStart'],capture_output=True,text=True,check=True).stdout
assert str(release/'ProjetoFaculdade') not in service,'Never overwrite an active release'
# Compare the same public certificate through the VM before sending SQL credentials.
def read_exact(connection,count):
 data=b''
 while len(data)<count:
  part=connection.recv(count-len(data))
  if not part:raise EOFError('TDS handshake closed')
  data+=part
 return data
def send_tds(connection,data):connection.sendall(struct.pack('!BBHHBB',0x12,1,len(data)+8,0,1,0)+data)
def receive_tds(connection):
 data=b''
 while True:
  kind,status,length,spid,pid,window=struct.unpack('!BBHHBB',read_exact(connection,8))
  data+=read_exact(connection,length-8)
  if status&1:return data
context=ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT);context.check_hostname=False;context.verify_mode=ssl.CERT_NONE
with socket.create_connection((__DBHOST__,__DBPORT__),timeout=8) as connection:
 prelogin=b'\\x00'+struct.pack('!HH',11,6)+b'\\x01'+struct.pack('!HH',17,1)+b'\\xff'+b'\\x09\\x00\\x00\\x00\\x00\\x00'+b'\\x01'
 send_tds(connection,prelogin);receive_tds(connection)
 inbound,outbound=ssl.MemoryBIO(),ssl.MemoryBIO();tls=context.wrap_bio(inbound,outbound,server_side=False,server_hostname=__DBHOST__)
 while True:
  try:tls.do_handshake();break
  except ssl.SSLWantReadError:
   if outbound.pending:send_tds(connection,outbound.read())
   inbound.write(receive_tds(connection))
 assert hashlib.sha256(tls.getpeercert(binary_form=True)).hexdigest()==__CERT_HASH__,'Database certificate mismatch'
assert hashlib.sha256(ssl.PEM_cert_to_DER_cert((stage/'database-server.pem').read_text())).hexdigest()==__CERT_HASH__
print('DATABASE_CERTIFICATE_MATCHED_FROM_BOTH_NETWORKS',flush=True)
def run(args):subprocess.run(args,check=True,capture_output=True)
run(['sudo','-n','install','-d','-o','root','-g','autocusto','-m','0750',str(release.parent),str(release),str(configuration.parent)])
for name in ['ProjetoFaculdade','LinuxDatabaseProbe']:
 run(['sudo','-n','install','-o','root','-g','autocusto','-m','0750',str(stage/name),str(release/name)])
run(['sudo','-n','install','-o','root','-g','autocusto','-m','0640',str(stage/'config.ini'),str(configuration)])
(stage/'config.ini').unlink()
certificate=configuration.with_suffix('.database.pem')
run(['sudo','-n','install','-o','root','-g','autocusto','-m','0640',str(stage/'database-server.pem'),str(certificate)])
run(['sudo','-n','install','-d','-o','root','-g','autocusto','-m','0750','/etc/autocusto/empty-ca'])
run(['sudo','-n','install','-o','root','-g','autocusto','-m','0640',str(stage/'wrong-database-ca.pem'),str(release/'wrong-database-ca.pem')])
static=stage/'frontend';static.mkdir(exist_ok=True)
with tarfile.open(stage/'frontend.tar.gz') as tar:tar.extractall(static,filter='data')
(static/'config.js').write_text("globalThis.AUTO_CUSTO_CONFIG = Object.freeze({apiBaseUrl: location.origin + '/api'});\\n",encoding='utf-8')
run(['sudo','-n','install','-d','-o','root','-g','root','-m','0755',str(release/'frontend')])
run(['sudo','-n','cp','-a',str(static)+'/.',str(release/'frontend')])
run(['sudo','-n','chown','-R','root:root',str(release/'frontend')])
run(['sudo','-n','chmod','-R','a+rX',str(release/'frontend')])
env=['AUTO_CUSTO_CONFIG='+str(configuration),'AUTO_CUSTO_EXPECTED_DATABASE=Projeto_JoseThiago','SSL_CERT_DIR=/etc/autocusto/empty-ca']
if not __TEMP_TRUST__:
 negative=subprocess.run(['sudo','-n','-u','autocusto','env']+env+['SSL_CERT_FILE='+str(release/'wrong-database-ca.pem'),str(release/'LinuxDatabaseProbe')],capture_output=True,text=True,timeout=30)
 assert negative.returncode!=0 and 'CERTIFICATE_ERROR' in negative.stdout,'Wrong database certificate must be rejected'
 print('WRONG_DATABASE_CERTIFICATE_REJECTED',flush=True)
else:print('TEMPORARY_DATABASE_CERTIFICATE_EXCEPTION_EXPLICITLY_AUTHORIZED',flush=True)
env+=['SSL_CERT_FILE='+str(certificate)]
result=subprocess.run(['sudo','-n','-u','autocusto','env']+env+[str(release/'LinuxDatabaseProbe')],capture_output=True,text=True,timeout=30)
print(result.stdout,end='')
print(json.dumps({'releasePrepared':True,'databaseProbeExit':result.returncode,'apiActivated':False,'hash':__HASH__}))
raise SystemExit(result.returncode)
'''.replace('__STAGE__',repr(stage)).replace('__RELEASE__',repr(release)).replace('__CONFIG__',repr(configuration)).replace('__HASH__',repr(binary_hash)).replace('__DBHOST__',repr(database_host)).replace('__DBPORT__',str(database_port)).replace('__CERT_HASH__',repr(certificate_hash)).replace('__TEMP_TRUST__',repr(temporary_trust_authorized))
client=paramiko.SSHClient();client.load_host_keys(str(root/'tests/.build/azure/known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
password=getpass.getpass('Senha SSH (oculta): ')
try:
 client.connect('102.37.16.34',username='projetoaltocusto',password=password,timeout=12,allow_agent=False,look_for_keys=False,compress=True)
 del password
 with client.open_sftp() as sftp:
  try:sftp.mkdir(stage,0o700)
  except OSError:
   assert stat.S_ISDIR(sftp.lstat(stage).st_mode),'Staging path must be a directory'
   sftp.chmod(stage,0o700)
  for name in (['LinuxDatabaseProbe'] if probe_only else ['ProjetoFaculdade','LinuxDatabaseProbe','frontend.tar.gz','database-server.pem','wrong-database-ca.pem']):
   sftp.put(str(build/name),stage+'/'+name);sftp.chmod(stage+'/'+name,0o600)
  if not probe_only:
   with sftp.open(stage+'/config.ini','w') as file:
    file.chmod(0o600);file.write(config_bytes)
 del config_bytes
 if probe_only:
  remote_source='''
import subprocess,os,json
subprocess.run(['sudo','-n','install','-o','root','-g','autocusto','-m','0750',__STAGE__+'/LinuxDatabaseProbe',__RELEASE__+'/LinuxDatabaseProbe'],check=True)
r=subprocess.run(['sudo','-n','-u','autocusto','env','AUTO_CUSTO_CONFIG='+__CONFIG__,'AUTO_CUSTO_EXPECTED_DATABASE=Projeto_JoseThiago','SSL_CERT_FILE='+__CERT__,'SSL_CERT_DIR=/etc/autocusto/empty-ca',__RELEASE__+'/LinuxDatabaseProbe'],capture_output=True,text=True,timeout=30)
print(r.stdout,end='')
if r.stderr:
 for name in ['shared libraries','symbol lookup error','Segmentation','ODBC','certificate']:
  if name in r.stderr:print('STDERR_CATEGORY='+name)
print(json.dumps({'databaseProbeExit':r.returncode,'apiActivated':False}))
raise SystemExit(r.returncode)
'''.replace('__STAGE__',repr(stage)).replace('__RELEASE__',repr(release)).replace('__CONFIG__',repr(configuration)).replace('__CERT__',repr(str(pathlib.PurePosixPath(configuration).with_suffix('.database.pem'))))
 command='python3 -c '+shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(remote_source.encode()).decode())+'))')
 _,stdout,stderr=client.exec_command(command,timeout=120)
 output=stdout.read().decode('utf-8','replace');error=stderr.read().decode('utf-8','replace');code=stdout.channel.recv_exit_status()
 print(output,end='')
 if error:print('Release preparation error; no activation performed.',file=sys.stderr)
 manifest.update({'stage':stage,'release':release,'configuration':configuration,'hash':binary_hash,'databaseProbeExit':code})
 if not probe_only:manifest['temporaryDatabaseCertificateException']=temporary_trust_authorized
 manifest_path.write_text(json.dumps(manifest,indent=2))
 raise SystemExit(code)
finally:client.close()
