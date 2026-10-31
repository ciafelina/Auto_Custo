# Item 7 — exibição segura e botões com nomes especiais

Objetivo: dados da API devem aparecer como texto e não criar HTML/JavaScript; aspas/apóstrofos não podem quebrar ações.

Diagnóstico: seis telas interpolam dados em innerHTML. Tabelas/cards interpolam nomes e objetos JSON em onclick; encodeURIComponent não codifica apóstrofos e não torna essa composição segura. Descrições em title e status/datas em modais também são vulneráveis.

Decisão: construir elementos com createElement/textContent e atributos por propriedades; botões recebem addEventListener com closure do objeto original. HTML estático de carregamento/estado vazio pode permanecer. Modal de medicamento/usuário/solicitação aceita objeto diretamente e mantém entrada codificada antiga por compatibilidade. Não limpar dados no banco nem remover caracteres legítimos.

Helper comum js/ui-safe.js: UI.el(tag, className, text), UI.add(parent,...children), UI.btn(label,className,handler,options), UI.msg(container,text,{tableCols,className}), UI.detail(label,value). Nenhum método interpreta texto como HTML ou código.

- [x] Criar testes em navegador real com dados fictícios e reproduzir execução de marcação e botões quebrados.
- [x] Corrigir telas em grupos independentes: cadastros administrativos; solicitações/painel do paciente; estoque/painel administrativo.
- [x] Integrar helper e testes, verificar texto literal, atributos e cliques com nomes especiais, e executar regressão completa.
- [x] Revisar e documentar resultados e limites.

Arquivos: helper, seis JSs, seis HTMLs para carregar helper antes do script, teste browser-safety.mjs e runner. API, regras de status, observação de outra solicitação (item 9), classificação (item 10) e URL configurável (item 12) não mudam.

Teste de navegador: Edge/Chrome headless via Playwright já disponível no runtime local. Todo arquivo/requisição é interceptado com fixtures locais; nenhuma chamada chega ao SQL Server ou a outro serviço. Payloads de teste apenas incrementam uma flag local caso sejam executados.

## Evidências de 25/10/2026

- Antes: os 16 casos de navegador falharam. Dados criavam elementos img/svg, nomes com apóstrofos quebravam os callbacks e modais não abriam corretamente.
- Depois: 18 casos de exibição segura aprovados em Edge headless, mais 228 verificações anteriores (246 no total). Dois casos adicionais conferem listas com múltiplos registros e alvos corretos dos cliques.
- Conferidos nomes, email, descrições, title, status e datas como texto; nomes completos preservados nos modais de cadastro/estoque/exclusão, cargo/status/edição de usuários, detalhes de solicitação e solicitação de medicamento.
- Botões de aprovação/rejeição e retirada receberam os IDs/status esperados. Nenhum elemento do payload foi criado e a flag de execução permaneceu zero nos casos verificados.
- Alerta de estoque zerado preservou os nomes em elementos strong legítimos, sem interpretar marcação nos dados. Mensagens de erro de quatro telas permaneceram texto.
- Todas as ocorrências restantes de innerHTML nos scripts são strings constantes ou limpeza; não há callbacks onclick gerados nos scripts. Os seis HTMLs carregam ui-safe antes de suas telas.
- Sintaxe dos sete JSs aprovados em node --check. Sem alteração de fonte Delphi/API; regressão compila e exercita o harness existente.
- Execução paralela limitou cada implementador aos seus dois JSs; integração e testes completos executados pelo agente principal.
- Revisão independente sem achados bloqueantes. As oportunidades de cobertura apontadas foram atendidas: a suíte agora falha se houver pageerror não tratado e testa registros múltiplos de medicamentos/solicitações. Regressão completa aprovada após esses acréscimos.
- Conferência integrada no SQL Server real continua pendente; esta etapa verificou renderização/interações no navegador com API simulada. Nenhum dado real foi alterado.
- Item 8 ainda não iniciado.
