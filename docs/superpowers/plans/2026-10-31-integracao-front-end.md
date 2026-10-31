# Integração do front-end — plano de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar o visual recebido sem perder as regras dos itens 1 a 12.

**Architecture:** HTML/CSS da referência sobre os scripts corrigidos. Um `js/theme.js` compartilhado cuida somente de apresentação; `js/accessibility.js` continua responsável por menu, foco e teclado. `js/stock.js` recebe apenas o aviso de sucesso e atualização sem reload.

**Tech Stack:** HTML, CSS, JavaScript, Node.js e Playwright/Edge existentes. Sem novas dependências de produção.

**Spec:** `docs/superpowers/specs/2026-10-31-integracao-front-end-design.md`

## Global Constraints

- Preservar API, banco e publicação; preservar a pasta recebida.
- Manter helpers e ordem de carregamento de configuração/API/erros/UI/estoque.
- Não importar endereços fixos ou interpolação de dados em HTML da referência.
- Preferência de tema é apresentação e nunca decide permissões.
- Workspace sem Git: preservar backup e entregar na pasta principal atual.

## Review Focus

- Tema salvo contrário ao sistema; preferência inválida ou armazenamento bloqueado.
- Contraste em botões e superfícies com cores antes fixadas em branco.
- Menu em celular e foco em modais, sem controles sobrepostos.
- Login continua enviando CPF/senha e direcionando cada cargo.
- Pedido recusado não mostra sucesso nem perde os dados do formulário.

### Tarefa 1: Integrar apresentação e comportamentos

**Files:** `Front_End/*.html`, `Front_End/css/style.css`, `Front_End/js/theme.js`, `Front_End/js/stock.js`, `Front_End/js/accessibility.js`; `Front_End/js/dashboard.js` somente cores do estado vazio. Teste `tests/frontend-integration.mjs`.

**Interfaces:** conservar IDs e funções atuais; usar chave `tema` da referência e `data-theme` no HTML; aviso `#pedido-aviso` e botão `.pedido-aviso-fechar`.

- [x] Preservar ZIP/hashes do front-end atual e hashes de origem e backend.
- [x] Escrever testes de navegador de tema, login, teclado, aviso e recusa de pedido; observar falhas das funções novas antes da implementação.
- [x] Integrar HTML/CSS, conservar diferenças funcionais corrigidas e scripts atuais; adicionar tema compartilhado e aviso de pedido.
- [x] Executar os novos testes e verificar capturas desktop/celular nos dois temas.

### Tarefa 2: Regressão e entrega local

**Files:** `tests/run-authorization.ps1`, `tests/README.md`, `docs/qa-integracao-front-end.md`.

**Interfaces:** incluir novo teste no runner, preservando propagação de falha; APIs de teste continuam isoladas.

- [x] Executar a suíte completa existente e os novos cenários; corrigir regressões comprovadas.
- [x] Conferir hashes do backend e da pasta recebida, recursos das páginas e sintaxe JavaScript.
- [x] Revisar a integração e registrar resultados, limitações e checklist operacional em português.

Resultado final: 503/503 verificações em 18 suítes, exit code 0. Inclui 40 cenários novos e 463 anteriores. Reprodução dos achados de revisão antes das correções e confirmação de contraste/foco após os ajustes. Sintaxe válida em 16 scripts, recursos/IDs das dez páginas válidos, backend e fonte recebida intactos. Revisão independente sem pendências importantes. API publicada e banco real não foram acessados nem alterados nesta etapa; integração entregue localmente na pasta principal.
