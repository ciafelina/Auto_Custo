# Conferência do front-end integrado

Usar ambiente de teste e contas de paciente, funcionário e administrador. Os testes automatizados usam API e banco fictícios; não movimentar cadastros ou estoque reais para esta conferência.

## Aparência e navegação

- [ ] Abrir a página inicial, login, cadastro, painéis, perfil, estoque e telas administrativas; conferir os textos e o visual recebidos, sem elementos cortados.
- [ ] Alternar entre modo claro e escuro, navegar entre telas e atualizar a página; a escolha deve acompanhar a navegação. Sem escolha salva, deve prevalecer o tema do sistema.
- [ ] Abrir no celular; botões e formulários devem permanecer acessíveis, com rolagem horizontal restrita às tabelas quando necessária.
- [ ] Usar Tab no início da página e acionar “Pular para o conteúdo principal”; o foco deve ir para o conteúdo. Abrir o menu no celular; o foco deve ir aos links e Tab deve percorrer as opções. Escape deve fechar o menu e devolver o foco ao botão.
- [ ] Abrir um modal usando o teclado; Tab deve permanecer dentro dele. Fechar com Escape deve devolver o foco ao botão que o abriu.

## Acesso e regras preservadas

- [ ] Entrar com CPF e senha de cada cargo; administrador e funcionário devem acessar a gestão, inclusive usuários. Paciente deve acessar seus dados e solicitações.
- [ ] Na gestão de usuários, conferir que o funcionário não recebe o botão para alterar cargos; administrador mantém essa ação.
- [ ] Editar um medicamento que tenha saldo; o campo de estoque inicial deve ficar oculto e a edição não deve alterar o saldo. O ajuste deliberado continua no botão de estoque.
- [ ] Conferir nomes com aspas e apóstrofos, descrições e observações; os textos devem aparecer completos e os botões devem atuar no registro correto.
- [ ] Conferir estoque com mínimo diferente de cinco; a consulta, a gestão e os filtros devem usar o mínimo do medicamento.
- [ ] Tentar excluir conta ou medicamento com histórico; a exclusão deve ser recusada com mensagem explicativa. Alterar o status de uma solicitação não deve gravar a observação de outra.

## Solicitação de medicamento

- [ ] Enviar uma quantidade inteira disponível; o modal deve fechar, o aviso de sucesso deve aparecer e receber foco, e a lista deve mostrar o novo saldo sem recarregar a página inteira. O botão × deve fechar o aviso e levar o foco à busca.
- [ ] Abrir outro pedido após um sucesso; o aviso anterior deve desaparecer. Enviar quantidade fracionária, zero ou negativa deve ser recusado.
- [ ] Simular recusa por falta de saldo no ambiente de teste; manter o formulário preenchido, mostrar a mensagem explicativa e não mostrar sucesso.

## Retorno ao usuário

O projeto recebeu o novo visual, os modos claro e escuro, melhorias de navegação por teclado e a confirmação de solicitações na própria tela. As permissões e regras já corrigidas foram preservadas. A publicação atual permanece ativa até a próxima publicação, conforme combinado.
