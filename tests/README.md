# Testes dos itens 1 a 12 — API, segurança, estoque e acesso em rede

## Fluxo autenticado completo no Azure publicado — 31/10/2026

**30 cenários aprovados, zero falhas, saída 0**, na execução `20261031-765d0947685e`. Cadastro/login, cadastro de medicamento, pedido, aprovação com observação e retirada foram executados no Edge contra o site/API publicados, sem simular respostas. A persistência foi conferida no Azure SQL do projeto. Negativas complementares cobrem quantidade/saldo, permissões/titularidade, edição sem sobrescrita de estoque, transições/repetições, histórico, observação de outro pedido e classificação pelo mínimo.

Foram criados e removidos **três usuários, um medicamento e duas solicitações fictícias**. Zero registros de teste remanescentes; contagens e SHA-256 dos registros originais das sete tabelas idênticos antes/depois. Tokens das contas removidas retornaram 401. Sem mudanças no código/configuração de produção ou schema; identidades SQL não são reinicializadas. Relatório operacional/checklist: `docs/resultado-e2e-azure.md`. Evidências: `tests/.build/azure-e2e/20261031-765d0947685e/{plan,preflight,results,cleanup,summary}.json` e duas capturas das telas finais com dados fictícios.

Ferramentas: `azure-e2e.mjs` controla o navegador/API; `azure-e2e-write-scope.mjs` bloqueia gravações fora do domínio e dos dados exatos desta rodada; `azure_e2e_remote.py` confere identidade do banco, colisões, triggers, assinaturas e propriedade dos vínculos. O auxiliar aceita somente operações fixas e limita a promoção a funcionário da própria conta fictícia; limpeza transacional por IDs/nomes/CPFs exatos, recusando referências externas. Credenciais da API são lidas apenas da configuração privada na VM. Senha fictícia gerada em memória; sem senhas/JWTs nos artefatos.

O supervisor exige previamente **nove testes locais de segurança e 11 assertivas de escopo HTTP**, que podem ser repetidos sem rede/banco:

```powershell
python -X utf8 tests/test_azure_e2e_safety.py
node tests/azure-e2e-write-scope-test.mjs
```

Para uma nova rodada autorizada no ambiente publicado, `python tests/run-azure-e2e.py` utiliza os runtimes Python/Node e Paramiko preparados neste computador, solicita a senha SSH sem eco e cria um manifesto exclusivo. O auxiliar pyodbc executa em ambiente privado separado da API, usando ODBC 18 com TLS validado. A chave de host SSH deve ser conhecida; não há aceitação automática. O supervisor sempre tenta limpar e exige confirmação de ausência de resíduos/preservação para retornar sucesso. O auxiliar também tenta limpar em EOF/desconexão/sinal; se a rodada for interrompida, `python tests/run-azure-e2e.py --cleanup-run <id-da-propria-rodada>` retoma somente a limpeza vinculada aos manifestos local/remoto correspondentes. Nenhuma restauração de snapshots sobre dados atuais é feita.

Essa rodada autentica o fluxo real publicado; não substitui os testes isolados, de concorrência ou da cópia SQL Server descritos abaixo.

## Publicação AutoCusto no domínio e banco Azure — 31/10/2026

**64 testes externos aprovados, zero falhas**, em `tests/domain-publication-green.log`. `node tests/domain-publication.mjs` confere somente o domínio fixo `https://autocusto.duckdns.org`, os 27 arquivos públicos por hash, proteção das rotas, JWT/login fictícios, bloqueio de arquivos privados e navegação/tema no Edge. Entradas privadas usam IDs inválidos e corpo vazio; não há cadastro ou movimento de estoque. `--preflight` executa somente redirecionamento e certificado/página inicial.

O probe nativo na VM passou 12 verificações de conexão/schema/permissões/cargos e leitura dos painéis no Azure, com TLS estrito. `test_autocusto_domain_publish.py` passou seis testes no Linux em pasta descartável, com serviços simulados. Dois testes de symlink/modo POSIX são explicitamente pulados no Windows e executados no Linux. A evidência nativa e o hash do módulo são exigidos antes de preparar/ativar. A recuperação também foi acionada de fato na primeira ativação e confirmou a restauração da instalação anterior; a nova ativação passou após a espera pelo reload, sem dispensar validação TLS.

Renovação simulada/reload, INI `0640`, processo/configuração efetivos e ausência da senha/chave da release nas últimas cem linhas do journal passaram. Evidências em `tests/.build/deploy-domain`. Operação e limitações em `docs/deploy-autocusto.md`.

## Integração visual recebida em 31/10/2026

Resultado final: **503 verificações aprovadas, zero falhas** — 463 anteriores e 40 de integração visual. Runner completo concluído com exit code 0 em `tests/frontend-integration-regression-final.log`. Sintaxe dos 16 scripts de produção validada; recursos e IDs conferidos nas dez páginas. Backend e pasta recebida preservados por conferência de hashes. Revisão independente concluída sem pendências importantes após as correções de contraste e foco.

`frontend-integration.mjs` verifica as dez páginas nos modos claro/escuro e em celular, preferência salva/sistema/armazenamento bloqueado, login por cargo, menu e modais pelo teclado, pedido com aviso sem reload, foco após sucesso, recusa sem falso sucesso, quantidade inteira e acesso do funcionário à gestão de usuários. Inclui contraste do estado vazio do paciente e navegação ativa no tema escuro.

O runner `run-authorization.ps1` inclui esses cenários na regressão dos itens 1 a 12. Para rodar somente a integração visual: `node tests/frontend-integration.mjs`. Para os quatro cenários encontrados na revisão: `node tests/frontend-integration.mjs --review-checks`.

Todas as chamadas destes novos cenários são interceptadas com fixtures; fontes externas são bloqueadas, sem acesso à API publicada ou ao banco real. As capturas concluem animações/transições para registrar o estado estável. Resultados/capturas em `tests/.build/frontend-integration`; logs em `tests/frontend-integration-*.log`. O ZIP anterior e os manifestos antes/depois permitem conferir preservação do backend e da pasta recebida. Roteiro operacional em `docs/qa-integracao-front-end.md`.

## Resultados anteriores

Resultado em 25/10/2026: **121 cenários aprovados com SQL Server real** e **463 verificações isoladas aprovadas**, sem falhas. Inclui fluxos no Edge, concorrência e regressão após as correções. Compilação Win32/Debug concluída e sintaxe dos JavaScripts validada. Acesso por um segundo computador físico ainda pendente.

Publicação Linux verificada em HTTPS: **45 cenários externos aprovados**, **8 cenários de configuração/runtime Linux aprovados** (incluindo BCrypt/JWT) e **5 testes de recuperação aprovados**. A regressão Windows de 463 verificações foi repetida após as adaptações Linux. O probe FireDAC Linux confirmou identidade do banco, tabelas, procedure e 19 permissões necessárias, somente por leitura. Ver `docs/deploy-linux.md` para infraestrutura, recuperação e a exceção de certificado autorizada.

Item 1: **88 verificações aprovadas**, mais **10 chamadas sem token bloqueadas no executável principal** na primeira etapa.

Item 2: **30 verificações adicionais de tokens aprovadas**; total da suíte: **118 verificações**. A condição de assinatura `Verified` e o algoritmo HS256 foram antecipados no item 1 e confirmados nesta etapa. Uma contraprova em cópia isolada, sem exigir `Verified`, provocou dez falhas; isso confirmou que os testes detectam a vulnerabilidade original. Não foi necessário alterar novamente o código de produção.

Item 3: **21 verificações de configuração aprovadas**; total acumulado: **139 verificações**. O harness usa agora o Secrets real e recebe uma chave fictícia por variável de ambiente. A fixture que substituía Secrets foi removida. São testados erros antes de abrir a porta, limites de tamanho, configuração por arquivo/variável, prioridade efetiva da chave, UTF-8, caminhos completos e credenciais legadas entre aspas.

Item 4: **31 verificações de pedidos aprovadas**; total acumulado: **170 verificações**. São conferidos quantidade/tipos inválidos, campo ausente, medicamento inexistente, estoque insuficiente/zerado/negativo/NULL, quantidade exata, rollback após falha de INSERT e chamadas simultâneas. Vinte chamadas por dez unidades resultaram em dez pedidos aceitos, dez recusados por estoque e saldo zero. A revisão independente não encontrou bloqueios de produção e o executável Win32/Debug compilou.

Item 5: **11 verificações de medicamentos e 3 de formulário aprovadas**; total acumulado: **184 verificações**. Salvar o cadastro preserva o saldo após pedidos, ajustes e movimentações concorrentes, mesmo quando o PUT recebe estoque antigo/inválido ou não recebe estoque. Nome, categoria, dosagem, fabricante, mínimo e descrição continuam sendo atualizados. Cadastro mantém estoque inicial e PATCH mantém a atualização deliberada de saldo.

Item 6: **44 verificações de status aprovadas**; total acumulado: **228 verificações**. A matriz de 16 transições impede reabertura e repetição, mantém observação/estoque nas recusas e faz devolução única. Há testes de reservas inconsistentes, medicamento ausente, limite inteiro, rollback e disputas entre cancelamento, aprovação e retirada. Dez cancelamentos simultâneos resultaram em um sucesso e nove conflitos, com uma única devolução.

Item 7: **18 verificações em navegador real aprovadas**; total acumulado: **246 verificações**. Nomes com apóstrofos/aspas e textos com img/svg são mostrados literalmente; descrições em title, status, datas e mensagens não criam elementos nem executam o payload. Botões preservam objetos/IDs e nomes completos, inclusive em listas com vários registros. A suíte também verifica ausência de erros JavaScript não tratados. A API não foi modificada nesta etapa.

Item 8: **20 verificações de histórico aprovadas**; total acumulado: **266 verificações**. Exclusões com solicitações são bloqueadas, independentemente do status, mantendo cadastro/vínculos/dados intactos. Cadastros sem solicitações podem ser excluídos. Triggers fictícios conferem rollback; disputas de exclusão e pedido não deixaram registros órfãos no SQLite de testes. Nenhuma alteração de schema foi necessária.

Item 9: **8 verificações de observações na API e 9 no navegador aprovadas**; total acumulado: **283 verificações**. Ações rápidas preservam a nota existente; ações do modal enviam somente o texto do registro aberto. Fechar limpa o rascunho e a identidade, e uma resposta atrasada de A não fecha nem apaga o modal de B. A compilação Win32/Debug e a sintaxe dos JavaScripts passaram.

Item 10: **24 verificações de classificação na API e 34 no navegador aprovadas**; total acumulado: **341 verificações**. Consulta, gestão, filtros e indicador administrativo usam o mínimo de cada medicamento. Foram testados limites, mínimos diferentes/zero, valores legados, totais/paginação, busca/categoria, catálogo vazio e alteração do mínimo sem alterar saldo. Compilação Win32/Debug e sintaxe dos três JavaScripts de produção passaram.

Item 11: **45 verificações de erros/JSON e 18 de mensagens no navegador aprovadas**; total acumulado: **404 verificações**. Erros usam o mesmo envelope e Content-Type JSON, login preserva status e escapa nomes, parser recusa corpos inválidos sem gravar e falhas internas não retornam detalhes do banco. As nove páginas consomem a mensagem padronizada, incluindo perfil/login/cadastro. Compilação Win32/Debug, sintaxe de todos os JS e revisão independente concluídas sem bloqueios.

Item 12: **32 verificações de endereço e 27 no navegador aprovadas**; total acumulado: **463 verificações**. Configuração única, detecção do servidor da página, IP/domínio/IPv6/HTTPS/porta/prefixo e recusa de bases/caminhos inadequados. As chamadas das nove páginas preservam métodos, autorização, payloads e paginação. GET/POST reais do navegador contra o harness passaram pelo CORS. Compilação Win32/Debug, sintaxe JS e revisão concluídas sem bloqueios de produção.

Executar no PowerShell, na pasta do projeto, com Delphi 11 (`dcc32` no PATH), Node.js com `node:sqlite`, Playwright e um navegador Chromium/Edge/Chrome disponível:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-authorization.ps1
```

O script compila os controllers, serviços, middleware, configuração e bibliotecas reais em um servidor de testes na porta 19001. Substitui a conexão de banco por SQLite local e fornece a chave fictícia por ambiente; a leitura da chave usa o código real. A fixture usa uma subclasse de query que traduz somente a paginação OFFSET/FETCH em LIMIT/OFFSET e preserva os parâmetros. Filtros e regras de negócio continuam sendo executados a partir do código real. Os cenários de configuração usam arquivos temporários fictícios e caminho alternativo, sem ler o arquivo real. O teste separado de Conexao usa o provider MSSQL real sem conectar. A base fictícia é recriada a cada execução em `tests/.build/autenticacao-test.sqlite`; o servidor iniciado pelo script é encerrado ao final. A porta precisa estar livre. O teste confirma um cabeçalho exclusivo do harness antes de fazer alterações.

`browser-safety.mjs` procura Playwright no projeto ou no runtime Node do Codex e usa Chromium instalado ou Edge/Chrome desta máquina. Para selecionar outro executável, definir `AUTO_CUSTO_TEST_BROWSER`. Todos os arquivos e respostas da API são interceptados com fixtures; o navegador usa um perfil temporário, sem acessar sessões pessoais. Pode ser executado separadamente com `node tests/browser-safety.mjs`.

Os testes verificam todas as 26 rotas privadas sem token, permissões por cargo, CPF de terceiros, retirada alheia, expiração/assinatura inválida, conta inativa/excluída, cargo desconhecido, revogação imediata de cargo/status, CPF com zero inicial, persistência de alterações autorizadas, ausência de alterações negadas e cadastro/login reais com BCrypt/JWT.

`tokens.mjs` verifica chave incorreta, assinatura alterada/ausente/truncada, CPF/cargo/expiração/cabeçalho adulterados, alg=none, HS384/HS512/RS256 indevidos, algoritmo ausente/desconhecido, partes ausentes/extras, JSON inválido, caracteres inválidos, padding, token expirado e expiração ausente. Cada rejeição confere HTTP 401, código de credenciais inválidas e ausência de mudança no banco; tokens válidos são aceitos antes e depois das tentativas. O runner executa todas as suítes, incluindo exibição e histórico, e falha se qualquer uma falhar.

`orders.mjs` usa o controller e o serviço reais, verifica alterações no banco fictício e executa a disputa simultânea pelo mesmo medicamento. O estoque é reservado por UPDATE com condição de saldo suficiente e o pedido é inserido na mesma transação. A fixture registra GETDATE para manter o SQL original; usa conexões com cache privado, WAL e espera por bloqueios. Nenhuma destas opções altera o provider MSSQL de produção.

`medications.mjs` confere saldo e cadastro persistidos após PUT com dados antigos, pedido e edição simultâneos, cadastro POST e ajuste PATCH. `medication-form.mjs` executa o JS real com DOM mínimo baseado nos IDs/classes/valores do HTML real; verifica campo inicial desabilitado/oculto na edição, ausência de estoque no PUT e restauração/envio do saldo inicial no POST.

Na edição, a API ignora campos de saldo e atualiza somente dados cadastrais. Para alterar o saldo deliberadamente, usar o botão de estoque (📦) na lista. O campo Estoque Inicial aparece somente para novos medicamentos.

`ui-safe.js` constrói dados externos com createElement/textContent e eventos com addEventListener. Nomes/descrições não precisam ser removidos ou alterados no banco: caracteres legítimos são preservados. HTML constante de carregamento/estados vazios e ações estáticas das páginas permanecem disponíveis; dados não são concatenados dentro de HTML ou código.

## Exclusão e histórico

Conforme escolha do usuário, a exclusão física é bloqueada quando existir qualquer solicitação vinculada ao cadastro. A API retorna **409 / HISTORICO_VINCULADO**, inclusive para pedidos Cancelados, Retirados, com status legado ou NULL. O histórico não é apagado nem perde o vínculo com usuário/medicamento. Cadastros sem solicitações continuam retornando 204 ao serem excluídos.

Para encerrar acesso de uma conta com histórico, permanece disponível a desativação de usuário no painel existente. Não foi criada desativação de medicamentos nem mudança de schema.

`history.mjs` compara os registros antes/depois das tentativas, lê os vínculos por JOIN, confere exclusão sem vínculos e rollback por trigger, e executa cinco disputas de pedido/exclusão para cada tipo de cadastro. As transações são serializáveis e o pedido confirma o usuário ativo dentro da transação, protegendo o vínculo após a autenticação. Os testes usam SQLite; os resultados não comprovam o comportamento específico de locks/deadlocks do SQL Server real. Dados apagados ou desvinculados antes desta correção não são reconstituídos automaticamente.

## Fluxo de status das solicitações

| Origem | Destinos permitidos | Efeito no estoque |
|---|---|---|
| Pendente | Aprovado, Cancelado | Aprovar mantém reserva; cancelar devolve uma vez |
| Aprovado | Retirado, Cancelado | Retirar mantém baixa; cancelar devolve uma vez |
| Retirado | Nenhum | Sem devolução |
| Cancelado | Nenhum | Sem nova devolução |

Repetir o mesmo status ou tentar uma transição inválida retorna 409 (`TRANSICAO_STATUS_INVALIDA`). Status desconhecido ou entrada inválida retorna 400; solicitação inexistente retorna 404. A API não finaliza um cancelamento se não puder devolver a reserva com segurança: retorna 409 e preserva status, observação e estoque. Falha inesperada retorna 500 com rollback.

`request-status.mjs` confere a matriz, entradas inválidas, repetição/reabertura, consistência da reserva, falha de devolução e chamadas simultâneas. O UPDATE condicionado da solicitação decide qual chamada pode prosseguir; a devolução pertence à mesma transação. A retirada do paciente já usa a mesma linha condicionada a Aprovado, permitindo apenas um vencedor na disputa com cancelamento.

## Observações das solicitações

Os botões rápidos da lista enviam somente `status`. Os botões de alteração do modal enviam também `observacao`, depois de conferir que o modal está aberto para o mesmo ID. O texto é capturado antes da confirmação e não é lido novamente durante a chamada. Fechar o modal limpa ID, observação e botões.

No PATCH de status, omitir `observacao` ou enviar `null` preserva o valor atual. Uma string explícita substitui o texto; `""` limpa a nota. Número, array e objeto são recusados com 400. A observação é alterada na mesma transação do status/estoque, somente na solicitação indicada pela URL e em transição válida.

`observations.mjs` confere os registros persistidos e a ausência de mudanças em outra solicitação. `observation-browser.mjs` usa navegador real com respostas fictícias e cobre rascunho residual, ações rápidas, gravação/limpeza explícita, ID divergente, modal fechado, confirmação cancelada e resposta atrasada. Pode ser executado separadamente com `node tests/observation-browser.mjs`.

## Classificação de estoque

| Condição | Classificação | Filtro |
|---|---|---|
| Saldo menor ou igual a zero | Indisponível | out |
| Saldo positivo, menor ou igual ao mínimo | Crítico | low |
| Saldo acima do mínimo | Disponível | available |

Saldo NULL é tratado como zero. Mínimo NULL ou negativo é tratado como zero para classificação, sem alterar automaticamente o cadastro. Igualdade com o mínimo positivo é crítica; saldo zero com mínimo zero continua indisponível. O mínimo é um alerta de reposição: estoque crítico ainda permite solicitar unidades disponíveis.

`/produtos` agora inclui `estoqueMinimo` no JSON. A condição SQL de `utils/Estoque.pas` é compartilhada pelos filtros e indicador administrativo; `Front_End/js/stock-status.js` é compartilhado pelas duas telas. Exemplos: saldo 3/mínimo 2 fica disponível; saldo 6/mínimo 10 fica crítico. Não há mais limite fixo de 5 nestes fluxos.

O painel administrativo faz consultas explícitas para total de usuários, medicamentos, solicitações com status Pendente, críticos e nomes dos indisponíveis. Mantém o formato da resposta e dispensa `sp_ObterDashboardAdmin`; nenhuma procedure ou schema foi alterado no banco. O código da procedure anterior não está disponível no projeto, portanto regras adicionais que eventualmente existam nela precisam ser conferidas na homologação. O painel do paciente continua usando sua procedure existente.

`stock-cases.mjs` contém 15 casos com expectativas literais. `stock-classification.mjs` executa os serviços reais, combina filtros, verifica paginação, saldos preservados e resultados do painel. Após verificar o cabeçalho exclusivo do harness, reinicializa somente Medicamentos/Solicitacoes da base fictícia; por isso é a última suíte de API no runner. `stock-classification-browser.mjs` confere rótulos, cores e botões nas duas telas, permite abrir pedido crítico e verifica os filtros enviados à API. Pode rodar sozinho com `node tests/stock-classification-browser.mjs`.

## Respostas de criação de pedido

| Situação | HTTP |
|---|---|
| Quantidade ou idMedicamento ausente, inválido, fracionário, zero ou negativo | 400 |
| Medicamento inexistente | 404 |
| Saldo insuficiente | 409 (`ESTOQUE_INSUFICIENTE`) |
| Pedido e reserva de estoque gravados | 201 |
| Falha inesperada na gravação, com rollback | 500 |

Quantidade e idMedicamento devem ser números inteiros JSON entre 1 e 2147483647. Valores numéricos enviados como texto são recusados. A tela mostra a mensagem de `erro.mensagem` e rejeita quantidade fracionária antes de enviar.

## Erros e geração de JSON

Todas as falhas tratadas pela API usam `Content-Type: application/json; charset=UTF-8` e este formato:

```json
{"sucesso":false,"erro":{"codigo":"REQUISICAO_INVALIDA","mensagem":"Descrição do problema.","detalhes":[]}}
```

Código e mensagem são serializados por System.JSON; aspas, barras, quebras de linha, acentos e caracteres de controle não são concatenados dentro do JSON. O login também usa objetos JSON no sucesso e preserva os campos/tipos anteriores em dados, incluindo token_jwt, nome, cpf, cargo e expira_em. Nomes com aspas/apóstrofos passam no fluxo cadastro/login; o transporte de emoji é verificado sem banco, pois preservação no armazenamento depende dos tipos/collation do SQL Server e da configuração do driver.

| Situação | HTTP / código |
|---|---|
| Corpo ausente em rota que o exige, raiz diferente de objeto ou JSON malformado | 400 / REQUISICAO_INVALIDA |
| Campo obrigatório ausente | 400 / PARAMETRO_AUSENTE |
| CPF já cadastrado | 400 / CPF_DUPLICADO |
| Credenciais/sessão inválidas | 401 / CREDENCIAIS_INVALIDAS |
| Acesso sem permissão | 403 / ACESSO_NEGADO |
| Rota/recurso inexistente | 404 / RECURSO_NAO_ENCONTRADO |
| Método inválido para rota existente | 405 / METODO_NAO_PERMITIDO |
| Conflito de estoque/status/histórico | 409 / código específico preservado |
| Corpo com Content-Type incompatível | 415 / FORMATO_NAO_SUPORTADO |
| Falha de gravação conhecida | 500 / ERRO_GRAVACAO_BANCO, mensagem segura |
| Exceção inesperada | 500 / ERRO_INTERNO_SERVIDOR, mensagem genérica |

O login com `{}` agora retorna 400 em vez do antigo 401 indiscriminado. O teste de autorização foi atualizado para esse contrato. O tratamento de duplicidade de usuário usa a classificação da exceção FireDAC, evitando informar CPF duplicado em qualquer falha de INSERT. Falhas de banco não incluem SQL, caminhos ou mensagens internas na resposta.

`utils/JsonApi.pas` substitui a integração Jhonson do executável, sem modificar a biblioteca externa. A ordem permanece CORS → tratamento de erros → autenticação → JSON; portanto uma requisição privada sem token retorna 401 antes de validar seu corpo. O helper LerObjetoJSON impede cast de nil/array como objeto nos controllers. A retirada sem corpo e as respostas 204 continuam válidas e vazias; o preflight permanece público. Os formatos de sucesso das rotas legadas não foram redesenhados.

`Front_End/js/api-response.js` prioriza erro.mensagem e mantém mensagem como compatibilidade com respostas legadas. Uma resposta não JSON usa texto genérico, sem mostrar HTML/JSON bruto. Listas continuam usando textContent e formulários usam texto/alertas.

`errors-json.mjs` testa os status, cabeçalhos, escape/UTF-8, formatos inválidos, corpo obrigatório em 14 operações, auth, 404/405, rollback/ausência de alterações e falhas reais no SQLite. `tests/fixtures/ErrosTeste.pas` adiciona rotas sintéticas para exceção/escape/resposta parcial somente no harness; elas não estão no projeto principal. `errors-browser.mjs` testa mensagens nas nove páginas e pode rodar sozinho com `node tests/errors-browser.mjs`.

Não foi feita uma auditoria completa da validação de todos os campos de cadastro. Conversões numéricas legadas fora do intervalo ainda podem retornar 500 seguro em vez de 400; esse comportamento anterior foi registrado pela revisão e não é coberto pela padronização de envelope.

O teste `unauthenticated.mjs` faz somente leituras contra `TEST_API_URL` (padrão `http://127.0.0.1:9000`).

## Endereço da API e acesso em rede

`Front_End/config.js` define `AUTO_CUSTO_CONFIG.apiBaseUrl`. O valor vazio usa o hostname e protocolo da página na porta 9000. Um arquivo local sem hostname mantém localhost; um compartilhamento com hostname usa esse servidor por HTTP. Uma URL HTTP/HTTPS explícita aceita IP/domínio, porta e prefixo de proxy. O passo a passo está em `docs/configuracao.md`.

`Front_End/js/api-client.js` compõe todas as URLs. As nove páginas carregam configuração/helper antes dos scripts de tela. As 21 expressões que tinham localhost fixo agora usam `Api.url`; a única referência local restante é o fallback centralizado. Headers de autorização, métodos, payloads e filtros permanecem nos fluxos de origem.

O helper rejeita base com protocolo incompatível, credenciais, query ou fragmento e impede que um caminho de chamada mude de origem ou escape do prefixo. Não usa query da página/localStorage para configurar o destino. HTTPS na página requer destino com TLS ou a configuração explícita da URL HTTPS do proxy; o processo Delphi permanece em 9000.

`api-config.mjs` executa o helper em VM com expectativas de URL literais, incluindo LAN, localhost, arquivo, compartilhamento, IPv6, HTTPS, prefixo, barra final, query e entradas recusadas. `api-config-browser.mjs` confere carregamentos e ações nas nove páginas com destino fictício HTTPS/porta 9443/prefixo /farmacia/v1 e preservação de método/header/corpo. Inclusive o destino antigo é interceptado para que uma regressão não acesse a API real.

O teste de CORS também abre um servidor HTTP temporário em loopback/porta aleatória para servir as telas reais e usa a API real **do harness** em 127.0.0.1:19001, com token e banco fictícios. Essas requisições não são interceptadas: GET do painel administrativo e POST de eco atravessam o preflight do navegador. A API declara explicitamente Authorization/Content-Type e GET/POST/PUT/PATCH/DELETE/OPTIONS. Perfil do navegador, servidor estático e harness são encerrados ao final.

As suítes antigas de navegador recebem seu endereço fictício por config.js; o teste antigo de formulário carrega o helper antes do JS real. Isso preserva os cenários anteriores sem depender do hostname usado pelo teste. Não houve abertura de firewall, publicação ou acesso à API/banco de produção. O uso em um segundo computador físico continua dependendo da rede/firewall e precisa de conferência manual.

## Permissões implementadas

| Operação | Administrador (1) | Funcionário (2) | Paciente (3) |
|---|---|---|---|
| Login e cadastro público | Sim | Sim | Sim |
| Consultar produtos | Sim | Sim | Sim |
| Perfil/painel pessoal e pedidos próprios | Sim | Sim | Sim |
| Gestão de usuários | Sim | Sim | Não |
| Alterar cargo | Sim | Não | Não |
| Gestão de medicamentos/solicitações | Sim | Sim | Não |
| Documentos, interessados e arquivos legados | Sim | Sim | Não |

Só contas existentes com status `Ativo` e cargo 1, 2 ou 3 são aceitas. Permissões são consultadas no banco a cada requisição; o cargo do token e do localStorage não autoriza operações. Cadastro público sempre cria paciente. A retirada exige pedido aprovado pertencente ao titular, e retorna 404 se não houver pedido correspondente, sem revelar pedidos alheios.

## Limite da validação automática

SQLite testa o controle de acesso, a validação criptográfica, as transações de pedidos/status/exclusão, as observações, a classificação, o painel administrativo, os erros e as atualizações reais de medicamentos. A fixture traduz paginação e remove hints MSSQL; reserva a escrita com BEGIN IMMEDIATE para evitar promoção de snapshots WAL. Essa adaptação não simula locks por linha. Driver, triggers, FKs, locks, OFFSET/FETCH, CONVERT e stored procedures foram validados separadamente na suíte SQL Server real descrita abaixo. O teste antigo de formulário usa DOM simulado; as suítes de exibição, observações, classificação e erros usam Edge headless real com API fictícia. A suíte de endereço também faz requisições reais entre origens ao harness local, sem interceptar a API nesses dois casos. Nenhum dado real foi alterado pelos testes. A conferência por outro computador físico continua pendente.

## Conferência manual no ambiente SQL Server

Reiniciar a API compilada em `Win32/Debug/ProjetoFaculdade.exe`, usando a configuração externa descrita em `docs/configuracao.md`. Abrir as telas e entrar com contas de teste existentes:

1. Paciente: consultar estoque e seu próprio painel/perfil; usar pedido próprio aprovado para conferir a retirada em ambiente de teste.
2. Funcionário: acessar gestão de usuários, medicamentos e solicitações; o botão de cargo não deve aparecer.
3. Administrador: conferir acesso às mesmas áreas e alteração de cargo em uma conta de teste.
4. Em outra sessão, mudar cargo/desativar uma conta de teste; a próxima chamada deve respeitar a alteração.
5. Sem login ou usando dados de outro titular, a API deve retornar 401/403; retirada alheia retorna 404.
6. Em homologação, conferir medicamento com saldo 3/mínimo 2 como disponível e saldo 6/mínimo 10 como crítico nas duas telas e filtros. Igualdade com mínimo positivo deve ser crítica; zero indisponível. Comparar total crítico do painel com o filtro e conferir os demais totais em relação às regras da procedure administrativa anterior.
7. Em outro computador da mesma rede, servir/abrir as telas pelo endereço do servidor, configurar apiBaseUrl se necessário e conferir login, consulta, perfil e operações autorizadas com dados de homologação. Confirmar destino das chamadas e preflight; verificar regras de firewall/rede se houver falha de conexão.

Usar somente dados de homologação para conferir exclusão e estoque; não excluir nem movimentar cadastros reais durante testes.

## Integração automatizada com SQL Server real

Os scripts `inspect-sqlserver.ps1` e `sqlserver-platform.ps1` fazem a pré-verificação de conexão/metadados usando o INI externo (`AUTO_CUSTO_CONFIG` ou o caminho padrão). A senha é lida em memória e não deve ser informada pela linha de comando nem enviada ao chat.

Para preparar e executar, abrir o terminal com o ambiente Delphi 11 (`rsvars.bat`) carregado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/export-sqlserver-schema.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-sqlserver.ps1
```

A exportação usa as bibliotecas SMO do Management Studio 22 instalado. Ela gera somente schema de sete tabelas e duas procedures, preservando identidades, defaults, índices e sete FKs. O runner precisa de permissão para criar/remover seu banco temporário no servidor configurado. Cada rodada cria um nome AutoCusto_IT exclusivo com marcador, copia somente os três cargos de referência e inicia sem dados de negócio. A configuração original não é alterada.

A API usa controllers/services/provider FireDAC MSSQL reais, porta 19002 restrita a loopback e chave JWT fictícia. Ela verifica o banco e marcador antes de aceitar requisições. O único acréscimo ao provider gerado é um observador de erros que registra códigos numéricos, sem SQL/parâmetros/credenciais. O bridge de persistência aceita apenas operações enumeradas e verifica o mesmo banco/marcador; o Node não pode enviar SQL arbitrário. Os testes de navegador usam as telas reais e essa API, sem interceptar respostas da API; fontes externas são bloqueadas.

Cobertura adicional: cadastro/BCrypt/login, papéis e revogação, JSON/erros, paginação OFFSET/FETCH, painéis/procedures, quantidade/saldo, edição sem sobrescrita, matriz de status, rollback com triggers reais, observações, histórico com FKs reais, documentos/interessados/arquivos e fluxo de pedido/aprovação/retirada no Edge. Inclui 20 pedidos por dez unidades, dez cancelamentos do mesmo pedido e 25 disputas de exclusão com criação/cancelamento.

As primeiras execuções detectaram contagem incompleta de cancelados e deadlocks 1205 em exclusão concorrente. O serviço do painel passou a contar Cancelado e Reprovado juntos, com todos os contadores na mesma consulta. Exclusões e cancelamento adquirem locks na ordem compatível com a criação do pedido; o UPDATE condicional continua determinando o único vencedor e toda devolução permanece na mesma transação. As procedures do banco original não foram alteradas. A fixture SQLite remove apenas os hints de lock e traduz paginação; a semântica de bloqueios é conferida nesta suíte MSSQL.

Saídas locais ignoradas pelo repositório: `tests/sqlserver-integration.log`, `tests/sqlserver-build.log`, `tests/.build/sqlserver/results.json` e `cleanup.json`. Este último registra a remoção da cópia e da configuração temporária. A limpeza valida nome, database_id e marcador antes de DROP, remove o INI mesmo se o DROP falhar e não apaga registros do banco original. `-RaceOnly` executa somente o bootstrap e as disputas de exclusão, para diagnóstico. Uma falha de limpeza faz a execução falhar.

Esta integração usa o servidor SQL remoto real a partir deste computador. O acesso à aplicação por um segundo computador físico continua sendo uma conferência separada de rede/firewall.

Resultado final MSSQL: **121 aprovados, zero falhas**, com remoção do banco e INI temporários confirmada em cleanup.json. A rodada abrange dez exclusões de medicamento concorrentes com pedido, cinco exclusões de conta concorrentes com pedido e dez cancelamentos concorrentes com exclusão. As 25 disputas mantiveram respostas esperadas, vínculos e saldo. O executável principal Win32/Debug compilou após as correções. A revisão independente não apontou novo problema importante nas mudanças de produção.

Regressão final após a adaptação da fixture: **463 aprovados, zero falhas**, exit code 0 em `tests/regression-sql-fixes.log`. As mesmas asserções de concorrência/status foram mantidas, incluindo um único sucesso e nove conflitos nos dez cancelamentos simultâneos. Sintaxe de todos os `.mjs` e dos scripts PowerShell SQL Server validada.


## Identificação e publicação Alto Custo — 31/10/2026

As verificações de identificação em `frontend-integration.mjs` cobrem dez páginas, dois temas e quatro larguras. A regressão dessa etapa teve 516 aprovações; após a última edição de texto nos formulários, os 53 cenários de interface passaram novamente. O parâmetro `--identification-checks` seleciona os novos cenários.

O publicador estático possui 15 testes em `test_alto_custo_static_publish.py`. Execute `python tests/test_alto_custo_static_publish.py` localmente e `python scripts/test-alto-custo-publisher-linux.py` para a verificação nativa Linux obrigatória antes da publicação. No Windows, nove casos POSIX são pulados explicitamente; no Linux todos passaram, sem chamadas reais a serviços nesses testes. A ativação e a simulação de renovação foram conferidas separadamente na VM.

Procedimentos e limites: [publicação](../docs/deploy-alto-custo.md) e [checklist preenchido](../docs/qa-identificacao-alto-custo.md). Evidências locais ignoradas: `tests/.build/alto-custo-publication/`. A classificação de segurança do Google permanece uma pendência externa; HTTPS e testes funcionais não a substituem.
