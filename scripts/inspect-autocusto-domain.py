"""Bounded, read-only checks of the AutoCusto VM and the friend's Azure database."""
import base64
import configparser
import getpass
import io
import hashlib
import json
import os
import pathlib
import secrets
import re
import shlex
import sys
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'tests/.build/deploy-domain'
OUTPUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / 'tests/.build/deploy/py-libs'))
import paramiko

if len(sys.argv) != 2 or sys.argv[1] not in ('inspect', 'probe', 'recovery', 'tls'):
    raise SystemExit('Choose inspect, probe, recovery or tls.')
action = sys.argv[1]
client = paramiko.SSHClient()
client.load_host_keys(str(ROOT / 'tests/.build/azure/known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
password = getpass.getpass('Senha SSH (oculta): ')
try:
    client.connect('102.37.16.34', username='projetoaltocusto', password=password,
                   timeout=15, allow_agent=False, look_for_keys=False)
    del password
    if action == 'inspect':
        source = r'''
import pathlib,subprocess,json,socket,urllib.request,os,hashlib
def query(args):
 r=subprocess.run(args,capture_output=True,text=True,timeout=20)
 return {'code':r.returncode,'output':r.stdout.strip()}
pid=query(['systemctl','show','autocusto.service','-p','MainPID','--value'])['output']
exe=os.readlink('/proc/'+pid+'/exe')
result={'service':query(['systemctl','is-active','autocusto.service']),
 'executable':exe,'binaryHash':hashlib.sha256(pathlib.Path(exe).read_bytes()).hexdigest(),
 'domainIp':socket.gethostbyname('autocusto.duckdns.org'),
 'nginxConfig':pathlib.Path('/etc/nginx/sites-enabled/autocusto').resolve().read_text(),
 'certbot':query(['/opt/autocusto-certbot/bin/certbot','--version']),
 'odbcDrivers':query(['odbcinst','-q','-d'])}
result['domainPreparation']={str(folder):{file.name:file.stat().st_size for file in folder.iterdir() if file.is_file()}
 for pattern in ['/home/projetoaltocusto/autocusto-domain-stage-20261031-*','/opt/autocusto/releases/20261031-*','/var/lib/autocusto-deploy/20261031-*']
 for folder in pathlib.Path('/').glob(pattern.lstrip('/')) if folder.is_dir() and not folder.is_symlink()}
try:
 with urllib.request.urlopen('https://api.ipify.org',timeout=10) as r:result['outboundIp']=r.read(80).decode().strip()
except Exception as e:result['outboundIpError']=type(e).__name__
try:
 with socket.create_connection(('db-altocusto.database.windows.net',1433),timeout=10):result['azureSqlTcp']=True
except Exception as e:result['azureSqlTcp']=False;result['azureSqlTcpError']=type(e).__name__
print(json.dumps(result))
'''
    elif action == 'tls':
        source = r'''
import pathlib,subprocess,tempfile,socket,ssl,http.client,time,json,shutil
base=pathlib.Path('/var/lib/autocusto-probes');folder=pathlib.Path(tempfile.mkdtemp(prefix='domain-tls-20261031-',dir=base))
process=None
try:
 probe=socket.socket();probe.bind(('127.0.0.1',19443));probe.close()
 config=folder/'nginx.conf'
 config.write_text('pid '+str(folder/'nginx.pid')+'; error_log '+str(folder/'error.log')+'; events {} http { access_log off; server { listen 127.0.0.1:19443 ssl; server_name autocusto.duckdns.org; ssl_certificate /etc/letsencrypt/live/autocusto-domain/fullchain.pem; ssl_certificate_key /etc/letsencrypt/live/autocusto-domain/privkey.pem; location / { return 200 "tls-probe-ready"; } } }')
 subprocess.run(['nginx','-t','-c',str(config)],check=True,capture_output=True)
 process=subprocess.Popen(['nginx','-c',str(config),'-g','daemon off; master_process off;'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 for attempt in range(20):
  try:
   with socket.create_connection(('127.0.0.1',19443),timeout=1):break
  except OSError:time.sleep(.1)
 connection=http.client.HTTPSConnection('autocusto.duckdns.org',port=19443,context=ssl.create_default_context(),timeout=8)
 connection._create_connection=lambda *a,**k:socket.create_connection(('127.0.0.1',19443),timeout=8)
 result={}
 try:
  connection.request('GET','/');response=connection.getresponse()
  result['isolatedNginxTlsVerified']=response.status==200 and response.read()==b'tls-probe-ready'
 except ssl.SSLCertVerificationError as e:
  result['isolatedNginxTlsVerified']=False;result['verifyReason']=e.verify_message
 finally:connection.close()
 global_config=pathlib.Path('/etc/nginx/nginx.conf').read_text()
 result['siteIncludes']=[line.strip() for line in global_config.splitlines() if 'include' in line and ('sites-enabled' in line or 'conf.d' in line)]
 result['domainCertificate']=subprocess.run(['openssl','x509','-in','/etc/letsencrypt/live/autocusto-domain/fullchain.pem','-noout','-subject','-issuer','-dates'],capture_output=True,text=True,check=True).stdout.strip()
 print(json.dumps(result))
finally:
 if process is not None:
  process.terminate()
  try:process.wait(timeout=5)
  except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
 assert folder.resolve().parent==base.resolve()
 shutil.rmtree(folder)
'''
    elif action == 'recovery':
        remote_module = (ROOT/'scripts/autocusto_domain_remote.py').read_bytes()
        remote_tests = (ROOT/'tests/test_autocusto_domain_publish.py').read_bytes()
        module_hash = hashlib.sha256(remote_module).hexdigest()
        source = r'''
import pathlib,tempfile,subprocess,shutil,base64,json,re
base=pathlib.Path('/var/lib/autocusto-probes')
assert base.is_dir() and base.resolve()==base
folder=pathlib.Path(tempfile.mkdtemp(prefix='domain-recovery-20261031-',dir=base))
try:
 (folder/'scripts').mkdir();(folder/'tests/.build/deploy-domain').mkdir(parents=True)
 (folder/'scripts/autocusto_domain_remote.py').write_bytes(base64.b64decode(__MODULE__))
 (folder/'tests/test_autocusto_domain_publish.py').write_bytes(base64.b64decode(__TESTS__))
 result=subprocess.run(['python3',str(folder/'tests/test_autocusto_domain_publish.py')],capture_output=True,text=True,timeout=30)
 print(json.dumps({'exitCode':result.returncode,'nativeLinux':True,'moduleHash':__MODULE_HASH__,
  'summary':result.stderr.strip().splitlines()[-3:],'testCount':int(re.search(r'Ran (\d+) tests',result.stderr).group(1)),'productionServiceCalls':False}))
finally:
 assert folder.resolve().parent==base.resolve() and folder.name.startswith('domain-recovery-20261031-')
 shutil.rmtree(folder)
'''.replace('__MODULE__',repr(base64.b64encode(remote_module).decode())).replace('__TESTS__',repr(base64.b64encode(remote_tests).decode())).replace('__MODULE_HASH__',repr(module_hash))
    else:
        cfg = configparser.RawConfigParser()
        cfg.optionxform = str
        external = pathlib.Path(os.environ['LOCALAPPDATA']) / 'AutoCusto/config.azure.ini'
        assert cfg.read(external, encoding='utf-8-sig'), 'Protected Azure configuration not found.'
        for field in ('Servidor', 'Porta', 'Banco', 'Usuario', 'Senha'):
            value = cfg['Base'].get(field, '').strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            assert value, 'Incomplete protected Azure configuration.'
            cfg['Base'][field] = value
        assert cfg['Base']['Servidor'] == 'db-altocusto.database.windows.net'
        assert cfg['Base']['Banco'] == 'db-altocusto'
        assert cfg['Base']['Porta'] == '1433'
        cfg['Base']['ConfiarCertificadoServidor'] = '0'
        cfg['Base']['NomeCertificadoServidor'] = ''
        cfg['Seguranca']['JwtSecret'] = secrets.token_urlsafe(48)
        stream = io.StringIO()
        cfg.write(stream, space_around_delimiters=False)
        configuration = stream.getvalue().encode('utf-8')
        cfg.clear()
        stream.close()
        probe = ROOT / 'tests/.build/deploy/LinuxDatabaseProbe'
        assert probe.is_file(), 'Compile the Linux database probe first.'
        ident = '20261031-' + uuid.uuid4().hex
        schema = json.loads((ROOT / 'tests/.build/sqlserver/schema.json').read_text(encoding='utf-8-sig'))
        definition = next(batch for batch in schema['batches'] if 'CREATE PROCEDURE sp_ObterDashboardPaciente' in batch)
        definition = re.sub(r'/\*[\s\S]*?\*/|--[^\r\n]*', '', definition)
        definition = definition.replace('[', '').replace(']', '').lower().replace('dbo.', '')
        definition = re.sub(r'\s+', '', definition)
        expected_procedure_hash = hashlib.sha256(definition.encode('utf-8')).hexdigest()
        stage = '/home/projetoaltocusto/autocusto-domain-probe-' + ident
        with client.open_sftp() as sftp:
            sftp.mkdir(stage, mode=0o700)
            with sftp.open(stage+'/config.ini', 'wx') as f:
                f.chmod(0o600)
                f.write(configuration)
            del configuration
            sftp.put(str(probe), stage+'/LinuxDatabaseProbe')
            sftp.chmod(stage+'/LinuxDatabaseProbe', 0o700)
        source = r'''
import pathlib,subprocess,shutil,json,os,re,grp,stat
stage=pathlib.Path(__STAGE__)
assert stage.parent==pathlib.Path('/home/projetoaltocusto') and re.fullmatch(r'autocusto-domain-probe-20261031-[a-f0-9]{32}',stage.name)
assert not stage.is_symlink() and stage.resolve()==stage
base=pathlib.Path('/var/lib/autocusto-probes');base.mkdir(mode=0o750,exist_ok=True)
assert base.resolve()==base and not base.is_symlink()
previous_group_matches=base.stat().st_gid==grp.getgrnam('autocusto').gr_gid
subprocess.run(['chown','root:autocusto',str(base)],check=True,capture_output=True)
base.chmod(0o750)
scratch=base/stage.name
assert not scratch.exists()
scratch.mkdir(mode=0o700)
try:
 for name in ['config.ini','LinuxDatabaseProbe']:
  subprocess.run(['install','-o','autocusto','-g','autocusto','-m','0600' if name=='config.ini' else '0700',str(stage/name),str(scratch/name)],check=True,capture_output=True)
 subprocess.run(['chown','autocusto:autocusto',str(scratch)],check=True,capture_output=True)
 env=os.environ.copy()
 for name in ['SSL_CERT_FILE','SSL_CERT_DIR','AUTO_CUSTO_JWT_SECRET']:env.pop(name,None)
 env['AUTO_CUSTO_CONFIG']=str(scratch/'config.ini');env['AUTO_CUSTO_EXPECTED_DATABASE']='db-altocusto'
 env['AUTO_CUSTO_EXPECTED_PATIENT_PROCEDURE_HASH']=__PROCEDURE_HASH__
 result=subprocess.run(['runuser','-u','autocusto','--',str(scratch/'LinuxDatabaseProbe')],env=env,capture_output=True,text=True,timeout=90)
 allowed=('ODBC_SECURITY=','DATABASE_IDENTITY_OK','SEVEN_TABLES_OK','PATIENT_PROCEDURE_OK','API_PERMISSIONS_OK','MSSQL_LINUX_READ_ONLY_OK','DRIVER_ERROR_KIND=','DRIVER_ERROR_COUNT=','FIREDAC_CODE=','DRIVER_CODE=','PROBE_ERROR_TYPE=','CERTIFICATE_ERROR','TLS_REASON=','ODBC_LIBRARY_REFERENCE','ODBC_DATA_SOURCE_NAME_ERROR','API_COLUMNS_OK','THREE_ROLES_OK','PASSWORD_COLUMN_LENGTH_OK','PATIENT_PROCEDURE_READ_ONLY_DEFINITION_OK','ADMIN_DASHBOARD_READ_OK','PATIENT_DASHBOARD_READ_OK')
 lines=[line for line in result.stdout.splitlines() if line.startswith(allowed)]
 stderr_kind='none'
 if result.stderr:
  stderr_kind='PermissionDenied' if 'permission denied' in result.stderr.lower() else 'LoaderError' if 'shared libraries' in result.stderr.lower() else 'RuntimeError'
 print(json.dumps({'database':'db-altocusto','exitCode':result.returncode,'checks':lines,'stderrKind':stderr_kind,'probeParentGroupWasCorrect':previous_group_matches,'realDatabaseWrites':False}))
finally:
 assert scratch.parent==base and scratch.resolve().parent==base.resolve()
 shutil.rmtree(scratch)
 assert stage.resolve().parent==pathlib.Path('/home/projetoaltocusto')
 shutil.rmtree(stage)
'''.replace('__STAGE__', repr(stage)).replace('__PROCEDURE_HASH__', repr(expected_procedure_hash))
    command = 'sudo -n python3 -c ' + shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(source.encode()).decode())+'))')
    _, stdout, stderr = client.exec_command(command, timeout=150)
    text = stdout.read().decode('utf-8')
    code = stdout.channel.recv_exit_status()
    if code:
        error = stderr.read().decode('utf-8', 'replace').strip().splitlines()
        print('REMOTE_CHECK_FAILED_TYPE='+(error[-1].split(':')[0] if error else 'Unknown'))
        raise SystemExit(code)
    data = json.loads(text)
    result_name = 'tls-diagnostic.json' if action == 'tls' else action+'.json'
    (OUTPUT / result_name).write_text(json.dumps(data, indent=2), encoding='utf-8')
    if action == 'inspect':
        data.pop('nginxConfig', None)
    print(json.dumps(data))
finally:
    client.close()
