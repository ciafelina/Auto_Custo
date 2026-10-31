import base64, configparser, hashlib, hmac, importlib.util, json, pathlib, re, sys, tempfile, types, unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'scripts'))
if sys.platform=='win32':sys.modules.setdefault('fcntl',types.SimpleNamespace(LOCK_EX=1,LOCK_UN=2,flock=lambda *_:None))
import password_recovery_publish as deploy
from alto_custo_static_remote import REQUIRED

class RecoveryPublication(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name);self.p=deploy.Publisher(self.root);self.rid='20261031-123456abcdef'
  self.folder=self.p.base/self.rid;self.folder.mkdir(parents=True)
  for path in [self.root/'var/lib/autocusto-branding',self.root/'var/www/autocusto-releases',self.root/'opt/autocusto/releases']:path.mkdir(parents=True)
  self.p.unit.parent.mkdir(parents=True);self.p.sites[0].parent.mkdir(parents=True)
  self.before={'pid':'1','binary':'/opt/autocusto/releases/previous/ProjetoFaculdade','binaryHash':'old-hash','config':'/etc/autocusto/private.ini','configHash':'unchanged-config'}
  self.current=dict(self.before)
  self.old_config=self.root/'etc/autocusto/private.ini';self.old_config.parent.mkdir(parents=True)
  self.old_config.write_text('[Base]\nServidor=azure.test\nBanco=db-altocusto\nSenha=ficticia\n[Seguranca]\nJwtSecret=chave-ficticia-antiga-de-teste-2026\n')
  self.before['configHash']=deploy.digest(self.old_config);self.current.update(self.before)
  self.p.unit.write_text('[Service]\nExecStart=\nExecStart='+self.before['binary']+'\nEnvironment=AUTO_CUSTO_CONFIG=/etc/autocusto/private.ini\n')
  for path in self.p.sites:path.write_text('root /var/www/autocusto-releases/20261031-aaaaaaaaaaaa;\nproxy_set_header X-Real-IP $remote_addr;\ninclude /etc/nginx/snippets/autocusto-google-verification.conf;\n')
  self.original={str(p):p.read_bytes() for p in self.p.files()}
  (self.folder/'ProjetoFaculdade').write_bytes(b'candidate');(self.folder/'email.ini').write_text('private fake config')
  (self.folder/'baseline.json').write_text(json.dumps(self.before))
  (self.folder/'tested.json').write_text(json.dumps({'releaseId':self.rid,'gmailSmtpAccepted':True,'publicApiUnchanged':True,'api':{'temporaryAccountRemoved':True,'originalDataPreserved':True,'checks':[{'passed':True}]*14},'tls':[{'passed':True}]*4}))
  self.files={name:b'public' for name in REQUIRED};self.files.update({'recuperar-senha.html':b'recover','redefinir-senha.html':b'reset','js/recuperacao-senha.js':b'recovery'})
  self.manifest={'releaseId':self.rid,'binaryHash':hashlib.sha256(b'candidate').hexdigest(),'files':{n:hashlib.sha256(b).hexdigest() for n,b in self.files.items()}}
 def tearDown(self):self.temp.cleanup()
 def invoke(self,args):
  if args[:2]==['systemctl','restart']:
   if str(self.root/'opt/autocusto/releases'/self.rid/'ProjetoFaculdade') in self.p.unit.read_text():self.current.update(binary=str(self.root/'opt/autocusto/releases'/self.rid/'ProjetoFaculdade'),binaryHash=self.manifest['binaryHash'],pid='2')
   else:self.current.update(self.before,pid='3')
   configs=re.findall(r'AUTO_CUSTO_CONFIG=([^"\r\n]+)',self.p.unit.read_text())
   if configs and configs[-1]!=self.before['config']:
    self.current.update(config=configs[-1],configHash=deploy.digest(pathlib.Path(configs[-1])))
 def activate(self,verify=lambda _:['focused checks passed']):return self.p.activate(self.manifest,self.files,invoke=self.invoke,observe=lambda:dict(self.current),verify=verify)
 def assertRestored(self):
  for p in self.p.sites:self.assertEqual(p.read_bytes(),self.original[str(p)])
  self.assertTrue(self.p.unit.read_bytes().startswith(self.original[str(self.p.unit)]));self.assertFalse(self.p.pending.exists());self.assertEqual(self.current['binaryHash'],'old-hash')
  self.assertEqual(deploy.digest(self.old_config),self.before['configHash'])
 def test_success_and_explicit_rollback(self):
  result=self.activate();self.assertTrue(result['azureConfigurationPreserved']);self.assertFalse(self.p.pending.exists());self.assertIn('recuperar-senha.html',self.manifest['files'])
  self.p.rollback(invoke=self.invoke,observe=lambda:dict(self.current));self.assertRestored()
 def test_failed_verification_restores_api_front_and_previous_marker(self):
  self.p.active.write_bytes(b'previous-marker')
  with self.assertRaisesRegex(RuntimeError,'focused failure'):self.activate(lambda _:(_ for _ in ()).throw(RuntimeError('focused failure')))
  self.assertRestored();self.assertEqual(self.p.active.read_bytes(),b'previous-marker')
 def test_active_journal_write_failure_rolls_back(self):
  real=deploy.atomic;failed=False
  def fail_once(path,body,mode=0o600):
   nonlocal failed
   if path==self.p.active and not failed:failed=True;raise OSError('disk failure')
   return real(path,body,mode)
  with patch.object(deploy,'atomic',fail_once),self.assertRaises(OSError):self.activate()
  self.assertRestored();self.assertFalse(self.p.active.exists())
 def test_changed_api_before_activation_is_rejected(self):
  self.current['binaryHash']='someone-else'
  with self.assertRaises(AssertionError):self.activate()
  self.assertFalse(self.p.pending.exists());self.assertEqual({str(p):p.read_bytes() for p in self.p.files()},self.original)
 def test_rollback_refuses_external_configuration_change(self):
  self.activate();self.p.sites[0].write_text('manual unrelated change')
  with self.assertRaisesRegex(RuntimeError,'outside'):self.p.rollback(invoke=self.invoke,observe=lambda:dict(self.current))
  self.assertEqual(self.p.sites[0].read_text(),'manual unrelated change')
 def test_rollback_rotates_effective_key_preserving_database_and_revocation(self):
  self.activate();self.p.rollback(invoke=self.invoke,observe=lambda:dict(self.current))
  before=configparser.ConfigParser();before.read(self.old_config)
  after=configparser.ConfigParser();after.read(self.current['config'])
  self.assertEqual(dict(before['Base']),dict(after['Base']))
  old=before['Seguranca']['JwtSecret'];new=after['Seguranca']['JwtSecret'];self.assertNotEqual(old,new);self.assertGreaterEqual(len(new),32)
  token=b'JWT-emitido-antes-da-redefinicao';signature=hmac.digest(old.encode(),token,'sha256')
  self.assertNotEqual(signature,hmac.digest(new.encode(),token,'sha256'))
  self.assertIn('UnsetEnvironment=AUTO_CUSTO_JWT_SECRET',self.p.unit.read_text())
 def test_failed_atomic_write_does_not_block_recovery(self):
  dest=self.root/'file';dest.write_bytes(b'before')
  with patch.object(deploy.os,'fsync',side_effect=OSError('fsync failure')),self.assertRaises(OSError):deploy.atomic(dest,b'after')
  self.assertEqual(dest.read_bytes(),b'before');self.assertEqual(list(self.root.glob('*.recovery-*')),[])
  dest.with_name(dest.name+'.recovery-tmp').write_bytes(b'old interrupted attempt')
  deploy.atomic(dest,b'recovered');self.assertEqual(dest.read_bytes(),b'recovered')

if __name__=='__main__':unittest.main()
