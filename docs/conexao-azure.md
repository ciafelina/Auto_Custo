# Conexão Azure — atualização em 31/10/2026

A VM `102.37.16.34` acessou `db-altocusto.database.windows.net:1433` com o driver Microsoft ODBC18 e validação normal de certificado. O banco `db-altocusto`, suas tabelas/colunas, cargos, permissões, procedure e leituras dos painéis foram validados em leitura. A aplicação publicada em **https://autocusto.duckdns.org/** passou a utilizar esse banco. Não houve migração ou alteração de registros durante os testes. Ver `docs/deploy-autocusto.md`.

O IP de saída da VM foi confirmado como `102.37.16.34`. Nenhuma regra de firewall Azure foi alterada nesta publicação. A verificação anterior, abaixo, descreve a tentativa a partir do computador local, não a conexão da VM atual. O arquivo Windows ativo foi preservado.

## Verificação anterior — 25/10/2026

O site http://102.37.16.34/ respondeu HTTP 200 e a API respondeu em http://102.37.16.34/api/produtos. O login SSH na VM foi confirmado com consulta somente de leitura (`uname -sm`): Linux x86_64. Nenhum serviço ou arquivo remoto foi alterado.

O servidor db-altocusto.database.windows.net respondeu na porta 1433. A tentativa de conexão SQL com criptografia e validação do certificado retornou 40615, indicando que o IP público deste computador, 177.54.192.201, não está permitido no firewall. A autenticação e a compatibilidade do schema ainda não foram confirmadas.

Foi preparado o arquivo externo `C:\Users\EBT\AppData\Local\AutoCusto\config.azure.ini`, com acesso exclusivo ao usuário atual e SYSTEM e herança bloqueada. Ele contém o destino Azure informado e preserva a chave JWT local. A configuração ativa `config.ini` foi mantida. Senhas não foram adicionadas ao projeto, a este documento ou aos argumentos dos processos.

O responsável pelo Azure deve abrir o servidor SQL `db-altocusto`, acessar Segurança > Rede (Networking), adicionar uma regra com IP inicial e final 177.54.192.201 e salvar. Se estiver usando outro computador, o botão de adicionar o IP atual pode selecionar um IP diferente; usar o endereço informado pelo erro da tentativa local. [Documentação Microsoft](https://learn.microsoft.com/en-us/azure/azure-sql/database/firewall-create-server-level-portal-quickstart?view=azuresql).

Após a liberação, validar login, tabelas, cargos e procedures em modo somente leitura antes de selecionar esse arquivo com `AUTO_CUSTO_CONFIG`. Nenhum teste de escrita ou migração foi executado no banco Azure.

Na verificação inicial, a publicação retornou cinco medicamentos sem autenticação (`sucesso=true`). Posteriormente, o usuário autorizou publicar a versão corrigida usando o SQL Server atual; a VM foi atualizada e a rota passou a exigir autenticação, com HTTPS em https://102.37.16.34/. Essa publicação não usa o Azure SQL. Detalhes e a exceção temporária de certificado do banco atual estão em `docs/deploy-linux.md`. As credenciais compartilhadas no chat devem ser substituídas pelos responsáveis.
