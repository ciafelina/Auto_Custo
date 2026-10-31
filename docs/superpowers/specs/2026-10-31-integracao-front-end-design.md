# Integração do front-end recebido

Pedido: incorporar o visual de `C:\Users\EBT\Downloads\Front_End` ao projeto atual, preservando as regras concluídas nos itens 1 a 12. A pasta recebida é referência de apresentação, não substituta das regras atuais.

Abordagem definida pelo pedido: aplicar os HTML/CSS recebidos e portar apenas os comportamentos de apresentação para os scripts corrigidos. Copiar toda a pasta reintroduziria endereços fixos, HTML inseguro, edição de saldo e perda das proteções de observações; recriar as telas em outra tecnologia não atende à integração solicitada.

- Usar os textos, marca, cores, superfícies claras/escuras, atalhos de teclado e aviso de pedido da referência.
- Manter login por CPF/senha, API configurável, mensagens padronizadas, exibição segura, permissões (funcionário também gerencia usuários), estoque mínimo, edição sem sobrescrever saldo, observações por solicitação e preservação de histórico.
- Centralizar a preferência `tema` em um script compartilhado nas dez páginas; aceitar apenas `light`/`dark`, usar o sistema quando não houver escolha e manter legibilidade e controles acessíveis em celular e desktop.
- Habilitar o script de acessibilidade existente e completar os estilos ausentes da referência (atalho, marca e aviso). Manter IDs usados pelos scripts e testes.
- Mostrar confirmação de pedido somente após sucesso da API, atualizar a lista sem recarregar toda a página e permitir fechar o aviso. Erros continuam exibindo a mensagem segura da API.
- Não alterar API, banco, credenciais, arquivos de Downloads ou publicação nesta etapa. O usuário confirmou manter a publicação atual até a próxima.
- Preservar cópia e hashes do front-end anterior em `tests/.build/frontend-integration`.

Aceite: telas correspondentes à referência com temas coerentes e navegação por teclado; login, pedido e regras atuais passam nos testes. Verificar no Edge com API fictícia e executar a regressão isolada completa, sem movimentar dados reais.

Refinamentos da revisão: texto e link do painel vazio usam cores semânticas; a opção ativa do menu tem contraste de 5,74:1 no modo escuro. O menu mobile encaminha e contém o foco nos links enquanto aberto; ao concluir pedido, o aviso recebe foco, e fechá-lo devolve o foco à busca.
