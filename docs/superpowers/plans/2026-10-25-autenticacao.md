# Item 1 — autenticação e permissões

Objetivo: exigir sessão válida e autorização no servidor, preservando login e cadastro públicos.

Decisão confirmada pelo usuário: funcionários também gerenciam usuários.
Decisões de implementação: alteração de cargo exclusiva do administrador; perfil pessoal e painel pessoal exclusivos do titular; criação e retirada de pedidos vinculadas ao CPF autenticado. Gestão de solicitações de terceiros ocorre nas rotas administrativas.

Arquitetura: middleware global valida o token e consulta cargo/status atuais no banco. Rotas administrativas e legadas exigem equipe (1/2); cargo exige administrador (1). Controllers verificam titularidade. UPDATE de retirada inclui CPF na condição. Cadastro público continua criando paciente (3).

Escopo: item 1; a checagem de assinatura Verified do item 2 é dependência indispensável. Não alterar estoque, histórico, SQL de listagem, configuração de segredos ou endereço da API nesta etapa.

- [x] Reproduzir falha com teste HTTP de leitura sem token.
- [x] Implementar middleware e titularidade em providers/Autenticacao.pas, ProjetoFaculdade.dpr, controllers/Controlador_Usuario.pas, controllers/Controlador_Dashboard.pas, controllers/Controlador_Solicitacao.pas e services/Servico_Solicitacao.pas.
- [x] Ajustar menus para funcionário e botão de cargo exclusivo de administrador.
- [x] Compilar Win32/Debug e executar testes de autenticação, permissões e titularidade.
- [x] Revisar alterações e documentar resultados e limitações.
- [ ] Conferência assistida das telas no SQL Server do usuário antes de avançar para o item 2.

Casos críticos: cargo alterado após login, usuário inativo/excluído, CPF com zeros iniciais, assinatura inválida, retirada pertencente a terceiro. Usar banco de teste isolado; não alterar registros reais.

Ambiente: pasta sem .git; sem commit/worktree. Build original confirmado via MSBuild (Delphi 11, Win32/Debug). Existem hints H2443 anteriores à alteração.

## Resultado em 25/10/2026

- Antes: 7 das 10 leituras chegavam ao serviço sem token; suíte inicial de autorização com 60 falhas em 76 casos.
- Depois: 88 verificações aprovadas em banco isolado, incluindo efeitos persistidos, ausência de alterações negadas e cadastro/login reais; 10 leituras sem token retornaram 401 também no executável principal.
- Compilação principal: MSBuild Build, Win32/Debug, sucesso. Hints H2443 preexistentes permanecem.
- JavaScript alterado: sintaxe validada com node --check.
- Revisão independente: sem achados bloqueadores remanescentes; recomendação de validar persistência de CPF com zero incorporada.
- Dependência adicional encontrada nos testes: utils/Excecoes.pas precisava propagar EHorseCallbackInterrupted e interromper após enviar erros. Sem isso, Horse continuava até o controller depois de negar autenticação. A padronização geral de JSON do item 11 permanece pendente.
- Normalização usa CPF canônico do token nos serviços após conferir titularidade, inclusive no dashboard.
- Limite: nenhum dado real foi alterado. SQLite não executa stored procedures e consultas específicas do MSSQL. Roteiro manual e execução dos testes em tests/README.md.
