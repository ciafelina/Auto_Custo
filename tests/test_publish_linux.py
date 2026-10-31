"""Exercise recovery decisions on temporary files; no SSH, root or service calls."""
import ast,copy,contextlib,io,json,pathlib,shutil,tempfile,types,unittest
source_path=pathlib.Path(__file__).resolve().parent.parent/'scripts/publish-linux.py'
module=ast.parse(source_path.read_text())
remote=next(node.value.value for node in module.body if isinstance(node,ast.Assign) and any(getattr(name,'id',None)=='source' for name in node.targets))
tree=ast.parse(remote)
def function(name):return copy.deepcopy(next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name==name))
def compile_function(node,namespace):exec(compile(ast.fix_missing_locations(ast.Module(body=[node],type_ignores=[])),'publication-test','exec'),namespace)
class RecoveryTests(unittest.TestCase):
 def run_restore(self,enabled='enabled',active='active',mutate=False):
  scratch=source_path.parent.parent/'tests/.build/deploy'
  with tempfile.TemporaryDirectory(dir=scratch) as folder:
   self.assertTrue(pathlib.Path(folder).resolve().is_relative_to(scratch.resolve()))
   base=pathlib.Path(folder);backup=base/'backup';backup.mkdir()
   paths={name:base/name for name in ['site','dropin','autocusto-certbot-renew.timer','autocusto-certbot-renew.service']}
   for path in paths.values():path.write_text('new')
   (backup/'nginx.before.conf').write_text('old-nginx')
   existed={str(path):True for key,path in paths.items() if key!='site'}
   for key,path in paths.items():
    if key!='site':(backup/(path.name+'.before')).write_text('old-'+key)
   (backup/'state.json').write_text(json.dumps({'existed':existed,'oldTimerEnabled':enabled,'oldTimerActive':active,'oldExecutable':'/old/api'}))
   calls=[]
   def run(args):
    calls.append(args)
    if args[:2]==['systemctl','list-jobs']:return '51 autocusto.service start running\n52 other.service start waiting'
    if args[:2]==['systemctl','show']:return '1234'
    if args[:2]==['systemctl','is-active']:return 'active'
    return ''
   namespace={'backup':backup,'site':paths['site'],'dropin':paths['dropin'],'timer':paths['autocusto-certbot-renew.timer'],'renew_service':paths['autocusto-certbot-renew.service'],'json':json,'shutil':shutil,'run':run,'os':types.SimpleNamespace(readlink=lambda path:'/old/api')}
   node=function('restore')
   if mutate:
    node.body=[part for part in node.body if not (isinstance(part,ast.If) and ('old_enabled' in ast.unparse(part.test) or 'oldTimerActive' in ast.unparse(part.test)))]
   compile_function(node,namespace)
   with contextlib.redirect_stdout(io.StringIO()):namespace['restore']()
   self.assertEqual(paths['site'].read_text(),'old-nginx')
   self.assertIn(['systemctl','cancel','51'],calls)
   self.assertNotIn(['systemctl','cancel','52'],calls)
   if enabled=='enabled':self.assertIn(['systemctl','enable',paths['autocusto-certbot-renew.timer'].name],calls)
   if enabled=='enabled-runtime':self.assertIn(['systemctl','enable','--runtime',paths['autocusto-certbot-renew.timer'].name],calls)
   if active=='active':self.assertIn(['systemctl','start',paths['autocusto-certbot-renew.timer'].name],calls)
   else:self.assertNotIn(['systemctl','start',paths['autocusto-certbot-renew.timer'].name],calls)
 def test_restores_enabled_active_timer(self):self.run_restore()
 def test_restores_runtime_enabled_timer(self):self.run_restore('enabled-runtime')
 def test_keeps_inactive_timer_inactive(self):self.run_restore('disabled','inactive')
 def test_missing_timer_recovery_is_detected(self):
  with self.assertRaises(AssertionError):self.run_restore(mutate=True)
 def test_restart_deadline_and_old_short_deadline_detected(self):
  def check(node):
   deadlines=[]
   def fake_run(args,**kwargs):deadlines.append(kwargs['timeout']);return types.SimpleNamespace(returncode=0,stdout='')
   namespace={'subprocess':types.SimpleNamespace(run=fake_run)};compile_function(node,namespace)
   namespace['run'](['systemctl','restart','autocusto.service']);self.assertGreaterEqual(deadlines[-1],240)
   namespace['run'](['nginx','-t']);self.assertEqual(deadlines[-1],45)
  check(function('run'))
  mutant=function('run')
  for node in ast.walk(mutant):
   if isinstance(node,ast.Constant) and node.value==240:node.value=45
  with self.assertRaises(AssertionError):check(mutant)
if __name__=='__main__':unittest.main(verbosity=2)
