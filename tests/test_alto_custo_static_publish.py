"""Publisher boundary tests: no production hosts, services or credentials."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('alto_custo_static_remote', ROOT / 'scripts/alto_custo_static_remote.py')
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

NAMES = ['index.html', 'login.html', 'register.html', 'stock.html', 'profile.html',
         'patient-dashboard.html', 'admin-dashboard.html', 'admin-medications.html',
         'admin-requests.html', 'admin-users.html', 'config.js', 'css/style.css',
         *('js/' + name + '.js' for name in ['accessibility', 'theme', 'api-client', 'api-response',
            'stock-status', 'ui-safe', 'admin-dashboard', 'admin-medications', 'admin-requests',
            'admin-users', 'dashboard', 'login', 'profile', 'register', 'stock'])]


class PublishTests(unittest.TestCase):
    def setUp(self):
        base=(ROOT/'tests/.build/static-publish-tests').resolve()
        base.mkdir(parents=True,exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='autocusto-static-test-',dir=base)
        self.root = Path(self.temp.name).resolve()
        def cleanup():
            assert self.root.parent == base and self.root.resolve().parent == base
            self.temp.cleanup()
        self.addCleanup(cleanup)
        self.paths = module.Paths(self.root)
        self.files = {name:('fixture ' + name).encode() for name in NAMES}
        self.files['config.js'] = b"globalThis.AUTO_CUSTO_CONFIG={apiBaseUrl:location.origin+'/api'};"
        self.manifest = {'releaseId':'20261031-aabbccddeeff',
                         'files':{name:hashlib.sha256(body).hexdigest() for name,body in self.files.items()}}
        self.calls = []
        for path in [self.paths.old_config, self.paths.new_config, self.paths.proof_snippet,
                     self.root/'etc/letsencrypt/live/altocusto-domain/fullchain.pem',
                     self.root/'etc/letsencrypt/live/altocusto-domain/privkey.pem',
                     self.root/'etc/autocusto/config.ini', self.root/'opt/autocusto/ProjetoFaculdade']:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'original-sentinel')
        self.paths.enabled.parent.mkdir(parents=True, exist_ok=True)

    def invoke(self, args, must=True):
        self.calls.append(tuple(args))
        if args[:2] == ['systemctl', 'is-enabled']: return 'not-found'
        if args[:2] == ['systemctl', 'is-active']: return 'inactive'
        return ''

    def archive(self, files=None, extra=None):
        path = self.root/'frontend.tar.gz'
        with tarfile.open(path, 'w:gz') as archive:
            for name,body in (self.files if files is None else files).items():
                entry=tarfile.TarInfo(name);entry.size=len(body)
                archive.addfile(entry, io.BytesIO(body))
            if extra:
                archive.addfile(*extra)
        return path

    def activate(self, verify=None, invoke=None, observe=None):
        if os.name == 'nt':
            self.skipTest('Activation and symlinks are tested natively on Linux before deployment.')
        return module.activate(self.paths,self.manifest,self.files,
            invoke=invoke or self.invoke,verify=verify or (lambda *_:{'ok':True}),
            observe=observe or (lambda:{'api':'unchanged'}))

    def test_loads_only_manifest_files_with_matching_hashes(self):
        self.assertEqual(module.load_bundle(self.archive(),self.manifest),self.files)

    def test_rejects_traversal_private_files_duplicate_members_and_links(self):
        for name in ['../config.ini','/etc/autocusto/config.ini','js/../../key.js','config.azure.ini',
                     'js/secret.pem','js\\secret.js','js//theme.js','css/style.js']:
            with self.subTest(name=name):
                files={**self.files,name:b'not-public'}
                manifest={**self.manifest,'files':{n:hashlib.sha256(b).hexdigest() for n,b in files.items()}}
                with self.assertRaises(ValueError):module.load_bundle(self.archive(files),manifest)
        duplicate=tarfile.TarInfo('index.html');duplicate.size=1
        with self.assertRaises(ValueError):module.load_bundle(self.archive(extra=(duplicate,io.BytesIO(b'x'))),self.manifest)
        link=tarfile.TarInfo('js/link.js');link.type=tarfile.SYMTYPE;link.linkname='/etc/autocusto/config.ini'
        with self.assertRaises(ValueError):module.load_bundle(self.archive(extra=(link,None)),self.manifest)

    def test_rejects_missing_files_bad_hash_and_invalid_release_id(self):
        missing=dict(self.files);missing.pop('login.html')
        with self.assertRaises(ValueError):module.load_bundle(self.archive(missing),self.manifest)
        broken={**self.manifest,'files':{**self.manifest['files'],'login.html':'0'*64}}
        with self.assertRaises(ValueError):module.load_bundle(self.archive(),broken)
        for name in ['../escape','20261031-zzzzzzzzzzzz','20261031-aabbccddeeff/extra']:
            with self.assertRaises(ValueError):module.load_bundle(self.archive(),{**self.manifest,'releaseId':name})

    def test_renders_both_hosts_with_same_api_and_persistent_google_proof(self):
        public=self.paths.public/'20261031-aabbccddeeff'
        for domain,cert in [('autocusto.duckdns.org','autocusto-domain'),('altocusto.duckdns.org','altocusto-domain')]:
            config=module.render_nginx(public,domain)
            self.assertIn('server_name '+domain+';',config)
            self.assertIn('/etc/letsencrypt/live/'+cert+'/fullchain.pem',config)
            self.assertIn('proxy_pass http://127.0.0.1:9000/;',config)
            self.assertIn('include /etc/nginx/snippets/autocusto-google-verification.conf;',config)
            self.assertIn('location ~* \\.(ini|env|pas|dpr|dproj|sql|log)$ { deny all; }',config)
        with self.assertRaises(ValueError):module.render_nginx(public,'outside.example')

    def test_activation_changes_only_static_routes_and_new_cert_timer(self):
        private=(self.root/'etc/autocusto/config.ini').read_bytes()
        result=self.activate()
        target=self.paths.public/self.manifest['releaseId']
        for name,body in self.files.items():self.assertEqual((target/name).read_bytes(),body)
        self.assertEqual((self.root/'etc/autocusto/config.ini').read_bytes(),private)
        self.assertEqual((self.root/'opt/autocusto/ProjetoFaculdade').read_bytes(),b'original-sentinel')
        self.assertTrue(result['apiStatePreserved'])
        self.assertIn('--cert-name altocusto-domain',self.paths.renew_service.read_text())
        self.assertFalse(any('restart' in c or 'autocusto.service' in c for c in self.calls))

    def test_failed_readiness_restores_both_hosts_without_restoring_database(self):
        def fail(*_):raise RuntimeError('readiness-failed')
        with self.assertRaisesRegex(RuntimeError,'readiness-failed'):self.activate(verify=fail)
        self.assertEqual(self.paths.old_config.read_bytes(),b'original-sentinel')
        self.assertEqual(self.paths.new_config.read_bytes(),b'original-sentinel')
        self.assertFalse(self.paths.renew_service.exists())
        self.assertFalse(self.paths.renew_timer.exists())
        self.assertEqual((self.root/'etc/autocusto/config.ini').read_bytes(),b'original-sentinel')
        self.assertFalse(any('autocusto.service' in c for c in self.calls))

    def test_nginx_validation_failure_restores_configuration_before_reload(self):
        count=0
        def invoke(args,must=True):
            nonlocal count
            result=self.invoke(args,must)
            if args==['nginx','-t']:
                count+=1
                if count==2:raise RuntimeError('nginx-rejected')
            return result
        with self.assertRaisesRegex(RuntimeError,'nginx-rejected'):self.activate(invoke=invoke)
        self.assertEqual(self.paths.old_config.read_bytes(),b'original-sentinel')
        self.assertEqual(self.paths.new_config.read_bytes(),b'original-sentinel')

    @unittest.skipIf(os.name=='nt','Symlink behavior is executed natively on Linux before activation.')
    def test_refuses_unexpected_enabled_site_link_before_writes(self):
        self.paths.enabled.symlink_to(self.root/'outside')
        with self.assertRaises(ValueError):self.activate()
        self.assertEqual(self.paths.old_config.read_bytes(),b'original-sentinel')
        self.assertFalse((self.paths.public/self.manifest['releaseId']).exists())

    def test_api_fingerprint_change_aborts_without_rewriting_private_configuration(self):
        count=0
        def observe():
            nonlocal count
            count+=1
            return {'api':'before' if count==1 else 'concurrent-change'}
        with self.assertRaisesRegex(RuntimeError,'API state changed'):self.activate(observe=observe)
        self.assertEqual((self.root/'etc/autocusto/config.ini').read_bytes(),b'original-sentinel')
        self.assertEqual(self.paths.old_config.read_bytes(),b'original-sentinel')

    def test_rolls_back_existing_renewal_units_and_previous_timer_state(self):
        self.paths.renew_service.parent.mkdir(parents=True,exist_ok=True)
        self.paths.renew_service.write_bytes(b'old-service')
        self.paths.renew_timer.write_bytes(b'old-timer')
        def invoke(args,must=True):
            self.calls.append(tuple(args))
            if args[:2]==['systemctl','is-enabled']:return 'enabled'
            if args[:2]==['systemctl','is-active']:return 'active'
            return ''
        def fail(*_):raise RuntimeError('readiness-failed')
        with self.assertRaises(RuntimeError):self.activate(verify=fail,invoke=invoke)
        self.assertEqual(self.paths.renew_service.read_bytes(),b'old-service')
        self.assertEqual(self.paths.renew_timer.read_bytes(),b'old-timer')
        self.assertIn(('systemctl','enable',module.TIMER),self.calls)
        self.assertIn(('systemctl','start',module.TIMER),self.calls)

    @unittest.skipIf(os.name=='nt','Transactional activation is verified natively on Linux.')
    def test_failed_publication_record_rolls_back_traffic_and_previous_record(self):
        record=self.paths.backups/'active-static.json'
        record.parent.mkdir(parents=True,exist_ok=True)
        record.write_bytes(b'previous-record')
        real_write=module.write
        injected=False
        def write(path,body,mode=0o644):
            nonlocal injected
            if path==record and not injected:
                injected=True
                raise OSError('record-write-failed')
            return real_write(path,body,mode)
        with patch.object(module,'write',side_effect=write):
            with self.assertRaisesRegex(OSError,'record-write-failed'):self.activate()
        self.assertEqual(record.read_bytes(),b'previous-record')
        self.assertEqual(self.paths.old_config.read_bytes(),b'original-sentinel')
        self.assertEqual(self.paths.new_config.read_bytes(),b'original-sentinel')
        self.assertFalse((self.paths.backups/'pending-static.json').exists())

    @unittest.skipIf(os.name=='nt','Interrupted activation recovery is verified natively on Linux.')
    def test_interrupted_activation_is_recoverable_from_pending_record(self):
        def interrupted(*_):raise KeyboardInterrupt('simulated-hard-stop')
        with self.assertRaises(KeyboardInterrupt):self.activate(verify=interrupted)
        pending=self.paths.backups/'pending-static.json'
        self.assertTrue(pending.is_file(),'Recovery pointer must precede traffic changes.')
        result=module.recover(self.paths,invoke=self.invoke,observe=lambda:{'api':'unchanged'})
        self.assertTrue(result['staticRollbackComplete'])
        self.assertFalse(pending.exists())
        self.assertFalse((self.paths.backups/'active-static.json').exists())
        self.assertEqual(self.paths.old_config.read_bytes(),b'original-sentinel')
        self.assertEqual(self.paths.new_config.read_bytes(),b'original-sentinel')

    @unittest.skipIf(os.name=='nt','POSIX file locking is verified natively on Linux.')
    def test_concurrent_publication_is_rejected_without_changing_traffic(self):
        self.assertTrue(callable(getattr(module,'publication_lock',None)))
        with module.publication_lock(self.paths):
            with self.assertRaisesRegex(RuntimeError,'publication in progress'):self.activate()
        self.assertEqual(self.paths.old_config.read_bytes(),b'original-sentinel')
        self.assertFalse((self.paths.public/self.manifest['releaseId']).exists())

    def test_status_does_not_report_rolled_back_record_as_active(self):
        record=self.paths.backups/'active-static.json'
        record.parent.mkdir(parents=True,exist_ok=True)
        record.write_text(json.dumps({'manifest':self.manifest,'rolledBack':True}),encoding='utf-8')
        self.assertTrue(callable(getattr(module,'publication_state',None)))
        state=module.publication_state(self.paths)
        self.assertIsNone(state['activeRelease'])
        self.assertTrue(state['rolledBack'])


if __name__=='__main__':unittest.main(verbosity=2)
