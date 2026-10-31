"""Issue only the AutoCusto DuckDNS certificate; never activate application changes."""
import base64
import getpass
import json
import pathlib
import shlex
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'tests/.build/deploy-domain'
OUTPUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / 'tests/.build/deploy/py-libs'))
import paramiko

source = r'''
import pathlib,subprocess,json,socket
assert socket.gethostbyname('autocusto.duckdns.org')=='102.37.16.34','Domain must point to this VM first'
certbot='/opt/autocusto-certbot/bin/certbot'
assert pathlib.Path(certbot).is_file()
assert pathlib.Path('/var/www/autocusto').is_dir()
def run(args,label,timeout=180):
 print('DOMAIN_TLS_STEP='+label,flush=True)
 result=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if result.returncode:
  print('DOMAIN_TLS_FAILED='+label,flush=True)
  for line in result.stderr.splitlines():
   if any(word in line.lower() for word in ['unauthorized','timeout','invalid','challenge','error','failed','detail','rate limit']):print(line[:350],flush=True)
  raise SystemExit(1)
 return result.stdout.strip()
common=[certbot,'certonly','--non-interactive','--agree-tos','--register-unsafely-without-email',
 '--webroot','--webroot-path','/var/www/autocusto','--cert-name','autocusto-domain',
 '-d','autocusto.duckdns.org','--keep-until-expiring']
run(common+['--dry-run'],'challenge-dry-run')
run(common,'certificate-production')
details=run(['openssl','x509','-in','/etc/letsencrypt/live/autocusto-domain/fullchain.pem','-noout','-dates','-ext','subjectAltName'],'certificate-inspect')
assert 'DNS:autocusto.duckdns.org' in details
print(details,flush=True)
print(json.dumps({'domain':'autocusto.duckdns.org','certificatePrepared':True,'challengeDryRun':True,'nginxChanged':False,'apiRestarted':False}),flush=True)
'''
client = paramiko.SSHClient()
client.load_host_keys(str(ROOT / 'tests/.build/azure/known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
password = getpass.getpass('Senha SSH (oculta): ')
try:
    client.connect('102.37.16.34', username='projetoaltocusto', password=password,
                   timeout=15, allow_agent=False, look_for_keys=False)
    del password
    command = 'sudo -n python3 -c ' + shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(source.encode()).decode())+'))')
    _, stdout, stderr = client.exec_command(command, timeout=500)
    for line in stdout:
        print(line, end='', flush=True)
    code = stdout.channel.recv_exit_status()
    if code:
        error = stderr.read().decode('utf-8', 'replace')
        print('DOMAIN_TLS_ERROR_TYPE='+('TimeoutExpired' if 'TimeoutExpired' in error else 'RemotePreparationError'))
    (OUTPUT / 'tls.json').write_text(json.dumps({'exitCode':code, 'domain':'autocusto.duckdns.org', 'apiActivated':False}), encoding='utf-8')
    raise SystemExit(code)
finally:
    client.close()
