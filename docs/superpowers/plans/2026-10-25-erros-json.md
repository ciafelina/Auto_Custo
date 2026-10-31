# Item 11 — erros consistentes e JSON válido

Objetivo autorizado: padronizar erros e corrigir a geração de JSON, preservando formatos de sucesso, permissões e regras dos itens anteriores. Implementação e testes nesta sessão, sem alterar dados reais.

Diagnóstico: Excecoes e login concatenam JSON; login captura qualquer exceção como 401 e usa formato diferente. Jhonson retorna texto puro para JSON inválido; erros anteriores ao serializer não têm Content-Type JSON garantido. Controllers fazem cast sem conferir objeto/nil; alguns serviços incluem mensagem interna de banco ou classificam qualquer falha como CPF duplicado. Telas leem formatos diferentes, exibem JSON bruto ou ignoram erros.

Decisão: construir respostas com System.JSON e Content-Type application/json; charset=UTF-8. Erros usam sucesso=false e erro {codigo,mensagem,detalhes:[]}; EErroApi preserva status/código/mensagem segura, inesperados usam 500/ERRO_INTERNO_SERVIDOR e texto genérico. Interrupção Horse continua sendo propagada. Normalizar 404/405 do roteador sem alterar auth/preflight. Login usa o tratador global e objetos JSON. Usar middleware JSON próprio pequeno, sem modificar bibliotecas externas, para parsing validado e serialização, e helper de leitura de objeto para controllers. Corpo vazio continua permitido em retirada/DELETE; obrigatório onde o controller o consome. Conteúdo não JSON em rotas que consomem corpo é recusado.

Frontend: helper comum prioriza erro.mensagem, aceita mensagem legada como compatibilidade e usa fallback seguro. Não exibir respostas HTML ou JSON bruto. Aplicar aos formulários/listas/painéis, preservando renderização como texto e redirecionamento de sessão existente.

- [x] Adicionar rotas exclusivas no harness para testar escape e exceção inesperada/parcial, sem incluí-las no executável principal.
- [x] Testes RED de status, Content-Type, escape/UTF-8, JSON inválido/tipo/corpo vazio, auth, 404/405, falha de banco e login; conferir ausência de alterações indevidas.
- [x] Testes RED no navegador para mensagem padronizada em listas, login/cadastro/perfil e operações administrativas.
- [x] Implementar middleware/helper, login, guardas de corpo e mensagens de serviço/consumo frontend.
- [x] Suíte completa GREEN, build Win32/Debug, sintaxe JS, revisão e documentação.

Limites: não redesenhar envelopes de sucesso/rotas legadas, validar todas as regras de campos de cadastros nem mudar endereço da API (item 12). Banco SQLite fictício e APIs interceptadas no navegador não substituem homologação SQL Server. Sem .git no workspace, sem commits/worktrees.

Evidências: item11-red.log reproduziu 43 falhas na API e 16 no navegador. Um erro inicial de importação Web.HTTPApp foi corrigido antes da rodada final. Os dados de dois testes de cadastro receberam data de nascimento para alcançar a falha/duplicidade pretendida, em vez de atingir a limitação preexistente de parâmetro nulo sem tipo. Emoji no nome armazenado também revelou perda de caracteres no driver/banco fictício; o teste de serialização de login usa acentos/aspas/controles e o escape de emoji é verificado sem banco. Nenhuma configuração de banco real foi modificada.

item11-green.log terminou com exit code 0: 404 verificações aprovadas, incluindo 45 novas de API e 18 de navegador. item11-build.log confirma Win32/Debug e node --check passou em todos os JavaScripts. Revisão independente sem achados bloqueantes. Registrou conversão de inteiros fora do intervalo ainda podendo retornar 500 seguro em código legado, fora da auditoria de campos deste item.
