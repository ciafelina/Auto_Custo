# Validação integrada com SQL Server

Solicitação: executar os fluxos completos no SQL Server após os 12 itens implementados. Usar o provider MSSQL real e conferir persistência, paginação, procedures, integridade e concorrência. Não alterar cadastros de usuários/medicamentos reais durante testes.

## Pré-verificação

- [x] Conferir disponibilidade de processo API/porta 9000 sem interromper processos existentes.
- [x] Ler somente presença de parâmetros da configuração externa, sem mostrar credenciais.
- [x] Consultar serviços/processos/instalações locais de SQL Server.
- [x] Identificar nome da instância, banco e tipo de autenticação.
- [x] Validar conexão e metadados/constraints/procedures/versão usando tests/inspect-sqlserver.ps1.
- [x] Definir base de homologação isolada ou cópia de schema antes de gravações de teste.

Situação inicial em 25/10/2026: INI externo existe com Base.Servidor/Porta/Banco/Usuario/Senha vazios. SQL Server Management Studio 22 e drivers ODBC 17/18/Native Client estão instalados. Não foram encontrados serviço registrado, processo SQL ou listener nas portas locais usuais. Existe pasta residual MSSQL16.SQLEXPRESS, sem sqlservr.exe no caminho padrão; leitura do diretório de dados/log é restrita. Nenhum arquivo de banco foi aberto ou alterado. Usuário informou que o banco fica neste computador; solicitado o servidor/banco/tipo de autenticação utilizado no Management Studio.

## Preparação técnica

- [x] Diagnóstico de conexão/metadados sem comandos de escrita em tests/inspect-sqlserver.ps1.
- [x] Compilar tests/build-sqlserver-harness.ps1: usa main/controllers/services/Conexao reais, sem fixtures SQLite, porta 19002 restrita a loopback e cabeçalho X-AutoCusto-Integration: sqlserver.
- [x] Executar com configuração da base de homologação e chave JWT exclusiva de testes por ambiente; não reutilizar sessões ou alterar o INI atual silenciosamente.

## Cenários após conexão

1. Estrutura: tabelas/colunas/defaults/identidades/FKs/triggers, roles 1/2/3, procedures de painel e consultas SQL Server.
2. Cadastro/login com nome contendo aspas; credenciais inválidas; paciente/funcionário/admin e revogação de acesso. Criar apenas contas marcadas para teste.
3. Consultas com busca/categoria/status, paginação e painéis; mínimo distinto por medicamento em telas/filtros/indicadores.
4. Pedido com quantidade válida/inválida e insuficiência; reserva persistida e rollback em falha, somente medicamentos de teste.
5. Edição cadastral preserva saldo atualizado; ajuste explícito de estoque funciona.
6. Todas as transições de status, retirada própria/alheia, repetição/reabertura e devolução única.
7. Concorrência: pedidos versus saldo, cancelamentos simultâneos e disputa cancelamento/retirada; verificar resultado/integridade/deadlocks sem presumir semântica SQLite.
8. Observação permanece na solicitação alvo; ação sem observação preserva valor.
9. Exclusão bloqueada com histórico e permitida sem histórico, preservando os vínculos.
10. JSON/erros/headers e CORS com a API SQL real de homologação; navegador usando config.js para 19002.

Conferir o banco depois das operações e registrar evidências sem dados pessoais ou segredos. Limpeza deve atingir exclusivamente os IDs criados nesta rodada e respeitar o histórico (não usar DELETE amplo em banco real). Se não houver ambiente seguro ou conexão, registrar a dependência concreta e não declarar a validação SQL concluída.

Preparação verificada: tests/sqlserver-build.log terminou com exit code 0 e 17657 linhas compiladas. O executável SQL de integração foi compilado, mas não iniciado. tests/sqlserver-preflight.log registrou configuração de Base incompleta; nenhuma operação de negócio foi executada.

Atualização pela janela do Management Studio: confirmou banco Projeto_JoseThiago, autenticação SQL e conexão a um servidor remoto (o cliente SSMS é que está neste computador). Os valores de servidor/porta/banco/login foram preenchidos apenas no INI externo; senha e chave JWT foram preservadas sem exibição. A conexão TCP ao endpoint foi confirmada, sem autenticação ou consulta. A senha segue como dependência: solicitado ao usuário preencher localmente Senha= e salvar, sem enviá-la ao chat. A abertura do INI no painel foi solicitada e retornou queued. Não foram lidas credenciais salvas do SSMS, alterados dados ou acessados os demais bancos visíveis no servidor. A consulta vazia SQLQuery1 foi aberta no banco correto, mas nenhum SQL foi inserido/executado.

## Execução após preenchimento privado da senha

Conexão confirmada em SQL Server 2022 Express (16.0.1190.2), collation Latin1_General_CI_AI e compatibilidade 120. Foram inspecionados somente metadados e os três cargos de referência. A estrutura de sete tabelas e duas procedures foi exportada com SMO ScriptData=False; os dados de usuários, medicamentos, solicitações e documentos não foram copiados. Os sete relacionamentos FK foram mantidos na cópia. Não foi usado DBCC CLONEDATABASE, cuja finalidade é diagnóstico.

Cada execução cria um banco AutoCusto_IT com nome e marcador exclusivos. A API usa o provider FireDAC/MSSQL real em loopback:19002, verifica nome e marcador antes de abrir a porta e recebe um INI temporário protegido com a mesma ACL do arquivo original. Uma chave JWT fictícia é usada somente nessa API. O bridge aceita operações de teste enumeradas, sem executar SQL arbitrário recebido pelo Node. O banco de origem recebe apenas leituras de metadados/cargos; toda escrita de negócio e DDL de teste ocorre na cópia identificada. A limpeza verifica nome, database_id e marcador antes de remover a cópia e remove a configuração temporária mesmo se houver falha no DROP.

Primeira rodada completa: 96 de 99 cenários passaram. O painel não incluía Cancelado no contador legado Reprovados, e duas disputas de exclusão de medicamento com pedido retornaram 500. Diagnóstico repetido registrou código SQL nativo 1205, sem mensagens/SQL/parâmetros sensíveis no log. Um teste adicional reproduziu o mesmo problema em exclusão de conta com pedido. As rodadas encerradas removeram os bancos e INIs temporários, preservando o banco original.

Correções em validação: contadores do painel lidos juntos, somando Cancelado e Reprovado; exclusões adquirem XLOCK/HOLDLOCK no cadastro antes de ler solicitações. Revisão independente pediu também verificar cancelamento concorrente com exclusão, pois as duas operações ainda poderiam adquirir locks em ordem inversa. Resultado final será registrado após a execução dos cenários adicionais e da regressão.

## Resultado da integração

- [x] Reproduzir 1205 também entre cancelamento e exclusão: sete falhas em dez disputas antes da correção, sem perda de histórico.
- [x] Cancelamento lê o identificador antes da transação, bloqueia o medicamento antes do CAS da solicitação, relê/confere vínculo e quantidade e só estorna após vencer a transição. Rollback permanece abrangendo status, nota e saldo.
- [x] Executar a suíte final MSSQL: **121 aprovados, zero falhas**, exit code 0.
- [x] Validar as 25 disputas finais: dez exclusões de medicamento com pedido, cinco exclusões de conta com pedido, dez cancelamentos com exclusão.
- [x] Confirmar 20 pedidos por dez unidades, dez cancelamentos com devolução única, retirada versus cancelamento, rollback real via triggers e fluxo real de navegador (login, exibição literal, pedido, aprovação, retirada).
- [x] Remover banco e INI temporários: cleanup.json com removed/temporaryConfigRemoved=true, sourceWritesPerformed=false e cleanupErrors vazio.
- [x] Compilar o executável principal Win32/Debug, exit code 0; apenas hints H2443 preexistentes em Servico_AdminUsuarios.
- [x] Revisão independente das correções de produção e isolamento; nenhum P1/P2 pendente.

A regressão local revelou uma diferença da fixture: remover XLOCK mantendo um SELECT dentro de transação SQLite DEFERRED provoca SQLITE_BUSY ao promover snapshot WAL. Foi preservado o código/asserções da API e ajustado somente Conexao fictícia para BEGIN IMMEDIATE (FireDAC xiSnapshot). A fonte instalada FireDAC.Phys.SQLite.pas confirma esse mapeamento. O SQLite serializa escritores globalmente, por isso não é evidência de granularidade/ordem dos locks MSSQL; a suíte real valida essa parte. A regressão funcional final passou: **463 aprovados, zero falhas**, exit code 0, inclusive dez cancelamentos com um sucesso/nove conflitos. Sintaxe JavaScript e PowerShell SQL Server válida. A revisão independente também aceitou a adaptação e sua limitação explícita.

Permanece fora da automação nesta máquina: acesso à aplicação por um segundo computador físico, incluindo configuração de endereço e regras reais de rede/firewall. Não foi aberto firewall, publicada API nem alterada a procedure do banco original.
