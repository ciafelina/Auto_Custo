# Publicação Linux — 25/10/2026

**Histórico:** esta implantação foi substituída em 31/10/2026 pela publicação em **https://autocusto.duckdns.org/**, usando o banco Azure `db-altocusto`. Consultar `docs/deploy-autocusto.md` para a operação e recuperação atuais. As informações e scripts abaixo descrevem a versão anterior.

O sistema está publicado em **https://102.37.16.34/**. HTTP redireciona temporariamente para HTTPS. A API pública fica em `/api`; a API Delphi escuta somente em `127.0.0.1:9000`, atrás do nginx.

A versão utiliza o SQL Server atual, banco `Projeto_JoseThiago`. Não foi feita migração para Azure SQL nem limpeza/cópia dos registros reais. Os usuários passam a usar pela internet o mesmo banco da aplicação local. O cadastro público cria pacientes; funcionários e administradores usam os cargos cadastrados nesse banco.

## Instalação ativa

- Release: `20261025-5e0f1c3e05fd`.
- Executável: `/opt/autocusto/releases/20261025-5e0f1c3e05fd/ProjetoFaculdade`.
- Telas: `/var/www/autocusto-releases/20261025-5e0f1c3e05fd`, com arquivos públicos legíveis pelo nginx.
- Serviço: `autocusto.service`, usuário `autocusto`, reinício em falha e limites de início/parada.
- Configuração privada: `/etc/autocusto/releases/20261025-5e0f1c3e05fd.ini`, `root:autocusto`, modo `0640`, fora do site. A publicação possui chave JWT aleatória própria.
- Override do serviço: `/etc/systemd/system/autocusto.service.d/90-publicacao.conf`.
- Nginx: configuração ativa referenciada por `/etc/nginx/sites-enabled/autocusto`.

O rodapé de login foi corrigido: a aplicação usa autenticação própria por CPF e senha; não possui autenticação oficial GOV.BR.

API, nginx e timer de renovação estão habilitados para iniciar com a VM. A conferência do log não encontrou a senha ou a chave JWT desta publicação nas últimas cem linhas do serviço; os valores e o conteúdo das linhas não foram exibidos.

## HTTPS e exceção do banco

O nginx usa certificado Let's Encrypt válido para o IP, em `/etc/letsencrypt/live/autocusto-ip`. Certificados de IP duram cerca de seis dias. O timer `autocusto-certbot-renew.timer` verifica duas vezes ao dia, com atraso aleatório de até 30 minutos; o serviço de renovação recarrega o nginx após emissão. Foram validados emissão, renovação simulada e reload depois da ativação, com validação normal do certificado pelo Windows e pelo navegador.

O Microsoft ODBC 18 mantém a conexão com o banco criptografada. O SQL Server atual apresenta certificado autoassinado cujo nome é recusado pelo driver Linux. O usuário autorizou explicitamente a publicação temporária com `ConfiarCertificadoServidor=1`, após ser informado de que isso dispensa a validação de identidade e deixa risco de interceptação. Essa exceção vale somente no INI privado desta release; o padrão do código/modelo continua falso. HTTPS do site possui certificado válido e verificado; a exceção é da conexão API–SQL Server.

Correção definitiva: o responsável deve instalar certificado adequado no SQL Server. Depois, ajustar o nome esperado, configurar a cadeia confiável, voltar `ConfiarCertificadoServidor=0` e revalidar o probe antes de reiniciar o serviço. A release atual também define `SSL_CERT_FILE` e `SSL_CERT_DIR` próprios; essas referências precisam ser atualizadas para a cadeia válida ou removidas para usar a confiança padrão do sistema. Não basta trocar o flag sem validar a nova cadeia/nome.

## Operação e recuperação

Os scripts usam SSH com chave conhecida do host e senha solicitada sem eco. Credenciais de banco são lidas do INI externo Windows e transferidas por SFTP para uma pasta privada, nunca incluídas em argumentos, logs, fontes ou arquivos públicos. Dependências SSH Python ficam em `tests/.build/deploy/py-libs`; metadados sem segredos ficam em `tests/.build/deploy/release.json`.

```powershell
python scripts/publish-linux.py status
python scripts/publish-linux.py check-renewal
```

Para recuperação emergencial desta implantação:

```powershell
python scripts/publish-linux.py rollback
```

O retorno usa `/var/lib/autocusto-deploy/20261025-5e0f1c3e05fd`, protegido com modo `0700`. Restaura nginx e override anteriores, estados do timer e executável anterior; não muda registros do banco. Também retorna à versão e à configuração que estavam na VM antes desta publicação, anteriores às melhorias atuais. O executável e as telas antigos foram preservados. A ativação possui retorno automático em falha; a recuperação lógica é exercitada com arquivos temporários e serviços simulados, sem interromper o site para um teste de queda artificial.

Para compilar nesta máquina, carregar `rsvars.bat` do Delphi 11 e executar `scripts/build-linux.ps1`. O cache de bibliotecas do alvo está em `tests/.build/deploy/linux-sdk`; foi exportado somente de bibliotecas públicas da VM. O compilador gera ELF Linux64 em `tests/.build/deploy`. Uma nova implantação deve ter novo identificador e metadados próprios; não sobrescrever uma release ativa.

## Evidências

- Windows: build Win32/Debug e 463 verificações isoladas, zero falhas.
- Linux: build Linux64; oito cenários de caminho/configuração, com BCrypt e JWT válidos/inválidos exercitados em runtime.
- FireDAC/ODBC na VM, como usuário do serviço: banco correto, sete tabelas, procedure e 19 permissões necessárias confirmados em leitura.
- Recuperação: cinco testes locais, incluindo contraprovas para a perda do estado do timer e o timeout antigo.
- Internet: 45 verificações, incluindo HTTPS, nove páginas, `/api`, 26 operações privadas sem token com IDs inválidos, JWT adulterado, login fictício, bloqueio de arquivos privados e Edge headless.
- Pós-ativação: serviço ativo, executável correto, porta 9000 em loopback, INI privado e renovação/reload do nginx confirmados.

As verificações não criaram usuários, solicitações ou movimentações no banco real. Um fluxo completo com cadastro/pedido/aprovação/retirada foi testado anteriormente na cópia SQL isolada (121 cenários); ele não foi repetido escrevendo no banco em uso. Logs e JSON de resultados locais estão em `tests/*.log` e `tests/.build/deploy`, ignorados pelo repositório.
