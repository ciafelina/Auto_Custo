# Identificação e publicação do Alto Custo — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar a identificação do Grupo 5, corrigir os títulos e preparar o domínio Alto Custo, investigando o alerta do Google.

**Architecture:** Manter o front-end HTML/CSS/JS e a API existentes, com mudanças de apresentação verificadas por testes de navegador isolados. DNS/HTTPS e comprovação no Google usam a VM atual, com backups e sem alteração de dados ou conexão Azure. Executar nesta sessão pelo próprio agente, conforme a aprovação para aplicar/publicar.

**Tech Stack:** HTML/CSS/JavaScript, Playwright/Edge, Python/Paramiko e nginx/certbot existentes, DuckDNS e Search Console por interface.

**Spec:** `docs/superpowers/specs/2026-10-31-identificacao-alto-custo-design.md`, aprovada pelo usuário; verificação da propriedade e solicitação de revisão também autorizadas.

## Global Constraints

- Identificação: “Projeto acadêmico desenvolvido pelo Grupo 5 — Univesp. Versão 1.0.0 · 2026.”
- Nome público “Alto Custo”; candidato `altocusto.duckdns.org`, condicionado ao cadastro/propriedade do usuário.
- Preservar API, banco Azure, permissões, estoque/status/histórico e nomes internos.
- Recuperação por e-mail fora do escopo; nenhum novo cadastro ou alteração de senha na base real.
- Manter configurações/relatórios privados fora do Git; nenhum envio de mensagens ao grupo.
- HTTPS não elimina a classificação do Google; não contornar o aviso nem afirmar que sumiu sem comprovação.

## Review Focus

- Crédito/versão em telas pequenas: títulos legíveis e sem rolagem lateral nos temas claro/escuro.
- Menu com cargo 2: funcionário mantém acesso à gestão de usuários e chamadas à mesma API.
- Publicação estática: preserva INI, binário ativo, estoque e conexão ao Azure; recuperação não usa o banco antigo.
- Domínio indisponível/sem autenticação DuckDNS: não assumir propriedade nem remover a instalação existente.
- Arquivo Google: permanece disponível após atualização do front-end, com verificação limitada à conta/propriedade autorizadas.

### Tarefa 1 — Textos e identificação

**Files:** `Front_End/*.html`, `Front_End/css/style.css`, `tests/frontend-integration.mjs`, `docs/resumo-melhorias-grupo-5.md`.

**Interfaces:** Os IDs, formulários, scripts e links internos existentes permanecem. Sem mudança de contrato HTTP. Identificação estática reutiliza uma classe CSS própria para cada página.

- [x] Acrescentar cenários de navegador para identificação nas dez telas, títulos em português nos menus/cabeçalhos e login sem promessa de completar cadastro. Verificar 375/768/1024/1440 e ambos os temas, com fixtures.
- [x] Executar os novos cenários antes da edição; confirmar falhas correspondentes aos textos ausentes/errados.
- [x] Aplicar os textos aprovados, corrigir `stock.html`/`profile.html` e inserir identificação na home e nas outras telas. Manter legibilidade e largura.
- [x] Executar os cenários novos e a regressão pertinente; conferir capturas com dados fictícios e ausência de chamadas externas.
- [x] Atualizar resumo para o grupo de acordo com os resultados efetivos; registrar commit normal dos fontes/testes.

### Tarefa 2 — Propriedade e diagnóstico no Google

**Files:** Arquivo de comprovação baixado do Google, configuração nginx e pasta pública persistente na VM; documentação operacional. Arquivos e relatórios privados em `tests/.build/private/`.

**Interfaces:** Servir o arquivo de comprovação exato na raiz de `https://autocusto.duckdns.org/`, sem expor `/etc/autocusto` ou mudar a API. Search Console utiliza a conta Google aberta e aprovada.

- [x] Publicar somente o arquivo de comprovação, com backup da configuração nginx e `nginx -t` antes do reload.
- [ ] Conferir HTTPS, corpo/hash do arquivo e ausência de impacto no site/API; concluir a verificação autorizada no Search Console.
- [ ] Ler problemas de segurança e exemplos da propriedade. Investigar achados específicos e corrigir somente os confirmados.
- [ ] Após a publicação revisada, solicitar revisão com descrição factual. Registrar estado e eventual prazo externo sem prometer remoção imediata do alerta.

### Tarefa 3 — Domínio e atualização estática

**Files:** Configuração DuckDNS, nginx/certbot/timer atuais, script restrito de atualização estática e documentação de operação.

**Interfaces:** Mesmo servidor e `/api`; apenas host e arquivos públicos. Arquivo Google persiste fora da release estática, com rota exata. Sem reutilizar rollback que restaura o banco anterior.

- [x] Confirmar acesso ao DuckDNS e disponibilidade do nome; cadastrar/apontar `altocusto.duckdns.org` na conta do usuário ou registrar impedimento concreto.
- [ ] Preparar o certificado/renovação do novo domínio, mantendo o atual ativo; validar cadeia, hostname, DNS e proxy `/api` antes de divulgar.
- [ ] Criar atualização estática com manifesto de hashes, checagem de caminhos, backup e retorno limitado a nginx/arquivos públicos. Conferir que nenhum comando altera serviço/INI/banco.
- [ ] Testar preparação e falha/retorno em pasta descartável; preparar release pública, validar nginx e ativar com verificações HTTPS/hashes/API protegida e binário/configuração preservados.
- [ ] Conferir os títulos/identificação no site servido, resposta do arquivo Google, status da renovação e classificação pública do domínio. Manter explícitas as pendências externas.

### Tarefa 4 — Entrega

**Files:** `docs/qa-identificacao-alto-custo.md`, documentação de publicação, resumo do Grupo 5 e commits de fontes/testes.

- [ ] Entregar checklist operacional preenchido, capturas e resumo atualizado, distinguindo funcionalidades implementadas e pendentes.
- [ ] Auditar índice/histórico novo com Gitleaks e comparação com segredos conhecidos; verificar diff e ausência de arquivos privados.
- [ ] Enviar commits normais ao GitHub e conferir o commit remoto, com branch/arquivos validados na pasta principal.
- [ ] Informar endereço efetivo e estado do aviso do Google; listar qualquer bloqueio de acesso, DNS ou processamento externo.
