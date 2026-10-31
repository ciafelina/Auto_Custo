# Fluxo completo no Azure com dados exclusivos de teste

Autorização explícita: executar cadastro, pedido, aprovação e retirada no banco do amigo com dados de teste, sem modificar dados reais.

Usar o domínio e a API publicados, com navegador Edge descartável e sem simular respostas da aplicação. Criar três contas fictícias pelo cadastro público (paciente, outro paciente e operador), todas inicialmente pacientes; somente a conta marcada como operador desta execução recebe cargo2 por SQL parametrizado e verificação exata de propriedade. Não usar contas existentes nem criar administrador.

Criar um medicamento fictício com nome e descrição ostensivos de teste, saldo5 e mínimo2. Todos os POST/PUT/PATCH/DELETE enviados pelo teste devem ser limitados aos CPFs, nomes e IDs dessa execução. As listas de medicamentos/solicitações serão filtradas pelo identificador do teste. Nunca usar medicamentos reais ou alterar seus saldos.

Um auxiliar SQL privado na VM verifica previamente a ausência dos CPFs/nomes, a identidade do banco e ausência de triggers habilitadas nas tabelas envolvidas. Guarda contagens e assinaturas SHA256 dos registros existentes nas sete tabelas, sem exportar seus dados. Não altera schema, procedures, constraints ou regras de firewall.

O auxiliar aceita somente operações enumeradas: preflight, promover operador de teste, ler estado próprio e limpar dados próprios. Limpeza transacional: conferir CPFs+nome+email exatos, nome exato do medicamento, vínculos exclusivamente entre dados de teste e inexistência de referências externas; excluir primeiro solicitações de teste, depois medicamento e contas próprias. Qualquer vínculo estranho impede a limpeza; nunca excluir registros de terceiros nem restaurar dados antigos sobre atividade real concorrente.

Conferir o caminho pelo navegador (cadastro/login, criação do medicamento, pedido, aprovação com observação, retirada), persistência no SQL e negativas de quantidade, saldo, permissões, titularidade, repetição de retirada/cancelamento, edição sem sobrescrita e preservação do histórico.

Remover os dados fictícios ao final, inclusive em falha, e comprovar registros/estoque originais por comparação com as assinaturas anteriores. Identidades SQL podem avançar naturalmente; não fazer reseed. Se houver alterações legítimas concorrentes, registrar divergência e preservar o estado atual, sem sobrescrever registros.

Credenciais reais ficam no INI privado ativo da API. Senha das contas fictícias gerada em memória e não impressa. Sem mudança de API/site/configuração de produção. Preparar o auxiliar e testar suas proteções antes de permitir escritas; revisão independente somente leitura antes da execução no Azure.
