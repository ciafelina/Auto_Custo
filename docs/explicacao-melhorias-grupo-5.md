# Alto Custo — explicação das melhorias para o Grupo 5

Atualizado em 31/10/2026. Endereço com a grafia corrigida: **https://altocusto.duckdns.org/**. Este documento reúne as melhorias das etapas anteriores e as correções desta entrega, separando o que está pronto das pendências.

## Mensagem pronta para compartilhar

Pessoal, integramos o novo visual às melhorias da API, que é a parte do sistema responsável por conferir as regras e consultar o banco. As principais mudanças foram:

1. **Acesso conforme o perfil.** As áreas protegidas exigem login. Pacientes acessam seus próprios dados e pedidos; funcionários e administradores acessam a gestão, inclusive de usuários. Somente o administrador pode alterar cargos. A permissão é conferida no servidor, além do que aparece nos menus.
2. **Validação do acesso.** Corrigimos a conferência dos tokens, que identificam a sessão: assinaturas inválidas são recusadas. As senhas dos usuários são protegidas com BCrypt, sem serem armazenadas em texto simples.
3. **Configurações protegidas.** Senhas de conexão e chaves secretas foram retiradas dos arquivos versionados e colocadas em configuração externa protegida. O histórico do GitHub também foi saneado. Credenciais anteriormente expostas ainda precisam ser trocadas pelos responsáveis; apagar o histórico não as invalida.
4. **Pedidos com quantidade e saldo válidos.** O sistema recusa quantidade zero, negativa, fracionária ou superior ao estoque. A criação do pedido e a reserva das unidades ocorrem juntas, evitando gravar um pedido sem reservar seu saldo.
5. **Edição de medicamento sem perda do saldo atualizado.** Alterar nome ou descrição não devolve o estoque ao valor antigo carregado na tela. Isso protege o saldo quando outra pessoa fez um pedido nesse intervalo.
6. **Etapas da solicitação controladas.** Aprovação, retirada e cancelamento seguem as mudanças de status permitidas. A mesma reserva não pode ser devolvida indevidamente mais de uma vez. Também foram conferidas operações simultâneas para evitar uso duplicado do saldo.
7. **Nomes e descrições exibidos corretamente.** Aspas e apóstrofos não quebram os botões. Conteúdo informado pelos usuários aparece como texto, sem ser interpretado como código executável.
8. **Histórico preservado.** A exclusão de usuário ou medicamento com solicitações vinculadas é bloqueada, com explicação do motivo. Os pedidos continuam ligados aos seus cadastros.
9. **Observações no pedido certo.** A edição da observação fica vinculada à solicitação correspondente, impedindo que seja gravada em outra.
10. **Estoque mínimo por medicamento.** A classificação usa o mínimo cadastrado para cada medicamento, mantendo o mesmo critério nas telas e nas respostas do sistema.
11. **Respostas e erros padronizados.** Corrigimos a geração do JSON, formato usado na comunicação entre tela e API, e as mensagens para tratar corretamente erros e operações recusadas.
12. **Endereço da API configurável.** As telas deixaram de depender de um endereço fixo do computador de desenvolvimento. Na publicação, chamam a API pelo próprio endereço do site, em `/api`.
13. **Novo visual integrado às regras.** Incorporamos o front-end atualizado preservando as validações. Ajustamos temas claro e escuro, navegação por teclado, telas menores e confirmação de pedido enviado.
14. **Identificação do projeto.** A apresentação e as dez telas identificam o Alto Custo como projeto acadêmico desenvolvido pelo Grupo 5 — Univesp, versão 1.0.0, ano 2026. A autoria também aparece antes dos campos de login e cadastro.
15. **Títulos em português.** Corrigimos os textos que apareciam como “Dashboard”. A consulta mantém “Consulta de Estoque”, e o menu do paciente usa “Painel de controle”, inclusive com a janela menor.
16. **Textos compatíveis com as funções existentes.** Removemos a promessa de uma etapa automática de completar o cadastro após o primeiro login. O usuário entra no painel de seu perfil e pode editar seus dados. Informações de saúde são opcionais; a apresentação não deve prometer atendimento médico personalizado.
17. **Publicação no servidor do projeto.** Site e API estão na VM Linux e usam o banco Azure fornecido pelo colega. Não dependem do computador do José ligado nem do banco local dele. O acesso usa HTTPS, com certificado e rotina de renovação.
18. **Nome e endereço corrigidos.** O nome público passou a ser “Alto Custo” e o endereço é `altocusto.duckdns.org`. O endereço anterior foi mantido. Usamos o subdomínio gratuito do DuckDNS; não foi necessário usar Cloudflare nessa configuração.
19. **Atualização com possibilidade de recuperação.** A publicação verifica os arquivos das telas e preserva a API e sua conexão com o Azure. Há retorno da atualização visual em caso de falha, sem restaurar o banco antigo.
20. **Testes e documentação.** Foram testados acessos, permissões, cadastros, pedidos, saldo, aprovação, retirada, cancelamento, histórico e observações. A documentação registra os resultados e as pendências.

## Como a publicação funciona

O DuckDNS associa o nome do site ao IP da VM. Ao abrir o endereço, o navegador recebe dessa VM os arquivos das telas. As telas fazem requisições à API, também na VM. A API verifica login, permissões e regras antes de consultar ou alterar o Azure SQL do colega. O navegador não acessa diretamente o banco. O computador de desenvolvimento pode ficar desligado.

## O que foi testado

As rodadas ocorreram em etapas distintas. Os números abaixo não representam uma única execução nem uma garantia de ausência de todos os defeitos.

| Rodada | Resultado e limite |
| --- | --- |
| Regressão isolada após os ajustes de identificação | 516 verificações aprovadas, zero falhas. |
| Interface após a última edição dos textos de login/cadastro | 53 verificações aprovadas. Dez telas, temas claro/escuro e larguras de 375, 768, 1024 e 1440 pixels; não substitui teste em todos os celulares físicos. |
| SQL Server, em etapa anterior | 121 cenários aprovados em banco temporário isolado, depois removido. Incluiu concorrência e integridade de estoque/histórico. |
| Fluxo completo no Azure, em etapa anterior | 30 cenários aprovados no site publicado, com contas, medicamento e pedidos fictícios. Cadastro, login, pedido, aprovação e retirada exercitados. Dados criados removidos; contagens e hashes das sete tabelas originais preservados. |
| Publicador nesta entrega | 15 testes aprovados no Linux, incluindo falhas, recuperação, interrupção, concorrência e comando da renovação. Serviços simulados nesses testes; ativação e renovação têm conferência separada no servidor. |
| Arquivos publicados | 27 arquivos por endereço, totalizando 54 conferências, além de HTTPS, identificação, comprovação Google e recusa da API sem login. |

Nesta última atualização visual, não repetimos gravações no banco de produção nem alteramos senhas de usuários. As verificações confirmaram que a API e sua configuração Azure foram preservadas.

## O aviso “Perigoso” e as pendências

- O Google classificou páginas do endereço anterior com **“Possível phishing detectado no login do usuário”**, sem URLs de amostra. Não é correto dizer que o aviso era apenas falta de HTTPS ou que a troca do nome o resolveu.
- Verificamos a propriedade no Search Console, conferimos os arquivos, reforçamos a identificação acadêmica antes dos formulários e enviamos o pedido de revisão pela interface. **O portal continuou mostrando o problema; não há confirmação de retirada do alerta nem de conclusão da revisão.**
- No endereço novo, o relatório público consultado informou **“Não há dados disponíveis”**. Isso não significa aprovação de segurança. Até esclarecer a classificação, usar dados fictícios nas demonstrações e aguardar para novos cadastros reais.
- **Recuperação de senha por e-mail foi implementada e publicada em atualização posterior no mesmo dia.** CPF/e-mail de conta ativa recebem link de uso único válido por 15 minutos; testes focados e configuração em [recuperacao-senha.md](recuperacao-senha.md). Notificações de pedidos por e-mail continuam não implementadas.
- A identificação do Grupo 5 informa autoria acadêmica. Ela não substitui avaliação de privacidade, definição de responsabilidades ou comprova adequação completa à LGPD. Não foi entregue revisão jurídica completa.
- A hospedagem depende da VM, do Azure e da conta/créditos do responsável. O endereço gratuito não torna a infraestrutura ilimitada ou permanente.

## Roteiro para o José gravar o áudio

> Pessoal, integramos o visual novo com as correções da API. O sistema exige login nas áreas protegidas e confere no servidor o que cada perfil pode fazer. Corrigimos os pedidos e o estoque: o pedido reserva as unidades, editar o medicamento preserva o saldo, e aprovação, retirada e cancelamento respeitam as etapas permitidas. O histórico é preservado, as observações ficam no pedido certo e o alerta usa o mínimo de cada medicamento. Também melhoramos a exibição dos dados, os erros e o uso das telas menores. Agora o projeto aparece como Alto Custo, desenvolvido pelo Grupo 5 — Univesp, versão 1.0.0 de 2026, e os títulos estão em português. O endereço corrigido é altocusto.duckdns.org. Site e API estão no servidor do projeto, usando o Azure do nosso colega, sem depender do meu computador. Fizemos testes isolados e também o fluxo completo com dados fictícios no Azure, depois removidos, preservando os registros existentes. Sobre o aviso de perigo, verificamos a propriedade e solicitamos revisão ao Google, mas a retirada ainda não foi confirmada. Na atualização seguinte, também entregamos a recuperação de senha por e-mail com link temporário de uso único. Notificações de pedidos por e-mail continuam fora desta entrega.

Texto para compartilhamento ou gravação pelo José; nenhuma mensagem ou áudio foi enviado ao grupo automaticamente.

Apoio: [publicação atual](deploy-alto-custo.md), [checklist desta entrega](qa-identificacao-alto-custo.md) e [resultado do fluxo real no Azure](resultado-e2e-azure.md).
