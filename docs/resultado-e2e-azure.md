# AutoCusto — resultado do fluxo completo no Azure

Em 31/10/2026, a execução `20261031-765d0947685e` concluiu **30 cenários aprovados, zero falhas e saída 0** em `https://autocusto.duckdns.org/`, utilizando a API publicada e o banco `db-altocusto` em `db-altocusto.database.windows.net`.

Cadastro, login, criação do medicamento, pedido, aprovação e retirada foram executados pelo site real no Edge. As gravações e os saldos foram conferidos diretamente no Azure SQL. As negativas complementares foram exercitadas pela API. Não houve simulação das respostas do sistema.

## Checklist executado

### Cadastro e acesso

- [x] Acessar o domínio por HTTPS e chamar uma rota privada sem login; site disponível e API recusando acesso com 401.
- [x] Cadastrar três contas fictícias pela tela; todas criadas ativas como pacientes, com senha protegida por BCrypt.
- [x] Preparar somente a conta fictícia do operador como funcionário; nenhum administrador ou usuário existente alterado.
- [x] Entrar com as três contas pelo site; sessões e telas correspondentes disponíveis.
- [x] Tentar acessar a gestão de solicitações e aprovar o próprio pedido como paciente; ambas as ações recusadas com 403.

### Medicamento e pedido

- [x] Cadastrar um medicamento fictício como funcionário, com saldo 5 e mínimo 2; gravação confirmada no banco.
- [x] Consultar o medicamento com apóstrofo e aspas no nome; texto exibido e botão de solicitação funcionando.
- [x] Solicitar quantidade zero, negativa, fracionária ou fora do intervalo; API retornando 400, sem pedido ou alteração de saldo.
- [x] Solicitar seis unidades quando há cinco; API retornando 409, sem pedido ou alteração de saldo.
- [x] Solicitar duas unidades pela tela; pedido criado como Pendente, aviso de sucesso exibido e saldo passando de 5 para 3.
- [x] Editar a descrição pela tela; campo de estoque indisponível para edição e saldo reservado preservado em 3.
- [x] Enviar também uma edição diretamente à API com o saldo antigo 5; estoque permanecendo em 3.
- [x] Conferir saldo 3 com mínimo 2; medicamento classificado como disponível.

### Aprovação e retirada

- [x] Tentar retirar o pedido pendente; ação recusada com 404 e reserva preservada.
- [x] Aprovar o pedido como funcionário pela tela, com observação; status Aprovado, nota correta e saldo ainda em 3.
- [x] Tentar retirar o pedido usando outro paciente; ação recusada com 404 e pedido preservado.
- [x] Confirmar a retirada como titular pela tela; status Retirado e saldo permanecendo em 3, sem segunda baixa.
- [x] Repetir a retirada e tentar cancelar o pedido retirado; recusas 404 e 409, mantendo status, observação e saldo.
- [x] Tentar excluir a conta e o medicamento com histórico; recusas 409 e vínculos preservados.

### Cancelamento, observação e mínimo

- [x] Criar um segundo pedido de uma unidade; saldo passando a 2 e classificação crítica por igualdade com o mínimo.
- [x] Cancelar somente o segundo pedido; devolução de uma unidade, saldo 3 e observação do primeiro pedido preservada.
- [x] Repetir o cancelamento; recusa 409, sem nova devolução de estoque.
- [x] Conferir as telas finais do paciente e do funcionário; pedidos Retirado e Cancelado exibidos, sem erros de execução de página ou escritas fora do escopo permitido.

### Limpeza e preservação

- [x] Remover somente os dados desta execução, verificando identidades e vínculos exatos em transação; removidos três usuários, um medicamento e duas solicitações.
- [x] Reconsultar os identificadores fictícios; nenhum registro remanescente.
- [x] Comparar contagem e assinatura SHA-256 dos registros originais das sete tabelas; todas idênticas antes/depois, incluindo estoque e histórico existentes.
- [x] Reutilizar os tokens das contas removidas; API recusando cada conta com 401.

## Conferência do estoque fictício

| Etapa | Saldo | Resultado |
|---|---:|---|
| Cadastro | 5 | Disponível |
| Primeiro pedido: duas unidades | 3 | Pendente; disponível |
| Aprovação do primeiro pedido | 3 | Reserva mantida |
| Retirada do primeiro pedido | 3 | Sem nova baixa |
| Segundo pedido: uma unidade | 2 | Pendente; crítico pelo mínimo 2 |
| Cancelamento do segundo pedido | 3 | Uma única devolução |
| Cancelamento repetido recusado | 3 | Sem devolução adicional |

## Preservação e evidências

As tabelas `Cargos`, `Usuarios`, `Medicamentos`, `Solicitacoes`, `Interessados`, `Documentos` e `Arquivo` mantiveram suas contagens e assinaturas originais. A limpeza foi confirmada novamente pelo supervisor após o fechamento do roteiro. Contadores automáticos de identidade podem avançar com os INSERTs de teste; não foi feito reseed. Não houve alteração de código/configuração publicados, schema ou dados reais.

As ferramentas passaram previamente por nove testes locais de segurança, 11 assertivas de escopo HTTP e revisão independente. A execução conferiu ausência de colisões e triggers habilitadas nas tabelas de escrita. O navegador limitou todas as gravações às contas, medicamento e solicitações desta rodada. O auxiliar privado aceita operações fixas, recusa vínculos externos e tenta a limpeza também no encerramento da conexão; existe recuperação limitada ao manifesto da própria execução.

Evidências locais em `tests/.build/azure-e2e/20261031-765d0947685e/`: `summary.json`, `preflight.json`, `results.json`, `cleanup.json`, `plan.json`, `patient-final.png` e `staff-final.png`. Senhas e tokens não integram esses artefatos. As capturas contêm somente dados fictícios.

Esta rodada comprova o fluxo autenticado no ambiente publicado. Os 503 testes isolados, 121 testes na cópia SQL Server e 64 testes externos da publicação são resultados anteriores, descritos separadamente em `tests/README.md`. Esta rodada não repete testes de carga, concorrência ou um segundo dispositivo físico.

## Retorno ao usuário

O cadastro, pedido, aprovação e retirada funcionaram pelo site publicado, com os resultados conferidos no banco do amigo. As tentativas indevidas foram recusadas e o estoque foi movimentado uma única vez em cada etapa. Todos os dados fictícios foram removidos ao final; os cadastros, pedidos e saldos que já existiam permaneceram iguais.
