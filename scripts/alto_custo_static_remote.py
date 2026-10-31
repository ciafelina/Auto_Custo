"""Static-only Alto Custo publication. Never changes the API or its configuration."""
import base64
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tarfile

from autocusto_domain_remote import nginx_configuration

TIMER = 'altocusto-domain-certbot-renew.timer'
DOMAINS = ('autocusto.duckdns.org', 'altocusto.duckdns.org')
REQUIRED = {'index.html', 'login.html', 'register.html', 'stock.html', 'profile.html',
            'patient-dashboard.html', 'admin-dashboard.html', 'admin-medications.html',
            'admin-requests.html', 'admin-users.html', 'config.js', 'css/style.css'}
MAX_TOTAL = 5 * 1024 * 1024


@dataclass
class Paths:
    root: Path = Path('/')

    def __post_init__(self):
        self.root = self.root.resolve()
        self.public = self.root/'var/www/autocusto-releases'
        self.old_config = self.root/'etc/nginx/sites-available/autocusto-domain'
        self.new_config = self.root/'etc/nginx/sites-available/altocusto-domain'
        self.enabled = self.root/'etc/nginx/sites-enabled/altocusto-domain'
        self.proof_snippet = self.root/'etc/nginx/snippets/autocusto-google-verification.conf'
        self.renew_service = self.root/'etc/systemd/system/altocusto-domain-certbot-renew.service'
        self.renew_timer = self.root/'etc/systemd/system/altocusto-domain-certbot-renew.timer'
        self.backups = self.root/'var/lib/autocusto-branding'
        self.active_file = self.backups/'active-static.json'
        self.pending_file = self.backups/'pending-static.json'
        self.lock_file = self.backups/'publication.lock'


def validate_manifest(manifest):
    if not re.fullmatch(r'20261031-[a-f0-9]{12}', manifest.get('releaseId', '')):
        raise ValueError('Invalid release identifier.')
    files = manifest.get('files', {})
    if not isinstance(files, dict) or not REQUIRED.issubset(files) or len(files) > 80:
        raise ValueError('Incomplete public file manifest.')
    for name, digest in files.items():
        if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_./-]+', name):
            raise ValueError('Invalid public filename.')
        parts = name.split('/')
        if any(part in ('', '.', '..') or part.startswith('.') for part in parts):
            raise ValueError('Invalid public path.')
        if len(parts) == 1:
            allowed = name.endswith('.html') or name == 'config.js'
        else:
            allowed = len(parts) == 2 and ((parts[0] == 'js' and parts[1].endswith('.js')) or
                                         (parts[0] == 'css' and parts[1].endswith('.css')))
        if not allowed or not isinstance(digest, str) or not re.fullmatch(r'[a-f0-9]{64}', digest):
            raise ValueError('Private or invalid file in public manifest.')


def validate_files(files, manifest):
    validate_manifest(manifest)
    if set(files) != set(manifest['files']) or sum(len(b) for b in files.values()) > MAX_TOTAL:
        raise ValueError('Public bundle does not match manifest.')
    for name, body in files.items():
        if not isinstance(body, bytes) or len(body) > 1024 * 1024 or hashlib.sha256(body).hexdigest() != manifest['files'][name]:
            raise ValueError('Public file hash or size is invalid.')


def load_bundle(archive, manifest):
    validate_manifest(manifest)
    files = {}
    total = 0
    with tarfile.open(archive, 'r:gz') as bundle:
        for item in bundle:
            if not item.isfile() or item.name not in manifest['files'] or item.name in files or item.size > 1024 * 1024:
                raise ValueError('Unexpected archive member, duplicate or link.')
            total += item.size
            if total > MAX_TOTAL:
                raise ValueError('Public archive exceeds size limit.')
            files[item.name] = bundle.extractfile(item).read()
    validate_files(files, manifest)
    return files


def render_nginx(public, domain):
    if domain not in DOMAINS or any(c in public.as_posix() for c in ';{}\r\n'):
        raise ValueError('Unexpected host or public path.')
    text = nginx_configuration(public.as_posix())
    if domain == DOMAINS[1]:
        text = text.replace(DOMAINS[0], DOMAINS[1]).replace('/live/autocusto-domain/', '/live/altocusto-domain/')
    return '# Managed by Alto Custo static publisher.\n' + text.replace(
        '    location = /api {',
        '    include /etc/nginx/snippets/autocusto-google-verification.conf;\n    location = /api {', 1)


def write(path, body, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.altocusto-new')
    if temporary.is_symlink() or path.is_symlink():
        raise ValueError('Refusing to write through symlink.')
    temporary.write_bytes(body)
    temporary.chmod(mode)
    temporary.replace(path)


def capture(path):
    if path.is_symlink():
        return {'exists':True, 'link':str(path.readlink())}
    if path.exists():
        if not path.is_file():
            raise ValueError('Expected a regular configuration file.')
        return {'exists':True, 'body':base64.b64encode(path.read_bytes()).decode(),
                'mode':stat.S_IMODE(path.stat().st_mode)}
    return {'exists':False}


@contextmanager
def publication_lock(paths):
    import fcntl
    paths.backups.mkdir(parents=True,mode=0o700,exist_ok=True)
    if paths.backups.resolve() != paths.backups:
        raise ValueError('Publication state directory must be canonical.')
    descriptor=os.open(paths.lock_file,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        try:
            fcntl.flock(descriptor,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another publication in progress.') from None
        yield
    finally:
        os.close(descriptor)


def publication_state(paths):
    active=json.loads(paths.active_file.read_text()) if paths.active_file.exists() else None
    pending=json.loads(paths.pending_file.read_text()) if paths.pending_file.exists() else None
    for record in [active,pending]:
        if record is not None:validate_manifest(record['manifest'])
    rolled_back=bool(active and active.get('rolledBack'))
    return {'activeRelease':active['manifest']['releaseId'] if active and not rolled_back else None,
            'pendingRelease':pending['manifest']['releaseId'] if pending else None,'rolledBack':rolled_back}


def _renewal_command():
    # The systemd timer already supplies RandomizedDelaySec; manual probes must be bounded.
    return ['/opt/autocusto-certbot/bin/certbot','renew','--cert-name','altocusto-domain',
            '--quiet','--no-random-sleep-on-renew','--deploy-hook','/bin/systemctl reload nginx']


def check_renewal(*, invoke, observe):
    before_api=observe()
    invoke(_renewal_command()+['--dry-run','--run-deploy-hooks'],timeout=240)
    if observe()!=before_api:
        raise RuntimeError('API state changed during certificate renewal test.')
    if invoke(['systemctl','is-active',TIMER])!='active':
        raise RuntimeError('Certificate renewal timer is not active.')
    return {'renewalDryRun':True,'deployHookExercised':True,'apiStatePreserved':True,'timerActive':True}


def restore_file(path, before):
    if path.is_symlink():
        path.unlink()
    if not before['exists']:
        if path.exists():path.unlink()
    elif 'link' in before:
        if path.exists():path.unlink()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.symlink_to(before['link'])
    else:
        write(path, base64.b64decode(before['body']), before['mode'])


def restore(paths, state, invoke):
    # Only the new certificate timer and public/nginx files are owned here.
    # In particular, never restore/restart autocusto.service or an old database INI.
    invoke(['systemctl', 'disable', '--now', TIMER], must=False)
    for name in ['old_config', 'new_config', 'enabled', 'renew_service', 'renew_timer', 'active_file', 'pending_file']:
        restore_file(getattr(paths, name), state['files'][name])
    invoke(['systemctl', 'daemon-reload'])
    invoke(['nginx', '-t'])
    if state['timerEnabled'] in ('enabled', 'enabled-runtime'):
        args = ['systemctl', 'enable']
        if state['timerEnabled'] == 'enabled-runtime':args.append('--runtime')
        invoke(args + [TIMER])
    if state['timerActive'] == 'active':invoke(['systemctl', 'start', TIMER])
    invoke(['systemctl', 'reload', 'nginx'])


def activate(paths, manifest, files, *, invoke, verify, observe):
    with publication_lock(paths):
        return _activate(paths,manifest,files,invoke=invoke,verify=verify,observe=observe)


def _activate(paths, manifest, files, *, invoke, verify, observe):
    validate_files(files, manifest)
    public = paths.public / manifest['releaseId']
    backup = paths.backups / ('static-' + manifest['releaseId'])
    if paths.pending_file.exists():
        raise ValueError('Recover the interrupted static publication first.')
    if public.exists() or public.is_symlink() or backup.exists() or not paths.old_config.is_file() or not paths.proof_snippet.is_file():
        raise ValueError('Release collision or missing existing configuration.')
    if paths.enabled.exists() or paths.enabled.is_symlink():
        if not paths.enabled.is_symlink() or paths.enabled.resolve() != paths.new_config.resolve():
            raise ValueError('Unexpected enabled-site target.')
    certificate = paths.root/'etc/letsencrypt/live/altocusto-domain'
    if not (certificate/'fullchain.pem').is_file() or not (certificate/'privkey.pem').is_file():
        raise ValueError('Prepare the new domain certificate first.')
    before_api = observe()
    invoke(['nginx', '-t'])
    state = {'files':{name:capture(getattr(paths, name)) for name in
                      ['old_config','new_config','enabled','renew_service','renew_timer','active_file','pending_file']},
             'timerEnabled':invoke(['systemctl','is-enabled',TIMER],must=False),
             'timerActive':invoke(['systemctl','is-active',TIMER],must=False)}
    backup.mkdir(parents=True, mode=0o700)
    write(backup/'state.json', json.dumps(state, indent=2).encode(), 0o600)
    write(backup/'api-before.json', json.dumps(before_api).encode(), 0o600)
    try:
        # This recovery pointer precedes every traffic change and survives a hard stop.
        write(paths.pending_file,json.dumps({'manifest':manifest,'phase':'activating'}).encode(),0o600)
        public.mkdir(parents=True, mode=0o755)
        if public.resolve() != public:
            raise ValueError('Public release path must be canonical.')
        for name, body in files.items():
            target=public/name
            if not target.resolve().is_relative_to(public):raise ValueError('Public path escaped release.')
            write(target, body)
        write(paths.old_config, render_nginx(public, DOMAINS[0]).encode())
        write(paths.new_config, render_nginx(public, DOMAINS[1]).encode())
        if not paths.enabled.is_symlink():paths.enabled.symlink_to(paths.new_config)
        service = '''[Unit]
Description=Renew the Alto Custo domain certificate
[Service]
Type=oneshot
ExecStart=__RENEW_COMMAND__
'''
        command=_renewal_command()
        service=service.replace('__RENEW_COMMAND__',' '.join(command[:-1])+' '+json.dumps(command[-1]))
        timer = '''[Unit]
Description=Check the Alto Custo domain certificate twice daily
[Timer]
OnCalendar=*-*-* 00,12:00:00
RandomizedDelaySec=1800
Persistent=true
Unit=altocusto-domain-certbot-renew.service
[Install]
WantedBy=timers.target
'''
        write(paths.renew_service, service.encode())
        write(paths.renew_timer, timer.encode())
        invoke(['nginx', '-t'])
        invoke(['systemctl', 'daemon-reload'])
        invoke(['systemctl', 'enable', '--now', TIMER])
        invoke(['systemctl', 'reload', 'nginx'])
        checks = verify(public, files)
        if observe() != before_api:
            raise RuntimeError('API state changed during static publication.')
        result={'releaseId':manifest['releaseId'],'public':str(public),'backup':str(backup),
                'apiStatePreserved':True,'checks':checks}
        # Persist inside this try: a recording failure must roll traffic back as well.
        write(paths.active_file,json.dumps({'manifest':manifest,'result':result}).encode(),0o600)
        paths.pending_file.unlink()
        return result
    except Exception:
        restore(paths, state, invoke)
        raise


def recover(paths, *, invoke, observe):
    with publication_lock(paths):
        pointer=paths.pending_file if paths.pending_file.exists() else paths.active_file
        if not pointer.is_file():raise ValueError('No static publication is recorded.')
        record=json.loads(pointer.read_text())
        if record.get('rolledBack'):raise ValueError('Static publication is already rolled back.')
        manifest=record['manifest'];validate_manifest(manifest)
        public=paths.public/manifest['releaseId']
        backup=paths.backups/('static-'+manifest['releaseId'])
        if backup.resolve().parent!=paths.backups.resolve():raise ValueError('Invalid recovery directory.')
        state=json.loads((backup/'state.json').read_text())
        for name,domain in [('old_config',DOMAINS[0]),('new_config',DOMAINS[1])]:
            path=getattr(paths,name)
            if path.is_symlink():raise ValueError('Configuration changed outside this publication.')
            current=path.read_bytes() if path.exists() else None
            before=state['files'][name]
            original=base64.b64decode(before['body']) if before['exists'] and 'body' in before else None
            if current not in (original,render_nginx(public,domain).encode()):
                raise ValueError('Configuration changed outside this publication.')
        before_api=observe()
        restore(paths,state,invoke)
        if observe()!=before_api:raise RuntimeError('API state changed during static recovery.')
        return {'staticRollbackComplete':True,'apiStatePreserved':True}
