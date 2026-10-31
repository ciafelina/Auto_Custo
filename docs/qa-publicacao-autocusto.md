# Conferência da publicação AutoCusto

Fluxo autenticado no Azure concluído em 31/10/2026: **30 cenários aprovados, zero falhas**, usando e removendo exclusivamente dados fictícios. As sete tabelas originais permaneceram iguais. O checklist preenchido e as evidências estão em `docs/resultado-e2e-azure.md`. Os itens abaixo permanecem como roteiro operacional para futuras conferências; celular físico e contas reais não foram usados nessa rodada.

## Endereço e aparência

- [ ] Abrir `https://autocusto.duckdns.org/`; a página inicial deve carregar com conexão segura e manter o domínio na barra de endereço.
- [ ] Abrir o mesmo endereço com `http://`; deve chegar ao HTTPS do domínio.
- [ ] Alternar modo claro/escuro e entrar na tela de login; a preferência deve acompanhar a navegação.
- [ ] Abrir no celular; o conteúdo e os botões devem ficar acessíveis, e o menu deve abrir e fechar corretamente.

## Acesso e banco

- [ ] Entrar com uma conta existente no banco Azure do projeto; os dados exibidos devem ser os desse banco. As contas do banco antigo não foram migradas automaticamente.
- [ ] Informar credenciais incorretas; deve aparecer a mensagem de CPF ou senha inválidos.
- [ ] Conferir com contas de homologação: paciente acessa seus dados/pedidos; funcionário e administrador acessam a gestão, inclusive usuários; somente administrador altera cargos.

## Fluxos operacionais

Usar somente cadastros e medicamentos de homologação combinados com o responsável pelo banco para verificações que gravam dados.

- [ ] Solicitar uma quantidade inteira disponível; deve aparecer o aviso de sucesso e o saldo deve atualizar. Quantidade inválida ou falta de saldo devem ser recusadas.
- [ ] Editar um medicamento; os dados cadastrais devem mudar sem sobrescrever o saldo.
- [ ] Conferir aprovação, retirada e cancelamento; não deve haver repetição indevida de devolução de estoque nem observação gravada em outro pedido.
- [ ] Tentar excluir um cadastro com solicitações vinculadas; deve ser recusado, preservando o histórico.

## Retorno ao usuário

O AutoCusto está disponível pelo domínio gratuito, com o visual atualizado e as regras corrigidas. A API utiliza o banco Azure fornecido pelo amigo do projeto, com conexão criptografada e certificado validado. O acesso usa as contas desse banco; a publicação não transferiu os dados do banco anterior.
