"""Run the published UI/API against exclusive fixtures, always attempting scoped cleanup."""
import base64
import getpass
import hashlib
import json
import os
import pathlib
import secrets
import shlex
import subprocess
import sys
import re
from azure_e2e_remote import cleanup_report,validate_plan

ROOT=pathlib.Path(__file__).resolve().parent.parent
NODE=pathlib.Path(r'C:\Users\EBT\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
sys.path.insert(0,str(ROOT/'tests/.build/deploy/py-libs'))
import paramiko

for command in [[sys.executable,'-X','utf8',str(ROOT/'tests/test_azure_e2e_safety.py')],
                [str(NODE),str(ROOT/'tests/azure-e2e-write-scope-test.mjs')]]:
    result=subprocess.run(command,capture_output=True,text=True)
    if result.returncode:raise SystemExit('Local safety tests failed; no network writes started.')
print('LOCAL_SAFETY_CHECKS_OK',flush=True)

if sys.argv[1:]:
    if len(sys.argv)!=3 or sys.argv[1]!='--cleanup-run' or not re.fullmatch(r'20261031-[a-f0-9]{12}',sys.argv[2]):
        raise SystemExit('Only --cleanup-run <owned run id> is supported.')
    recovery_id=sys.argv[2]
    recovery_output=ROOT/'tests/.build/azure-e2e'/recovery_id
    recovery_plan=json.loads((recovery_output/'plan.json').read_text())
    validate_plan(recovery_plan)
    assert recovery_plan['runId']==recovery_id
    recovery_release=json.loads((ROOT/'tests/.build/deploy-domain/release.json').read_text())
    recovery_config='/etc/autocusto/releases/'+recovery_release['releaseId']+'.ini'
    recovery_source=r'''
import pathlib,json,os,subprocess
folder=pathlib.Path('/var/lib/autocusto-e2e')/__RUN_ID__
assert folder.resolve()==folder and not folder.is_symlink()
plan=json.loads((folder/'plan.json').read_text())
expected=__PLAN__
assert all(plan[key]==expected[key] for key in ['runId','marker','actors','medicineName'])
assert 'baseline' in plan
env=os.environ.copy()
for key in ['SSL_CERT_FILE','SSL_CERT_DIR','AUTO_CUSTO_JWT_SECRET']:env.pop(key,None)
env['AUTO_CUSTO_CONFIG']=__CONFIG__;env['AUTO_CUSTO_E2E_PLAN']=str(folder/'plan.json')
result=subprocess.run(['runuser','-u','autocusto','--','/var/lib/autocusto-e2e/runtime/bin/python','-u',str(folder/'azure_e2e_remote.py'),'--cleanup-only'],env=env,capture_output=True,text=True,timeout=120)
if result.returncode:raise RuntimeError('Scoped cleanup requires inspection of private plan.')
print(result.stdout.strip())
'''.replace('__RUN_ID__',repr(recovery_id)).replace('__PLAN__',repr(recovery_plan)).replace('__CONFIG__',repr(recovery_config))
    recovery_client=paramiko.SSHClient();recovery_client.load_host_keys(str(ROOT/'tests/.build/azure/known_hosts'))
    recovery_client.set_missing_host_key_policy(paramiko.RejectPolicy())
    recovery_password=getpass.getpass('Senha SSH (oculta): ')
    try:
        recovery_client.connect('102.37.16.34',username='projetoaltocusto',password=recovery_password,timeout=15,allow_agent=False,look_for_keys=False)
        del recovery_password
        command='sudo -n python3 -c '+shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(recovery_source.encode()).decode())+'))')
        _,recovery_stdout,recovery_stderr=recovery_client.exec_command(command,timeout=150)
        recovered=json.loads(recovery_stdout.read().decode())
        assert recovery_stdout.channel.recv_exit_status()==0
        (recovery_output/'cleanup-recovery.json').write_text(json.dumps(recovered,indent=2),encoding='utf-8')
        assert recovered['cleanup']['remaining']==0
        print('SCOPED_CLEANUP_RECOVERED; originalDataPreserved='+str(recovered['cleanup']['originalDataPreserved']))
    finally:recovery_client.close()
    raise SystemExit(0)

run_id='20261031-'+secrets.token_hex(6)
marker='AUTOCUSTO_E2E_'+run_id.replace('-','_')
def cpf():
    digits=[0,0,0]+[secrets.randbelow(10) for _ in range(6)]
    for _ in range(2):
        check=sum(a*b for a,b in zip(digits,range(len(digits)+1,1,-1)))*10%11
        digits.append(check if check<10 else 0)
    return ''.join(map(str,digits))
identities=set()
actors=[]
for key,role in [('patient',3),('other',3),('staff',2)]:
    identity=cpf()
    while identity in identities or len(set(identity))==1:identity=cpf()
    identities.add(identity)
    actors.append({'key':key,'cpf':identity,'name':marker+'_'+key,
      'email':key+'.'+run_id[9:]+'@autocusto.invalid','role':role})
plan={'runId':run_id,'marker':marker,'actors':actors,'medicineName':marker+' TESTE NAO SOLICITAR D\'Avila "QA"'}
password='Qa!'+secrets.token_urlsafe(24)
output=ROOT/'tests/.build/azure-e2e'/run_id
output.mkdir(parents=True,exist_ok=False)
(output/'plan.json').write_text(json.dumps(plan,indent=2),encoding='utf-8')
release=json.loads((ROOT/'tests/.build/deploy-domain/release.json').read_text())
expected_config='/etc/autocusto/releases/'+release['releaseId']+'.ini'
source=(ROOT/'tests/azure_e2e_remote.py').read_bytes()
stage='/home/projetoaltocusto/autocusto-e2e-upload-'+run_id
remote_folder='/var/lib/autocusto-e2e/'+run_id
bootstrap=r'''
import os,pathlib,subprocess,json,sys,shutil,hashlib,configparser
stage=pathlib.Path(__STAGE__);folder=pathlib.Path(__FOLDER__)
assert stage.parent==pathlib.Path('/home/projetoaltocusto') and stage.name==__STAGE_NAME__
assert stage.resolve()==stage and not stage.is_symlink()
assert folder.parent==pathlib.Path('/var/lib/autocusto-e2e') and folder.name==__RUN_ID__
assert not folder.exists()
pid=subprocess.run(['systemctl','show','autocusto.service','-p','MainPID','--value'],capture_output=True,text=True,check=True).stdout.strip()
env=dict(part.split(b'=',1) for part in pathlib.Path('/proc',pid,'environ').read_bytes().split(b'\0') if b'=' in part)
assert env[b'AUTO_CUSTO_CONFIG'].decode()==__CONFIG__
cfg=configparser.RawConfigParser();cfg.read(__CONFIG__,encoding='utf-8')
assert cfg['Base']['Servidor']=='db-altocusto.database.windows.net' and cfg['Base']['Banco']=='db-altocusto'
assert cfg['Base']['ConfiarCertificadoServidor']=='0'
assert hashlib.sha256((stage/'azure_e2e_remote.py').read_bytes()).hexdigest()==__SOURCE_HASH__
base=folder.parent
subprocess.run(['install','-d','-o','root','-g','autocusto','-m','0750',str(base)],check=True,capture_output=True)
runtime=base/'runtime'
if not (runtime/'bin/python').is_file():
 subprocess.run(['python3','-m','venv',str(runtime)],check=True,capture_output=True,timeout=60)
 subprocess.run([str(runtime/'bin/python'),'-m','pip','install','--disable-pip-version-check','--only-binary=:all:','pyodbc==5.3.0'],check=True,capture_output=True,timeout=180)
subprocess.run(['install','-d','-o','autocusto','-g','autocusto','-m','0700',str(folder)],check=True,capture_output=True)
for name in ['azure_e2e_remote.py','plan.json']:
 subprocess.run(['install','-o','autocusto','-g','autocusto','-m','0600',str(stage/name),str(folder/name)],check=True,capture_output=True)
shutil.rmtree(stage)
child_env=os.environ.copy()
for key in ['SSL_CERT_FILE','SSL_CERT_DIR','AUTO_CUSTO_JWT_SECRET']:child_env.pop(key,None)
child_env['AUTO_CUSTO_CONFIG']=__CONFIG__;child_env['AUTO_CUSTO_E2E_PLAN']=str(folder/'plan.json')
result=subprocess.run(['runuser','-u','autocusto','--',str(runtime/'bin/python'),'-u',str(folder/'azure_e2e_remote.py')],env=child_env,stdin=sys.stdin,stdout=sys.stdout,stderr=subprocess.DEVNULL)
raise SystemExit(result.returncode)
'''
for name,value in {'__STAGE__':stage,'__FOLDER__':remote_folder,'__STAGE_NAME__':pathlib.PurePosixPath(stage).name,
 '__RUN_ID__':run_id,'__CONFIG__':expected_config,'__SOURCE_HASH__':hashlib.sha256(source).hexdigest()}.items():
    bootstrap=bootstrap.replace(name,repr(value))

client=paramiko.SSHClient()
client.load_host_keys(str(ROOT/'tests/.build/azure/known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh_password=getpass.getpass('Senha SSH (oculta): ')
remote_in=remote_out=None
preflight_ok=False
child=None
final_code=1
cleanup_result=None
def database(operation, identity='supervisor'):
    remote_in.write(json.dumps({'id':identity,'operation':operation})+'\n');remote_in.flush()
    line=remote_out.readline()
    if not line:raise RuntimeError('Private SQL helper disconnected.')
    reply=json.loads(line)
    if not reply.get('ok'):raise RuntimeError(reply.get('error','DatabaseCheckFailed')+': '+reply.get('reason',''))
    return reply['result']

try:
    client.connect('102.37.16.34',username='projetoaltocusto',password=ssh_password,timeout=15,allow_agent=False,look_for_keys=False)
    del ssh_password
    with client.open_sftp() as sftp:
        sftp.mkdir(stage,mode=0o700)
        for name,content in [('azure_e2e_remote.py',source),('plan.json',json.dumps(plan).encode())]:
            with sftp.open(stage+'/'+name,'wx') as file:
                file.chmod(0o600);file.write(content)
    command='sudo -n python3 -c '+shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(bootstrap.encode()).decode())+'))')
    remote_in,remote_out,remote_err=client.exec_command(command,timeout=300)
    ready_line=remote_out.readline()
    if not ready_line:raise RuntimeError('Private helper did not start.')
    ready=json.loads(ready_line)
    if not ready.get('ready'):raise RuntimeError('Private database connection did not pass: '+ready.get('error','Unknown'))
    initial=database('preflight')
    preflight_ok=True
    (output/'preflight.json').write_text(json.dumps(initial,indent=2),encoding='utf-8')
    print('AZURE_PREFLIGHT_OK: exclusive identifiers, no enabled triggers, original data signatures recorded.',flush=True)
    environment=os.environ.copy();environment['AUTO_CUSTO_E2E_OUTPUT']=str(output)
    child=subprocess.Popen([str(NODE),str(ROOT/'tests/azure-e2e.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,
      stderr=subprocess.PIPE,text=True,encoding='utf-8',bufsize=1,env=environment)
    child.stdin.write(json.dumps({'type':'bootstrap','plan':plan,'password':password})+'\n');child.stdin.flush()
    del password
    for line in child.stdout:
        message=json.loads(line)
        if message.get('type')=='db':
            try:
                result=database(message['operation'],message['id'])
                if message['operation']=='cleanup':cleanup_result=result
                reply={'id':message['id'],'ok':True,'result':result}
            except Exception as error:
                reply={'id':message['id'],'ok':False,'error':str(error)}
            child.stdin.write(json.dumps(reply)+'\n');child.stdin.flush()
        elif message.get('type')=='log':print(message['message'],flush=True)
    final_code=child.wait(timeout=30)
    if final_code and not (output/'results.json').exists():
        print('BROWSER_RUNNER_FAILED_BEFORE_REPORT',flush=True)
except Exception as error:
    print('E2E_RUN_ERROR='+type(error).__name__+': '+str(error),flush=True)
    final_code=1
finally:
    if child and child.poll() is None:
        child.terminate();child.wait(timeout=15)
    if preflight_ok:
        try:
            confirmation=database('cleanup','final-cleanup')
            cleanup_result=cleanup_report(cleanup_result,confirmation)
            (output/'cleanup.json').write_text(json.dumps(cleanup_result,indent=2),encoding='utf-8')
            if confirmation['remaining']!=0 or not confirmation['originalDataPreserved']:final_code=1
            print('FINAL_CLEANUP: remaining='+str(confirmation['remaining'])+'; originalDataPreserved='+str(confirmation['originalDataPreserved']),flush=True)
        except Exception as error:
            final_code=1
            (output/'cleanup-error.json').write_text(json.dumps({'error':type(error).__name__,'reason':str(error),'remotePlan':remote_folder+'/plan.json'}),encoding='utf-8')
            print('CLEANUP_REQUIRES_ATTENTION='+type(error).__name__+': '+str(error),flush=True)
    if remote_in:
        try:remote_in.channel.shutdown_write()
        except Exception:pass
    client.close()
    (output/'summary.json').write_text(json.dumps({'runId':run_id,'exitCode':final_code,'preflightPassed':preflight_ok,
      'cleanupConfirmed':bool(cleanup_result and cleanup_result.get('remaining')==0 and cleanup_result.get('originalDataPreserved'))},indent=2),encoding='utf-8')
    print('EVIDENCE_DIRECTORY='+str(output),flush=True)
raise SystemExit(final_code)
