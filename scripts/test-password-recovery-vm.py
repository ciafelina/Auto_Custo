"""Stage and test the candidate without switching the public API or frontend."""
import base64, configparser, getpass, hashlib, json, pathlib, secrets, shlex, sys
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'tests/.build/password-recovery-release';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tests/.build/deploy/py-libs'))
import paramiko
smtp_only=sys.argv[1:]==['--smtp-only']
functional_only=sys.argv[1:]==['--functional-only']
if sys.argv[1:] and not smtp_only and not functional_only:raise SystemExit('Use no arguments, --functional-only, or --smtp-only.')
previous=json.loads((OUT/'manifest.json').read_text()) if smtp_only else None
rid=previous['releaseId'] if smtp_only else '20261031-'+secrets.token_hex(6)
stage='/home/projetoaltocusto/recovery-stage-'+rid
localmail=pathlib.Path('C:/Users/EBT/AppData/Local/AutoCusto/email.ini')
c=configparser.ConfigParser(interpolation=None);c.read(localmail,encoding='utf-8-sig')
assert c['SMTP']['Servidor']=='smtp.gmail.com' and c['SMTP']['Porta']=='465'
assert c['SMTP']['Usuario']==c['SMTP']['Remetente'] and len(c['SMTP']['Senha'])==16
uploads={
 'ProjetoFaculdade':ROOT/'tests/.build/deploy/ProjetoFaculdade',
 'EmailRecoveryProbe':ROOT/'tests/.build/deploy/EmailRecoveryProbe',
 'password_recovery_native.py':ROOT/'scripts/password_recovery_native.py',
 'migration.sql':ROOT/'scripts/sql/recuperacao-senha.sql',
 'email.ini':localmail,
}
if smtp_only:uploads={'email.ini':localmail}
contents={name:path.read_bytes() for name,path in uploads.items()}
manifest=previous if smtp_only else {'releaseId':rid,'hashes':{n:hashlib.sha256(body).hexdigest() for n,body in contents.items() if n!='email.ini'}}
ssh=paramiko.SSHClient();ssh.load_host_keys(str(ROOT/'tests/.build/azure/known_hosts'));ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
password=getpass.getpass('Senha SSH (oculta): ')
try:
 ssh.connect('102.37.16.34',username='projetoaltocusto',password=password,timeout=15,allow_agent=False,look_for_keys=False);del password
 if smtp_only:stage+='-smtp-'+secrets.token_hex(4)
 sftp=ssh.open_sftp();sftp.mkdir(stage,mode=0o700)
 for name,body in contents.items():
  with sftp.open(stage+'/'+name,'wb') as stream:
   stream.set_pipelined(True);stream.write(body)
  sftp.chmod(stage+'/'+name,0o600)
 sftp.close()
 source=r'''
import configparser,grp,hashlib,importlib.util,json,os,pathlib,shlex,shutil,subprocess,sys
stage=pathlib.Path(__STAGE__);rid=__RID__;manifest=__MANIFEST__
assert stage.resolve()==stage and not stage.is_symlink() and stage.parent==pathlib.Path('/home/projetoaltocusto')
base=pathlib.Path('/var/lib/autocusto-recovery');base.mkdir(mode=0o750,exist_ok=True);os.chown(base,0,grp.getgrnam('autocusto').gr_gid)
folder=base/rid;assert not folder.exists();folder.mkdir(mode=0o750);os.chown(folder,0,grp.getgrnam('autocusto').gr_gid)
for name,digest in manifest['hashes'].items():
 path=stage/name;assert path.is_file() and not path.is_symlink() and hashlib.sha256(path.read_bytes()).hexdigest()==digest
 shutil.copyfile(path,folder/name);(folder/name).chmod(0o750 if name in ('ProjetoFaculdade','EmailRecoveryProbe') else 0o640);os.chown(folder/name,0,grp.getgrnam('autocusto').gr_gid)
mail=stage/'email.ini';assert mail.is_file() and not mail.is_symlink();shutil.copyfile(mail,folder/'email.ini');(folder/'email.ini').chmod(0o640);os.chown(folder/'email.ini',0,grp.getgrnam('autocusto').gr_gid)
def run(args):return subprocess.run(args,capture_output=True,text=True,check=True,timeout=15).stdout.strip()
def current():
 pid=run(['systemctl','show','autocusto.service','-p','MainPID','--value'])
 binary=pathlib.Path(os.readlink('/proc/'+pid+'/exe'))
 env=dict(part.split('=',1) for part in shlex.split(run(['systemctl','show','autocusto.service','-p','Environment','--value'])) if '=' in part)
 ini=pathlib.Path(env['AUTO_CUSTO_CONFIG']);assert str(ini).startswith('/etc/autocusto/')
 return {'pid':pid,'binary':str(binary),'binaryHash':hashlib.sha256(binary.read_bytes()).hexdigest(),'config':str(ini),'configHash':hashlib.sha256(ini.read_bytes()).hexdigest()}
baseline=current();(folder/'baseline.json').write_text(json.dumps(baseline));(folder/'baseline.json').chmod(0o600)
spec=importlib.util.spec_from_file_location('recovery_native',folder/'password_recovery_native.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
result={'releaseId':rid,'tls':m.transport_tests(folder,folder/'EmailRecoveryProbe')}
result['api']=m.api_tests(folder,folder/'ProjetoFaculdade',pathlib.Path(baseline['config']),folder/'migration.sql')
assert current()==baseline,'The public API changed during the isolated test.'
result['publicApiUnchanged']=True
(folder/'functional-tests.json').write_text(json.dumps(result,indent=2));(folder/'functional-tests.json').chmod(0o600)
if __FUNCTIONAL_ONLY__:print(json.dumps(result));raise SystemExit(0)
mailcfg=m.read_config(folder/'email.ini');destination=mailcfg['SMTP']['Remetente']
env=os.environ.copy();env['AUTO_CUSTO_EMAIL_CONFIG']=str(folder/'email.ini')
probe=subprocess.run(['runuser','-u','autocusto','--',str(folder/'EmailRecoveryProbe'),destination],env=env,capture_output=True,text=True,timeout=35)
result['gmailSmtpAccepted']=probe.returncode==0
assert result['gmailSmtpAccepted'],'Gmail did not accept the test email.'
(folder/'tested.json').write_text(json.dumps(result,indent=2));(folder/'tested.json').chmod(0o600)
print(json.dumps(result))
'''.replace('__STAGE__',repr(stage)).replace('__RID__',repr(rid)).replace('__MANIFEST__',repr(manifest)).replace('__FUNCTIONAL_ONLY__',repr(functional_only))
 runtime='/var/lib/autocusto-e2e/runtime/bin/python'
 if smtp_only:
  source=r'''
import configparser,grp,hashlib,json,os,pathlib,shutil,subprocess
folder=pathlib.Path('/var/lib/autocusto-recovery')/__RID__;stage=pathlib.Path(__STAGE__)
assert folder.resolve()==folder and folder.is_dir() and not folder.is_symlink()
active=folder.parent/'active.json'
if active.exists():assert json.loads(active.read_text())['manifest']['releaseId']!=__RID__,'Do not edit an active release through a test helper.'
probe=folder/'EmailRecoveryProbe';assert hashlib.sha256(probe.read_bytes()).hexdigest()==__PROBE_HASH__
mail=stage/'email.ini';assert mail.is_file() and not mail.is_symlink()
shutil.copyfile(mail,folder/'email.ini');(folder/'email.ini').chmod(0o640);os.chown(folder/'email.ini',0,grp.getgrnam('autocusto').gr_gid)
cfg=configparser.ConfigParser(interpolation=None);cfg.read(folder/'email.ini',encoding='utf-8-sig')
env=os.environ.copy();env['AUTO_CUSTO_EMAIL_CONFIG']=str(folder/'email.ini')
p=subprocess.run(['runuser','-u','autocusto','--',str(probe),cfg['SMTP']['Remetente']],env=env,capture_output=True,text=True,timeout=35)
partial=folder/'functional-tests.json'
result=json.loads(partial.read_text()) if partial.exists() else {'releaseId':__RID__,'needsFunctionalTests':True}
result['gmailSmtpAccepted']=p.returncode==0
if p.returncode==0 and partial.exists():(folder/'tested.json').write_text(json.dumps(result,indent=2));(folder/'tested.json').chmod(0o600)
print(json.dumps(result))
raise SystemExit(0 if p.returncode==0 else 1)
'''.replace('__RID__',repr(rid)).replace('__STAGE__',repr(stage)).replace('__PROBE_HASH__',repr(manifest['hashes']['EmailRecoveryProbe']))
 import textwrap
 source='try:\n'+textwrap.indent(source,' ')+'\nexcept Exception as e:\n import traceback\n print(json.dumps({"errorType":type(e).__name__,"assertion":str(e) if isinstance(e,AssertionError) else "","frames":[{"file":pathlib.Path(f.filename).name,"line":f.lineno} for f in traceback.extract_tb(e.__traceback__)]}))\n raise SystemExit(1)\n'
 command='sudo -n '+runtime+' -c '+shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(source.encode()).decode())+'))')
 _,stdout,stderr=ssh.exec_command(command,timeout=240)
 data=stdout.read().decode();err=stderr.read().decode();code=stdout.channel.recv_exit_status()
 (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
 if code:
  if data.strip():print(data.strip())
  # Traceback deliberately omitted: provider/library messages can contain private data.
  lines=err.strip().splitlines();kind=lines[-1].split(':',1)[0] if lines else 'Unknown'
  print('Focused VM test failed; type='+kind)
  (OUT/'failed-run.json').write_text(json.dumps({'releaseId':rid,'stage':stage,'errorType':kind}))
  raise SystemExit(code)
 result=json.loads(data)
 filename='gmail-probe.json' if result.get('needsFunctionalTests') else ('native-tests.json' if result.get('gmailSmtpAccepted') else 'functional-tests.json')
 (OUT/filename).write_text(json.dumps(result,indent=2))
 print(json.dumps(result,ensure_ascii=False))
finally:ssh.close()
