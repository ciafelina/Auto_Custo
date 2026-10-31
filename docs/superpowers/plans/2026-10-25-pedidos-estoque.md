# Item 4 — quantidade e estoque de pedidos

Objetivo: aceitar somente quantidade inteira positiva e medicamento válido; registrar pedido e reservar estoque de forma atômica, inclusive sob concorrência.

Diagnóstico: controller usa quantidade 1 quando o campo falta; serviço insere pedido antes de atualizar estoque e UPDATE não confere quantidade disponível. Exceções do serviço perdem o status ao serem embrulhadas em Exception.

Decisões: campos quantidade e idMedicamento obrigatórios, números inteiros positivos no intervalo de Integer. Entrada inválida retorna 400; medicamento inexistente retorna 404; estoque insuficiente retorna 409. Pedido e baixa ficam na mesma transação. A primeira operação é UPDATE condicionado a quantidadeEstoque >= quantidade solicitada; somente uma linha atualizada permite INSERT. Falha de INSERT desfaz a baixa. Manter GETDATE e as regras atuais de reserva imediata/status Pendente.

Arquivos: controllers/Controlador_Solicitacao.pas, services/Servico_Solicitacao.pas e utils/Mensagens.pas; Front_End/js/stock.js para validar valor inteiro e apresentar mensagem do servidor. Tests: orders.mjs, fixture SQLite com função GETDATE equivalente para o INSERT original, runner existente.

- [x] Escrever testes HTTP com banco fictício e observar falhas antes da correção.
- [x] Implementar validação no controller e serviço, baixa condicional e rollback.
- [x] Testar entradas inválidas, estoque insuficiente/inexistente, limite exato, rollback e pedidos simultâneos; executar regressão dos itens anteriores.
- [x] Compilar Win32/Debug, revisar e documentar resultados.

Não alterar edição de medicamento, devoluções de estoque/status, histórico, classificação de estoque ou endereço da API. Nenhum registro SQL Server real será alterado. Concorrência automatizada usa SQLite e o mesmo UPDATE condicional do serviço; a execução real no MSSQL permanece conferência integrada de ambiente.

## Evidências em 25/10/2026

- Reprodução: 25 dos 31 testes novos falharam antes da correção; os 139 testes das etapas anteriores permaneceram aprovados.
- Depois: 31 verificações de pedidos e 139 de regressão aprovadas (170 no total).
- Testes conferem diretamente o estoque e as solicitações persistidas: quantidade inválida não altera dados; pedido válido reserva a quantidade exata; limite exato zera o estoque; inexistente retorna 404; insuficiente/zerado/negativo/NULL retorna 409; falha de INSERT deixa estoque intacto.
- Concorrência: dois pedidos de quatro unidades contra estoque cinco resultaram em 201 e 409, saldo um. Vinte pedidos de uma unidade contra estoque dez resultaram em dez respostas 201 e dez 409, saldo zero e dez registros.
- O stress identificou particularidades do SQLite do harness (cache compartilhado e bloqueios de tabela). Diagnóstico OnError temporário comprovou `database table is locked`. A fixture passou a usar cache privado, modo Normal/WAL e espera por bloqueio, sem mudança de produção para contornar o banco fictício. Instrumentação temporária removida.
- GETDATE foi mantido no serviço; somente a fixture registra uma função de data equivalente para executar o INSERT original no SQLite.
- Build principal MSBuild Build Win32/Debug aprovado; hints H2443 anteriores permanecem. `node --check` aprovado para stock.js e orders.mjs.
- Revisão independente sem achados bloqueadores de produção. Cobertura de navegador e comparação individual de todos os códigos de erro são melhorias menores não realizadas nesta etapa. A suíte confere status, persistência e ESTOQUE_INSUFICIENTE.
- Limite: teste integrado no SQL Server e teste visual das telas permanecem conferência do ambiente. Nenhum dado real foi alterado. Item 5 ainda não iniciado.
