import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.resolve(path.dirname(process.execPath), '..', 'node_modules/playwright')); }
const candidates = [process.env.AUTO_CUSTO_TEST_BROWSER, playwright.chromium.executablePath(),
  ...['ProgramFiles(x86)', 'ProgramFiles'].flatMap(e => process.env[e] ? [path.join(process.env[e], 'Microsoft/Edge/Application/msedge.exe')] : [])].filter(Boolean);
const executablePath = candidates.find(existsSync);
assert.ok(executablePath, 'Edge/Chromium não encontrado.');
const root = fileURLToPath(new URL('../Front_End/', import.meta.url));
const output = fileURLToPath(new URL('./.build/frontend-integration/', import.meta.url));
await mkdir(output, {recursive:true});
const front = 'http://autocusto.test';
const api = 'https://api.example.test/farmacia/v1';
const pages = ['index.html', 'login.html', 'register.html', 'admin-dashboard.html', 'admin-medications.html',
  'admin-requests.html', 'admin-users.html', 'patient-dashboard.html', 'profile.html', 'stock.html'];
const med = {id:42, nome:"D'Ávila Especial", dosagem:'10 mg', categoria:'Teste', fabricante:'Teste', descricao:'Descrição segura', estoque:10, estoqueMinimo:2};
const person = {cpf:'22222222222', cpfFormatado:'222.222.222-22', nome:'Pessoa teste', email:'teste@example.test', idCargo:3, status:'Ativo'};
const browser = await playwright.chromium.launch({headless:true, executablePath});
const results = [];
let passed = 0, failed = 0;
const filter = process.argv.includes('--review-checks');
const identificationOnly = process.argv.includes('--identification-checks');

function fixture(route, stock) {
  if (route === '/produtos') return {sucesso:true, resultado:{dados:[{...med, estoque:stock}], total_registros:1}};
  if (route === '/admin/medicamentos') return {sucesso:true, dados:{lista:[med], total:1}};
  if (route === '/admin/usuarios') return {sucesso:true, dados:{lista:[person], total:1, totalLista:1, totalAdmins:0, totalFuncionarios:0, totalPacientes:1}};
  if (route === '/admin/solicitacoes') return {sucesso:true, dados:{lista:[], total:0}};
  if (route.startsWith('/perfil/')) return {sucesso:true, dados:{nomeCompleto:person.nome, cpf:person.cpf, email:person.email, dataNascimento:'2000-01-01'}};
  if (route === '/admin/dashboard') return {sucesso:true, dados:{totalUsuarios:1, totalMedicamentos:1, estoqueCritico:0, solicitacoesPendentes:0, medicamentosZerados:[]}};
  return {sucesso:true, dados:{total:0, pendentes:0, aprovados:0, reprovados:0, solicitacoes:[]}};
}

async function open(file, {theme, colorScheme='light', width=1440, role=1, blockedStorage=false, orderStatus=201}={}) {
  const context = await browser.newContext({viewport:{width, height:900}, colorScheme, serviceWorkers:'block'});
  const page = await context.newPage(), errors = [], calls = [], missing = [];
  page.setDefaultTimeout(4000);
  let stock = 10;
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(({theme, role, blockedStorage}) => {
    if (!sessionStorage.getItem('theme-seeded')) {
      localStorage.setItem('token_jwt', 'token-ficticio');
      localStorage.setItem('usuario_cpf', '22222222222');
      localStorage.setItem('nome_usuario', 'Pessoa teste');
      localStorage.setItem('usuario_cargo', String(role));
      if (theme !== undefined) localStorage.setItem('tema', theme);
    }
    sessionStorage.setItem('theme-seeded', '1');
    window.__alerts = [];
    window.alert = text => window.__alerts.push(text);
    window.confirm = () => true;
    if (blockedStorage) {
      Storage.prototype.getItem = () => { throw new DOMException('Bloqueado', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('Bloqueado', 'SecurityError'); };
    }
  }, {theme, role, blockedStorage});
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === front) {
      if (url.pathname === '/config.js') return route.fulfill({contentType:'application/javascript', body:'globalThis.AUTO_CUSTO_CONFIG='+JSON.stringify({apiBaseUrl:api})+';'});
      const target = path.resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
      if (!target.startsWith(path.resolve(root)+path.sep)) return route.abort();
      try {
        return await route.fulfill({contentType:target.endsWith('.js') ? 'application/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html', body:await readFile(target)});
      } catch { missing.push(url.pathname); return route.fulfill({status:404, body:'Arquivo não encontrado'}); }
    }
    if (url.origin === new URL(api).origin) {
      const headers = {'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Authorization, Content-Type', 'Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, DELETE, OPTIONS'};
      if (request.method() === 'OPTIONS') return route.fulfill({status:204, headers});
      assert.ok(url.pathname.startsWith('/farmacia/v1/'), 'Chamada escapou do prefixo configurado.');
      const routePath = url.pathname.slice('/farmacia/v1'.length), body = request.postData() ? request.postDataJSON() : undefined;
      calls.push({route:routePath, method:request.method(), headers:request.headers(), body});
      let status = 200, result = fixture(routePath, stock);
      if (routePath === '/login') result = {sucesso:true, dados:{token_jwt:'token-novo-ficticio', nome:person.nome, cargo:role}};
      if (routePath === '/solicitacoes' && request.method() === 'POST') {
        status = orderStatus;
        result = status === 201 ? {sucesso:true} : {sucesso:false, erro:{codigo:'ESTOQUE_INSUFICIENTE', mensagem:'Estoque insuficiente para esta solicitação.', detalhes:[]}};
        if (status === 201) stock -= body.quantidade;
      }
      return route.fulfill({status, headers, contentType:'application/json', body:JSON.stringify(result)});
    }
    // Fontes e qualquer outro destino são bloqueados: nunca acessar API ou banco reais.
    return route.abort();
  });
  await page.goto(front+'/'+file);
  return {page, context, errors, calls, missing};
}

async function check(label, file, fn, options) {
  if (filter && !label.startsWith('revisão:')) return;
  if (identificationOnly && !label.startsWith('identificação:')) return;
  let scope;
  try {
    scope = await open(file, options);
    await fn(scope);
    assert.deepEqual(scope.errors, [], 'Erro JavaScript na tela.');
    assert.deepEqual(scope.missing, [], 'Recurso local ausente.');
    passed++; results.push({label, passed:true}); console.log('PASS integração: '+label);
  } catch (e) {
    failed++; results.push({label, passed:false, error:e.message}); console.error('FAIL integração '+label+': '+e.message);
  } finally { await scope?.context.close(); }
}

async function themeIs(page, expected) {
  await page.waitForFunction(value => document.documentElement.dataset.theme === value, expected, {timeout:1500});
  assert.equal(await page.locator('#alternar-tema').count(), 1);
  assert.equal(await page.locator('#alternar-tema').getAttribute('aria-pressed'), String(expected === 'dark'));
  await page.waitForFunction(color => getComputedStyle(document.body).backgroundColor === color,
    expected === 'dark' ? 'rgb(15, 23, 42)' : 'rgb(239, 246, 255)', {timeout:1500});
}

function contrast(foreground, background) {
  const luminance = color => {
    const rgb = color.match(/[\d.]+/g).slice(0,3).map(Number).map(value => {
      value /= 255; return value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4;
    });
    return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

try {
  // Catches incorrect page identity after a viewport change, rather than a CSS-only failure.
  await check('identificação: estoque conserva o título correto ao redimensionar', 'stock.html', async ({page}) => {
    for (const width of [1440, 1024, 768, 375, 1440, 375]) {
      await page.setViewportSize({width, height:900});
      assert.equal((await page.locator('#page-title').innerText()).trim(), 'Consulta de Estoque');
      assert.equal(await page.locator('#page-title').isVisible(), true);
      assert.equal((await page.locator('h1').innerText()).trim(), 'Consulta de Estoque');
    }
  }, {role:3});
  for (const file of ['stock.html', 'profile.html']) await check('identificação: menu do paciente leva ao Painel de controle em '+file, file, async ({page}) => {
    await page.locator('#hamburger').click();
    const link = page.locator('#menu-paciente a[href="patient-dashboard.html"]');
    assert.match(await link.innerText(), /Painel de controle/);
    await link.click();
    await page.waitForURL('**/patient-dashboard.html');
    assert.equal((await page.locator('#page-title').innerText()).trim(), 'Painel de controle');
  }, {role:3, width:375});
  for (const file of pages) await check('identificação: crédito legível sem rolagem lateral em '+file, file, async ({page}) => {
    const credit = page.locator('.project-credit').last();
    assert.equal(await credit.count(), 1, 'Identificação do projeto precisa aparecer na tela.');
    for (const theme of ['light', 'dark']) {
      if (await page.locator('#alternar-tema').getAttribute('aria-pressed') !== String(theme === 'dark')) {
        await page.locator('#alternar-tema').click();
      }
      await themeIs(page, theme);
      for (const width of [375, 768, 1024, 1440]) {
        await page.setViewportSize({width, height:900});
        await credit.scrollIntoViewIfNeeded();
        assert.equal(await credit.isVisible(), true);
        const colors = await credit.evaluate(element => {
          let parent = element;
          let background = 'rgba(0, 0, 0, 0)';
          while (parent) {
            background = getComputedStyle(parent).backgroundColor;
            if (background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') break;
            parent = parent.parentElement;
          }
          return {text:getComputedStyle(element).color, background};
        });
        assert.ok(contrast(colors.text, colors.background) >= 4.5, theme+' '+width+': crédito com baixo contraste');
        const dimensions = await page.evaluate(() => ({scroll:document.documentElement.scrollWidth, width:innerWidth}));
        assert.ok(dimensions.scroll <= dimensions.width + 1, file+' '+theme+' '+width+': rolagem lateral');
      }
    }
  });
  for (const file of pages) {
    await check('tema e atalho em '+file, file, async ({page}) => {
      await themeIs(page, 'light');
      await page.locator('#alternar-tema').click();
      await themeIs(page, 'dark');
      assert.equal(await page.evaluate(() => localStorage.getItem('tema')), 'dark');
      await page.reload(); await themeIs(page, 'dark');
      await page.locator('.skip-link').focus();
      const box = await page.locator('.skip-link').boundingBox();
      assert.ok(box && box.y >= 0 && box.width > 0, 'Atalho precisa ser visível quando recebe foco.');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content');
    });
    await check('celular sem rolagem lateral em '+file, file, async ({page}) => {
      await themeIs(page, 'dark');
      const dimensions = await page.evaluate(() => ({scroll:document.documentElement.scrollWidth, width:innerWidth}));
      assert.ok(dimensions.scroll <= dimensions.width + 1, JSON.stringify(dimensions));
      const button = await page.locator('#alternar-tema').boundingBox();
      assert.ok(button && button.x >= 0 && button.x+button.width <= 391, 'Botão de tema fora da tela.');
      if (['index.html', 'login.html', 'stock.html'].includes(file)) await page.screenshot({path:path.join(output, file.replace('.html', '-mobile-dark.png')), fullPage:true, animations:'disabled'});
    }, {theme:'dark', width:390});
  }
  await check('preferência escura do sistema', 'index.html', ({page}) => themeIs(page, 'dark'), {colorScheme:'dark'});
  await check('escolha clara prevalece sobre sistema escuro', 'index.html', ({page}) => themeIs(page, 'light'), {theme:'light', colorScheme:'dark'});
  await check('preferência inválida usa o sistema', 'index.html', ({page}) => themeIs(page, 'dark'), {theme:'invalido', colorScheme:'dark'});
  await check('tema funciona com armazenamento bloqueado', 'index.html', async ({page}) => {
    await themeIs(page, 'dark'); await page.locator('#alternar-tema').click(); await themeIs(page, 'light');
  }, {blockedStorage:true, colorScheme:'dark'});
  await check('preferência acompanha navegação entre páginas', 'login.html', async ({page}) => {
    await themeIs(page, 'light'); await page.locator('#alternar-tema').click();
    await page.goto(front+'/stock.html'); await themeIs(page, 'dark');
  });
  for (const role of [1,2,3]) await check('login por CPF/senha e destino do cargo '+role, 'login.html', async ({page, calls}) => {
    await page.locator('#usuario').fill('22222222222'); await page.locator('#senha').fill('senha-ficticia');
    await page.locator('#form-login button[type="submit"]').click();
    await page.waitForURL('**/'+(role === 3 ? 'patient-dashboard.html' : 'admin-dashboard.html'));
    const call = calls.find(call => call.route === '/login');
    assert.deepEqual(call.body, {cpf:'22222222222', senha:'senha-ficticia'});
    assert.equal(await page.evaluate(() => localStorage.getItem('token_jwt')), 'token-novo-ficticio');
  }, {role});
  await check('menu mobile abre, fecha com Escape e restaura foco', 'stock.html', async ({page}) => {
    assert.equal(await page.locator('#sidebar').evaluate(el => el.inert), true);
    await page.locator('#hamburger').click();
    assert.equal(await page.locator('#hamburger').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#sidebar').evaluate(el => el.inert), false);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#hamburger').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'hamburger');
  }, {width:390});
  await check('modal mantém Tab dentro e devolve foco ao fechar', 'admin-medications.html', async ({page}) => {
    const openButton = page.getByRole('button', {name:/Novo Medicamento/});
    await openButton.click();
    await page.waitForFunction(() => document.querySelector('#modal-med').contains(document.activeElement));
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Salvar Medicamento');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#modal-med .modal-close').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modal-med').evaluate(el => el.classList.contains('hidden')), true);
    assert.equal(await openButton.evaluate(el => el === document.activeElement), true);
  });
  await check('pedido aprovado mostra aviso, atualiza saldo e não recarrega a página', 'stock.html', async ({page, calls}) => {
    await page.waitForFunction(() => document.querySelector('#lista-medicamentos').textContent.includes("D'Ávila"));
    let navigations = 0; page.on('framenavigated', () => navigations++);
    await page.locator('#lista-medicamentos button').click(); await page.locator('#req-qty').fill('2');
    await page.locator('#form-solicitar button[type="submit"]').click();
    await page.locator('#pedido-aviso:not(.hidden)').waitFor({timeout:2000});
    await page.waitForFunction(() => document.querySelector('.stock-num')?.textContent === '8');
    assert.equal(navigations, 0); assert.equal(await page.locator('#modal-request').evaluate(el => el.classList.contains('hidden')), true);
    assert.deepEqual(await page.evaluate(() => window.__alerts), []);
    const posts = calls.filter(call => call.method === 'POST'); assert.equal(posts.length, 1);
    assert.equal(posts[0].headers.authorization, 'Bearer token-ficticio'); assert.equal(posts[0].body.quantidade, 2);
    await page.locator('.pedido-aviso-fechar').click();
    assert.equal(await page.locator('#pedido-aviso').evaluate(el => el.classList.contains('hidden')), true);
  });
  await check('pedido recusado mantém formulário e mensagem padronizada sem sucesso', 'stock.html', async ({page}) => {
    await page.waitForFunction(() => document.querySelector('#lista-medicamentos button'));
    await page.locator('#lista-medicamentos button').click(); await page.locator('#req-qty').fill('2');
    await page.locator('#form-solicitar button[type="submit"]').click();
    await page.waitForFunction(() => window.__alerts.length === 1);
    assert.ok((await page.evaluate(() => window.__alerts[0])).includes('Estoque insuficiente'));
    assert.equal(await page.locator('#modal-request').evaluate(el => el.classList.contains('hidden')), false);
    assert.equal(await page.locator('#req-qty').inputValue(), '2');
    assert.equal(await page.locator('#pedido-aviso').evaluate(el => el.classList.contains('hidden')), true);
  }, {orderStatus:409});
  await check('quantidade fracionária continua bloqueada antes do pedido', 'stock.html', async ({page, calls}) => {
    await page.evaluate(async () => { abrirModal(42, 'Teste', 10); document.getElementById('req-qty').value = '1.5'; await realizarPedido({preventDefault(){}}); });
    assert.equal(calls.filter(call => call.method === 'POST').length, 0);
    assert.ok((await page.evaluate(() => window.__alerts[0])).includes('inteira'));
  });
  for (const file of ['stock.html', 'profile.html']) await check('funcionário mantém gestão de usuários em '+file, file, async ({page}) => {
    assert.equal(await page.locator('#link-usuarios').isVisible(), true);
  }, {role:2});
  await check('home incorpora marca e textos recebidos', 'index.html', async ({page}) => {
    assert.ok((await page.locator('#hero-title').textContent()).includes('Seu cuidado começa com acesso à informação'));
    assert.equal(await page.locator('.brand-mark').count(), 1);
    await page.screenshot({path:path.join(output, 'index-desktop-light.png'), fullPage:true, animations:'disabled'});
    await page.locator('#alternar-tema').click();
    await themeIs(page, 'dark');
    await page.screenshot({path:path.join(output, 'index-desktop-dark.png'), fullPage:true, animations:'disabled'});
  });
  await check('revisão: paciente sem pedidos tem mensagem legível no tema escuro', 'patient-dashboard.html', async ({page}) => {
    const message = page.getByText('Você ainda não tem nenhuma solicitação.');
    await message.waitFor();
    const colors = await message.evaluate(el => ({text:getComputedStyle(el).color, background:getComputedStyle(el.parentElement).backgroundColor}));
    assert.ok(contrast(colors.text, colors.background) >= 4.5, JSON.stringify(colors));
    const linkColors = await page.locator('#lista-solicitacoes a').evaluate(el => ({text:getComputedStyle(el).color, background:getComputedStyle(el.parentElement).backgroundColor}));
    assert.ok(contrast(linkColors.text, linkColors.background) >= 4.5, 'Link do estado vazio: '+JSON.stringify(linkColors));
    await page.screenshot({path:path.join(output, 'patient-empty-desktop-dark.png'), fullPage:true, animations:'disabled'});
  }, {theme:'dark', role:3});
  await check('revisão: página ativa lateral tem contraste no tema escuro', 'stock.html', async ({page}) => {
    const colors = await page.locator('#menu-admin .nav-item.active').evaluate(el => ({text:getComputedStyle(el).color, background:getComputedStyle(el).backgroundColor}));
    assert.ok(contrast(colors.text, colors.background) >= 4.5, JSON.stringify(colors));
  }, {theme:'dark'});
  await check('revisão: teclado navega nos links do menu mobile aberto', 'stock.html', async ({page}) => {
    await page.locator('#hamburger').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.querySelector('#sidebar').contains(document.activeElement)), true, 'Abrir deve encaminhar foco para a navegação.');
    for (let index=0; index<9; index++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.querySelector('#sidebar').contains(document.activeElement)), true, 'Tab escapou para conteúdo coberto.');
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'hamburger');
  }, {width:390});
  await check('revisão: pedido bem-sucedido mantém foco em conteúdo visível', 'stock.html', async ({page}) => {
    await page.waitForFunction(() => document.querySelector('#lista-medicamentos button'));
    await page.locator('#lista-medicamentos button').click();
    await page.locator('#form-solicitar button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('.stock-num')?.textContent === '9');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'pedido-aviso');
    await page.locator('.pedido-aviso-fechar').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'f-search');
  });
} finally {
  await browser.close();
  await writeFile(path.join(output, 'results.json'), JSON.stringify({passed, failed, realDatabaseWrites:false, results}, null, 2));
}
console.log(`Integração do front-end: ${passed} aprovados; ${failed} falhas.`);
process.exitCode = failed ? 1 : 0;
