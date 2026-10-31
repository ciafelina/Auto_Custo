# AutoCusto — base da API e publicação inicial de 31/10/2026

**Atualização posterior:** o endereço principal passou a ser `https://altocusto.duckdns.org/`, com identificação do Grupo 5 e novos arquivos públicos. Consulte `deploy-alto-custo.md` para a operação estática atual, recuperação que preserva o Azure e pendência do Google. Os detalhes abaixo registram a implantação base da API, cujo executável/INI permanecem ativos; o endereço anterior foi mantido.

Endereço público: **https://autocusto.duckdns.org/**. O domínio gratuito foi criado pelo usuário no DuckDNS e aponta para a VM `102.37.16.34`. O DNS é administrado no DuckDNS; esta opção não utiliza Cloudflare.

As melhorias de API e front-end estão publicadas. A página inicial apresenta a plataforma; o acesso à conta fica em `/login.html`. As telas usam a API HTTPS da mesma origem em `/api`.

## Banco e acessos

- Servidor: `db-altocusto.database.windows.net:1433`.
- Banco: `db-altocusto`, fornecido pelo amigo do usuário.
- Driver: Microsoft ODBC 18, `Encrypt=yes;TrustServerCertificate=no`.
- O serviço não utiliza os overrides `SSL_CERT_FILE`/`SSL_CERT_DIR` da implantação anterior.
- Contas, medicamentos e solicitações exibidos são os desse banco Azure. Não houve cópia ou migração de registros do antigo `Projeto_JoseThiago`.
- Administrador e funcionário mantêm gestão de usuários; alteração de cargo continua exclusiva do administrador. Cadastro público cria paciente.

O INI Windows em uso foi preservado. Credenciais Azure foram lidas do arquivo externo protegido `config.azure.ini` e transferidas por SFTP para configuração privada da release. Senha, chave JWT e token DuckDNS não constam dos arquivos públicos ou argumentos dos processos. Não foi necessário obter o token DuckDNS.

## Instalação ativa

- Release: `20261031-dd8afbbb9e14`.
- Executável: `/opt/autocusto/releases/20261031-dd8afbbb9e14/ProjetoFaculdade`.
- SHA-256: `46f3d933211073c4246f1336d00cb88dcb20790c08a4c5e5a44993c7e9c9b58b`.
- Arquivos públicos: `/var/www/autocusto-releases/20261031-dd8afbbb9e14`.
- INI privado: `/etc/autocusto/releases/20261031-dd8afbbb9e14.ini`, proprietário `root:autocusto`, modo `0640`.
- Serviço: `autocusto.service`, executado como `autocusto`; API somente em `127.0.0.1:9000`.
- Override: `/etc/systemd/system/autocusto.service.d/90-publicacao.conf`.
- Nginx do domínio: `/etc/nginx/sites-available/autocusto-domain`, habilitado por symlink em `sites-enabled`.
- Backup de recuperação: `/var/lib/autocusto-deploy/20261031-dd8afbbb9e14`, modo `0700`.

Os 27 arquivos públicos foram comparados por hash com o manifesto validado. A configuração pública define `apiBaseUrl: location.origin + '/api'`. As fontes de negócio da API e o front-end validado anteriormente foram preservados; a API foi recompilada para Linux64.

## HTTPS e renovação

Certificado Let's Encrypt para `autocusto.duckdns.org`, em `/etc/letsencrypt/live/autocusto-domain/`. Validade inicial: 31/10/2026 a 29/01/2027, sujeita à renovação automática.

O timer `autocusto-domain-certbot-renew.timer` verifica duas vezes ao dia, com atraso aleatório de até 30 minutos e execução persistente. Seu serviço renova somente o certificado `autocusto-domain` e recarrega o nginx. O desafio HTTP continua sendo servido em `/.well-known/acme-challenge/`, pelo webroot `/var/www/autocusto`, antes do redirecionamento HTTPS.

Emissão, desafio de teste e renovação simulada com execução do reload passaram. O navegador e os testes externos validaram normalmente cadeia e nome do certificado.

## Operação e recuperação

Usar o Python com Paramiko já preparado em `tests/.build/deploy/py-libs`. Os scripts pedem a senha SSH sem eco e recusam chaves de host desconhecidas.

```powershell
python scripts/publish-autocusto-domain.py status
python scripts/publish-autocusto-domain.py check-renewal
```

Recuperação emergencial desta publicação:

```powershell
python scripts/publish-autocusto-domain.py rollback
```

A recuperação restaura nginx, serviço, arquivos e estados anteriores do timer. **Também restaura a conexão anterior ao `Projeto_JoseThiago`**; ela não migra, apaga ou reconcilia dados gravados no Azure. Considerar essa diferença de banco antes de um retorno manual após novos cadastros ou pedidos. A instalação anterior foi preservada como contingência; o endereço principal divulgado deve ser o domínio.

Os scripts antigos `publish-linux.py` pertencem à implantação de 25/10 e não são o procedimento de recuperação desta release.

## Verificações concluídas

- Build Linux64 da API e do probe de compatibilidade concluídos.
- 12 verificações nativas em leitura no Azure: TLS estrito, identidade do banco, sete tabelas, colunas, três cargos, senha com capacidade para BCrypt, 19 permissões, definição conhecida somente de leitura da procedure e consultas reais dos dois painéis. Repetidas no INI definitivo antes da ativação.
- Seis testes de recuperação/readiness aprovados no Linux, com serviços simulados; incluem arquivos, symlinks, estado do timer, cancelamento de jobs somente do AutoCusto e recusa de certificado persistentemente inválido.
- 64 testes externos aprovados: domínio/HTTPS, 27 hashes públicos, 26 operações privadas sem token, JWT inválido, login fictício, arquivos privados bloqueados, tema, mensagens e viewport de celular no Edge.
- Processo/configuração efetivos, banco Azure, loopback, timer ativo e INI `0640` confirmados. A verificação das últimas cem linhas do journal não encontrou a senha ou a chave JWT da publicação; os valores não foram exibidos.
- Renovação simulada e reload passaram após a ativação.

Os 64 testes da publicação não criaram cadastros nem movimentaram estoque. Posteriormente, com autorização explícita, o fluxo completo no Azure passou **30 cenários, zero falhas** na execução `20261031-765d0947685e`: cadastro/login, pedido, aprovação e retirada pelo site, persistência SQL, permissões, quantidades, edição, classificação, histórico, observações e cancelamento único. Foram usados exclusivamente três usuários, um medicamento e duas solicitações fictícias, todos removidos. Contagens e assinaturas das sete tabelas originais permaneceram idênticas; nenhum dado real foi alterado. Relatório e checklist em `docs/resultado-e2e-azure.md`; evidências em `tests/.build/azure-e2e/20261031-765d0947685e/`.

A regressão de 503 cenários e a integração SQL Server de 121 cenários em cópia isolada pertencem às etapas anteriores. Nenhum reboot ou segundo celular físico foi usado nestas conferências.

A primeira ativação foi recuperada automaticamente ao encontrar o certificado anterior durante a transição de workers do nginx. O certificado novo foi validado em uma instância isolada. A ativação passou após incluir espera limitada, sempre repetindo a verificação TLS completa; o certificado anterior transitório foi observado na primeira tentativa e o novo na seguinte. A revisão não apontou pendências P1/P2.

Evidências locais: `tests/.build/deploy-domain/`, `tests/domain-publication-green.log`, `tests/domain-linux-build.log` e `tests/domain-database-probe-build.log`. Roteiro operacional: `docs/qa-publicacao-autocusto.md`.
