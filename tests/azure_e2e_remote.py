"""Private, narrowly scoped SQL audit/cleanup for one AutoCusto test run."""
import configparser
import json
import os
import pathlib
import re
import signal
import sys

class UnsafeTestData(Exception):
    pass

def require(value, message):
    if not value: raise UnsafeTestData(message)

def validate_plan(plan):
    require(re.fullmatch(r'20261031-[a-f0-9]{12}',plan.get('runId','')), 'Invalid run identifier.')
    require(plan.get('marker')=='AUTOCUSTO_E2E_'+plan['runId'].replace('-','_'), 'Invalid test marker.')
    actors=plan.get('actors',[])
    require(len(actors)==3 and [(a['key'],a['role']) for a in actors]==[('patient',3),('other',3),('staff',2)], 'Only two patients and one test employee allowed.')
    require(len({a['cpf'] for a in actors})==3, 'Duplicate test CPFs.')
    for actor in actors:
        require(re.fullmatch(r'\d{11}',actor['cpf']), 'Invalid CPF shape.')
        require(actor['name']==plan['marker']+'_'+actor['key'], 'Invalid test account name.')
        require(actor['email']==actor['key']+'.'+plan['runId'][9:]+'@autocusto.invalid', 'Invalid test email.')
    require(plan.get('medicineName','').startswith(plan['marker']+' TESTE NAO SOLICITAR'), 'Invalid test medicine.')

def guard_ownership(plan, users, medicines, requests, external_refs=0):
    validate_plan(plan)
    actors={a['cpf']:a for a in plan['actors']}
    require(len(users)<=3 and len(medicines)<=1 and len(requests)<=10, 'Unexpected number of related records.')
    for user in users:
        expected=actors.get(user['cpf'])
        require(expected is not None and user['name']==expected['name'] and user['email']==expected['email'], 'Account ownership mismatch.')
    for medicine in medicines:
        require(medicine['name']==plan['medicineName'], 'Medicine ownership mismatch.')
        if plan.get('medicineId') is not None:
            require(medicine['id']==plan['medicineId'], 'Medicine identity mismatch.')
    medicine_ids={m['id'] for m in medicines}
    for request in requests:
        require(request['cpf'] in actors and request['medicineId'] in medicine_ids, 'External request relationship detected.')
    require(external_refs==0, 'Documents/archive reference test users; cleanup refused.')

def cleanup_report(previous, confirmation):
    return {'initial':previous,'finalConfirmation':confirmation,'remaining':confirmation['remaining'],
            'originalDataPreserved':confirmation['originalDataPreserved']}

TABLES={
    'Cargos':'IdCargo','Usuarios':'idUsuarioCPF','Medicamentos':'idMedicamento',
    'Solicitacoes':'idSolicitacao','Interessados':'idInteressado','Documentos':'idDoc',
    'Arquivo':'prontuario,idDoc,idUsuarioCPF,caixa,prateleiraCorredor,dataHora'}

class RestrictedAudit:
    def __init__(self, connection, plan_path):
        self.connection=connection
        self.plan_path=pathlib.Path(plan_path)
        self.plan=json.loads(self.plan_path.read_text(encoding='utf-8'))
        validate_plan(self.plan)
        require(self.rows('SELECT DB_NAME() AS name')[0]['name']=='db-altocusto','Unexpected database.')

    def rows(self, sql, *params):
        cursor=self.connection.cursor()
        try:
            cursor.execute(sql,params)
            names=[c[0] for c in cursor.description]
            return [dict(zip(names,row)) for row in cursor.fetchall()]
        finally:cursor.close()

    def execute(self, sql, *params):
        cursor=self.connection.cursor()
        try:
            cursor.execute(sql,params)
            return cursor.rowcount
        finally:cursor.close()

    def save(self):
        temporary=self.plan_path.with_suffix('.new')
        temporary.write_text(json.dumps(self.plan,indent=2),encoding='utf-8')
        temporary.chmod(0o600);temporary.replace(self.plan_path)

    def snapshot(self):
        result={}
        for table, ordering in TABLES.items():
            # Only fixed internal identifiers; no SQL is accepted from the controller.
            row=self.rows("SELECT (SELECT COUNT_BIG(*) FROM dbo."+table+") AS records, "
              "CONVERT(varchar(64),HASHBYTES('SHA2_256',CAST((SELECT * FROM dbo."+table+
              " ORDER BY "+ordering+" FOR JSON PATH,INCLUDE_NULL_VALUES) AS nvarchar(max))),2) AS digest")[0]
            result[table]=row
        return result

    def check_triggers(self):
        count=self.rows("SELECT COUNT(*) AS n FROM sys.triggers WHERE is_disabled=0 AND parent_id IN "
          "(OBJECT_ID('dbo.Usuarios'),OBJECT_ID('dbo.Medicamentos'),OBJECT_ID('dbo.Solicitacoes'))")[0]['n']
        require(count==0,'Enabled business trigger requires review before any test writes.')

    def owned(self, lock=False):
        cpfs=[int(a['cpf']) for a in self.plan['actors']]
        hints=' WITH (XLOCK,HOLDLOCK)' if lock else ''
        users=self.rows("SELECT RIGHT('00000000000'+CAST(idUsuarioCPF AS varchar(11)),11) AS cpf, "
          "nomeUsuario AS name,email,IdCargo AS role,status, "
          "CASE WHEN LEN(senha)=60 AND senha LIKE '$2%' THEN 1 ELSE 0 END AS passwordHashOK "
          'FROM dbo.Usuarios'+hints+' WHERE idUsuarioCPF IN (?,?,?) ORDER BY idUsuarioCPF',*cpfs)
        medicine_id=self.plan.get('medicineId',-1)
        medicines=self.rows('SELECT idMedicamento AS id,nome AS name,descricao AS description,quantidadeEstoque AS stock,estoqueMinimo AS minimum '
          'FROM dbo.Medicamentos'+hints+' WHERE nome=? OR idMedicamento=?',self.plan['medicineName'],medicine_id)
        if len(medicines)==1 and medicines[0]['name']==self.plan['medicineName'] and 'medicineId' not in self.plan:
            self.plan['medicineId']=medicines[0]['id'];self.save();medicine_id=medicines[0]['id']
        requests=self.rows("SELECT idSolicitacao AS id,RIGHT('00000000000'+CAST(idUsuarioCPF AS varchar(11)),11) AS cpf, "
          'IdMedicamento AS medicineId,quantidade AS quantity,status,observacao AS observation '
          'FROM dbo.Solicitacoes'+hints+' WHERE idUsuarioCPF IN (?,?,?) OR IdMedicamento=? ORDER BY idSolicitacao',*cpfs,medicine_id)
        refs=self.rows('SELECT (SELECT COUNT(*) FROM dbo.Documentos WHERE idUsuarioCPF IN (?,?,?))+'
          '(SELECT COUNT(*) FROM dbo.Arquivo WHERE idUsuarioCPF IN (?,?,?)) AS n',*cpfs,*cpfs)[0]['n']
        guard_ownership(self.plan,users,medicines,requests,refs)
        return {'users':users,'medicines':medicines,'requests':requests}

    def preflight(self):
        require('baseline' not in self.plan,'Preflight cannot be reset.')
        self.check_triggers()
        state=self.owned()
        require(not any(state.values()),'Proposed identifiers already exist; no writes authorized.')
        self.plan['baseline']=self.snapshot();self.plan['phase']='ready';self.save()
        return {'ready':True,'database':'db-altocusto','existingDataSignatures':self.plan['baseline']}

    def promote(self):
        require(self.plan.get('phase')=='ready','Test run is not active.')
        self.check_triggers()
        self.connection.autocommit=False
        try:
            self.execute('SET XACT_ABORT ON; SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')
            state=self.owned(lock=True)
            require(len(state['users'])==3,'All public registrations must exist first.')
            require(all(u['role']==3 and u['status']=='Ativo' and u['passwordHashOK']==1 for u in state['users']), 'Public registration role/status/hash mismatch.')
            actor=self.plan['actors'][2]
            affected=self.execute("UPDATE dbo.Usuarios SET IdCargo=2 WHERE idUsuarioCPF=? AND nomeUsuario=? AND email=? AND IdCargo=3 AND status='Ativo'",
              int(actor['cpf']),actor['name'],actor['email'])
            require(affected==1,'Operator promotion did not affect exactly the owned account.')
            self.connection.commit()
        except BaseException:
            self.connection.rollback();raise
        finally:self.connection.autocommit=True
        return self.owned()

    def cleanup(self):
        require('baseline' in self.plan,'Missing preflight ownership proof; cleanup refused.')
        self.check_triggers()
        self.connection.autocommit=False
        deleted={'users':0,'medicines':0,'requests':0}
        try:
            self.execute('SET XACT_ABORT ON; SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')
            state=self.owned(lock=True)
            cpfs=[int(a['cpf']) for a in self.plan['actors']]
            if state['medicines']:
                medicine=state['medicines'][0]
                deleted['requests']=self.execute('DELETE FROM dbo.Solicitacoes WHERE IdMedicamento=? AND idUsuarioCPF IN (?,?,?)',medicine['id'],*cpfs)
                require(deleted['requests']==len(state['requests']),'Request cleanup count mismatch.')
                deleted['medicines']=self.execute('DELETE FROM dbo.Medicamentos WHERE idMedicamento=? AND nome=?',medicine['id'],self.plan['medicineName'])
                require(deleted['medicines']==1,'Medicine cleanup count mismatch.')
            for user in state['users']:
                affected=self.execute('DELETE FROM dbo.Usuarios WHERE idUsuarioCPF=? AND nomeUsuario=? AND email=?',int(user['cpf']),user['name'],user['email'])
                require(affected==1,'Account cleanup count mismatch.')
                deleted['users']+=affected
            self.connection.commit()
        except BaseException:
            self.connection.rollback();raise
        finally:self.connection.autocommit=True
        remaining=self.owned()
        require(not any(remaining.values()),'Test records remain.')
        after=self.snapshot()
        preserved={name:after[name]==self.plan['baseline'][name] for name in TABLES}
        previous=self.plan.get('cleanup',{}).get('deleted',{'users':0,'medicines':0,'requests':0})
        total_deleted={key:previous[key]+deleted[key] for key in deleted}
        result={'deleted':total_deleted,'deletedThisCall':deleted,'remaining':0,'originalDataPreserved':all(preserved.values()),
                'tablesPreserved':preserved,'before':self.plan['baseline'],'after':after}
        self.plan['phase']='cleaned';self.plan['cleanup']=result;self.save()
        return result

    def dispatch(self, operation):
        if operation=='preflight':return self.preflight()
        if operation=='promote-test-operator':return self.promote()
        if operation=='state':
            require('baseline' in self.plan,'Preflight required.')
            return self.owned()
        if operation=='cleanup':return self.cleanup()
        raise UnsafeTestData('Operation not allowed.')

def serve(audit, stream):
    try:
        for line in stream:
            command={}
            try:
                command=json.loads(line)
                require(set(command)=={'id','operation'},'Only fixed operations accepted.')
                result=audit.dispatch(command['operation'])
                print(json.dumps({'id':command['id'],'ok':True,'result':result}),flush=True)
            except Exception as error:
                print(json.dumps({'id':command.get('id'),'ok':False,'error':type(error).__name__,
                  'reason':str(error) if isinstance(error,UnsafeTestData) else 'Database operation failed.'}),flush=True)
    finally:
        # EOF/disconnection also cleans up locally on the VM, without the SSH channel.
        for name in ('SIGTERM','SIGHUP'):
            if hasattr(signal,name):signal.signal(getattr(signal,name),signal.SIG_IGN)
        if 'baseline' in audit.plan:
            try:audit.cleanup()
            except Exception as error:
                audit.plan['cleanupFailure']={'type':type(error).__name__,
                  'reason':str(error) if isinstance(error,UnsafeTestData) else 'Database cleanup failed.'}
                audit.save()
                raise

def main():
    import pyodbc
    config=configparser.RawConfigParser()
    config.read(os.environ['AUTO_CUSTO_CONFIG'],encoding='utf-8')
    base=config['Base']
    require(base['Servidor']=='db-altocusto.database.windows.net' and base['Banco']=='db-altocusto','Wrong configuration target.')
    def escape(value):return '{'+str(value).replace('}','}}')+'}'
    connection_string='DRIVER={ODBC Driver 18 for SQL Server};SERVER='+escape(base['Servidor']+','+base.get('Porta','1433'))+';DATABASE='+escape(base['Banco'])+';UID='+escape(base['Usuario'])+';PWD='+escape(base['Senha'])+';Encrypt=yes;TrustServerCertificate=no;APP=AutoCusto restricted E2E;'
    connection=pyodbc.connect(connection_string,timeout=20,autocommit=True)
    connection.timeout=30
    del connection_string
    try:
        audit=RestrictedAudit(connection,os.environ['AUTO_CUSTO_E2E_PLAN'])
        if sys.argv[1:]==['--cleanup-only']:
            print(json.dumps({'cleanup':audit.cleanup()}),flush=True)
            return
        require(not sys.argv[1:],'Unknown program arguments.')
        def stop(signum, frame):raise SystemExit(128+signum)
        for name in ('SIGTERM','SIGHUP'):
            if hasattr(signal,name):signal.signal(getattr(signal,name),stop)
        print(json.dumps({'ready':True,'database':'db-altocusto'}),flush=True)
        serve(audit,sys.stdin)
    finally:connection.close()

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'ready':False,'error':type(error).__name__}),flush=True)
        raise SystemExit(1)
