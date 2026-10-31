"""Prepare the IP certificate only; never replace nginx or restart the API."""
import pathlib,sys,getpass,base64,shlex,json
root=pathlib.Path(__file__).resolve().parent.parent
build=root/'tests/.build/deploy';sys.path.insert(0,str(build/'py-libs'))
import paramiko
source=r'''
import pathlib,subprocess,re,json,os
venv=pathlib.Path('/opt/autocusto-certbot')
webroot=pathlib.Path('/var/www/autocusto')
assert webroot.is_dir() and pathlib.Path('/etc/nginx/sites-enabled/autocusto').is_file()
def run(args,label,timeout=240):
 print('TLS_STEP='+label,flush=True)
 result=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if result.returncode:
  print('TLS_FAILED='+label+' code='+str(result.returncode),flush=True)
  # Certificate issuance diagnostics contain public IP/domain information only.
  if label.startswith('certificate') or label=='renewal-dry-run':
   for line in result.stderr.splitlines():
    if any(word in line.lower() for word in ['unauthorized','timeout','invalid','challenge','error','failed','detail','profile']):print(line[:300],flush=True)
  raise SystemExit(1)
 return result.stdout
if not (venv/'bin/python').exists():
 attempt=subprocess.run(['python3','-m','venv',str(venv)],capture_output=True)
 if attempt.returncode:
  run(['apt-get','update'],'apt-package-index')
  run(['apt-get','install','-y','python3-venv'],'python-venv-dependency')
  run(['python3','-m','venv',str(venv)],'create-certbot-venv')
run([str(venv/'bin/python'),'-m','pip','install','--disable-pip-version-check','--upgrade','certbot>=5.4,<6'],'install-certbot')
certbot=str(venv/'bin/certbot')
version=run([certbot,'--version'],'certbot-version').strip()
print(version,flush=True)
match=re.search(r'(\d+)\.(\d+)',version);assert match and tuple(map(int,match.groups()))>=(5,4)
common=[certbot,'certonly','--non-interactive','--agree-tos','--register-unsafely-without-email','--keep-until-expiring','--preferred-profile','shortlived','--webroot','--webroot-path',str(webroot),'--ip-address','102.37.16.34']
run(common+['--staging','--cert-name','autocusto-ip-staging'],'certificate-staging')
run(common+['--cert-name','autocusto-ip'],'certificate-production')
certificate='/etc/letsencrypt/live/autocusto-ip/fullchain.pem'
details=run(['openssl','x509','-in',certificate,'-noout','-dates','-ext','subjectAltName'],'certificate-inspect')
assert 'IP Address:102.37.16.34' in details
print(details.strip(),flush=True)
run([certbot,'renew','--dry-run','--no-random-sleep-on-renew','--cert-name','autocusto-ip'],'renewal-dry-run',timeout=300)
print(json.dumps({'certificatePrepared':True,'renewalDryRun':True,'nginxChanged':False,'apiRestarted':False}),flush=True)
'''
client=paramiko.SSHClient();client.load_host_keys(str(root/'tests/.build/azure/known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
password=getpass.getpass('Senha SSH (oculta): ')
try:
 client.connect('102.37.16.34',username='projetoaltocusto',password=password,timeout=12,allow_agent=False,look_for_keys=False,compress=True)
 del password
 command='sudo -n python3 -c '+shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(source.encode()).decode())+'))')
 _,stdout,stderr=client.exec_command(command,timeout=900)
 for line in stdout:print(line,end='',flush=True)
 error=stderr.read().decode('utf-8','replace');code=stdout.channel.recv_exit_status()
 if error:print('TLS_ERROR_TYPE='+('TimeoutExpired' if 'TimeoutExpired' in error else 'remote-preparation-failure'),file=sys.stderr)
 (build/'tls-result.json').write_text(json.dumps({'exitCode':code,'apiActivated':False}),encoding='utf-8')
 raise SystemExit(code)
finally:client.close()
