// Mandatory boundary for both browser and direct HTTP writes during live tests.
export function allowTestWrite(plan, owned, address, method, body={}) {
  const url=new URL(address);
  if(url.origin!=='https://autocusto.duckdns.org') throw new Error('Write origin outside the test application.');
  if(['GET','HEAD','OPTIONS'].includes(method)) return;
  const route=url.pathname.replace(/^\/api/,'');
  const actor=plan.actors.find(a=>a.cpf===String(body.cpf??''));
  if(method==='POST'&&route==='/login'&&actor) return;
  if(method==='POST'&&route==='/usuarios'&&actor&&body.nomeCompleto===actor.name&&body.email===actor.email) return;
  if(method==='POST'&&route==='/admin/medicamentos'&&body.nome===plan.medicineName&&body.categoria===plan.marker&&body.estoque===5) return;
  if(method==='POST'&&route==='/solicitacoes'&&owned.medicineId&&Number(body.idMedicamento)===owned.medicineId&&(!body.cpf||actor)) return;
  let match=route.match(/^\/admin\/medicamentos\/(\d+)$/);
  if(match&&Number(match[1])===owned.medicineId&&(['DELETE'].includes(method)||(method==='PUT'&&body.nome===plan.medicineName))) return;
  match=route.match(/^\/perfil\/(\d{11})$/);
  if(match&&method==='DELETE'&&plan.actors.some(a=>a.cpf===match[1])) return;
  match=route.match(/^\/solicitacoes\/(\d+)\/retirada$/);
  if(match&&method==='PATCH'&&owned.requests.has(Number(match[1]))) return;
  match=route.match(/^\/admin\/solicitacoes\/(\d+)\/status$/);
  if(match&&method==='PATCH'&&owned.requests.has(Number(match[1]))) return;
  throw new Error('Write target outside the exclusive test records.');
}
