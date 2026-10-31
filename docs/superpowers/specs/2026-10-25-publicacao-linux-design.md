# Publicação da versão corrigida na VM Linux

Objetivo autorizado: permitir que outras pessoas usem a versão corrigida do sistema pela internet, mantendo por enquanto o SQL Server atual. O usuário escolheu usar o IP da VM, sem domínio.

## Abordagem

Usar a infraestrutura existente em 102.37.16.34: nginx, serviço systemd autocusto e aplicação Linux de 64 bits. A VM alcançou a porta do SQL Server atual; login e compatibilidade pelo driver Linux ainda precisam ser validados. O compilador Delphi Linux está instalado neste computador, mas o cache de bibliotecas/SDK Linux precisa ser preparado.

Publicar uma nova compilação dos fontes corrigidos, preservando as 12 melhorias e as correções verificadas nos 121 cenários SQL Server. Reutilizar a versão antiga deixaria rotas sem autenticação; hospedar a API neste computador exigiria mantê-lo ligado e acessível. Por isso a publicação nativa na VM é a abordagem proposta.

## Mudanças necessárias

- Adaptar somente a compatibilidade Linux: remover dependência Windows sem uso, aceitar caminhos absolutos POSIX em AUTO_CUSTO_CONFIG e usar configuração externa adequada ao serviço.
- Manter a execução Windows e suas validações. Não reintroduzir chaves fixas nem credenciais no projeto.
- Compilar Linux64 com bibliotecas compatíveis; preparar a nova versão em pasta separada e testar antes da ativação.
- Configurar a API Linux em loopback, mantendo nginx como ponto público /api. Servir as telas corrigidas pelo mesmo nginx, com o endereço público da API em config.js.
- Usar o SQL Server atual, sem migração, exclusão, limpeza ou cópia dos dados reais. Transferir a configuração de banco por SSH e guardá-la fora do site, legível somente pela conta do serviço. Gerar chave JWT própria da publicação.
- Preparar HTTPS para o IP com certificado válido e renovação automática. Certificados de IP são de curta duração, exigindo verificar a renovação e o recarregamento do nginx.

## Ativação e verificação

Guardar o executável, telas e configuração anteriores para retorno em caso de falha. Validar driver/banco em leitura, serviço, nginx e certificado antes de apresentar o link como pronto. A troca exige breve reinício do serviço; restaurar a implantação anterior se a nova API não ficar saudável.

Verificar externamente HTTPS, carregamento de telas, destino /api, bloqueio de rotas sem token e recusa de token adulterado. Verificar login/cadastro apenas com dados de teste quando houver isolamento seguro; não movimentar estoque nem criar pedidos no banco real para testar. Rodar a regressão isolada Windows e testes Linux de configuração/autenticação; registrar limites e eventuais dependências de firewall Azure.

Não inclui trocar para Azure SQL, migrar dados, instalar banco na VM, alterar contas de usuários reais, comprar domínio ou mudar a assinatura Azure. A versão publicada passará a gravar no banco atual quando os usuários utilizarem as operações autorizadas.

## Exceção aprovada durante a execução

O banco atual apresenta certificado autoassinado que o driver Linux recusa por nome. Foram testadas confiança no certificado e alternativas de driver sem resolver a validação. Após explicação do risco de interceptação e da alternativa de aguardar um certificado válido, o usuário respondeu: **“Autorizar temporariamente para publicar agora”**. A publicação mantém TLS API–banco, mas usa opt-in de confiança sem validação de identidade somente em seu INI privado. O código/modelo permanece com validação como padrão. HTTPS do navegador continua usando certificado público válido. A correção definitiva do certificado do SQL Server permanece pendente e está documentada em docs/deploy-linux.md.
