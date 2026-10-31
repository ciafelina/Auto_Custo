# Identificação e apresentação do Alto Custo

## Objetivo e escopo escolhido

Corrigir os pontos trazidos pelo Grupo 5: identificação do projeto, nomes de tela em português, endereço coerente com “Alto Custo”, textos que correspondam às funções existentes e diagnóstico do aviso vermelho do Chrome. Preservar autenticação, permissões, API, regras de estoque/status/histórico e o banco Azure atual.

O usuário escolheu corrigir identificação, telas e endereço primeiro. Recuperação automática de senha por e-mail fica para outra etapa; nenhum fluxo fictício ou promessa de recuperação será inserido.

## Abordagens

1. **Escolhida:** corrigir identificação/textos/navegação e preparar o endereço; tratar o alerta de reputação com diagnóstico e revisão do Google. Mantém o escopo atual do sistema e dispensa serviço de e-mail nesta rodada.
2. Incluir recuperação por e-mail nesta rodada: exige definir remetente, serviço de envio, expiração/uso único dos tokens, limites de tentativas e novos testes. Foi adiada pelo usuário.

## Constatações em 31/10/2026

- O HTTPS de `autocusto.duckdns.org` valida nome e cadeia normalmente; certificado inicial válido até 29/01/2027.
- O relatório público do Google informa “Algumas páginas deste site não são seguras” e descreve possível conteúdo enganoso. Esta é uma classificação de reputação; HTTPS e testes funcionais não a anulam. A causa exata ainda não foi confirmada.
- Conferência somente leitura na VM: 27 arquivos públicos presentes, todos com hash igual ao manifesto validado, sem extras ou symlinks; executável ativo com hash esperado. Nginx válido, raízes esperadas e API em `127.0.0.1:9000`. Isso não constitui uma auditoria completa de comprometimento.
- A conta Google aberta ainda não tem propriedade verificada do site no Search Console. O arquivo de comprovação foi baixado, mas não publicado, e a verificação não foi concluída. O relatório detalhado de problemas depende dessa comprovação.
- `altocusto.duckdns.org` não resolveu no DNS na consulta. Isso não comprova disponibilidade para cadastro nem propriedade; a confirmação precisa ocorrer no DuckDNS.
- `stock.html` contém “Dashboard” no cabeçalho que fica visível em telas menores; `stock.html` e `profile.html` também usam o termo no menu do paciente.
- O login promete completar o cadastro no primeiro acesso; o código efetivamente direciona aos painéis por cargo. Há edição do perfil autenticado, mas não recuperação automática de senha.
- A apresentação não identifica Grupo 5/Univesp, ano ou versão.

## Identificação proposta para aprovação

Nome público: **Alto Custo**. Subdomínio pretendido: **altocusto.duckdns.org**, sujeito à obtenção na conta DuckDNS do usuário. Nomes internos de pastas, variáveis, serviços, rotas e banco permanecem como estão.

Texto de identificação visível no início da página principal e no rodapé das telas:

> Projeto acadêmico desenvolvido pelo Grupo 5 — Univesp. Versão 1.0.0 · 2026.

A versão 1.0.0 é uma proposta para a primeira identificação pública, não uma numeração previamente informada pelo grupo. Manter o contexto de São José do Rio Preto sem apresentar o projeto como serviço oficial da prefeitura, universidade ou rede de saúde. Não inserir selo de conformidade, garantia de segurança total ou promessa de atendimento não validada.

## Telas e conteúdo

- Menu do paciente: “Painel de controle” em todas as telas e larguras.
- Cabeçalho do estoque: “Consulta de Estoque”; perfil: “Meu Perfil”; painéis mantêm seus títulos em português.
- Preservar layout, cores, acessibilidade e as melhorias de segurança já entregues.
- Login deve informar o direcionamento ao painel e a possibilidade de editar o perfil, sem prometer etapa obrigatória inexistente ou recuperação por e-mail.
- Descrever somente cadastro, acesso, consulta de estoque, solicitações e acompanhamento que realmente existem. Identificar explicitamente o caráter acadêmico antes do convite a novos cadastros.
- Preparar um resumo em linguagem simples das alterações já realizadas e das funções pendentes, utilizável como roteiro para o próprio José gravar um áudio. Nenhuma mensagem ou áudio será enviado ao grupo pelo agente.

## Alerta de segurança e Search Console

Verificar a propriedade somente de `https://autocusto.duckdns.org/` na conta Google já aberta do usuário, após autorização específica para essa atribuição de acesso. O arquivo público de comprovação deve persistir na VM sem expor configuração, senha ou chave e sem entrar na pasta de arquivos privados da API.

Ler os exemplos e motivos apresentados no relatório de problemas de segurança. Corrigir achados concretos; caso o conteúdo seja considerado legítimo após a revisão, preparar e solicitar reanálise com descrição factual das correções e da finalidade acadêmica. Não afirmar comprometimento ou falso positivo sem evidência; não ignorar o aviso do navegador nem desativar suas proteções. Uma troca de endereço não será apresentada como solução do alerta.

O retorno do Google pode depender de processamento externo. Enquanto a classificação persistir, registrar a pendência e recomendar que o grupo suspenda novos cadastros com dados reais. Os textos corrigidos não serão apresentados como regularização jurídica completa.

## Endereço e publicação

Após confirmar cadastro/propriedade do novo nome no DuckDNS, apontar para a mesma VM. Preparar HTTPS válido para o nome novo, serviço de renovação e nginx sem alterar a API ou o banco. Antes de mudar o endereço divulgado, testar o novo host com validação TLS normal e acesso à API da mesma origem.

Preservar o endereço existente e a instalação até a nova configuração estar validada. Se o novo nome não estiver disponível ou faltar acesso à conta DuckDNS, concluir as correções independentes e informar o impedimento específico, sem apontar para domínio de terceiros. Não divulgar um nome novo como forma de contornar a classificação do Google; seu próprio estado de reputação também precisa ser conferido.

Publicar os arquivos revisados com backup e possibilidade de retornar à versão anterior, mantendo a conexão atual ao Azure. Não usar o rollback antigo que restaura a conexão ao banco anterior. Configurações e dados reais permanecem fora do Git. Commit e envio das correções devem ser normais, sem nova reescrita de histórico.

## Verificação e entrega

- Conferir títulos e identificação nas dez telas, nos temas claro/escuro e larguras 375, 768, 1024 e 1440, com dados fictícios e sem gravações na base real.
- Confirmar que os nomes visíveis não mudam para inglês ao redimensionar e que não surge rolagem lateral por causa do crédito/versão.
- Confirmar login por cargo, menu, consulta e composição das URLs sem alterar métodos, tokens, permissões ou regras de negócio.
- Executar os testes pertinentes à alteração e a verificação de segredos antes do commit.
- Na publicação, conferir hashes, HTTPS, proteção da API, destino Azure preservado e renovação. A comprovação de propriedade do Google não deve se perder em futuras publicações.
- Entregar checklist operacional em português, resumo para o grupo e status explícito do alerta e do novo domínio, distinguindo o que foi concluído do que depende do Google/DuckDNS.

## Fontes e evidências

- Relatório público: https://transparencyreport.google.com/safe-browsing/search?url=autocusto.duckdns.org
- Ajuda para proprietários: https://support.google.com/webmasters/answer/6347750?hl=pt-BR
- Evidência privada de integridade (sem dados de usuários): `tests/.build/private/warning-integrity.json`.
- Nenhuma conta teve a senha alterada nesta etapa; a solicitação anterior continua dependendo da escolha do CPF pelo usuário.
