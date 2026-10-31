# Recuperação de senha — Alto Custo

Solicitação: implementar, testar somente esta funcionalidade e publicar depois dos testes. Usar ACBr disponível neste computador. Conta remetente informada pelo usuário: Gmail; credencial será fornecida fora do Git e do chat.

## Fluxo e decisões

No login, “Esqueci minha senha” abre formulário de CPF e e-mail cadastrado. A resposta será sempre “Se os dados corresponderem a uma conta ativa, enviaremos um link para o e-mail cadastrado.” Não confirmar existência, situação ou endereço de uma conta. Contas inativas não recuperam acesso.

O e-mail contém link HTTPS do endereço público configurado, com token aleatório de 32 bytes no fragmento da URL (não em parâmetros registrados pelo servidor). Válido por 15 minutos, uso único, inutilizado após troca de senha ou mudança de e-mail. O link abre formulário de nova senha e confirmação; não altera senha em GET, nem faz login automático. Nova senha: 8 a 64 caracteres e no máximo 72 bytes UTF-8 (limite do BCrypt).

Reutilizar BCrypt. Guardar apenas SHA-256 do token em tabela nova `RecuperacoesSenha`, junto a CPF, vínculos HMAC da senha/e-mail e instantes UTC. Redefinição transacional com comparação da credencial anterior: dois envios simultâneos não podem consumir o mesmo link. Invalidar todos os links e sessões anteriores após a troca. Tokens de sessão passam a incluir vínculo HMAC da senha; sessões antigas precisarão entrar novamente na publicação.

Proteção de envio: fila limitada, um trabalhador, limite global e por IP, intervalo mínimo de 60 segundos e máximo de cinco mensagens por hora por conta. Resposta pública independe do envio; erros SMTP são registrados sem destinatário, senha ou token. Fila temporária: reinício antes do envio exige nova solicitação; não prometer entrega.

## Alternativas e ACBr

Link temporário é adequado ao cadastro com e-mail existente. Envio da senha atual é impossível com BCrypt; senha provisória enviada por e-mail reduz a segurança. SMS exigiria serviço e dados verificados adicionais.

Usar o componente de código aberto ACBrMail compilado para Windows/Linux. As DLLs OpenSSL encontradas no ÓTICOM são Windows; não copiar configurações/credenciais do produto corporativo. Fontes ACBr estão em `C:/delphi_11/D11/ACBR`; selecionar dependências mínimas, preservar licenças e registrar origem/hashes. TLS SMTP exige cadeia e hostname válidos, sem alternativa em texto simples. Configuração externa separada da conexão SQL e do JWT.

## Integração e publicação

Rotas públicas exatas: POST `/senha/recuperar` e POST `/senha/redefinir`. As demais permissões permanecem. Front usa o cliente/API JSON atual. Nenhuma URL de recuperação é construída a partir de Host ou cabeçalhos enviados pelo usuário.

Migração aditiva e idempotente no Azure, sem modificar usuários reais, pedidos ou estoque. Testar previamente em banco isolado. Publicar executável Linux, biblioteca necessária, novas telas e configuração privada com backup e retorno de API/front; preservar domínio, nginx, certificado, comprovação Google e configuração Azure. A tabela aditiva pode permanecer após retorno.

Testes restritos: API de recuperação/login, concorrência/expiração/reuso, e-mail ACBr/TLS, telas e ativação/retorno da nova publicação. Teste remoto apenas com conta temporária marcada e removida ao final. Não repetir suíte completa. Credencial Gmail de aplicativo e confirmação do recebimento são dependências externas; não publicar uma funcionalidade declarada pronta sem envio real verificado.

## Fora de escopo

Login com Google, troca de provedor de DNS, revisão adicional do alerta Google, notificações de pedidos, alterações em dados de pessoas reais ou código/configuração do ÓTICOM.
