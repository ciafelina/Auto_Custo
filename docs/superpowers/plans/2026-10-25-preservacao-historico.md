# Item 8 — preservar histórico ao excluir cadastros

Objetivo: não apagar solicitações nem desvincular usuário/medicamento ao excluir cadastros.

Decisão confirmada pelo usuário: bloquear a exclusão de qualquer cadastro com solicitações vinculadas e explicar o motivo; não criar campos novos no banco. Contas/medicamentos sem solicitações podem ser excluídos normalmente. A desativação de usuários pelo painel já existente continua disponível.

Diagnóstico: ExcluirConta apaga Solicitacoes e depois Usuarios; Excluir medicamento define IdMedicamento=NULL antes de remover o medicamento. Os bloqueios atuais abrangem apenas Pendente/Aprovado e são feitos antes da transação.

Arquitetura: transação serializável com consulta do cadastro e de qualquer vínculo; exclusão física condicionada a NOT EXISTS e nenhuma escrita em Solicitacoes. Erro 409 com código HISTORICO_VINCULADO para qualquer status vinculado. Pedido novo confirma a existência/atividade do usuário dentro da transação serializável, mantendo o vínculo protegido até o INSERT; isso cobre disputa com exclusão, inclusive sem presumir FK na base recebida. Reserva de medicamento já é a primeira escrita de estoque e participa da mesma disputa com exclusão do medicamento.

- [x] Reproduzir perda/desvinculação de históricos e testar exclusões sem vínculo.
- [x] Implementar bloqueio transacional, preservar solicitações e atualizar mensagens da interface.
- [x] Testar estados antigos/ativos/desconhecidos, concorrência, rollback e regressão completa.
- [x] Compilar Win32/Debug, revisar e documentar limites.

Arquivos: Servico_Usuario.pas, Servico_AdminMedicamentos.pas, Servico_Solicitacao.pas, Mensagens.pas; profile.js/profile.html e mensagem/modal de admin-medications; teste history.mjs e runner. Sem schema/migration e sem alteração de registros reais.

Metadados: tentativa de consulta somente de sys.foreign_keys não conseguiu conexão; nenhum registro de negócio foi lido/alterado. Não presumir cascatas/FKs como única proteção. Histórico já apagado/desvinculado no passado não é reconstituído nesta etapa.

## Evidências de 25/10/2026

- Antes: 16 falhas em 20 verificações novas; as 246 verificações anteriores permaneceram aprovadas.
- Depois: 20 verificações de histórico e 246 de regressão aprovadas (266 no total).
- Exclusão de conta e medicamento bloqueada com histórico Retirado, Cancelado, Pendente, Aprovado, legado desconhecido e status NULL. Comparações dos registros confirmam cadastro, vínculo, quantidade, observação, data e saldo intactos.
- Cadastros sem solicitações continuam excluídos fisicamente; medicamento inexistente retorna 404. Triggers de falha fictícia confirmam rollback sem perda de dados.
- JOIN de histórico confirmou nomes e descrições disponíveis após tentativas de exclusão.
- Cinco disputas de exclusão/pedido por medicamento e cinco por usuário verificaram que pedido aceito mantém o cadastro e que exclusão aceita não deixa solicitações órfãs nem baixa de estoque residual.
- Não há DELETE de Solicitacoes nem definição de IdMedicamento=NULL nos serviços ativos de exclusão.
- Build principal MSBuild Build Win32/Debug aprovado; hints H2443 preexistentes permanecem. Sintaxe de profile.js, admin-medications.js e history.mjs aprovada.
- Revisão independente sem achados bloqueantes; confirmou integridade dos fluxos ativos e registrou a possibilidade de conflito/deadlock no SQL Server resultar em rollback e erro 500, sem perda de histórico. A verificação específica desse ambiente continua pendente.
- Limite: os testes de concorrência usam SQLite. Locks, deadlocks, triggers e driver do SQL Server real não foram exercitados; essa conferência integrada segue pendente. O rollback preserva integridade quando houver falha de transação.
- Sem novos campos ou scripts de schema. Nenhuma solicitação real foi lida ou alterada. Item 9 ainda não iniciado.
