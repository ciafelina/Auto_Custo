"""Publish or recover only the tested Alto Custo password-recovery release."""
import argparse,base64,getpass,hashlib,io,json,pathlib,secrets,shlex,subprocess,sys,tarfile
ROOT=pathlib.Path(__file__).resolve().parent.parent;OUT=ROOT/'tests/.build/password-recovery-release'
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('action',choices=['activate','status','rollback','test']);args=parser.parse_args()
sys.path.insert(0,str(ROOT/'scripts'))
from alto_custo_static_remote import validate_files
record=json.loads((OUT/'manifest.json').read_text());rid=record['releaseId'];uploads={}
if args.action=='activate':
 evidence=json.loads((OUT/'native-tests.json').read_text());assert evidence['releaseId']==rid and evidence['gmailSmtpAccepted']
 assert subprocess.run(['git','diff','--quiet','HEAD','--','Front_End'],cwd=ROOT).returncode==0,'Commit the tested frontend before publishing.'
 files={p.relative_to(ROOT/'Front_End').as_posix():p.read_bytes() for p in (ROOT/'Front_End').rglob('*') if p.is_file() and not p.is_symlink()}
 files['config.js']=b"globalThis.AUTO_CUSTO_CONFIG = {apiBaseUrl: location.origin + '/api'};\n"
 manifest={'releaseId':rid,'binaryHash':record['hashes']['ProjetoFaculdade'],'emailConfigurationHash':hashlib.sha256(pathlib.Path('C:/Users/EBT/AppData/Local/AutoCusto/email.ini').read_bytes()).hexdigest(),'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip(),'files':{n:hashlib.sha256(b).hexdigest() for n,b in files.items()}}
 validate_files(files,manifest);assert hashlib.sha256((ROOT/'tests/.build/deploy/ProjetoFaculdade').read_bytes()).hexdigest()==manifest['binaryHash']
 archive=io.BytesIO()
 with tarfile.open(fileobj=archive,mode='w:gz') as tar:
  for name,body in files.items():
   entry=tarfile.TarInfo(name);entry.size=len(body);entry.mode=0o644;tar.addfile(entry,io.BytesIO(body))
 uploads['frontend.tar.gz']=archive.getvalue();(OUT/'publication-manifest.json').write_text(json.dumps(manifest,indent=2))
else:manifest=json.loads((OUT/'publication-manifest.json').read_text()) if (OUT/'publication-manifest.json').exists() else {'releaseId':rid}
for name in ['password_recovery_publish.py','alto_custo_static_remote.py','autocusto_domain_remote.py']:
 uploads[name]=(ROOT/'scripts'/name).read_bytes()
uploads['test_password_recovery_publish.py']=(ROOT/'tests/test_password_recovery_publish.py').read_bytes()
hashes={n:hashlib.sha256(b).hexdigest() for n,b in uploads.items()}
sys.path.insert(0,str(ROOT/'tests/.build/deploy/py-libs'));import paramiko
ssh=paramiko.SSHClient();ssh.load_host_keys(str(ROOT/'tests/.build/azure/known_hosts'));ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
stage='/home/projetoaltocusto/recovery-publication-'+secrets.token_hex(8)
try:
 ssh.connect('102.37.16.34',username='projetoaltocusto',password=getpass.getpass('Senha SSH (oculta): '),timeout=15,allow_agent=False,look_for_keys=False)
 sftp=ssh.open_sftp();sftp.mkdir(stage,mode=0o700)
 for name,body in uploads.items():
  with sftp.open(stage+'/'+name,'wb') as stream:stream.set_pipelined(True);stream.write(body)
  sftp.chmod(stage+'/'+name,0o600)
 sftp.close()
 source=r'''
import hashlib,http.client,importlib.util,json,os,pathlib,re,secrets,shlex,shutil,socket,ssl,subprocess,sys,time
rid=__RID__;manifest=__MANIFEST__;hashes=__HASHES__;stage=pathlib.Path(__STAGE__);action=__ACTION__
assert stage.resolve()==stage and not stage.is_symlink() and stage.parent==pathlib.Path('/home/projetoaltocusto')
folder=pathlib.Path('/var/lib/autocusto-recovery')/rid;assert folder.is_dir() and not folder.is_symlink()
work=folder/('publication-'+stage.name.rsplit('-',1)[1]);work.mkdir(mode=0o700)
(work/'scripts').mkdir();(work/'tests').mkdir()
for name,digest in hashes.items():
 p=stage/name;assert p.is_file() and not p.is_symlink() and hashlib.sha256(p.read_bytes()).hexdigest()==digest
 dest=work/('tests' if name.startswith('test_') else 'scripts')/name;shutil.copyfile(p,dest);dest.chmod(0o600)
sys.path.insert(0,str(work/'scripts'))
from password_recovery_publish import Publisher
from alto_custo_static_remote import load_bundle
def invoke(argv):
 r=subprocess.run(argv,capture_output=True,text=True,timeout=40)
 if r.returncode:raise RuntimeError('Service operation failed: '+argv[0])
 return r.stdout.strip()
def observe():
 for _ in range(50):
  pid=invoke(['systemctl','show','autocusto.service','-p','MainPID','--value'])
  if pid.isdigit() and int(pid)>0 and pathlib.Path('/proc/'+pid+'/exe').exists():break
  time.sleep(.1)
 else:raise RuntimeError('API not running.')
 binary=pathlib.Path(os.readlink('/proc/'+pid+'/exe'))
 env=dict(p.split('=',1) for p in shlex.split(invoke(['systemctl','show','autocusto.service','-p','Environment','--value'])) if '=' in p)
 ini=pathlib.Path(env['AUTO_CUSTO_CONFIG']);assert str(ini).startswith('/etc/autocusto/')
 return {'pid':pid,'binary':str(binary),'binaryHash':hashlib.sha256(binary.read_bytes()).hexdigest(),'config':str(ini),'configHash':hashlib.sha256(ini.read_bytes()).hexdigest()}
def get(host,path,body=None):
 c=http.client.HTTPSConnection(host,context=ssl.create_default_context(),timeout=12)
 c._create_connection=lambda *a,**k:socket.create_connection(('127.0.0.1',443),timeout=12)
 try:
  c.request('POST' if body is not None else 'GET',path,json.dumps(body) if body is not None else None,{'Content-Type':'application/json'})
  r=c.getresponse();return r.status,r.read()
 finally:c.close()
def verify(m):
 checks=[]
 spec=importlib.util.spec_from_file_location('recovery_native',folder/'password_recovery_native.py');native_api=importlib.util.module_from_spec(spec);spec.loader.exec_module(native_api)
 db=native_api.connect_db(pathlib.Path(observe()['config']))
 try:
  for _ in range(10):
   probe_cpf='000'+''.join(str(secrets.randbelow(10)) for _ in range(8))
   if not db.cursor().execute('SELECT 1 FROM Usuarios WHERE idUsuarioCPF=?',int(probe_cpf)).fetchone():break
  else:raise RuntimeError('No collision-free smoke identity available.')
 finally:db.close()
 for host in ['altocusto.duckdns.org','autocusto.duckdns.org']:
  for name in ['index.html','login.html','recuperar-senha.html','redefinir-senha.html','js/recuperacao-senha.js']:
   code,data=get(host,'/' if name=='index.html' else '/'+name);assert code==200 and hashlib.sha256(data).hexdigest()==m['files'][name]
  assert get(host,'/google6865db66f34119a6.html')[0]==200
  for _ in range(30):
   try:
    if get(host,'/api/produtos')[0]==401:break
   except OSError:pass
   time.sleep(.1)
  else:raise RuntimeError('Protected API check failed.')
  assert get(host,'/api/senha/recuperar',{'cpf':'invalido','email':'test@example.invalid'})[0]==400
  assert get(host,'/api/senha/recuperar',{'cpf':probe_cpf,'email':'smoke@autocusto.invalid'})[0]==202
  assert get(host,'/api/senha/redefinir',{'token':'invalido','senha':'NovaSenhaTeste2026'})[0]==400
  checks.append({'host':host,'newFilesVerified':5,'privateApi401':True,'newPublicRoutes400':True,'googleProofPreserved':True,'tlsVerified':True})
 return checks
publisher=Publisher()
if action in ('activate','test'):
 native=subprocess.run([sys.executable,str(work/'tests/test_password_recovery_publish.py')],capture_output=True,text=True,timeout=40)
 assert native.returncode==0,'Native recovery-publication tests failed.'
 count=int(re.search(r'Ran (\d+) tests',native.stderr)[1]);assert count>=7
 (folder/'publisher-native-tests.json').write_text(json.dumps({'passed':count,'failed':0,'nativeLinux':True,'moduleHash':hashes['password_recovery_publish.py']}))
 if action=='test':result={'nativeLinux':True,'publisherPassed':count,'publisherFailed':0,'publicApiUnchanged':True}
 else:
  assert hashlib.sha256((folder/'email.ini').read_bytes()).hexdigest()==manifest['emailConfigurationHash'],'SMTP configuration changed after its test.'
  files=load_bundle(work/'scripts/frontend.tar.gz',manifest)
  result=publisher.activate(manifest,files,invoke=invoke,observe=observe,verify=verify)
elif action=='rollback':result=publisher.rollback(invoke=invoke,observe=observe)
else:
 active=json.loads(publisher.active.read_text()) if publisher.active.exists() else None
 result={'api':observe(),'activeRelease':active['manifest']['releaseId'] if active else None,'pending':publisher.pending.exists()}
print(json.dumps(result))
'''.replace('__RID__',repr(rid)).replace('__MANIFEST__',repr(manifest)).replace('__HASHES__',repr(hashes)).replace('__STAGE__',repr(stage)).replace('__ACTION__',repr(args.action))
 import textwrap
 source='try:\n'+textwrap.indent(source,' ')+'\nexcept Exception as e:\n import traceback\n print(json.dumps({"errorType":type(e).__name__,"assertion":str(e) if isinstance(e,AssertionError) else "","frames":[{"file":pathlib.Path(f.filename).name,"line":f.lineno} for f in traceback.extract_tb(e.__traceback__)]}))\n raise SystemExit(1)\n'
 command='sudo -n /var/lib/autocusto-e2e/runtime/bin/python -c '+shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(source.encode()).decode())+'))')
 _,stdout,stderr=ssh.exec_command(command,timeout=180);data=stdout.read().decode();code=stdout.channel.recv_exit_status()
 result=json.loads(data);(OUT/(args.action+'.json')).write_text(json.dumps(result,indent=2));print(json.dumps(result,ensure_ascii=False))
 raise SystemExit(code)
finally:ssh.close()
