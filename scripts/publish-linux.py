"""Prepare, activate, inspect or restore only this application's reviewed release."""
import pathlib,sys,json,getpass,base64,shlex,re
root=pathlib.Path(__file__).resolve().parent.parent;build=root/'tests/.build/deploy'
sys.path.insert(0,str(build/'py-libs'))
import paramiko
if len(sys.argv)!=2 or sys.argv[1] not in ['prepare','activate','rollback','status','check-renewal','check-logs']:raise SystemExit('Choose prepare, activate, rollback, status, check-renewal or check-logs')
action=sys.argv[1];manifest=json.loads((build/'release.json').read_text());rid=manifest['releaseId']
assert re.fullmatch(r'20261025-[a-f0-9]{12}',rid)
if action in ['prepare','activate']:
 assert json.loads((build/'tls-result.json').read_text())['exitCode']==0,'Validate certificate and renewal first'
if action=='activate':
 assert manifest.get('databaseProbeExit')==0,'Validate native database access before publishing'
source=r"""
import pathlib,subprocess,shutil,json,os,hashlib,time,urllib.request,urllib.error,ssl,http.client,socket
rid=__RID__;action=__ACTION__;expected_hash=__HASH__
release=pathlib.Path('/opt/autocusto/releases')/rid
configuration=pathlib.Path('/etc/autocusto/releases')/(rid+'.ini')
certificate=configuration.with_suffix('.database.pem')
public=pathlib.Path('/var/www/autocusto-releases')/rid
backup=pathlib.Path('/var/lib/autocusto-deploy')/rid
dropin=pathlib.Path('/etc/systemd/system/autocusto.service.d/90-publicacao.conf')
site=pathlib.Path('/etc/nginx/sites-enabled/autocusto').resolve(strict=True)
assert site.parent in [pathlib.Path('/etc/nginx/sites-enabled'),pathlib.Path('/etc/nginx/sites-available')]
timer=pathlib.Path('/etc/systemd/system/autocusto-certbot-renew.timer')
renew_service=pathlib.Path('/etc/systemd/system/autocusto-certbot-renew.service')
def run(args):
 timeout=240 if args[:2]==['systemctl','restart'] else 45
 result=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if result.returncode:raise RuntimeError('Command failed: '+args[0]+' '+args[1] if len(args)>1 else args[0])
 return result.stdout.strip()
def save_file(path,text,mode=0o644):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text,encoding='utf-8');path.chmod(mode)
def status():
 active=run(['systemctl','is-active','autocusto.service'])
 pid=run(['systemctl','show','autocusto.service','-p','MainPID','--value'])
 executable=str(pathlib.Path('/proc')/pid/'exe')
 executable=os.readlink(executable)
 print(json.dumps({'service':active,'executable':executable,'certificateExists':pathlib.Path('/etc/letsencrypt/live/autocusto-ip/fullchain.pem').exists(),'renewTimer':subprocess.run(['systemctl','is-active',timer.name],capture_output=True,text=True).stdout.strip()}),flush=True)
def restore():
 data=json.loads((backup/'state.json').read_text())
 # Cancel only pending jobs for this application before restoring its unit.
 jobs=run(['systemctl','list-jobs','--no-legend','--plain','--no-pager'])
 for line in jobs.splitlines():
  fields=line.split()
  if len(fields)>1 and fields[1]=='autocusto.service' and fields[0].isdigit():run(['systemctl','cancel',fields[0]])
 if timer.exists():run(['systemctl','disable','--now',timer.name])
 shutil.copy2(backup/'nginx.before.conf',site)
 for path in [dropin,timer,renew_service]:
  old=backup/(path.name+'.before')
  if data['existed'][str(path)]:shutil.copy2(old,path)
  elif path.exists():path.unlink()
 run(['systemctl','daemon-reload']);run(['nginx','-t']);run(['systemctl','restart','autocusto.service']);run(['systemctl','reload','nginx'])
 old_enabled=data.get('oldTimerEnabled','disabled')
 if old_enabled=='enabled':run(['systemctl','enable',timer.name])
 elif old_enabled=='enabled-runtime':run(['systemctl','enable','--runtime',timer.name])
 if data.get('oldTimerActive')=='active':run(['systemctl','start',timer.name])
 old_pid=run(['systemctl','show','autocusto.service','-p','MainPID','--value'])
 assert os.readlink('/proc/'+old_pid+'/exe')==data['oldExecutable'],'Previous executable did not recover'
 assert run(['systemctl','is-active','autocusto.service'])=='active'
 print('PREVIOUS_APPLICATION_RESTORED',flush=True)
if action=='status':status();raise SystemExit(0)
if action=='check-logs':
 import configparser
 config=configparser.RawConfigParser();config.read(configuration,encoding='utf-8')
 private_values=[config['Base']['Senha'],config['Seguranca']['JwtSecret']]
 journal=run(['journalctl','-u','autocusto.service','-n','100','--no-pager','-o','cat'])
 assert all(value and value not in journal for value in private_values),'Current publication secret found in service log'
 print('CURRENT_PUBLICATION_SECRETS_NOT_FOUND_IN_SERVICE_LOG',flush=True)
 status();raise SystemExit(0)
if action=='check-renewal':
 listeners=run(['ss','-ltn'])
 assert all('127.0.0.1:9000' in line for line in listeners.splitlines() if ':9000' in line)
 assert '127.0.0.1:9000' in listeners
 import pwd,grp,stat
 pid=run(['systemctl','show','autocusto.service','-p','MainPID','--value'])
 assert pathlib.Path('/proc/'+pid).stat().st_uid==pwd.getpwnam('autocusto').pw_uid
 attributes=configuration.stat()
 assert attributes.st_uid==0 and attributes.st_gid==grp.getgrnam('autocusto').gr_gid and stat.S_IMODE(attributes.st_mode)==0o640
 print('SERVICE_USER_LOOPBACK_AND_PRIVATE_CONFIG_OK',flush=True)
 print('CHECKING_CERTIFICATE_RENEWAL_AFTER_NGINX_ACTIVATION',flush=True)
 renewal=subprocess.run(['/opt/autocusto-certbot/bin/certbot','renew','--dry-run','--no-random-sleep-on-renew','--cert-name','autocusto-ip','--run-deploy-hooks','--deploy-hook','/usr/bin/systemctl reload nginx'],capture_output=True,text=True,timeout=300)
 assert renewal.returncode==0,'Renewal or nginx reload failed'
 assert run(['systemctl','is-active',timer.name])=='active'
 print('RENEWAL_AND_NGINX_RELOAD_OK',flush=True);status();raise SystemExit(0)
if action=='rollback':restore();status();raise SystemExit(0)
assert release.parent==pathlib.Path('/opt/autocusto/releases') and release.is_dir() and not release.is_symlink()
assert hashlib.sha256((release/'ProjetoFaculdade').read_bytes()).hexdigest()==expected_hash,'Release hash mismatch'
assert pathlib.Path('/etc/letsencrypt/live/autocusto-ip/fullchain.pem').is_file()
assert os.stat(configuration).st_mode & 0o007==0,'Configuration must not be world-readable'
if action=='prepare':
 service=run(['systemctl','show','autocusto.service','-p','ExecStart'])
 assert str(release/'ProjetoFaculdade') not in service,'Never prepare over an active release'
 backup.parent.mkdir(mode=0o700,exist_ok=True);backup.parent.chmod(0o700)
 backup.mkdir(mode=0o700,exist_ok=True);backup.chmod(0o700)
 if not (backup/'state.json').exists():
  shutil.copy2(site,backup/'nginx.before.conf')
  shutil.copy2('/etc/systemd/system/autocusto.service',backup/'service.before')
  shutil.copy2('/opt/autocusto/ProjetoFaculdade',backup/'api.before')
  existed={}
  for path in [dropin,timer,renew_service]:
   assert not path.is_symlink(),'Do not replace existing symlinked unit files'
   existed[str(path)]=path.exists()
   if path.exists():shutil.copy2(path,backup/(path.name+'.before'))
  save_file(backup/'state.json',json.dumps({'existed':existed,'site':str(site),'oldStaticRoot':'/var/www/autocusto'}),0o600)
 data=json.loads((backup/'state.json').read_text())
 if 'oldTimerEnabled' not in data:
  data['oldTimerEnabled']=subprocess.run(['systemctl','is-enabled',timer.name],capture_output=True,text=True,timeout=15).stdout.strip()
  data['oldTimerActive']=subprocess.run(['systemctl','is-active',timer.name],capture_output=True,text=True,timeout=15).stdout.strip()
  old_pid=run(['systemctl','show','autocusto.service','-p','MainPID','--value'])
  data['oldExecutable']=os.readlink('/proc/'+old_pid+'/exe')
  save_file(backup/'state.json',json.dumps(data),0o600)
 public.parent.mkdir(mode=0o755,exist_ok=True);public.parent.chmod(0o755)
 public.mkdir(mode=0o755,exist_ok=True);public.chmod(0o755)
 assert not public.is_symlink()
 shutil.copytree(release/'frontend',public,dirs_exist_ok=True)
 for path in [public]+list(public.rglob('*')):
  assert not path.is_symlink()
  path.chmod(0o755 if path.is_dir() else 0o644)
 run(['sudo','-n','-u','www-data','test','-r',str(public/'login.html')])
 nginx=r'''server {
    listen 80;
    server_name 102.37.16.34;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/autocusto;
        default_type text/plain;
        try_files $uri =404;
    }
    location / { return 307 https://102.37.16.34$request_uri; }
}
server {
    listen 443 ssl;
    server_name 102.37.16.34;
    ssl_certificate /etc/letsencrypt/live/autocusto-ip/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/autocusto-ip/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    root __PUBLIC__;
    index login.html index.html;
    add_header X-Content-Type-Options nosniff always;
    location = /api { return 308 /api/; }
    location /api/ {
        proxy_pass http://127.0.0.1:9000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_intercept_errors on;
        error_page 502 503 504 = @api_indisponivel;
    }
    location @api_indisponivel {
        default_type application/json;
        return 503 '{"sucesso":false,"erro":{"codigo":"SERVICO_INDISPONIVEL","mensagem":"Serviço temporariamente indisponível.","detalhes":[]}}';
    }
    location ~ /\. { deny all; }
    location ~* \.(ini|env|pas|dpr|dproj|sql|log)$ { deny all; }
    location / { try_files $uri $uri/ =404; }
}
'''.replace('__PUBLIC__',str(public))
 save_file(backup/'nginx.new.conf',nginx)
 save_file(backup/'nginx.test.conf','user www-data; events {} http { include /etc/nginx/mime.types; include '+str(backup/'nginx.new.conf')+'; }\n')
 run(['nginx','-t','-c',str(backup/'nginx.test.conf')])
 override='[Service]\nExecStart=\nExecStart='+str(release/'ProjetoFaculdade')+'\nWorkingDirectory='+str(release)+'\nEnvironment="AUTO_CUSTO_CONFIG='+str(configuration)+'"\nEnvironment="SSL_CERT_FILE='+str(certificate)+'"\nEnvironment="SSL_CERT_DIR=/etc/autocusto/empty-ca"\nUnsetEnvironment=AUTO_CUSTO_JWT_SECRET\nRestart=on-failure\nRestartSec=5s\nTimeoutStartSec=20s\nTimeoutStopSec=20s\n'
 save_file(backup/'service.new.conf',override)
 save_file(backup/'renew.new.service','[Unit]\nDescription=Renew AutoCusto IP certificate\nAfter=network-online.target nginx.service\n[Service]\nType=oneshot\nExecStart=/opt/autocusto-certbot/bin/certbot renew --cert-name autocusto-ip --quiet --no-random-sleep-on-renew --deploy-hook "/usr/bin/systemctl reload nginx"\n')
 save_file(backup/'renew.new.timer','[Unit]\nDescription=Check AutoCusto certificate twice daily\n[Timer]\nOnCalendar=*-*-* 00,12:00:00\nRandomizedDelaySec=30m\nPersistent=true\n[Install]\nWantedBy=timers.target\n')
 print(json.dumps({'prepared':True,'publicFilesReadableByNginx':True,'nginxSyntaxValid':True,'backup':str(backup),'apiActivated':False}),flush=True)
 raise SystemExit(0)
assert (backup/'state.json').is_file(),'Prepare and review activation files first'
try:
 dropin.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(backup/'service.new.conf',dropin)
 run(['systemctl','daemon-reload']);run(['systemctl','restart','autocusto.service'])
 for attempt in range(20):
  try:
   urllib.request.urlopen('http://127.0.0.1:9000/produtos',timeout=2)
   raise RuntimeError('Private route unexpectedly open')
  except urllib.error.HTTPError as error:
   if error.code==401:break
   raise
  except (urllib.error.URLError,TimeoutError):
   if attempt==19:raise
   time.sleep(1)
 pid=run(['systemctl','show','autocusto.service','-p','MainPID','--value'])
 assert pathlib.Path(os.readlink('/proc/'+pid+'/exe'))==release/'ProjetoFaculdade','Unexpected service executable'
 payload=json.dumps({'cpf':'90909090909','senha':'senha-ficticia-da-verificacao-de-publicacao'}).encode()
 request=urllib.request.Request('http://127.0.0.1:9000/login',data=payload,headers={'Content-Type':'application/json'})
 try:urllib.request.urlopen(request,timeout=15);raise RuntimeError('Synthetic credentials accepted')
 except urllib.error.HTTPError as error:assert error.code==401,'Database-backed login check failed'
 shutil.copy2(backup/'nginx.new.conf',site);run(['nginx','-t']);run(['systemctl','reload','nginx'])
 shutil.copy2(backup/'renew.new.service',renew_service);shutil.copy2(backup/'renew.new.timer',timer)
 run(['systemctl','daemon-reload']);run(['systemctl','enable','--now',timer.name])
 connection=http.client.HTTPSConnection('102.37.16.34',context=ssl.create_default_context(),timeout=8)
 connection._create_connection=lambda *args,**kwargs:socket.create_connection(('127.0.0.1',443),timeout=8)
 connection.request('GET','/api/produtos');response=connection.getresponse()
 assert response.status==401 and json.loads(response.read())['sucesso'] is False
 connection.close();print('LOCAL_HTTPS_AND_AUTHENTICATION_OK',flush=True);status()
 print(json.dumps({'activated':True,'rollbackAvailable':True,'realDatabaseWrites':False}),flush=True)
except BaseException:
 restore()
 raise
"""
source=source.replace('__RID__',repr(rid)).replace('__ACTION__',repr(action)).replace('__HASH__',repr(manifest['hash']))
client=paramiko.SSHClient();client.load_host_keys(str(root/'tests/.build/azure/known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
password=getpass.getpass('Senha SSH (oculta): ')
try:
 client.connect('102.37.16.34',username='projetoaltocusto',password=password,timeout=12,allow_agent=False,look_for_keys=False,compress=True)
 del password
 command='sudo -n python3 -c '+shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(source.encode()).decode())+'))')
 _,stdout,stderr=client.exec_command(command,timeout=900)
 for line in stdout:print(line,end='',flush=True)
 error=stderr.read().decode('utf-8','replace');code=stdout.channel.recv_exit_status()
 if error:print('DEPLOY_ERROR_TYPE='+error.strip().splitlines()[-1].split(':')[0],file=sys.stderr)
 (build/('publish-'+action+'.json')).write_text(json.dumps({'action':action,'exitCode':code}),encoding='utf-8')
 raise SystemExit(code)
finally:client.close()
