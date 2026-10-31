"""Transactional activation of the tested recovery API/frontend; never rewrites Azure/JWT INI."""
import base64, configparser, contextlib, fcntl, hashlib, io, json, os, pathlib, re, secrets, shutil, time
from alto_custo_static_remote import validate_files

def atomic(path,body,mode=0o600):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+'.recovery-'+secrets.token_hex(8));created=False
    try:
        with temp.open('xb') as stream:
            created=True;os.chmod(temp,mode);stream.write(body);stream.flush();os.fsync(stream.fileno())
        os.replace(temp,path)
    finally:
        if created and temp.exists():temp.unlink()

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def _poll(read,ready,*,pause,attempts=100):
    deadline=time.monotonic()+10
    for _ in range(attempts):
        try:
            value=read()
            if ready(value):return value
        except (OSError,RuntimeError):pass
        if time.monotonic()>=deadline:break
        pause(.1)
    raise RuntimeError('The new process or public files did not become ready within the verification window.')

def wait_for_identity(observe,binary,binary_hash,*,pause=time.sleep):
    return _poll(observe,lambda item:item['binary']==binary and item['binaryHash']==binary_hash,pause=pause)

def wait_for_file(fetch,expected_hash,*,pause=time.sleep):
    return _poll(fetch,lambda item:item[0]==200 and hashlib.sha256(item[1]).hexdigest()==expected_hash,pause=pause)

class Publisher:
    def __init__(self,root=pathlib.Path('/')):
        self.root=root
        self.base=root/'var/lib/autocusto-recovery'
        self.unit=root/'etc/systemd/system/autocusto.service.d/90-publicacao.conf'
        self.sites=[root/('etc/nginx/sites-available/'+name+'-domain') for name in ('autocusto','altocusto')]
        self.active=self.base/'active.json';self.pending=self.base/'pending.json'

    @contextlib.contextmanager
    def lock(self):
        # The existing static publisher uses this same lock.
        path=self.root/'var/lib/autocusto-branding/publication.lock'
        assert path.parent.is_dir() and not path.is_symlink()
        with path.open('a+b') as stream:
            fcntl.flock(stream,fcntl.LOCK_EX)
            try:yield
            finally:fcntl.flock(stream,fcntl.LOCK_UN)

    def files(self):return [self.unit,*self.sites]

    def rollback_configuration(self,state):
        before=state['apiBefore'];original=self.root/before['config'].lstrip('/')
        assert original.is_file() and not original.is_symlink() and digest(original)==before['configHash'],'Protected configuration changed.'
        old=configparser.ConfigParser(interpolation=None);old.optionxform=str;old.read(original,encoding='utf-8-sig')
        target=self.root/'etc/autocusto/releases'/('rollback-'+state['releaseId']+'.ini')
        if target.exists():
            assert not target.is_symlink()
            new=configparser.ConfigParser(interpolation=None);new.optionxform=str;new.read(target,encoding='utf-8-sig')
        else:
            new=configparser.ConfigParser(interpolation=None);new.optionxform=str
            new.read_dict({s:dict(old[s]) for s in old.sections()})
            new.set('Seguranca','JwtSecret',secrets.token_hex(32))
            stream=io.StringIO();new.write(stream);atomic(target,stream.getvalue().encode('utf-8'),0o640)
            if self.root==pathlib.Path('/'):
                import grp
                os.chown(target,0,grp.getgrnam('autocusto').gr_gid)
        assert dict(old['Base'])==dict(new['Base']) and old['Seguranca']['JwtSecret']!=new['Seguranca']['JwtSecret']
        assert len(new['Seguranca']['JwtSecret'])>=32
        expected={'path':str(target),'hash':digest(target)}
        if state.get('rollbackConfig'):assert state['rollbackConfig']==expected
        state['rollbackConfig']=expected
        item=state['files'][str(self.unit.relative_to(self.root))]
        body=base64.b64decode(item['before']).decode()+'\nEnvironment="AUTO_CUSTO_CONFIG='+str(target)+'"\nUnsetEnvironment=AUTO_CUSTO_JWT_SECRET\n'
        item['rollback']=base64.b64encode(body.encode()).decode()
        # Record the new effective key's protected file before switching the unit.
        atomic(self.base/state['releaseId']/'activation-before.json',json.dumps(state).encode())
        atomic(self.pending,json.dumps({'releaseId':state['releaseId']}).encode())
        return target

    def restore(self,state,*,invoke,observe):
        for path in self.files():
            item=state['files'][str(path.relative_to(self.root))]
            current=path.read_bytes()
            acceptable=[base64.b64decode(item[k]) for k in ('before','after','rollback') if k in item]
            if current not in acceptable:
                raise RuntimeError('Configuration changed outside this publication.')
        target=self.rollback_configuration(state)
        for path in self.files():
            item=state['files'][str(path.relative_to(self.root))]
            atomic(path,base64.b64decode(item['rollback'] if path==self.unit else item['before']),0o644)
        invoke(['nginx','-t']);invoke(['systemctl','daemon-reload']);invoke(['systemctl','restart','autocusto.service']);invoke(['systemctl','reload','nginx'])
        before=state['apiBefore'];actual=wait_for_identity(observe,before['binary'],before['binaryHash'])
        assert all(actual[k]==before[k] for k in ('binary','binaryHash')),'Previous API identity not restored.'
        assert actual['config']==str(target) and actual['configHash']==state['rollbackConfig']['hash'],'Safe rollback configuration not loaded.'
        state['rolledBack']=True
        atomic(self.base/state['releaseId']/'activation-before.json',json.dumps(state).encode())
        if state['activeBefore'] is None:
            if self.active.exists():self.active.unlink()
        else:atomic(self.active,base64.b64decode(state['activeBefore']))
        if self.pending.exists():self.pending.unlink()
        return {'rollbackComplete':True,'azureConfigurationPreserved':True,'sessionsRevoked':True}

    def activate(self,manifest,files,*,invoke,observe,verify):
        with self.lock():
            validate_files(files,manifest)
            rid=manifest['releaseId'];assert re.fullmatch(r'20261031-[a-f0-9]{12}',rid)
            folder=self.base/rid;assert folder.is_dir() and not folder.is_symlink()
            tested=json.loads((folder/'tested.json').read_text())
            assert tested['releaseId']==rid and tested['gmailSmtpAccepted'] and tested['publicApiUnchanged']
            assert tested['api']['temporaryAccountRemoved'] and tested['api']['originalDataPreserved']
            assert len(tested['tls'])==4 and all(x['passed'] for x in tested['tls'])
            assert len(tested['api']['checks'])>=14 and all(x['passed'] for x in tested['api']['checks'])
            assert digest(folder/'ProjetoFaculdade')==manifest['binaryHash']
            assert not self.pending.exists(),'Recover the pending publication before activating another.'
            before=json.loads((folder/'baseline.json').read_text());assert observe()==before,'Public API changed after private tests.'
            assert all(p.is_file() and not p.is_symlink() for p in self.files())
            public=self.root/'var/www/autocusto-releases'/rid
            release=self.root/'opt/autocusto/releases'/rid
            assert not public.exists() and not public.is_symlink() and not release.exists() and not release.is_symlink()
            mail=self.base/rid/'email.ini';assert mail.is_file() and not mail.is_symlink()
            state={'releaseId':rid,'apiBefore':before,'files':{},'rolledBack':False,
                   'activeBefore':base64.b64encode(self.active.read_bytes()).decode() if self.active.exists() else None}
            new_binary=str(release/'ProjetoFaculdade');mail_path=str(mail)
            for path in self.files():
                old=path.read_bytes();text=old.decode()
                if path==self.unit:
                    text,count=re.subn(r'^ExecStart=[^\r\n]+\r?$',lambda _:'ExecStart='+new_binary,text,flags=re.M);assert count==1
                    text+='\nEnvironment="AUTO_CUSTO_EMAIL_CONFIG='+mail_path+'"\nEnvironment="AUTO_CUSTO_PORT=9000"\n'
                else:
                    assert 'proxy_set_header X-Real-IP $remote_addr;' in text
                    text,count=re.subn(r'root /var/www/autocusto-releases/20261031-[a-f0-9]{12};',lambda _:'root '+str(public)+';',text);assert count==1
                    assert 'autocusto-google-verification.conf' in text
                state['files'][str(path.relative_to(self.root))]={'before':base64.b64encode(old).decode(),'after':base64.b64encode(text.encode()).decode()}
            atomic(folder/'activation-before.json',json.dumps(state).encode())
            atomic(self.pending,json.dumps({'releaseId':rid}).encode())
            try:
                release.mkdir(mode=0o755);shutil.copyfile(folder/'ProjetoFaculdade',release/'ProjetoFaculdade');(release/'ProjetoFaculdade').chmod(0o755)
                public.mkdir(mode=0o755)
                for name,body in files.items():
                    dest=public/name;dest.parent.mkdir(parents=True,exist_ok=True,mode=0o755);atomic(dest,body,0o644)
                for path in self.files():atomic(path,base64.b64decode(state['files'][str(path.relative_to(self.root))]['after']),0o644)
                invoke(['nginx','-t']);invoke(['systemctl','daemon-reload']);invoke(['systemctl','restart','autocusto.service'])
                actual=wait_for_identity(observe,new_binary,manifest['binaryHash'])
                assert actual['config']==before['config'] and actual['configHash']==before['configHash']
                invoke(['systemctl','reload','nginx']);checks=verify(manifest)
                result={'releaseId':rid,'binary':new_binary,'public':str(public),'azureConfigurationPreserved':True,'checks':checks}
                atomic(self.active,json.dumps({'manifest':manifest,'result':result}).encode())
                self.pending.unlink()
                return result
            except BaseException:
                self.restore(state,invoke=invoke,observe=observe)
                raise

    def rollback(self,*,invoke,observe):
        with self.lock():
            pointer=self.pending if self.pending.exists() else self.active
            record=json.loads(pointer.read_text());rid=record.get('releaseId') or record['manifest']['releaseId']
            assert re.fullmatch(r'20261031-[a-f0-9]{12}',rid)
            state=json.loads((self.base/rid/'activation-before.json').read_text())
            return self.restore(state,invoke=invoke,observe=observe)
