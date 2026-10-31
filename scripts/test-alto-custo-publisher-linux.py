"""Run publisher tests in a disposable Linux directory, never against production services."""
import base64,getpass,hashlib,json,pathlib,shlex,sys,uuid
ROOT=pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'tests/.build/deploy/py-libs'))
import paramiko
files=[ROOT/'scripts/alto_custo_static_remote.py',ROOT/'scripts/autocusto_domain_remote.py',ROOT/'tests/test_alto_custo_static_publish.py']
hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
ident='branding-tests-20261031-'+uuid.uuid4().hex
stage='/home/projetoaltocusto/'+ident
source=r'''
import hashlib,json,pathlib,re,shutil,subprocess
stage=pathlib.Path(__STAGE__);hashes=__HASHES__
assert stage.parent==pathlib.Path('/home/projetoaltocusto') and re.fullmatch(r'branding-tests-20261031-[a-f0-9]{32}',stage.name)
assert stage.resolve()==stage and not stage.is_symlink()
base=pathlib.Path('/var/lib/autocusto-probes');assert base.is_dir() and base.resolve()==base
scratch=base/stage.name;assert not scratch.exists()
scratch.mkdir(mode=0o700)
try:
    (scratch/'scripts').mkdir();(scratch/'tests').mkdir()
    for name,digest in hashes.items():
        path=stage/name
        assert path.is_file() and not path.is_symlink() and hashlib.sha256(path.read_bytes()).hexdigest()==digest
        shutil.copyfile(path,scratch/('tests' if name.startswith('test_') else 'scripts')/name)
    result=subprocess.run(['python3',str(scratch/'tests/test_alto_custo_static_publish.py')],capture_output=True,text=True,timeout=40)
    match=re.search(r'Ran (\d+) tests',result.stderr)
    passed=result.returncode==0 and match and int(match[1])==10 and 'skipped=' not in result.stderr
    print(json.dumps({'nativeLinux':True,'exitCode':result.returncode,'allTenPassed':bool(passed),
          'moduleHash':hashes['alto_custo_static_remote.py'],'testHash':hashes['test_alto_custo_static_publish.py'],
          'output':result.stderr,'productionServiceCalls':False}))
finally:
    assert scratch.resolve().parent==base.resolve() and scratch.name==stage.name
    shutil.rmtree(scratch)
    assert stage.resolve().parent==pathlib.Path('/home/projetoaltocusto')
    shutil.rmtree(stage)
'''.replace('__STAGE__',repr(stage)).replace('__HASHES__',repr(hashes))
client=paramiko.SSHClient();client.load_host_keys(str(ROOT/'tests/.build/azure/known_hosts'));client.set_missing_host_key_policy(paramiko.RejectPolicy())
password=getpass.getpass('Senha SSH (oculta): ')
try:
    client.connect('102.37.16.34',username='projetoaltocusto',password=password,timeout=15,allow_agent=False,look_for_keys=False);del password
    with client.open_sftp() as sftp:
        sftp.mkdir(stage,mode=0o700)
        for path in files:
            sftp.put(str(path),stage+'/'+path.name);sftp.chmod(stage+'/'+path.name,0o600)
    command='sudo -n python3 -c '+shlex.quote('import base64;exec(base64.b64decode('+repr(base64.b64encode(source.encode()).decode())+'))')
    _,stdout,stderr=client.exec_command(command,timeout=65)
    text=stdout.read().decode();code=stdout.channel.recv_exit_status()
    if code:raise SystemExit('Native test setup failed; no production action executed.')
    result=json.loads(text)
    output=ROOT/'tests/.build/alto-custo-publication/native-tests.json';output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='output'}))
    if not result['allTenPassed']:
        print(result['output']);raise SystemExit(1)
finally:client.close()
