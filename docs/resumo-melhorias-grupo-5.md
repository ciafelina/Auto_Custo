# Alto Custo — resumo para o Grupo 5

Situação conferida em 31/10/2026. A [explicação completa para o grupo](explicacao-melhorias-grupo-5.md) reúne 20 melhorias, os testes e um roteiro para áudio. Endereço atual: **https://altocusto.duckdns.org/**.

## O que já foi realizado

- A API exige login nas rotas protegidas e confere o perfil do usuário no servidor. Funcionários e administradores fazem a gestão; pacientes consultam seus próprios dados e pedidos. Alterar cargos permanece exclusivo do administrador.
- Tokens com assinatura inválida são recusados. Senhas e chaves de configuração ficam em arquivos externos protegidos; o repositório foi revisado e o histórico saneado. Credenciais anteriormente expostas ainda precisam ser trocadas pelos responsáveis.
- Pedidos validam quantidade inteira e saldo disponível. O estoque é reservado junto com a gravação do pedido, e a edição do cadastro de medicamento preserva o saldo atualizado.
- Aprovação, retirada e cancelamento respeitam as etapas permitidas. Retirada e devolução de estoque não podem ser repetidas indevidamente; cada observação permanece ligada à solicitação correta.
- Cadastros com solicitações não podem ser excluídos, preservando histórico e vínculos. O alerta de estoque considera o mínimo configurado de cada medicamento.
- Nomes e descrições são exibidos como texto, com proteção contra execução de código. As mensagens de erro e respostas da API foram padronizadas.
- O novo visual foi integrado mantendo essas regras. Foram incluídos temas claro/escuro, navegação por teclado, ajustes para celular e aviso de pedido enviado com sucesso.
- Front-end e API estão na VM Linux do projeto. A aplicação publicada usa o banco Azure fornecido pelo colega; o computador pessoal do José pode ficar desligado.
- A regressão isolada foi repetida com 503 verificações aprovadas. Em etapas distintas, houve 121 cenários na cópia SQL Server e 30 cenários no site publicado com o Azure real. Os dados fictícios dessa última rodada foram removidos e os registros existentes permaneceram iguais.

## O que precisa ser descrito corretamente

- Há cadastro, login, consulta de estoque, solicitações, aprovação, retirada e acompanhamento pelo painel.
- Há edição de perfil após autenticação. O login direciona para o painel correspondente ao cargo.
- Recuperação automática de senha por e-mail e envio de notificações por e-mail **não foram implementados**. Não devem aparecer como funções entregues no relatório acadêmico.
- A identificação de projeto acadêmico, Grupo 5 — Univesp, ano 2026 e versão 1.0.0 foi publicada nas dez telas, inclusive antes dos formulários de acesso e cadastro. Não há comprovação de uma revisão jurídica completa de privacidade nesta entrega.
- O nome aprovado para apresentação é **Alto Custo**. `altocusto.duckdns.org` está ativo na mesma VM, com HTTPS validado e simulação da renovação aprovada, preservando o endereço anterior, a API e o banco Azure.
- O Google está sinalizando páginas do domínio atual por possível conteúdo enganoso. O certificado HTTPS foi validado e os arquivos publicados correspondem à versão conhecida, mas isso não elimina o alerta. A propriedade foi verificada no Search Console, que apontou possível phishing no login sem URLs de amostra. O pedido de revisão foi enviado pela interface após as correções, mas a retirada do alerta não foi confirmada. No endereço novo, “Não há dados disponíveis” não significa aprovação de segurança. Até esclarecer a classificação, evitar novos cadastros com dados reais.

## Roteiro para José gravar o áudio

> Pessoal, nesta etapa nós integramos o visual novo com as correções da API. O sistema agora exige login nas áreas protegidas e verifica as permissões de pacientes, funcionários e administradores no servidor. Também corrigimos a validação dos pedidos e do estoque: o pedido reserva as unidades, editar o medicamento preserva o saldo, e aprovação, retirada e cancelamento respeitam a sequência correta, sem devolver ou baixar estoque duas vezes. O histórico é preservado, as observações ficam no pedido certo e o alerta usa o estoque mínimo de cada medicamento. Melhoramos a exibição dos dados, as mensagens de erro e o uso das telas no celular e pelo teclado. O site e a API estão na VM Linux, usando o banco Azure do nosso colega. O fluxo completo de cadastro, pedido, aprovação e retirada foi testado com dados fictícios, depois removidos, sem mudar os registros existentes. Publicamos a identificação do Grupo 5 — Univesp, versão 1.0.0 de 2026, corrigimos os nomes das telas e ativamos altocusto.duckdns.org. Solicitamos revisão do aviso ao Google, mas sua retirada ainda não foi confirmada; ter HTTPS não elimina esse aviso. Recuperação de senha e notificações por e-mail ainda não foram implementadas, então não devemos apresentar essas funções como prontas.

O roteiro é um texto para gravação pelo próprio José; não foi enviado ao grupo nem convertido em áudio nesta etapa.
