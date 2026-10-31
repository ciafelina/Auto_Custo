import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../Front_End/admin-medications.html',import.meta.url),'utf8');
const source=await readFile(new URL('../Front_End/js/admin-medications.js',import.meta.url),'utf8');
const elements=new Map();
for(const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){
 const value=/\bvalue="([^"]*)"/.exec(match[0])?.[1]||'';
 const classes=new Set((/\bclass="([^"]*)"/.exec(match[0])?.[1]||'').split(/\s+/));
 elements.set(match[1],{value,defaultValue:value,textContent:'',innerHTML:'',disabled:false,
  classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle:(c,state)=>{const add=state===undefined?!classes.has(c):state;add?classes.add(c):classes.delete(c);}},
  addEventListener(){},reset(){for(const id of ['m-id','m-name','m-cat','m-dos','m-mfr','m-stock','m-min','m-desc']){const e=elements.get(id);e.value=e.defaultValue;}}
 });
}
const requests=[];
const context=vm.createContext({document:{getElementById:id=>elements.get(id)||null,addEventListener(){}},
 localStorage:{getItem:()=> 'teste'},alert(){},console,URL,setTimeout,clearTimeout,
 fetch:async(url,options={})=>{requests.push({url:String(url),...options});return {ok:true,status:200,json:async()=>({sucesso:true,dados:{lista:[],total:0}})};}
});
vm.runInContext(await readFile(new URL('../Front_End/config.js',import.meta.url),'utf8'),context);
vm.runInContext(await readFile(new URL('../Front_End/js/api-client.js',import.meta.url),'utf8'),context);
vm.runInContext(source,context);
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS formulário: '+name);}catch(e){failed++;console.error('FAIL formulário '+name+': '+e.message);}}
const med={id:42,nome:'Teste',categoria:'Categoria',dosagem:'10mg',fabricante:'Teste',estoque:10,estoqueMinimo:2,descricao:'Descrição'};
await test('edição oculta e desabilita estoque inicial',async()=>{
 context.abrirModalMedicamento(encodeURIComponent(JSON.stringify(med)));
 assert.equal(elements.get('m-stock').disabled,true);
 assert.ok(elements.get('m-stock-field')?.classList.contains('hidden'));
 assert.equal(elements.get('m-stock-edit-hint')?.classList.contains('hidden'),false);
});
await test('payload de edição omite saldo mesmo se campo for adulterado',async()=>{
 context.abrirModalMedicamento(encodeURIComponent(JSON.stringify(med)));
 elements.get('m-stock').value='999';
 await context.salvarMedicamento({preventDefault(){}});
 const request=requests.find(r=>r.method==='PUT');assert.ok(request);const data=JSON.parse(request.body);
 assert.equal(Object.hasOwn(data,'estoque'),false);assert.equal(data.nome,'Teste');assert.equal(data.estoqueMinimo,2);
});
await test('cadastro reabilita e envia estoque inicial',async()=>{
 context.abrirModalMedicamento();
 assert.equal(elements.get('m-stock').disabled,false);
 assert.equal(elements.get('m-stock-field')?.classList.contains('hidden'),false);
 assert.equal(elements.get('m-stock-edit-hint')?.classList.contains('hidden'),true);
 elements.get('m-stock').value='11';elements.get('m-min').value='2';
 await context.salvarMedicamento({preventDefault(){}});
 const request=requests.find(r=>r.method==='POST');assert.ok(request);assert.equal(JSON.parse(request.body).estoque,11);
});
console.log(`Formulário: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
