"""Fixed server operations for the reviewed AutoCusto domain publication."""
import configparser
import hashlib
import http.client
import json
import os
import pathlib
import re
import shutil
import socket
import stat
import subprocess
import tarfile
import time
import urllib.error
import urllib.request
import ssl

DOMAIN = 'autocusto.duckdns.org'
TIMER = 'autocusto-domain-certbot-renew.timer'
REQUIRED_DATABASE_CHECKS = (
    'ODBC_SECURITY=Encrypt=yes;TrustServerCertificate=no', 'DATABASE_IDENTITY_OK',
    'SEVEN_TABLES_OK', 'PATIENT_PROCEDURE_OK', 'API_PERMISSIONS_OK', 'API_COLUMNS_OK',
    'THREE_ROLES_OK', 'PASSWORD_COLUMN_LENGTH_OK', 'PATIENT_PROCEDURE_READ_ONLY_DEFINITION_OK',
    'ADMIN_DASHBOARD_READ_OK', 'PATIENT_DASHBOARD_READ_OK', 'MSSQL_LINUX_READ_ONLY_OK')


def validate_evidence(probe, tls):
    if probe.get('exitCode') != 0 or tls.get('exitCode') != 0:
        raise ValueError('Database and TLS checks must pass before publication.')
    if not set(REQUIRED_DATABASE_CHECKS).issubset(probe.get('checks', [])):
        raise ValueError('Incomplete database compatibility check.')


def run(args, must=True, timeout=None):
    if timeout is None:
        timeout = 240 if args[:2] == ['systemctl', 'restart'] else 45
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if must and result.returncode:
        raise RuntimeError('Operation failed: '+args[0]+' '+(args[1] if len(args)>1 else ''))
    return result.stdout.strip()


def executable():
    pid = run(['systemctl', 'show', 'autocusto.service', '-p', 'MainPID', '--value'])
    return os.readlink('/proc/'+pid+'/exe')


def capture_state(backup, paths, old_executable, invoke=run):
    state_file = backup/'state.json'
    if state_file.exists():
        return
    files = {}
    for name, path in paths.items():
        info = {'exists':path.exists() or path.is_symlink()}
        if path.is_symlink():
            info['link'] = os.readlink(path)
        elif path.exists():
            info['mode'] = stat.S_IMODE(path.stat().st_mode)
            shutil.copyfile(path, backup/(name+'.before'))
            (backup/(name+'.before')).chmod(0o600)
        files[name] = info
    has_timer = files['timer']['exists']
    state = {'files':files, 'oldExecutable':old_executable,
             'oldTimerEnabled':invoke(['systemctl', 'is-enabled', TIMER], must=False) if has_timer else 'not-found',
             'oldTimerActive':invoke(['systemctl', 'is-active', TIMER], must=False) if has_timer else 'not-found'}
    state_file.write_text(json.dumps(state), encoding='utf-8')
    state_file.chmod(0o600)


def restore(backup, paths, invoke=run, read_executable=executable):
    state = json.loads((backup/'state.json').read_text())
    jobs = invoke(['systemctl', 'list-jobs', '--no-legend', '--plain', '--no-pager'])
    for line in jobs.splitlines():
        fields = line.split()
        if len(fields)>1 and fields[1]=='autocusto.service' and fields[0].isdigit():
            invoke(['systemctl', 'cancel', fields[0]])
    invoke(['systemctl', 'disable', '--now', TIMER], must=False)
    for name, path in paths.items():
        info = state['files'][name]
        if path.is_symlink(): path.unlink()
        if info['exists']:
            if 'link' in info:
                if path.exists(): path.unlink()
                path.symlink_to(info['link'])
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(backup/(name+'.before'), path)
                path.chmod(info['mode'])
        elif path.exists():
            path.unlink()
    invoke(['systemctl', 'daemon-reload'])
    invoke(['nginx', '-t'])
    invoke(['systemctl', 'restart', 'autocusto.service'])
    invoke(['systemctl', 'reload', 'nginx'])
    if state['oldTimerEnabled']=='enabled': invoke(['systemctl', 'enable', TIMER])
    elif state['oldTimerEnabled']=='enabled-runtime': invoke(['systemctl', 'enable', '--runtime', TIMER])
    if state['oldTimerActive']=='active': invoke(['systemctl', 'start', TIMER])
    if read_executable()!=state['oldExecutable']:
        raise RuntimeError('Previous API executable did not recover.')
    if invoke(['systemctl', 'is-active', 'autocusto.service'])!='active':
        raise RuntimeError('Previous API service did not recover.')
    print('PREVIOUS_APPLICATION_RESTORED', flush=True)


def write_file(path, text, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name+'.autocusto-new')
    temporary.write_text(text, encoding='utf-8')
    temporary.chmod(mode)
    temporary.replace(path)


def nginx_configuration(public):
    return r'''server {
    listen 80;
    server_name autocusto.duckdns.org;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/autocusto;
        default_type text/plain;
        try_files $uri =404;
    }
    location / { return 307 https://autocusto.duckdns.org$request_uri; }
}
server {
    listen 443 ssl;
    server_name autocusto.duckdns.org;
    ssl_certificate /etc/letsencrypt/live/autocusto-domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/autocusto-domain/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    root __PUBLIC__;
    index index.html login.html;
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
        add_header Cache-Control "no-store" always;
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
'''.replace('__PUBLIC__', str(public))


def check_api():
    for attempt in range(25):
        try:
            urllib.request.urlopen('http://127.0.0.1:9000/produtos', timeout=2)
            raise RuntimeError('Private route unexpectedly open.')
        except urllib.error.HTTPError as error:
            if error.code != 401: raise
            break
        except (urllib.error.URLError, TimeoutError):
            if attempt==24: raise
            time.sleep(1)
    body = json.dumps({'cpf':'90909090909', 'senha':'senha-ficticia-da-verificacao-de-publicacao'}).encode()
    request = urllib.request.Request('http://127.0.0.1:9000/login', data=body, headers={'Content-Type':'application/json'})
    try:
        urllib.request.urlopen(request, timeout=20)
        raise RuntimeError('Synthetic login accepted.')
    except urllib.error.HTTPError as error:
        if error.code!=401: raise RuntimeError('Database-backed login check failed.')


def check_https():
    connection = http.client.HTTPSConnection(DOMAIN, context=ssl.create_default_context(), timeout=12)
    connection._create_connection = lambda *a, **kw:socket.create_connection(('127.0.0.1',443), timeout=12)
    try:
        connection.request('GET', '/')
        response = connection.getresponse()
        if response.status!=200 or b'hero-title' not in response.read(): raise RuntimeError('Domain home page failed.')
        connection.request('GET', '/api/produtos')
        response = connection.getresponse()
        if response.status!=401 or json.loads(response.read()).get('sucesso') is not False:
            raise RuntimeError('Domain authentication check failed.')
    finally:
        connection.close()


def wait_https(check=check_https, attempts=20, pause=time.sleep):
    # nginx reload signals the master; old workers may briefly serve their certificate.
    # Every retry performs full certificate and hostname verification again.
    for attempt in range(attempts):
        try:
            check()
            return
        except (OSError, http.client.RemoteDisconnected) as error:
            if attempt==attempts-1:
                raise
            reason=getattr(error,'verify_message',None) or type(error).__name__
            print('HTTPS_RELOAD_WAIT='+reason,flush=True)
            pause(.25)


def status(manifest):
    pid = run(['systemctl','show','autocusto.service','-p','MainPID','--value'])
    environment = dict(part.split(b'=',1) for part in pathlib.Path('/proc',pid,'environ').read_bytes().split(b'\0') if b'=' in part)
    config_path = pathlib.Path(environment[b'AUTO_CUSTO_CONFIG'].decode())
    cfg = configparser.RawConfigParser()
    cfg.read(config_path, encoding='utf-8')
    listeners = run(['ss','-ltn'])
    api_listeners = [line for line in listeners.splitlines() if ':9000' in line]
    return {'domain':DOMAIN, 'service':run(['systemctl','is-active','autocusto.service']),
            'executable':executable(), 'configPath':str(config_path), 'database':cfg['Base']['Banco'],
            'databaseServer':cfg['Base']['Servidor'], 'trustServerCertificate':cfg['Base'].get('ConfiarCertificadoServidor','0'),
            'customSslEnvironment':any(key in environment for key in (b'SSL_CERT_FILE',b'SSL_CERT_DIR')),
            'loopbackOnly':bool(api_listeners) and all('127.0.0.1:9000' in line for line in api_listeners),
            'renewTimer':run(['systemctl','is-active',TIMER], must=False),
            'newReleaseActive':executable()==manifest['release']+'/ProjetoFaculdade'}


def main(manifest, action, stage_name=None):
    rid = manifest['releaseId']
    assert re.fullmatch(r'20261031-[a-f0-9]{12}', rid)
    assert action in ('prepare','activate','rollback','status','check-renewal')
    release = pathlib.Path('/opt/autocusto/releases')/rid
    public = pathlib.Path('/var/www/autocusto-releases')/rid
    configuration = pathlib.Path('/etc/autocusto/releases')/(rid+'.ini')
    backup = pathlib.Path('/var/lib/autocusto-deploy')/rid
    paths = {'dropin':pathlib.Path('/etc/systemd/system/autocusto.service.d/90-publicacao.conf'),
             'site':pathlib.Path('/etc/nginx/sites-available/autocusto-domain'),
             'link':pathlib.Path('/etc/nginx/sites-enabled/autocusto-domain'),
             'timer':pathlib.Path('/etc/systemd/system')/TIMER,
             'renew_service':pathlib.Path('/etc/systemd/system/autocusto-domain-certbot-renew.service')}
    assert manifest['release']==str(release) and manifest['public']==str(public)
    if action=='status': print(json.dumps(status(manifest)), flush=True); return
    if action=='rollback': restore(backup, paths); print(json.dumps(status(manifest)), flush=True); return
    validate_evidence(manifest['databaseProbe'], manifest['tls'])
    assert socket.gethostbyname(DOMAIN)=='102.37.16.34'
    assert pathlib.Path('/etc/letsencrypt/live/autocusto-domain/fullchain.pem').is_file()
    if action=='prepare':
        assert executable()!=str(release/'ProjetoFaculdade'), 'Never overwrite active release.'
        stage = pathlib.Path(stage_name)
        assert stage.parent==pathlib.Path('/home/projetoaltocusto') and stage.name=='autocusto-domain-stage-'+rid
        assert stage.resolve()==stage and not stage.is_symlink()
        assert hashlib.sha256((stage/'ProjetoFaculdade').read_bytes()).hexdigest()==manifest['binaryHash']
        backup.mkdir(mode=0o700, parents=True, exist_ok=True)
        backup.chmod(0o700)
        if paths['link'].is_symlink(): assert paths['link'].resolve()==paths['site']
        elif paths['link'].exists(): raise RuntimeError('Unexpected domain site file.')
        capture_state(backup, paths, executable())
        for directory in [release, configuration.parent]:
            run(['install','-d','-o','root','-g','autocusto','-m','0750',str(directory)])
        for name in ['ProjetoFaculdade','LinuxDatabaseProbe']:
            run(['install','-o','root','-g','autocusto','-m','0750',str(stage/name),str(release/name)])
        run(['install','-o','root','-g','autocusto','-m','0640',str(stage/'config.ini'),str(configuration)])
        (stage/'config.ini').unlink()
        cfg = configparser.RawConfigParser(); cfg.read(configuration, encoding='utf-8')
        assert cfg['Base']['Servidor']=='db-altocusto.database.windows.net' and cfg['Base']['Banco']=='db-altocusto'
        assert cfg['Base']['ConfiarCertificadoServidor']=='0' and not cfg['Base']['NomeCertificadoServidor']
        env = os.environ.copy()
        for name in ['SSL_CERT_FILE','SSL_CERT_DIR','AUTO_CUSTO_JWT_SECRET']: env.pop(name,None)
        env.update(AUTO_CUSTO_CONFIG=str(configuration),AUTO_CUSTO_EXPECTED_DATABASE='db-altocusto',
                   AUTO_CUSTO_EXPECTED_PATIENT_PROCEDURE_HASH=manifest['procedureHash'])
        probe = subprocess.run(['runuser','-u','autocusto','--',str(release/'LinuxDatabaseProbe')], env=env, capture_output=True,text=True,timeout=120)
        checks = probe.stdout.splitlines()
        validate_evidence({'exitCode':probe.returncode,'checks':checks},manifest['tls'])
        write_file(backup/'prepared-database.json',json.dumps({'exitCode':0,'checks':checks}),0o600)
        public.mkdir(mode=0o755, parents=True, exist_ok=True)
        assert public.resolve()==public and not public.is_symlink()
        with tarfile.open(stage/'frontend.tar.gz') as archive: archive.extractall(public, filter='data')
        for file in public.rglob('*'):
            assert not file.is_symlink()
            os.chown(file,0,0); file.chmod(0o755 if file.is_dir() else 0o644)
        public.chmod(0o755)
        for relative, digest in manifest['files'].items():
            file = public/relative
            assert file.resolve().is_relative_to(public) and hashlib.sha256(file.read_bytes()).hexdigest()==digest
        run(['runuser','-u','www-data','--','test','-r',str(public/'login.html')])
        write_file(backup/'nginx.new.conf', nginx_configuration(public))
        write_file(backup/'nginx.test.conf','user www-data; events {} http { include /etc/nginx/mime.types; include '+str(backup/'nginx.new.conf')+'; }\n')
        run(['nginx','-t','-c',str(backup/'nginx.test.conf')])
        override='[Service]\nExecStart=\nExecStart='+str(release/'ProjetoFaculdade')+'\nWorkingDirectory='+str(release)+'\nEnvironment="AUTO_CUSTO_CONFIG='+str(configuration)+'"\nUnsetEnvironment=AUTO_CUSTO_JWT_SECRET SSL_CERT_FILE SSL_CERT_DIR\nRestart=on-failure\nRestartSec=5s\nTimeoutStartSec=20s\nTimeoutStopSec=20s\n'
        write_file(backup/'service.new.conf',override)
        write_file(backup/'renew.new.service','[Unit]\nDescription=Renew AutoCusto domain certificate\nAfter=network-online.target nginx.service\n[Service]\nType=oneshot\nExecStart=/opt/autocusto-certbot/bin/certbot renew --cert-name autocusto-domain --quiet --no-random-sleep-on-renew --deploy-hook "/usr/bin/systemctl reload nginx"\n')
        write_file(backup/'renew.new.timer','[Unit]\nDescription=Check AutoCusto domain certificate twice daily\n[Timer]\nOnCalendar=*-*-* 01,13:00:00\nRandomizedDelaySec=30m\nPersistent=true\n[Install]\nWantedBy=timers.target\n')
        shutil.rmtree(stage)
        print(json.dumps({'prepared':True,'databaseNativeReadOnly':True,'nginxSyntaxValid':True,'apiActivated':False,'backup':str(backup)}),flush=True)
        return
    assert (backup/'prepared-database.json').is_file()
    assert hashlib.sha256((release/'ProjetoFaculdade').read_bytes()).hexdigest()==manifest['binaryHash']
    if action=='check-renewal':
        check_https()
        run(['/opt/autocusto-certbot/bin/certbot','renew','--dry-run','--no-random-sleep-on-renew','--cert-name','autocusto-domain','--run-deploy-hooks','--deploy-hook','/usr/bin/systemctl reload nginx'],timeout=240)
        assert run(['systemctl','is-active',TIMER])=='active'
        details=status(manifest)
        assert details['newReleaseActive'] and details['database']=='db-altocusto' and details['loopbackOnly']
        assert not details['customSslEnvironment'] and details['trustServerCertificate']=='0'
        cfg=configparser.RawConfigParser();cfg.read(configuration,encoding='utf-8')
        logs=run(['journalctl','-u','autocusto.service','-n','100','--no-pager','-o','cat'])
        assert all(cfg[section][key] not in logs for section,key in [('Base','Senha'),('Seguranca','JwtSecret')])
        assert stat.S_IMODE(configuration.stat().st_mode)==0o640
        print(json.dumps({'renewalAndReload':True,'secretLogCheck':True,'privateConfigMode':'0640','status':details}),flush=True)
        return
    state=json.loads((backup/'state.json').read_text())
    assert executable()==state['oldExecutable'],'Active application changed since preparation.'
    try:
        write_file(paths['dropin'],(backup/'service.new.conf').read_text())
        run(['systemctl','daemon-reload']);run(['systemctl','restart','autocusto.service'])
        check_api()
        assert executable()==str(release/'ProjetoFaculdade')
        write_file(paths['site'],(backup/'nginx.new.conf').read_text())
        if not paths['link'].is_symlink(): paths['link'].symlink_to(paths['site'])
        run(['nginx','-t']);run(['systemctl','reload','nginx'])
        wait_https()
        write_file(paths['renew_service'],(backup/'renew.new.service').read_text())
        write_file(paths['timer'],(backup/'renew.new.timer').read_text())
        run(['systemctl','daemon-reload']);run(['systemctl','enable','--now',TIMER])
        details=status(manifest)
        assert details['newReleaseActive'] and details['database']=='db-altocusto' and details['loopbackOnly']
        assert details['trustServerCertificate']=='0' and not details['customSslEnvironment']
        print(json.dumps({'activated':True,'rollbackAvailable':True,'realDatabaseWrites':False,'status':details}),flush=True)
    except BaseException:
        restore(backup,paths)
        raise
