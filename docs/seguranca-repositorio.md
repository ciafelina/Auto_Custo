# Segredos e arquivos locais no Git

O repositório deve conter fontes, dependências de execução, testes com dados fictícios, documentação e `config.example.ini` vazio. A configuração real fica fora da pasta do projeto, conforme `configuracao.md`.

O `.gitignore` exclui configurações locais e suas variantes, arquivos `.env`, chaves/certificados privados, bancos/exports, backups, histórico da IDE, binários e resultados dos testes. Os exemplos e testes criptográficos das dependências não são necessários para compilar a aplicação e também ficam fora do versionamento. As cópias locais desses arquivos são preservadas.

O Gitleaks utiliza `.gitleaks.toml`, que estende as regras oficiais e detecta também constantes Pascal de senha/JWT. As exceções se limitam a três casos conferidos: marcadores de cabeçalho PEM na biblioteca (sem conteúdo de chave), um endereço reservado de teste e a senha explicitamente fictícia da integração descartável. Nenhuma pasta de código próprio é ignorada integralmente pelo verificador.

Para conferir o histórico de uma cópia já saneada, usar Gitleaks 8.30.1 ou compatível, sem imprimir os valores encontrados:

```powershell
gitleaks git . --config .gitleaks.toml --redact=100 --log-opts="main"
```

Antes da publicação de 31/10/2026, a regressão isolada foi repetida: 503 verificações aprovadas e zero falhas. O conteúdo preparado foi exportado para uma pasta local ignorada e verificado com Gitleaks e comparação com valores conhecidos, mantidos somente em memória. Relatórios detalhados, backups e cópias de auditoria permanecem em `tests/.build/security/`, fora do Git.

O histórico anteriormente existente no GitHub continha credenciais. Retirar os arquivos do commit atual não elimina esses objetos antigos: a substituição do histórico remoto precisa ser autorizada explicitamente e executada com proteção contra mudanças concorrentes. Ela muda os identificadores dos commits afetados; colaboradores devem obter uma cópia nova ou realinhar suas branches antes de enviar alterações antigas novamente.

Mesmo após uma limpeza do histórico, credenciais anteriormente publicadas precisam ser trocadas por seus responsáveis. A limpeza não revoga senhas/chaves e não apaga cópias, forks ou caches de terceiros. Não usar o Git nem o chat para compartilhar novos segredos.
