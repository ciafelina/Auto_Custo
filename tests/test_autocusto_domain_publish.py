"""Recovery and publication gates on temporary files, without SSH or service changes."""
import importlib.util
import json
import os
import pathlib
import ssl
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent


class DomainPublicationTests(unittest.TestCase):
    def setUp(self):
        source = ROOT / 'scripts/autocusto_domain_remote.py'
        self.assertTrue(source.is_file(), 'Implementar preparação e recuperação da publicação do domínio.')
        spec = importlib.util.spec_from_file_location('autocusto_domain_remote', source)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def restore_case(self, originals):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests/.build/deploy-domain') as folder:
            root = pathlib.Path(folder)
            backup = root/'backup'
            backup.mkdir()
            paths = {name:root/name for name in ['dropin', 'site', 'link', 'timer', 'renew_service']}
            for name in originals:
                if name != 'link':
                    paths[name].write_text('old-'+name)
                    paths[name].chmod(0o600)
            if 'link' in originals:
                paths['link'].symlink_to(paths['site'])
            unrelated = root/'other-site'
            unrelated.write_text('unrelated')
            calls = []
            def invoke(args, **kwargs):
                calls.append(args)
                if args[:2] == ['systemctl', 'list-jobs']:
                    return '51 autocusto.service start running\n52 other.service start waiting'
                if args[:2] == ['systemctl', 'is-enabled']:
                    return 'enabled-runtime' if 'timer' in originals else 'not-found'
                if args[:2] == ['systemctl', 'is-active']:
                    return 'active'
                return ''
            self.module.capture_state(backup, paths, '/old/api', invoke)
            for name, target in paths.items():
                if target.is_symlink(): target.unlink()
                target.write_text('new-'+name)
            self.module.restore(backup, paths, invoke, lambda:'/old/api')
            for name, target in paths.items():
                if name in originals:
                    if name == 'link':
                        self.assertTrue(target.is_symlink())
                        self.assertEqual(target.resolve(), paths['site'].resolve())
                    else:
                        self.assertEqual(target.read_text(), 'old-'+name)
                        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
                else:
                    self.assertFalse(target.exists())
            self.assertEqual(unrelated.read_text(), 'unrelated')
            self.assertIn(['systemctl', 'cancel', '51'], calls)
            self.assertNotIn(['systemctl', 'cancel', '52'], calls)
            if 'timer' in originals:
                self.assertIn(['systemctl', 'enable', '--runtime', 'autocusto-domain-certbot-renew.timer'], calls)
                self.assertIn(['systemctl', 'start', 'autocusto-domain-certbot-renew.timer'], calls)

    @unittest.skipIf(os.name == 'nt', 'Executar na VM Linux para validar symlinks e modos POSIX reais.')
    def test_restore_existing_files_symlink_and_timer_state(self):
        self.restore_case({'dropin', 'site', 'link', 'timer', 'renew_service'})

    @unittest.skipIf(os.name == 'nt', 'Executar na VM Linux para validar modos POSIX reais.')
    def test_restore_removes_only_new_domain_files(self):
        self.restore_case({'dropin'})

    def test_incomplete_database_evidence_blocks_publication(self):
        checks = list(self.module.REQUIRED_DATABASE_CHECKS)
        for omitted in checks:
            with self.subTest(omitted=omitted), self.assertRaises(ValueError):
                self.module.validate_evidence({'exitCode':0, 'checks':[c for c in checks if c != omitted]}, {'exitCode':0})
        self.module.validate_evidence({'exitCode':0, 'checks':checks}, {'exitCode':0})

    def test_invalid_tls_or_database_result_blocks_publication(self):
        good = {'exitCode':0, 'checks':list(self.module.REQUIRED_DATABASE_CHECKS)}
        with self.assertRaises(ValueError): self.module.validate_evidence(good, {'exitCode':1})
        with self.assertRaises(ValueError): self.module.validate_evidence({**good, 'exitCode':1}, {'exitCode':0})

    def test_https_wait_rechecks_certificate_after_nginx_reload(self):
        self.assertTrue(hasattr(self.module, 'wait_https'), 'Aguardar configuração TLS após reload do nginx.')
        attempts=[]
        def check():
            attempts.append(1)
            if len(attempts)<3: raise ssl.SSLCertVerificationError('old worker certificate')
        self.module.wait_https(check, attempts=3, pause=lambda _:None)
        self.assertEqual(len(attempts), 3)

    def test_https_wait_never_accepts_persistently_invalid_certificate(self):
        self.assertTrue(hasattr(self.module, 'wait_https'), 'Exigir validação TLS em todas as tentativas.')
        attempts=[]
        def check():
            attempts.append(1)
            raise ssl.SSLCertVerificationError('invalid certificate')
        with self.assertRaises(ssl.SSLCertVerificationError):
            self.module.wait_https(check, attempts=3, pause=lambda _:None)
        self.assertEqual(len(attempts), 3)


if __name__ == '__main__':
    unittest.main(verbosity=2)
