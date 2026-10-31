"""Correct only the inaccurate GOV.BR statement in this release's login page."""
import pathlib,sys,json,getpass,base64,shlex,hashlib,re
root=pathlib.Path(__file__).resolve().parent.parent;build=root/'tests/.build/deploy';sys.path.insert(0,str(build/'py-libs'))
import paramiko
manifest=json.loads((build/'release.json').read_text());rid=manifest['releaseId']
assert re.fullmatch(r'20261025-[a-f0-9]{12}',rid)
local=root/'Front_End/login.html';content=local.read_bytes();digest=hashlib.sha256(content).hexdigest()
stage='/home/projetoaltocusto/autocusto-deploy/stage-'+rid+'/login.corrected.html'
source=r'''
import pathlib,hashlib,os
source=pathlib.Path(__STAGE__);assert hashlib.sha256(source.read_bytes()).hexdigest()==__HASH__
for target in [pathlib.Path('/var/www/autocusto-releases')/__RID__/'login.html',pathlib.Path('/opt/autocusto/releases')/__RID__/'frontend/login.html']:
 assert target.is_file() and not target.is_symlink()
 old=target.read_text(encoding='utf-8-sig');new=source.read_text(encoding='utf-8-sig')
 assert new==old.replace('Esta plataforma utiliza autenticação oficial do GOV.BR.','Acesse com o CPF e a senha cadastrados neste sistema.'),'Only the reviewed statement may change'
 temporary=target.with_name('.login-correction-'+__RID__)
 with temporary.open('xb') as file:file.write(source.read_bytes());file.flush();os.fsync(file.fileno())
 temporary.chmod(0o644);os.chown(temporary,0,0);os.replace(temporary,target)
print('LOGIN_AUTHENTICATION_DESCRIPTION_CORRECTED; NO_API_RESTART; NO_DATABASE_WRITES',flush=True)
'''.replace('__STAGE__',repr(stage)).replace('__HASH__',repr(digest)).replace('__RID__',repr(rid))
client=paramiko.SSHClient();client.load_host_keys(str(root/'tests/.build/azure/known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
password=getpass.getpass('Senha SSH (oculta): ')
try:
 client.connect('102.37.16.34',username='projetoaltocusto',password=password,timeout=12,allow_agent=False,look_for_keys=False,compress=True)
 del password
 with client.open_sftp() as sftp:sftp.put(str(local),stage);sftp.chmod(stage,0o600)
 command='sudo -n python3 -c '+shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(source.encode()).decode())+'))')
 _,stdout,stderr=client.exec_command(command,timeout=45)
 print(stdout.read().decode('utf-8','replace'),end='');error=stderr.read().decode('utf-8','replace');code=stdout.channel.recv_exit_status()
 if error:print('LOGIN_COPY_UPDATE_ERROR='+error.strip().splitlines()[-1].split(':')[0],file=sys.stderr)
 raise SystemExit(code)
finally:client.close()
