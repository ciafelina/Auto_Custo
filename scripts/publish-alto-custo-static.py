"""Publish only the Alto Custo frontend/nginx. API and Azure INI remain untouched."""
import argparse
import base64
import getpass
import hashlib
import io
import json
import pathlib
import secrets
import shlex
import subprocess
import sys
import tarfile

ROOT=pathlib.Path(__file__).resolve().parent.parent
OUTPUT=ROOT/'tests/.build/alto-custo-publication'
OUTPUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'scripts'))
from alto_custo_static_remote import validate_files

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('action',choices=['activate','status','rollback','renewal-test'])
args=parser.parse_args()
action=args.action
module=ROOT/'scripts/alto_custo_static_remote.py'
dependency=ROOT/'scripts/autocusto_domain_remote.py'
manifest_path=OUTPUT/'release.json'
if action=='activate':
    native=json.loads((OUTPUT/'native-tests.json').read_text())
    assert native['allTenPassed'] and native['nativeLinux'] and native['exitCode']==0
    assert native['moduleHash']==hashlib.sha256(module.read_bytes()).hexdigest(),'Repeat the native Linux tests after changing the publisher.'
    assert subprocess.run(['git','diff','--quiet','HEAD','--','Front_End'],cwd=ROOT).returncode==0,'Commit the validated frontend before publishing.'
    frontend=ROOT/'Front_End'
    tracked=subprocess.check_output(['git','ls-files','-z','--','Front_End'],cwd=ROOT).decode().split('\0')
    files={}
    for name in filter(None,tracked):
        path=ROOT/name
        assert path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(frontend.resolve())
        files[path.relative_to(frontend).as_posix()]=path.read_bytes()
    files['config.js']=b"globalThis.AUTO_CUSTO_CONFIG = {apiBaseUrl: location.origin + '/api'};\n"
    manifest={'releaseId':'20261031-'+secrets.token_hex(6),
              'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip(),
              'files':{name:hashlib.sha256(body).hexdigest() for name,body in sorted(files.items())}}
    validate_files(files,manifest)
    with tarfile.open(OUTPUT/'frontend.tar.gz','w:gz') as archive:
        for name,body in sorted(files.items()):
            entry=tarfile.TarInfo(name);entry.size=len(body);entry.mode=0o644
            archive.addfile(entry,io.BytesIO(body))
    manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf-8')

sys.path.insert(0,str(ROOT/'tests/.build/deploy/py-libs'))
import paramiko

ident='20261031-'+secrets.token_hex(6)
stage='/home/projetoaltocusto/alto-custo-static-'+ident
uploads=[module,dependency]
if action=='activate':uploads += [OUTPUT/'frontend.tar.gz',manifest_path]
hashes={path.name:hashlib.sha256(path.read_bytes()).hexdigest() for path in uploads}
source=r'''
import configparser,hashlib,http.client,importlib.util,json,os,pathlib,re,shlex,shutil,signal,socket,ssl,subprocess,sys,time
stage=pathlib.Path(__STAGE__);hashes=__HASHES__;action=__ACTION__
assert stage.parent==pathlib.Path('/home/projetoaltocusto') and re.fullmatch(r'alto-custo-static-20261031-[a-f0-9]{12}',stage.name)
assert stage.resolve()==stage and not stage.is_symlink()
base=pathlib.Path('/var/lib/autocusto-branding');base.mkdir(parents=True,mode=0o700,exist_ok=True)
assert base.resolve()==base
scratch=base/('exec-'+stage.name);assert not scratch.exists();scratch.mkdir(mode=0o700)
def interrupted(*_):raise RuntimeError('Static publication interrupted.')
signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGHUP,interrupted)
def invoke(argv,must=True,timeout=40):
    result=subprocess.run(argv,capture_output=True,text=True,timeout=timeout)
    if must and result.returncode:raise RuntimeError('Publication command failed: '+argv[0])
    return result.stdout.strip()
def observe():
    pid=invoke(['systemctl','show','autocusto.service','-p','MainPID','--value'])
    assert pid.isdigit() and int(pid)>0
    executable=pathlib.Path(os.readlink('/proc/'+pid+'/exe'))
    assert str(executable).startswith('/opt/autocusto/releases/')
    environment=invoke(['systemctl','show','autocusto.service','-p','Environment','--value'])
    variables=dict(v.split('=',1) for v in shlex.split(environment) if '=' in v)
    ini=pathlib.Path(variables['AUTO_CUSTO_CONFIG'])
    assert ini.is_file() and str(ini).startswith('/etc/autocusto/')
    config=configparser.ConfigParser(interpolation=None);config.read(ini,encoding='utf-8-sig')
    def value(key):return config['Base'][key].strip().strip('"\'')
    assert value('Servidor')=='db-altocusto.database.windows.net' and value('Banco')=='db-altocusto'
    assert not config.getboolean('Base','ConfiarCertificadoServidor',fallback=False)
    return {'pid':pid,'executable':str(executable),'binaryHash':hashlib.sha256(executable.read_bytes()).hexdigest(),
            'configPath':str(ini),'configHash':hashlib.sha256(ini.read_bytes()).hexdigest()}
def get(domain,path):
    connection=http.client.HTTPSConnection(domain,context=ssl.create_default_context(),timeout=10)
    connection._create_connection=lambda *a,**k:socket.create_connection(('127.0.0.1',443),timeout=10)
    try:
        connection.request('GET',path);response=connection.getresponse();return response.status,response.read()
    finally:connection.close()
try:
    for name,digest in hashes.items():
        item=stage/name
        assert item.is_file() and not item.is_symlink() and hashlib.sha256(item.read_bytes()).hexdigest()==digest
        shutil.copyfile(item,scratch/name)
    sys.path.insert(0,str(scratch))
    import alto_custo_static_remote as publisher
    paths=publisher.Paths()
    active_file=base/'active-static.json'
    def verify(public,files):
        for attempt in range(20):
            try:
                proofs=sorted(pathlib.Path('/var/www/autocusto-verification').glob('google*.html'))
                assert proofs
                for domain in publisher.DOMAINS:
                    for name,body in files.items():
                        status,actual=get(domain,'/'+name)
                        if status!=200 or actual!=body:raise RuntimeError('Published file differs from manifest.')
                    status,body=get(domain,'/api/produtos')
                    if status!=401 or json.loads(body).get('sucesso') is not False:raise RuntimeError('Private API route is not protected.')
                    for proof in proofs:
                        assert proof.is_file() and not proof.is_symlink()
                        status,body=get(domain,'/'+proof.name)
                        if status!=200 or body!=proof.read_bytes():raise RuntimeError('Persistent Google verification was lost.')
                return {'hostsVerified':2,'filesVerified':len(files)*2,'googleProofsVerified':len(proofs)*2,'apiAuthentication':True}
            except (RuntimeError,ssl.SSLError,OSError):
                if attempt==19:raise
                time.sleep(.5)
    if action=='activate':
        manifest=json.loads((scratch/'release.json').read_text())
        files=publisher.load_bundle(scratch/'frontend.tar.gz',manifest)
        result=publisher.activate(paths,manifest,files,invoke=invoke,verify=verify,observe=observe)
        publisher.write(active_file,json.dumps({'manifest':manifest,'result':result}).encode(),0o600)
        result['azureConfigurationPreserved']=True
    elif action=='rollback':
        active=json.loads(active_file.read_text());assert not active.get('rolledBack')
        manifest=active['manifest'];publisher.validate_manifest(manifest)
        public=paths.public/manifest['releaseId']
        assert ('root '+str(public)+';') in paths.old_config.read_text() and ('root '+str(public)+';') in paths.new_config.read_text()
        backup=paths.backups/('static-'+manifest['releaseId'])
        assert backup.resolve().parent==paths.backups.resolve()
        state=json.loads((backup/'state.json').read_text())
        before=observe();publisher.restore(paths,state,invoke)
        assert observe()==before
        active['rolledBack']=True;publisher.write(active_file,json.dumps(active).encode(),0o600)
        result={'staticRollbackComplete':True,'apiStatePreserved':True,'azureConfigurationPreserved':True}
    elif action=='renewal-test':
        before=observe()
        invoke(['/opt/autocusto-certbot/bin/certbot','renew','--cert-name','altocusto-domain','--dry-run','--run-deploy-hooks'],timeout=240)
        assert observe()==before
        result={'renewalDryRun':True,'apiStatePreserved':True,'timerActive':invoke(['systemctl','is-active',publisher.TIMER])=='active'}
    else:
        before=observe()
        result={'apiActive':True,'azureConfigurationStrict':True,
                'newTimerEnabled':invoke(['systemctl','is-enabled',publisher.TIMER],must=False),
                'newTimerActive':invoke(['systemctl','is-active',publisher.TIMER],must=False),
                'activeRelease':json.loads(active_file.read_text())['manifest']['releaseId'] if active_file.exists() else None}
    print(json.dumps(result),flush=True)
finally:
    assert scratch.resolve().parent==base.resolve() and scratch.name=='exec-'+stage.name
    shutil.rmtree(scratch)
    assert stage.resolve().parent==pathlib.Path('/home/projetoaltocusto')
    shutil.rmtree(stage)
'''.replace('__STAGE__',repr(stage)).replace('__HASHES__',repr(hashes)).replace('__ACTION__',repr(action))
compile(source,'<static-publication-remote>','exec')

client=paramiko.SSHClient()
client.load_host_keys(str(ROOT/'tests/.build/azure/known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
password=getpass.getpass('Senha SSH (oculta): ')
try:
    client.connect('102.37.16.34',username='projetoaltocusto',password=password,timeout=15,allow_agent=False,look_for_keys=False)
    del password
    with client.open_sftp() as sftp:
        sftp.mkdir(stage,mode=0o700)
        for path in uploads:
            sftp.put(str(path),stage+'/'+path.name);sftp.chmod(stage+'/'+path.name,0o600)
    command='sudo -n python3 -c '+shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(source.encode()).decode())+'))')
    _,stdout,stderr=client.exec_command(command,timeout=300)
    text=stdout.read().decode('utf-8');code=stdout.channel.recv_exit_status()
    if code:
        error=stderr.read().decode('utf-8',errors='replace').splitlines()
        print('STATIC_PUBLICATION_FAILED_TYPE='+(error[-1].split(':')[0] if error else 'Unknown'))
        raise SystemExit(code)
    result=json.loads(text)
    (OUTPUT/(action+'.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2))
finally:client.close()
