# Item 5 — preservar estoque ao editar medicamento

Objetivo: PUT de dados cadastrais não pode sobrescrever saldo alterado por pedidos ou ajustes de estoque.

Diagnóstico: Servico_AdminMedicamentos.Atualizar inclui quantidadeEstoque no UPDATE e assume zero quando estoque não está no JSON. A tela envia o saldo obtido ao abrir o modal, que pode ficar antigo.

Decisão: remover o saldo do UPDATE cadastral e ignorar qualquer campo estoque recebido nessa rota, inclusive de clientes antigos. Cadastro POST mantém estoque inicial; PATCH específico de estoque permanece disponível. Na tela, estoque inicial fica visível/habilitado apenas no cadastro; edição envia somente campos cadastrais e orienta usar a ação de estoque.

Arquivos: services/Servico_AdminMedicamentos.pas, Front_End/js/admin-medications.js, Front_End/admin-medications.html; tests/medications.mjs e tests/medication-form.mjs, fixture e runner.

- [x] Reproduzir saldo antigo após pedido/ajuste, omissão de estoque e edição simultânea.
- [x] Remover gravação de estoque do PUT e ajustar formulário/payload.
- [x] Verificar persistência de cadastro, estoque inicial, PATCH e regressão das etapas anteriores.
- [x] Compilar Win32/Debug, revisar e documentar.

Sem alteração de schema, status, exclusão, classificação ou API configurável. Dados SQL Server reais não serão alterados.

## Evidências de 25/10/2026

- Antes: nove dos onze testes de edição falharam e os três testes do formulário falharam; as 170 verificações anteriores permaneceram aprovadas.
- Depois: onze testes de API de medicamentos, três testes de formulário e 170 de regressão aprovados (184 no total).
- Pedido de três unidades reduziu saldo dez para sete; salvar cadastro antigo com estoque dez preservou sete. Ajuste de cinco para doze foi preservado ao salvar cadastro com estoque cinco.
- PUT com estoque omitido, nulo, texto inválido, negativo ou nome alternativo não modifica o saldo. Edição não repõe medicamento zerado. Pedido e edição concorrentes preservam reserva e dados cadastrais.
- POST continua registrando estoque inicial; PATCH continua alterando estoque deliberadamente.
- Testes de formulário executam o JS real e conferem estado dos campos e corpo HTTP. IDs, valores padrão e classes vêm do HTML real; DOM simulado não substitui conferência visual em navegador.
- Build principal MSBuild Build Win32/Debug aprovado; hints H2443 preexistentes permanecem. JavaScript e testes passaram em node --check.
- Revisão independente sem achados bloqueantes; reexecução dos três testes de formulário pelo revisor também aprovada.
- Limites: API testada com SQLite e middleware/serviços reais, sem alterar SQL Server real. Conferência integrada no SQL Server e renderização em navegador seguem pendentes do ambiente.
- Item 6 ainda não iniciado.
