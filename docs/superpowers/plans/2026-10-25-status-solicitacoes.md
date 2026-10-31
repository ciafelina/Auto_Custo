# Item 6 — transições de status e estorno único

Objetivo: validar fluxo de solicitações e impedir devolução indevida ou duplicada de estoque.

Diagnóstico: AlterarStatus aceita qualquer texto, faz SELECT antes de UPDATE sem condição e permite reabrir Cancelado/Retirado. Duas chamadas podem decidir estornar com base no mesmo status antigo. A retirada do paciente já usa UPDATE condicionado a Aprovado.

Decisão baseada nas telas/serviço atuais: Pendente pode ir para Aprovado ou Cancelado; Aprovado pode ir para Retirado ou Cancelado (cancelamento de aprovado já permitido pela API); Cancelado e Retirado são terminais. Repetição de status retorna 409 sem alterar observação/estoque. Status desconhecido ou entrada inválida retorna 400; solicitação inexistente retorna 404.

Arquitetura: primeiro UPDATE de status condicionado à origem permitida, dentro de transação. Somente o vencedor pode devolver estoque ao cancelar. Ler medicamento/quantidade após ganhar a transição; exigir reserva positiva e medicamento/saldo válido, impedir overflow de Integer. Qualquer falha desfaz status, observação e estoque. A retirada do paciente compete com o mesmo status Aprovado e não devolve estoque.

- [x] Reproduzir matriz de transições, reabertura/repetição e concorrência com dados fictícios.
- [x] Implementar validações, UPDATE condicional e devolução protegida, preservando erros HTTP.
- [x] Executar matriz, rollback, cancelamentos concorrentes e disputa com retirada, além de regressão.
- [x] Compilar Win32/Debug, revisar e documentar.

Arquivos: services/Servico_AdminSolicitacoes.pas, controllers/Controlador_AdminSolicitacoes.pas, utils/Mensagens.pas e mensagem de erro em Front_End/js/admin-requests.js. Tests: request-status.mjs e runner.

Não alterar a escolha da observação na tela (item 9), histórico/exclusão (item 8) ou estoque cadastral. Sem alteração de schema nem correção retroativa de dados reais. Testes de concorrência usam SQLite e o mesmo SQL condicional; validação integrada no SQL Server permanece conferência de ambiente.

## Evidências de 25/10/2026

- Antes: 37 falhas nos 44 testes de status; 184 verificações anteriores permaneceram aprovadas.
- Depois: 44 testes de status e 184 de regressão aprovados (228 no total).
- Matriz de 16 transições confere HTTP, status, observação e saldo persistidos. Reabertura e repetição de estados finais são recusadas; recusa não sobrescreve observação.
- Cancelamento de reserva inválida (quantidade zero/negativa/NULL/acima do limite, medicamento inexistente/desvinculado, saldo NULL/negativo ou overflow) retorna 409 e mantém pedido/saldo intactos.
- Trigger de falha proposital na devolução confirmou rollback de status, observação e saldo.
- Dez cancelamentos simultâneos: um sucesso e nove conflitos, devolução única. Aprovações concorrentes: um sucesso e um conflito. Aprovação disputando cancelamento: final Cancelado com uma devolução. Retirada do titular disputando cancelamento: somente um vence; Cancelado devolve, Retirado preserva a baixa.
- Build principal MSBuild Build Win32/Debug aprovado; hints H2443 anteriores permanecem. Syntax check aprovado para admin-requests.js e request-status.mjs.
- Revisão independente sem achados bloqueantes; confirmou ordem de bloqueio e limites do teste SQLite, que não exercita driver/triggers/configuração do SQL Server real.
- Nenhum dado real foi alterado. Item 7 ainda não iniciado.
