import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

let passed=0,failed=0;
async function client({config,protocol='http:',hostname='localhost'}={}){
  const source=await readFile(new URL('../Front_End/js/api-client.js',import.meta.url),'utf8');
  const context=vm.createContext({URL,location:{protocol,hostname},AUTO_CUSTO_CONFIG:config});
  vm.runInContext(source,context);return context.Api;
}
async function test(name,fn){try{await fn();passed++;console.log('PASS endereço API: '+name);}catch(e){failed++;console.error('FAIL endereço API '+name+': '+e.message);}}
for(const [name,options,want] of [
  ['local padrão',{},'http://localhost:9000/produtos'],
  ['servidor da página LAN',{hostname:'192.0.2.20'},'http://192.0.2.20:9000/produtos'],
  ['domínio da página',{hostname:'servidor.test'},'http://servidor.test:9000/produtos'],
  ['HTTPS da página',{protocol:'https:',hostname:'servidor.test'},'https://servidor.test:9000/produtos'],
  ['arquivo local',{protocol:'file:',hostname:''},'http://localhost:9000/produtos'],
  ['arquivo em compartilhamento',{protocol:'file:',hostname:'servidor.test'},'http://servidor.test:9000/produtos'],
  ['IPv6 da página',{hostname:'[::1]'},'http://[::1]:9000/produtos'],
  ['base explícita',{config:{apiBaseUrl:'http://192.0.2.40:9000'}},'http://192.0.2.40:9000/produtos'],
  ['base com barra final',{config:{apiBaseUrl:'http://192.0.2.40:9000/'}},'http://192.0.2.40:9000/produtos'],
  ['proxy e porta',{config:{apiBaseUrl:'https://api.example.test:9443/farmacia/v1/'}},'https://api.example.test:9443/farmacia/v1/produtos'],
  ['base com espaços externos',{config:{apiBaseUrl:'  https://api.example.test/api/  '}},'https://api.example.test/api/produtos'],
  ['IPv6 explícito',{config:{apiBaseUrl:'http://[2001:db8::1]:9000'}},'http://[2001:db8::1]:9000/produtos'],
  ['configuração vazia',{config:{apiBaseUrl:''},hostname:'192.0.2.30'},'http://192.0.2.30:9000/produtos']
])await test(name,async()=>assert.equal((await client(options)).url('/produtos'),want));
await test('query e busca não perdem o prefixo',async()=>{
  const api=await client({config:{apiBaseUrl:'https://api.example.test/farmacia'}});
  const url=new URL(api.url('/produtos?page=2&limit=4'));url.searchParams.set('search',`D'Ávila & Teste`);
  assert.equal(url.origin,'https://api.example.test');assert.equal(url.pathname,'/farmacia/produtos');assert.equal(url.searchParams.get('page'),'2');assert.equal(url.searchParams.get('limit'),'4');assert.equal(url.searchParams.get('search'),`D'Ávila & Teste`);
});
for(const value of ['ftp://api.test','javascript:alert(1)','/api','//api.test','https://nome:senha@api.test','http://api.test?chave=1','https://api.test/#x','http://','http://api.test:99999',42])await test('base inválida é recusada '+JSON.stringify(value),async()=>{
  // Falhar pela ausência do helper não é prova de validação; verificar Api antes.
  await client();await assert.rejects(async()=>{const api=await client({config:{apiBaseUrl:value}});api.url('/produtos');});
});
for(const route of ['https://externo.test/produtos','//externo.test/produtos','produtos','/../fora','/%2e%2e/fora','/\\externo.test/produtos','/produtos#fragmento'])await test('caminho externo/inválido é recusado '+route,async()=>{
  const api=await client({config:{apiBaseUrl:'https://api.test/farmacia'}});assert.throws(()=>api.url(route));
});
await test('configuração distribuída mantém modo automático',async()=>{
  const source=await readFile(new URL('../Front_End/config.js',import.meta.url),'utf8');
  const context=vm.createContext({});vm.runInContext(source,context);assert.equal(context.AUTO_CUSTO_CONFIG.apiBaseUrl,'');
});
console.log(`Endereço API: ${passed} aprovados; ${failed} falhas.`);process.exitCode=failed?1:0;
