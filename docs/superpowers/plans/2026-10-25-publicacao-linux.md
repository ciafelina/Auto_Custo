# Publicação Linux — plano de implementação

> Execução aprovada pelo usuário neste chat. Implementar com superpowers:executing-plans; revisão independente ao final. Não há repositório Git nesta pasta, portanto não criar commits/worktrees artificiais.

**Objetivo:** publicar a versão corrigida em HTTPS pelo IP da VM, mantendo o SQL Server atual.

**Arquitetura:** nginx público em 102.37.16.34; API Delphi Linux64 em loopback; serviço autocusto executado por usuário dedicado; configuração externa protegida. Nova versão e cópia anterior permitem ativação reversível.

**Tecnologias:** Delphi 11 Linux64, FireDAC/ODBC 18, nginx, systemd, Certbot com certificados de IP.

**Especificação aprovada:** docs/superpowers/specs/2026-10-25-publicacao-linux-design.md.

## Restrições

- Banco atual e seus registros preservados; nada de migração, testes de estoque/pedidos ou limpeza no banco real.
- Segredos fora do projeto e site; transporte por SSH sem segredos nos argumentos/logs.
- Preservar execução Windows, autenticação/permissões e os contratos dos 12 itens.
- Acesso público pelo IP com HTTPS e renovação; não comprar domínio nem mudar assinatura Azure.
- A versão anterior permanece recuperável; se a ativação falhar, retornar a ela.

## Foco da revisão

- Caminhos POSIX absolutos aceitos, relativos recusados e comportamento Windows preservado.
- Compilação Linux usa as mesmas regras de autenticação, JWT e transações verificadas.
- Driver Linux autentica no banco atual; falhas não expõem credenciais.
- Nginx encaminha /api e config.js não volta a localhost/porta incorreta; API não fica publicamente exposta sem proxy.
- Troca/reinício e renovação TLS conservam recuperação e permissões privadas dos segredos.

## Tarefa 1 — Compilação e configuração Linux

- [x] Preparar cache mínimo de bibliotecas Linux do alvo e script de build reproduzível em scripts/build-linux.ps1, com artefatos em tests/.build/deploy.
- [x] Criar teste executável de Secrets para caminhos POSIX/variáveis e observar recusa antes do ajuste; compilar aplicação atual e registrar a dependência Windows que impede Linux.
- [x] Ajustar ProjetoFaculdade.dpr e utils/Secrets.pas somente para plataforma, caminho externo e escuta loopback Linux.
- [x] Compilar Linux64 e executar testes de configuração Linux na VM sem iniciar serviço público; conferir rejeição de arquivo/chave inválidos e chave válida.
- [x] Compilar Windows e executar regressão isolada; nenhuma alteração de contrato permitida.

## Tarefa 2 — Preparação da implantação

- [x] Preparar versão em pasta separada, com hash do executável e telas corrigidas; não copiar arquivos de testes/configuração para webroot.
- [x] Transferir configuração do banco atual por SSH a arquivo privado, com chave JWT própria da implantação; conferir leitura somente pela conta do serviço.
- [x] Executar probe FireDAC Linux somente de leitura (identidade do banco, objetos e permissões necessárias), sem valores de registros reais.
- [x] Preparar backup restrito dos arquivos/configuração anteriores e comandos de retorno; testar nginx -t antes de recarga.
- [x] Instalar/configurar Certbot atual, obter certificado de IP e preparar renovação e reload do nginx; validar HTTPS externamente.

## Tarefa 3 — Ativação e validação pública

- [x] Revisão independente das mudanças completas antes de ativar; resolver problemas importantes.
- [x] Ativar executável/telas/configuração e reiniciar somente autocusto; conferir serviço e restaurar anterior se falhar.
- [x] Conferir HTTPS, certificado, telas/config.js, rotas privadas 401 e token adulterado; usar apenas leitura no banco real.
- [x] Conferir renovação TLS, logs sem segredos, diretórios protegidos e recuperação documentada.
- [x] Registrar resultados e link de acesso, com limites concretos e sem declarar testes não executados.

Resultado: release `20261025-5e0f1c3e05fd` ativa em https://102.37.16.34/, usando o SQL Server atual. Build Linux e Win32 concluídos; regressão 463/463; configuração/runtime Linux 8/8; recuperação 5/5; verificação externa 45/45. O probe nativo confirmou identidade, sete tabelas, procedure e 19 permissões em leitura. Certificado HTTPS e renovação/reload após ativação passaram; porta 9000 em loopback, serviço autocusto e INI 0640 confirmados. As verificações não gravaram nos registros reais. A exceção de certificado do banco foi autorizada explicitamente pelo usuário e consta na especificação e em docs/deploy-linux.md. A revisão independente não encontrou P1/P2 após os ajustes de recuperação. O rodapé GOV.BR foi corrigido para autenticação própria e a publicação foi retestada. A senha e a chave JWT desta publicação não foram encontradas nas últimas cem linhas do log do serviço.