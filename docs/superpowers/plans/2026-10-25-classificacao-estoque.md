# Item 10 — classificação pelo mínimo de cada medicamento

Objetivo autorizado: padronizar consulta, filtros, gestão e painel sem mudar saldos ou schema. Execução nesta sessão, uma melhoria por vez.

Diagnóstico: gestão já compara com estoqueMinimo; consulta e filtros usam 5 fixo e /produtos não retorna mínimo. Painel usa procedure sem fonte disponível.

Regra: saldo <= 0 ou NULL é indisponível (out); saldo positivo <= mínimo é crítico (low); acima do mínimo é disponível (available). Mínimo NULL/negativo é tratado como zero para classificação, sem corrigir registros silenciosamente. Críticos excluem indisponíveis, que têm alerta próprio. Igualdade pertence a crítico. Pedidos continuam permitidos em estoque crítico enquanto houver saldo.

Abordagem escolhida nesta execução: predicados SQL compartilhados pela consulta e painel e helper JS compartilhado pela consulta/gestão. Retornar estoqueMinimo em /produtos. Substituir somente o uso da procedure administrativa por consultas explícitas para totais/pendentes e lista de indisponíveis; painel do paciente permanece como está. Evita depender de uma procedure possivelmente divergente e de migração no banco. Alternativa de alterar a procedure exigiria fonte/implantação externa e não padronizaria as telas por si só.

- [x] Criar casos independentes com mínimos 0, 2, 5 e 10, limites, valores legados e testes de API/navegador.
- [x] Adaptar somente a paginação OFFSET/FETCH para LIMIT/OFFSET na conexão fictícia; regras de negócio e parâmetros seguem reais.
- [x] Reproduzir falhas antes de alterar produção.
- [x] Implementar predicados, mínimo no JSON, helper e consultas administrativas.
- [x] Rodar suíte completa, compilar Win32/Debug, revisar e documentar.

Arquivos: utils/Estoque.pas, services/Servico_Produtos.pas, services/Servico_Dashboard.pas, Front_End/js/stock-status.js, stock.js, admin-medications.js e as duas páginas; referências Delphi; testes stock-cases.mjs, stock-classification.mjs, stock-classification-browser.mjs, fixtures/Conexao.pas e runner.

Validação: itens com saldo 3/mínimo 2 devem ser disponíveis e saldo 6/mínimo 10 críticos, demonstrando ambos os erros do limite fixo. Totais e páginas dos filtros precisam concordar; filtros combinados mantêm busca/categoria; mudar mínimo muda classificação/painel sem alterar saldo. API e UI usam os mesmos exemplos com expectativas literais. O banco de testes será reinicializado apenas após verificar cabeçalho exclusivo do harness. Nenhum registro real será alterado.

Evidências: item10-red.log terminou em exit code 1: 23 falhas na API (campo mínimo ausente, filtros divergentes e procedure indisponível no SQLite) e 10 no navegador. Isso não prova erro dentro da procedure original, cuja fonte não está disponível. item10-green.log terminou em exit code 0: 341 verificações aprovadas, incluindo 24 novas de API e 34 de navegador. item10-build.log confirma compilação Win32/Debug; node --check passou em stock-status.js, stock.js e admin-medications.js. Revisão independente concluiu sem achados bloqueantes. Limite: não foi testada integração com SQL Server nem eventuais regras adicionais da procedure antiga.
