# QA — identificação e publicação do Alto Custo

Conferência de 31/10/2026. Os testes de interface usam contas, medicamentos e respostas fictícias; as verificações de produção são de leitura. Nenhum usuário real teve senha alterada.

## Identificação e telas

- [x] Abrir a apresentação; conferir “Alto Custo”, finalidade acadêmica, Grupo 5 — Univesp, versão 1.0.0 e ano 2026 antes do convite ao cadastro e no rodapé.
- [x] Abrir login e cadastro; conferir autoria acadêmica antes dos campos e identificação completa no rodapé. Login explica acesso ao painel; cadastro oferece criar conta, sem prometer etapa automática inexistente.
- [x] Abrir o estoque e redimensionar; cabeçalho e título principal permanecem “Consulta de Estoque”.
- [x] Como paciente fictício, abrir o menu no estoque e perfil; “Painel de controle” leva ao painel correto.
- [x] Conferir dez telas nos temas claro/escuro e larguras 375, 768, 1024 e 1440; crédito legível e sem rolagem lateral.
- [x] Executar os fluxos isolados de login por cargo, menu, modal e pedido; permissões do funcionário e comportamento dos formulários preservados. Interface final: 53 cenários aprovados.

## Endereço e publicação

- [x] Conferir `altocusto.duckdns.org` na conta DuckDNS do usuário, apontando para a mesma VM; endereço anterior preservado.
- [x] Abrir os dois hosts por HTTPS; certificado validado para cada nome, sem desativar a validação de identidade.
- [x] Conferir os 27 arquivos de cada host contra o manifesto; 54 verificações externas aprovadas.
- [x] Conferir a base da API; usa `/api` na mesma origem. Chamada privada sem login retorna 401.
- [x] Conferir a ativação; processo, executável e conteúdo da configuração Azure da API preservados. Nenhuma restauração do banco antigo foi usada.
- [x] Conferir o arquivo Google nos dois hosts; corpo correto, servido fora da release estática e mantido após a atualização.
- [x] Simular falhas e recuperação em pasta descartável no Linux; não restaurar INI, não reiniciar API, recuperar interrupção e recusar operação concorrente. Verificar que status não apresenta release desativada como ativa.
- [x] Simular a renovação HTTPS com o mesmo hook de reload; simulação aprovada, timer ativo e API preservada. Release final `20261031-f8085877267f`; mesmos 27 arquivos da primeira ativação.

## Google e limites

- [x] Verificar a propriedade original na conta Google autorizada; ler o problema específico de possível phishing no login, sem URLs de amostra.
- [x] Após publicar a identificação revisada, enviar a solicitação de revisão pela interface, descrevendo as ações realizadas e a finalidade acadêmica.
- [x] Registrar o estado atual: portal mantém o problema; endereço novo sem dados disponíveis no relatório público. Não interpretar ausência de dados como aprovação.
- [ ] Obter o resultado da análise e confirmar a retirada do aviso do Google. **Pendente de resposta externa.**
- [x] Manter recuperação por e-mail e notificações fora das funções declaradas como entregues; não afirmar validação jurídica completa de privacidade.

## Retorno ao usuário

O Alto Custo passou a identificar o projeto acadêmico do Grupo 5 — Univesp, com versão e ano. Os nomes das telas foram corrigidos e permanecem em português no celular. O endereço com a grafia corrigida está ativo e as regras do sistema foram preservadas. O pedido de revisão do aviso foi enviado ao Google, mas ainda não houve confirmação de retirada; as demonstrações devem continuar com dados fictícios enquanto essa pendência não for esclarecida.
