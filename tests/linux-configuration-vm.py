"""Run only fake configuration scenarios in a private disposable VM folder."""
import pathlib,sys,getpass,uuid,base64,shlex,json
root=pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'tests/.build/deploy/py-libs'))
import paramiko
run_id=uuid.uuid4().hex
remote_root='/home/projetoaltocusto/autocusto-deploy/config-test-'+run_id
source='''
import pathlib,tempfile,os,subprocess,json,shutil
root=pathlib.Path(TESTROOT)
assert root.parent==pathlib.Path('/home/projetoaltocusto/autocusto-deploy') and root.name.startswith('config-test-')
key='chave-ficticia-exclusiva-do-teste-linux-nao-producao-2026'
config=root/'config-acentuação.ini'
config.write_text('[Seguranca]\\nJwtSecret='+key+'\\n',encoding='utf-8')
exe=str(root/'LinuxConfigurationProbe')
base=os.environ.copy()
for name in ['AUTO_CUSTO_CONFIG','AUTO_CUSTO_JWT_SECRET','LOCALAPPDATA']:base.pop(name,None)
cases=[
 ('caminho POSIX absoluto',{'AUTO_CUSTO_CONFIG':str(config)},0,str(config)),
 ('padrão Linux',{'AUTO_CUSTO_JWT_SECRET':key},0,'/etc/autocusto/config.ini'),
 ('Linux ignora LOCALAPPDATA',{'LOCALAPPDATA':'/tmp/nao-usar','AUTO_CUSTO_JWT_SECRET':key},0,'/etc/autocusto/config.ini'),
 ('relativo recusado',{'AUTO_CUSTO_CONFIG':'relativo.ini','AUTO_CUSTO_JWT_SECRET':key},1,'CONFIG_ERROR='),
 ('caminho Windows recusado',{'AUTO_CUSTO_CONFIG':'C:\\\\Temp\\\\config.ini','AUTO_CUSTO_JWT_SECRET':key},1,'CONFIG_ERROR='),
 ('arquivo ausente',{'AUTO_CUSTO_CONFIG':str(root/'ausente.ini')},1,'CONFIG_ERROR='),
 ('chave curta recusada',{'AUTO_CUSTO_CONFIG':str(config),'AUTO_CUSTO_JWT_SECRET':'curta'},1,'CONFIG_ERROR='),
 ('chave variável prioritária',{'AUTO_CUSTO_CONFIG':str(root/'ausente.ini'),'AUTO_CUSTO_JWT_SECRET':key},0,'JWT_OK')]
passed=failed=0
try:
 for name,patch,code,expected in cases:
  env=base.copy();env.update(patch)
  result=subprocess.run([exe],env=env,capture_output=True,text=True,timeout=8)
  ok=result.returncode==code and expected in result.stdout and key not in result.stdout+result.stderr
  if ok:passed+=1;print('PASS Linux config: '+name)
  else:failed+=1;print('FAIL Linux config: '+name+' code='+str(result.returncode)+' expected='+str(code))
 print(json.dumps({'passed':passed,'failed':failed}))
finally:shutil.rmtree(root)
raise SystemExit(1 if failed else 0)
'''.replace('TESTROOT',repr(remote_root))
client=paramiko.SSHClient();client.load_host_keys(str(root/'tests/.build/azure/known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
password=getpass.getpass('Senha SSH (oculta): ')
try:
 client.connect('102.37.16.34',username='projetoaltocusto',password=password,timeout=12,allow_agent=False,look_for_keys=False)
 del password
 with client.open_sftp() as sftp:
  sftp.mkdir(remote_root,0o700)
  sftp.put(str(root/'tests/.build/deploy/LinuxConfigurationProbe'),remote_root+'/LinuxConfigurationProbe')
  sftp.chmod(remote_root+'/LinuxConfigurationProbe',0o700)
 command='python3 -c '+shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(source.encode()).decode())+'))')
 _,stdout,stderr=client.exec_command(command,timeout=100)
 out=stdout.read().decode('utf-8','replace');err=stderr.read().decode('utf-8','replace');code=stdout.channel.recv_exit_status()
 print(out,end='');print(err,end='',file=sys.stderr)
 raise SystemExit(code)
finally:client.close()
