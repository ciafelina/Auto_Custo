"""Ownership boundaries: no database or network access."""
import copy
import importlib.util
import io
import json
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parent.parent

class SafetyTests(unittest.TestCase):
    def setUp(self):
        source=ROOT/'tests/azure_e2e_remote.py'
        self.assertTrue(source.is_file(),'Implementar as guardas antes de executar escritas no Azure.')
        spec=importlib.util.spec_from_file_location('azure_e2e_remote',source)
        self.m=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.m)
        self.plan={'runId':'20261031-a123456789ab','marker':'AUTOCUSTO_E2E_20261031_a123456789ab',
          'actors':[{'key':key,'cpf':cpf,'name':'AUTOCUSTO_E2E_20261031_a123456789ab_'+key,'email':key+'.a123456789ab@autocusto.invalid','role':role}
            for key,cpf,role in [('patient','00012345678',3),('other','00012345679',3),('staff','00012345680',2)]],
          'medicineName':'AUTOCUSTO_E2E_20261031_a123456789ab TESTE NAO SOLICITAR'}
        self.users=[{'cpf':a['cpf'],'name':a['name'],'email':a['email']} for a in self.plan['actors']]
        self.meds=[{'id':991,'name':self.plan['medicineName']}]
        self.requests=[{'id':552,'cpf':self.plan['actors'][0]['cpf'],'medicineId':991}]

    def guard(self,users=None,meds=None,requests=None,refs=0):
        return self.m.guard_ownership(self.plan,self.users if users is None else users,self.meds if meds is None else meds,self.requests if requests is None else requests,refs)

    def test_allows_owned_graph_and_partial_registration(self):
        self.guard();self.guard(users=self.users[:1],meds=[],requests=[]);self.guard(users=[],meds=[],requests=[])

    def test_rejects_user_collision_even_with_same_cpf(self):
        for field in ['name','email']:
            users=copy.deepcopy(self.users);users[0][field]='existing-real-value'
            with self.assertRaises(self.m.UnsafeTestData):self.guard(users=users)

    def test_rejects_foreign_patient_referencing_test_medicine(self):
        rows=copy.deepcopy(self.requests);rows[0]['cpf']='12345678901'
        with self.assertRaises(self.m.UnsafeTestData):self.guard(requests=rows)

    def test_rejects_test_patient_referencing_real_medicine(self):
        rows=copy.deepcopy(self.requests);rows[0]['medicineId']=99
        with self.assertRaises(self.m.UnsafeTestData):self.guard(requests=rows)

    def test_rejects_changed_medicine_and_duplicate_medicine(self):
        with self.assertRaises(self.m.UnsafeTestData):self.guard(meds=[{'id':991,'name':'Real medicine'}])
        with self.assertRaises(self.m.UnsafeTestData):self.guard(meds=self.meds*2)

    def test_rejects_external_documents(self):
        with self.assertRaises(self.m.UnsafeTestData):self.guard(refs=1)

    def test_rejects_admin_role_and_unmarked_plan(self):
        bad=copy.deepcopy(self.plan);bad['actors'][2]['role']=1
        with self.assertRaises(self.m.UnsafeTestData):self.m.validate_plan(bad)

    def test_ssh_eof_also_runs_cleanup_on_remote_side(self):
        self.assertTrue(hasattr(self.m,'serve'),'Encerramento remoto precisa executar limpeza.')
        class Audit:
            plan={'baseline':{}}
            cleaned=0
            def cleanup(self):self.cleaned+=1;return {'remaining':0}
        audit=Audit()
        self.m.serve(audit,io.StringIO(''))
        self.assertEqual(audit.cleaned,1)

    def test_cleanup_report_without_browser_result_is_serializable(self):
        self.assertTrue(hasattr(self.m,'cleanup_report'),'Evidência de limpeza não pode criar referência circular.')
        confirmation={'remaining':0,'originalDataPreserved':True}
        report=self.m.cleanup_report(None,confirmation)
        self.assertEqual(json.loads(json.dumps(report))['remaining'],0)
        self.assertNotIn('finalConfirmation',confirmation)
        bad=copy.deepcopy(self.plan);bad['marker']='normal-data'
        with self.assertRaises(self.m.UnsafeTestData):self.m.validate_plan(bad)

if __name__=='__main__':unittest.main(verbosity=2)
