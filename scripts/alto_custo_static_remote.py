"""Static-only Alto Custo publication. Never changes the API or its configuration."""
import base64
from dataclasses import dataclass
import hashlib
import json
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
    for name in ['old_config', 'new_config', 'enabled', 'renew_service', 'renew_timer']:
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
    validate_files(files, manifest)
    public = paths.public / manifest['releaseId']
    backup = paths.backups / ('static-' + manifest['releaseId'])
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
                      ['old_config','new_config','enabled','renew_service','renew_timer']},
             'timerEnabled':invoke(['systemctl','is-enabled',TIMER],must=False),
             'timerActive':invoke(['systemctl','is-active',TIMER],must=False)}
    backup.mkdir(parents=True, mode=0o700)
    write(backup/'state.json', json.dumps(state, indent=2).encode(), 0o600)
    write(backup/'api-before.json', json.dumps(before_api).encode(), 0o600)
    try:
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
ExecStart=/opt/autocusto-certbot/bin/certbot renew --cert-name altocusto-domain --quiet --deploy-hook "/bin/systemctl reload nginx"
'''
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
        return {'releaseId':manifest['releaseId'],'public':str(public),'backup':str(backup),
                'apiStatePreserved':True,'checks':checks}
    except Exception:
        restore(paths, state, invoke)
        raise
