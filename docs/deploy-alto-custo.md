# Alto Custo — apresentação e publicação em 31/10/2026

**Atualização posterior no mesmo dia:** recuperação de senha por e-mail publicada, com novo executável e novas telas. Operação, versão ativa e retorno seguro estão em [recuperacao-senha.md](recuperacao-senha.md). As seções abaixo registram a publicação estática anterior; seus caminhos de API e comandos de retorno não representam mais a instalação ativa. O acompanhamento do Google permanece descrito aqui.

Endereço principal: **https://altocusto.duckdns.org/**. O nome público foi corrigido para **Alto Custo**, com identificação “Projeto acadêmico desenvolvido pelo Grupo 5 — Univesp. Versão 1.0.0 · 2026”. O endereço anterior, `https://autocusto.duckdns.org/`, foi preservado e apresenta a mesma interface revisada. O DNS continua no DuckDNS, apontando os dois nomes para a VM do projeto; não há Cloudflare nesta opção gratuita.

## O que mudou

A identificação está na apresentação inicial, nos rodapés das dez telas e antes dos formulários de acesso/cadastro. O cabeçalho do estoque agora informa “Consulta de Estoque”, e os menus do paciente usam “Painel de controle”, inclusive em telas menores. O login explica o direcionamento ao painel e a edição posterior do perfil; o cadastro informa sua finalidade real. As informações de saúde continuam opcionais.

As regras de autenticação, permissões, estoque, pedidos, status, observações e histórico foram preservadas. Recuperação automática de senha e notificações por e-mail continuam fora do escopo. Os nomes internos do repositório, serviços e banco não foram renomeados.

## API e banco preservados

- A API Linux permanece no executável `/opt/autocusto/releases/20261031-dd8afbbb9e14/ProjetoFaculdade`, SHA-256 `46f3d933211073c4246f1336d00cb88dcb20790c08a4c5e5a44993c7e9c9b58b`.
- O serviço `autocusto.service` continua no mesmo processo, com o mesmo INI privado e seu conteúdo preservado. A publicação estática não o reinicia nem restaura configurações antigas.
- Banco: `db-altocusto` em `db-altocusto.database.windows.net`, com validação de certificado mantida. Nenhum script desta etapa executa escrita no SQL ou altera senha de usuário.
- Os dois hosts usam `/api` na mesma origem HTTPS, com proxy para `127.0.0.1:9000`. A rota privada sem autenticação continua retornando 401.

## Publicação estática e recuperação

O publicador é `scripts/publish-alto-custo-static.py`, com módulo remoto `scripts/alto_custo_static_remote.py`. Ele usa somente arquivos públicos rastreados pelo Git, exige o front-end sem alterações pendentes e substitui `config.js` no pacote pela base da API da mesma origem. O pacote tem manifesto SHA-256, limites de tamanho e rejeição de caminhos privados, travessia, links e membros duplicados.

As releases públicas ficam em `/var/www/autocusto-releases/`. O identificador e os hashes efetivos da operação local estão em `tests/.build/alto-custo-publication/release.json` e `activate.json`; o estado ativo e os backups ficam em `/var/lib/autocusto-branding/` na VM. O INI e o executável da API não pertencem a esses snapshots.

Antes de alterar o tráfego, o publicador salva um registro pendente e o estado anterior. A gravação do registro ativo integra a mesma operação protegida: falha de gravação retorna os hosts e o registro anterior. O comando de recuperação encontra tanto operações concluídas quanto interrompidas. Um lock POSIX recusa operações concorrentes; uma operação pendente exige recuperação antes de uma nova ativação. Recuperar preserva o estado atual da API e do Azure, incluindo alterações legítimas posteriores na configuração privada.

Os scripts solicitam a senha SSH sem eco e recusam host desconhecido. Requerem Python/Paramiko e a chave de host previamente conferida em `tests/.build/azure/known_hosts`; esse arquivo local não é versionado. A evidência nativa de teste precisa corresponder ao hash atual do módulo. Na máquina preparada do projeto:

```powershell
python scripts/test-alto-custo-publisher-linux.py
python scripts/publish-alto-custo-static.py activate
python scripts/publish-alto-custo-static.py status
python scripts/publish-alto-custo-static.py renewal-test
```

Para recuperar somente a última atualização estática:

```powershell
python scripts/publish-alto-custo-static.py rollback
```

A recuperação retorna nginx, arquivos públicos e o temporizador de certificado ao estado imediatamente anterior daquela atualização. No retorno da primeira ativação, o nome novo pode voltar ao estado de preparação, enquanto o endereço anterior permanece como contingência. Nenhuma recuperação estática troca a conexão do banco. **Não usar o rollback antigo de `publish-autocusto-domain.py` ou `publish-linux.py` para desfazer esta interface**: eles pertencem a implantações anteriores e podem restaurar outro banco.

## HTTPS e comprovação do Google

O certificado de `altocusto.duckdns.org` foi emitido pelo Let's Encrypt, com validade inicial de 31/10/2026 a 29/01/2027. O certificado do endereço anterior permanece separado. O desafio HTTP usa `/var/www/autocusto/.well-known/acme-challenge/`.

O temporizador `altocusto-domain-certbot-renew.timer` agenda duas verificações diárias, com atraso aleatório de até 30 minutos e execução persistente. O serviço renova somente `altocusto-domain` e recarrega o nginx. A simulação final com o mesmo hook passou, mantendo o timer ativo e a API preservada; isso valida a rotina atual, sem garantir disponibilidade futura do DNS ou da autoridade certificadora. A simulação deve exercitar explicitamente o mesmo deploy hook; a opção que evita espera aleatória interna duplicada permite limitar o teste, sem remover o atraso configurado no timer.

O arquivo de comprovação de propriedade fica em `/var/www/autocusto-verification/`, fora das releases do front-end. Uma rota exata incluída por `/etc/nginx/snippets/autocusto-google-verification.conf` o serve nos dois hosts. Não remover essa pasta/rota em atualizações: a propriedade do endereço anterior foi verificada na conta Google autorizada do usuário. Configurações, senhas e tokens privados não são publicados por essa rota.

## Aviso do Google — pendência externa

O Google sinalizou no endereço anterior **“Possível phishing detectado no login do usuário”**, sem URLs de amostra. Os arquivos públicos e o executável foram conferidos contra os artefatos conhecidos; isso é evidência de integridade, não uma auditoria completa de comprometimento da VM.

Após as correções de apresentação serem publicadas, o pedido de revisão foi preenchido e enviado pela interface do Search Console, com descrição factual da finalidade acadêmica e das verificações. O portal continuou exibindo o problema; **não há confirmação de retirada do alerta ou de conclusão da análise**. No relatório público do endereço novo, o resultado consultado foi “Não há dados disponíveis”, o que não equivale a aprovação de segurança.

Acompanhar a propriedade original no [Search Console](https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fautocusto.duckdns.org%2F) e os relatórios públicos do [endereço anterior](https://transparencyreport.google.com/safe-browsing/search?url=autocusto.duckdns.org) e do [endereço corrigido](https://transparencyreport.google.com/safe-browsing/search?url=altocusto.duckdns.org). A troca de grafia não foi apresentada como solução do aviso, e nenhuma proteção do navegador foi contornada. Até esclarecer a classificação, o roteiro recomenda usar dados fictícios nas demonstrações e suspender novos cadastros reais.

Não foi realizada validação jurídica completa de privacidade nesta etapa. A identificação acadêmica e a solicitação de revisão não devem ser descritas como garantia de conformidade ou segurança total.

## Evidências

- Regressão isolada: 516 verificações aprovadas; após a última edição de apresentação do login/cadastro, 53 verificações de interface repetidas e aprovadas. Temas claro/escuro, dez telas e larguras 375/768/1024/1440 conferidos.
- Publicador: 15 testes nativos Linux aprovados, sem skips, de pacote, ativação, falhas, recuperação, interrupção, concorrência, status e renovação; evidência efetiva em `tests/.build/alto-custo-publication/native-tests.json`. Casos POSIX são explicitamente pulados no Windows e executados no Linux antes da ativação.
- Ativação: hashes dos 27 arquivos nos dois hosts, duas respostas do arquivo Google, HTTPS/autenticação e preservação do processo/INI da API confirmados.
- Conferência externa inicial: 54 arquivos aprovados, DNS/HTTPS, identidade acadêmica, arquivo de comprovação e recusa da API sem login; nenhuma escrita de dados reais.
- Revisão independente identificou o registro de recuperação fora da transação; quatro regressões falharam antes e passaram após a correção. A recuperação passou a ter registro pendente e lock. O teste de renovação foi ajustado após timeout para exercitar o hook real sem espera interna duplicada.

Release final: `20261031-f8085877267f`, fontes em `b816d280bf93fa2fbb9118de9554f6a5bfb3f8dc`. A atualização do publicador ajustou o comando de renovação; os 27 arquivos do front-end têm os mesmos hashes da release `20261031-cea79541ed2b`. Conferência final externa de dez arquivos centrais e autenticação nos dois hosts aprovada após a simulação de renovação.

Checklist operacional: `qa-identificacao-alto-custo.md`. Resumo em linguagem simples e roteiro para gravação de áudio: `resumo-melhorias-grupo-5.md`. Resultados gerados, capturas, backups e credenciais permanecem fora do Git.
