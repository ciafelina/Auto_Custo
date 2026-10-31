# QA — recuperação de senha

Executar com conta temporária de teste e e-mail acessível, preservando cadastros reais. Não incluir tokens, senhas, CPF real ou conteúdo de configuração nas evidências.

## Solicitação e envio

- [x] Informar CPF/e-mail válidos na API isolada — receber confirmação neutra, sem alteração de senha.
- [x] Informar conta inexistente/inativa ou e-mail divergente — receber a mesma resposta; não gerar mensagem.
- [x] Enviar CPF/e-mail inválidos, tipos JSON incorretos ou corpo excessivo — receber erro padronizado; não gerar link.
- [x] Repetir antes de 60 segundos ou ultrapassar cinco mensagens por hora/conta — não gerar novo envio nem revelar o cadastro.
- [x] Ultrapassar limite por IP — receber 429; aguardar a janela para nova tentativa.
- [x] Simular fila cheia/configuração indisponível — não expor destinatários ou segredos.
- [x] Testar ACBr no Linux com cadeia/hostname válidos e inválidos — aceitar somente TLS confiável e entregar o corpo com link.
- [x] Enviar pelo Gmail configurado — servidor SMTP aceitar a mensagem; corpo identificado e sem senha atual/provisória.
- [ ] Confirmar no Gmail do responsável se a mensagem chegou à caixa de entrada ou ao spam.

## Redefinição e acesso

- [x] Abrir link válido — remover token da barra e apresentar nova senha/confirmar; não trocar senha por GET.
- [x] Informar senhas diferentes/curtas/longas — impedir gravação; exibir orientação.
- [x] Usar link expirado, alterado ou já consumido — recusar sem mudar senha.
- [x] Desativar/remover conta ou mudar e-mail depois da emissão — recusar o link anterior.
- [x] Disparar duas confirmações simultâneas no banco isolado — somente uma concluir.
- [x] Entrar após recuperação — senha nova aceita, senha anterior e sessão anterior recusadas.
- [x] Repetir concorrência/login com SQL Server Azure usando somente a conta temporária — manter dados reais e remover o teste.
- [x] Trocar a senha pelo Meu Perfil — encerrar sessão e abrir login; uma edição sem senha mantém a sessão.

## Telas e publicação

- [x] Abrir login e acessar “Esqueci minha senha” em celular e computador — navegar para formulário legível, sem rolagem horizontal.
- [x] Receber erro contendo HTML — mostrar texto, sem executar código.
- [x] Enviar formulários — usar endereço configurado da API e JSON POST; não guardar token no navegador.
- [x] Simular falha na ativação e na gravação do marcador — restaurar arquivos, API anterior e estado da publicação.
- [x] Retornar ao binário anterior — trocar a chave efetiva em configuração privada, preservando Azure e impedindo reativação de sessões revogadas.
- [x] Publicar após os testes — conferir HTTPS, novas telas/rotas, autenticação privada, prova Google e configuração Azure preservada.
