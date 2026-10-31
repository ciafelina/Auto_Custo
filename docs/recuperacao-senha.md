# Recuperação de senha — Alto Custo

## Funcionamento

No login, escolher **Esqueci minha senha**, informar CPF e e-mail cadastrado e enviar. A mensagem da tela é igual para conta ativa, inexistente, inativa ou e-mail divergente. Somente a combinação de CPF/e-mail de uma conta ativa recebe o link.

O link permite escolher uma nova senha por 15 minutos e é de uso único. Abrir o e-mail ou a página não altera a senha. Após confirmar a nova senha, a senha anterior, os outros links de recuperação e as sessões anteriores deixam de funcionar. A tela retorna o acesso ao login, sem entrar automaticamente.

Usar de 8 a 64 caracteres, até 72 bytes UTF-8, e confirmar a mesma senha. O limite de bytes vem do BCrypt. Não há envio da senha atual ou de senha provisória. Quem perdeu também o acesso ao e-mail precisa procurar a equipe responsável; não há recuperação por CPF sem comprovar acesso ao e-mail.

## Envio e configuração externa

O componente ACBrMail foi compilado no executável Linux. Usa SMTP com TLS implícito, TLS 1.2, cadeia CA e nome do servidor verificados; não há alternativa sem criptografia. São usadas as bibliotecas Linux OpenSSL do sistema. Nenhuma DLL/configuração/credencial corporativa do ÓTICOM foi reutilizada.

Para Gmail, ativar a verificação em duas etapas, criar uma senha de aplicativo e executar `scripts/configurar-email.ps1`. A entrada da senha é oculta. O arquivo padrão Windows fica em `%LOCALAPPDATA%/AutoCusto/email.ini`, com acesso ao usuário e SYSTEM. Nunca enviar o conteúdo ao chat ou ao Git. [Ajuda oficial Google](https://support.google.com/accounts/answer/185833?hl=pt-br).

Configuração de exemplo **sem credenciais**:

```ini
[SMTP]
Servidor=smtp.gmail.com
Porta=465
Usuario=
Senha=
Remetente=
Nome=Alto Custo - Grupo 5 Univesp
ModoTLS=SSL
; Linux: padrão /etc/ssl/certs/ca-certificates.crt
; Windows: informar caminho absoluto de um bundle CA confiável.
CertificadosCA=

[Recuperacao]
URLPublica=https://altocusto.duckdns.org
```

`AUTO_CUSTO_EMAIL_CONFIG` seleciona o arquivo absoluto privado. No Linux, sem variável, tenta `/etc/autocusto/email.ini`. No Windows, tenta `email.ini` ao lado do INI de configuração e usa `email-ca.pem` nesse diretório como CA padrão; o OpenSSL adequado à arquitetura também precisa estar disponível. A publicação Linux seleciona seu próprio arquivo privado. Não acrescentar senha/configuração de e-mail ao `Front_End/config.js`.

Configuração ausente ou inválida deixa apenas a recuperação indisponível (503); a API não inicia um envio sem TLS. Configuração é carregada ao iniciar; reiniciar a API para alterações. A aceitação SMTP não garante chegada à caixa de entrada: conferir spam e as restrições do provedor.

## Proteções e limitações

- Token aleatório de 256 bits. Banco guarda somente SHA-256 e vínculos HMAC da senha/e-mail, sem o token ou e-mail de recuperação em texto.
- Token no fragmento `#token=`, removido da barra pela tela e enviado somente no JSON do POST. Sem token em query string, localStorage ou logs.
- Redefinição transacional e bloqueio do usuário: duas chamadas simultâneas permitem uma única troca.
- Por conta: intervalo de 60 segundos e cinco mensagens por hora. Tentativas adicionais mantêm a resposta neutra. Por IP: 30 solicitações e 50 tentativas de redefinição por 15 minutos. Limites globais de 200/300 operações no mesmo período; limites por IP/global são locais ao processo e reiniciam com ele.
- Fila limitada a 32 mensagens, com um trabalhador e tempo de conexão limitado. A fila é temporária; reinício pode exigir nova solicitação. Não expõe falhas individuais de envio ou existência de contas.
- Respostas de erro seguem o JSON da API. Requisições das novas rotas com mais de 8 KiB são recusadas antes do processamento JSON.

## Banco e publicação

`scripts/sql/recuperacao-senha.sql` adiciona somente `dbo.RecuperacoesSenha`, de forma idempotente. Não altera dados reais de usuários, pedidos ou estoque. O retorno de versão deixa a tabela aditiva no banco. A configuração Azure/JWT existente é preservada byte a byte.

As sessões emitidas antes desta versão precisarão de novo login, pois os tokens passam a ter vínculo com a senha atual. Essa regra também revoga sessões após troca de senha pelo perfil.

Compilar API e probe com `scripts/build-linux.ps1` e `-EmailProbe`, respectivamente. `scripts/test-password-recovery-vm.py` testa transporte ACBr e uma única conta temporária no Azure, em porta de loopback 19002, sem trocar a versão pública. O teste valida a titularidade e remove a conta e seus tokens ao terminar; não cria solicitações/medicamentos.

Depois dos testes e da revisão, `scripts/publish-password-recovery.py activate` publica API e front com backup transacional. `status` informa a versão ativa; `rollback` retorna API/front anteriores, preservando os cadastros e os parâmetros Azure. Para impedir que o binário antigo reative sessões revogadas, o retorno cria uma cópia privada do INI com chave JWT nova e encerra as sessões; o INI original fica intacto. O journal registra essa configuração antes da troca e o retorno remove a precedência de `AUTO_CUSTO_JWT_SECRET`. Não usar os scripts históricos de publicação estática para reverter esta atualização completa. Arquivos de e-mail e evidências da VM ficam em diretório privado, fora da raiz pública.

## Evidências desta entrega

Validação: API local 16/16, telas de recuperação 10/10, perfil/sessão 2/2 e retorno da publicação 7/7 em Windows e Linux. A revisão independente apontou três problemas; todos receberam teste de reprodução e correção: revogação no retorno, arquivo temporário de escrita e sessão do perfil. Linux/TLS 4/4 e SQL Server Azure 14/14 passaram, com remoção da conta temporária e snapshots originais idênticos. O Gmail aceitou o envio real após corrigir o endereço cadastrado no arquivo privado. Confirmação da caixa de entrada e publicação ainda em acompanhamento.

Ver [checklist da recuperação](qa-recuperacao-senha.md). A suíte completa anterior não é repetida nesta etapa, conforme solicitado. Após atualizar localmente a senha de aplicativo, o teste pode repetir apenas o SMTP com `scripts/test-password-recovery-vm.py --smtp-only`, se a execução possui evidência funcional parcial; não precisa criar outra conta no banco.
