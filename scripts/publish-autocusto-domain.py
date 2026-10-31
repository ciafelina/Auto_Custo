"""Publish only AutoCusto to its chosen VM, domain and Azure database."""
import base64
import configparser
import getpass
import hashlib
import io
import json
import os
import pathlib
import re
import secrets
import shlex
import sys
import tarfile
from autocusto_domain_remote import validate_evidence

ROOT=pathlib.Path(__file__).resolve().parent.parent
OUTPUT=ROOT/'tests/.build/deploy-domain'
OUTPUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tests/.build/deploy/py-libs'))
import paramiko

if len(sys.argv)!=2 or sys.argv[1] not in ('prepare','activate','rollback','status','check-renewal'):
    raise SystemExit('Choose prepare, activate, rollback, status or check-renewal.')
action=sys.argv[1]
manifest_path=OUTPUT/'release.json'
if action in ('prepare','activate'):
    recovery=json.loads((OUTPUT/'recovery.json').read_text())
    assert recovery['exitCode']==0 and recovery['nativeLinux'] and recovery['testCount']>=6
    assert recovery['moduleHash']==hashlib.sha256((ROOT/'scripts/autocusto_domain_remote.py').read_bytes()).hexdigest(), 'Run native recovery tests after any deployment change.'
if action=='prepare':
    probe=json.loads((OUTPUT/'probe.json').read_text())
    tls=json.loads((OUTPUT/'tls.json').read_text())
    validate_evidence(probe,tls)
    binary=ROOT/'tests/.build/deploy/ProjetoFaculdade'
    binary_hash=hashlib.sha256(binary.read_bytes()).hexdigest()
    public={}
    for file in sorted((ROOT/'Front_End').rglob('*')):
        if file.is_file() and not file.is_symlink() and file.suffix.lower() in {'.html','.js','.css','.svg','.png','.jpg','.jpeg','.ico','.woff','.woff2','.webp'}:
            relative=file.relative_to(ROOT/'Front_End').as_posix()
            public[relative]=file.read_bytes()
    public['config.js']=b"globalThis.AUTO_CUSTO_CONFIG = Object.freeze({apiBaseUrl: location.origin + '/api'});\n"
    hashes={name:hashlib.sha256(content).hexdigest() for name,content in public.items()}
    rid='20261031-'+hashlib.sha256(json.dumps({'api':binary_hash,'frontend':hashes},sort_keys=True).encode()).hexdigest()[:12]
    schema=json.loads((ROOT/'tests/.build/sqlserver/schema.json').read_text(encoding='utf-8-sig'))
    definition=next(s for s in schema['batches'] if 'CREATE PROCEDURE sp_ObterDashboardPaciente' in s)
    definition=re.sub(r'/\*[\s\S]*?\*/|--[^\r\n]*','',definition)
    definition=definition.replace('[','').replace(']','').lower().replace('dbo.','')
    procedure_hash=hashlib.sha256(re.sub(r'\s+','',definition).encode()).hexdigest()
    manifest={'releaseId':rid,'release':'/opt/autocusto/releases/'+rid,
              'public':'/var/www/autocusto-releases/'+rid,'binaryHash':binary_hash,'files':hashes,
              'domain':'autocusto.duckdns.org','database':'db-altocusto',
              'databaseProbe':probe,'tls':tls,'procedureHash':procedure_hash}
    manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    archive=OUTPUT/'frontend.tar.gz'
    with tarfile.open(archive,'w:gz') as tar:
        for name,content in public.items():
            member=tarfile.TarInfo(name);member.size=len(content);member.mode=0o644
            tar.addfile(member,io.BytesIO(content))
else:
    manifest=json.loads(manifest_path.read_text())

assert re.fullmatch(r'20261031-[a-f0-9]{12}',manifest['releaseId'])
client=paramiko.SSHClient()
client.load_host_keys(str(ROOT/'tests/.build/azure/known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
password=getpass.getpass('Senha SSH (oculta): ')
try:
    client.connect('102.37.16.34',username='projetoaltocusto',password=password,timeout=15,allow_agent=False,look_for_keys=False)
    del password
    stage=None
    if action=='prepare':
        cfg=configparser.RawConfigParser();cfg.optionxform=str
        external=pathlib.Path(os.environ['LOCALAPPDATA'])/'AutoCusto/config.azure.ini'
        assert cfg.read(external,encoding='utf-8-sig')
        for field in ['Servidor','Porta','Banco','Usuario','Senha']:
            value=cfg['Base'].get(field,'').strip()
            if len(value)>=2 and value[0]==value[-1] and value[0] in ('"',"'"):value=value[1:-1]
            assert value
            cfg['Base'][field]=value
        assert cfg['Base']['Servidor']=='db-altocusto.database.windows.net' and cfg['Base']['Banco']=='db-altocusto'
        cfg['Base']['NomeCertificadoServidor']='';cfg['Base']['ConfiarCertificadoServidor']='0'
        cfg['Seguranca']['JwtSecret']=secrets.token_urlsafe(48)
        stream=io.StringIO();cfg.write(stream,space_around_delimiters=False)
        config_bytes=stream.getvalue().encode('utf-8');stream.close();cfg.clear()
        stage='/home/projetoaltocusto/autocusto-domain-stage-'+manifest['releaseId']
        with client.open_sftp() as sftp:
            try:sftp.mkdir(stage,mode=0o700)
            except IOError:sftp.stat(stage)
            sftp.chmod(stage,0o700)
            with sftp.open(stage+'/config.ini','w') as f:
                f.chmod(0o600);f.write(config_bytes)
            del config_bytes
            for name,path in [('ProjetoFaculdade',binary),('LinuxDatabaseProbe',ROOT/'tests/.build/deploy/LinuxDatabaseProbe'),('frontend.tar.gz',archive)]:
                sftp.put(str(path),stage+'/'+name);sftp.chmod(stage+'/'+name,0o600)
    remote=(ROOT/'scripts/autocusto_domain_remote.py').read_text(encoding='utf-8')
    remote+='\nmain('+repr(manifest)+','+repr(action)+','+repr(stage)+')\n'
    command='sudo -n python3 -c '+shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(remote.encode()).decode())+'))')
    _,stdout,stderr=client.exec_command(command,timeout=600)
    for line in stdout:print(line,end='',flush=True)
    code=stdout.channel.recv_exit_status()
    if code:
        lines=stderr.read().decode('utf-8','replace').strip().splitlines()
        print('DOMAIN_PUBLISH_ERROR_TYPE='+(lines[-1].split(':')[0] if lines else 'Unknown'))
    (OUTPUT/('publish-'+action+'.json')).write_text(json.dumps({'action':action,'exitCode':code}),encoding='utf-8')
    raise SystemExit(code)
finally:
    client.close()
