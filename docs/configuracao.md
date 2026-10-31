# Configuração externa da API

A API guarda seus segredos fora do projeto. No Windows, o caminho padrão é `%LOCALAPPDATA%\AutoCusto\config.ini` do usuário que executa o processo; no Linux, `/etc/autocusto/config.ini`. `AUTO_CUSTO_CONFIG` permite outro caminho absoluto da plataforma, como `D:\Configuracoes\AutoCusto\config.ini` ou `/etc/autocusto/releases/versao.ini`. Caminhos relativos são recusados.

O arquivo possui as seções `[Base]` (servidor, porta, banco, usuário e senha do SQL Server) e `[Seguranca]` (`JwtSecret`). O modelo `config.example.ini` não contém credenciais.

No Linux, o provider seleciona o Microsoft ODBC Driver 18 e exige criptografia. `NomeCertificadoServidor` permite indicar o nome esperado no certificado; não aceita delimitadores de conexão. `ConfiarCertificadoServidor` é falso por padrão. A opção verdadeira mantém TLS, mas dispensa a validação de identidade do servidor e exige autorização explícita. A publicação anterior de 25/10 tinha essa exceção para o banco antigo. A publicação atual de 31/10 usa Azure SQL com `ConfiarCertificadoServidor=0` e confiança normal do sistema; ver `docs/deploy-autocusto.md`.

## Preparar uma máquina

Na pasta do projeto:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configurar-ambiente.ps1
```

O script cria o arquivo externo, preserva a configuração antiga de `Win32\Debug\config.ini` se ela existir e gera uma nova chave JWT com 32 bytes aleatórios. O arquivo recebe acesso somente para o usuário atual e SYSTEM antes da gravação. Se o destino já existir, o script encerra sem sobrescrevê-lo. Sem configuração antiga, preencher os campos de banco no novo arquivo.

Para indicar outro destino ou outro arquivo antigo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configurar-ambiente.ps1 -ConfigPath 'D:\Configuracoes\AutoCusto\config.ini' -LegacyConfigPath 'D:\ConfiguracoesAntigas\config.ini'
$env:AUTO_CUSTO_CONFIG = 'D:\Configuracoes\AutoCusto\config.ini'
```

O script preserva o arquivo de origem. Após verificar a migração, remover a cópia antiga da pasta do projeto. Na migração deste ambiente em 25/10/2026, a cópia local antiga já foi removida.

## Chave JWT

`AUTO_CUSTO_JWT_SECRET`, quando preenchida, tem prioridade sobre `[Seguranca] JwtSecret`. Uma variável preenchida com chave curta ou composta apenas de espaços provoca erro; a API não recorre ao arquivo para contornar uma variável inválida. Sem variável preenchida, a chave vem do arquivo externo.

A chave precisa ter pelo menos 32 bytes UTF-8. Esse mínimo não substitui a geração aleatória; o script já gera uma chave com 256 bits de aleatoriedade. Não reutilizar chaves de teste ou exemplos.

A API carrega a chave uma vez na inicialização, antes de abrir a porta HTTP. Sem configuração válida, encerra com código 1 e mensagem sem incluir o valor do segredo. Login e validação usam a mesma chave carregada. Reiniciar o processo após mudar a chave; sessões assinadas com a chave anterior precisarão de novo login.

## Execução

Depois de compilar, executar `Win32\Debug\ProjetoFaculdade.exe`. O processo lê a configuração externa automaticamente; o arquivo não precisa acompanhar o executável. Ao usar outra conta do Windows ou serviço, configurar `AUTO_CUSTO_CONFIG` e conceder leitura ao usuário do serviço no arquivo externo.

## Endereço usado pelas telas

Na publicação atual em `https://autocusto.duckdns.org/`, o `config.js` servido na VM usa `apiBaseUrl: location.origin + '/api'`. A API fica atrás do nginx na mesma origem HTTPS. O arquivo de desenvolvimento local foi preservado e segue o modo automático explicado abaixo.

Editar somente `Front_End/config.js`. Esse arquivo é público e contém apenas o endereço da API; os segredos continuam no INI externo da API.

```javascript
globalThis.AUTO_CUSTO_CONFIG = Object.freeze({
    apiBaseUrl: ''
});
```

Com valor vazio, as telas usam o hostname e protocolo da página, na porta 9000. Por exemplo, abrir `http://192.168.1.50:5500/login.html` faz as chamadas para `http://192.168.1.50:9000`. Assim, o outro computador usa o servidor da página. Abrir um arquivo local sem hostname (`file:///C:/...`) mantém `http://localhost:9000` como compatibilidade; arquivos de um compartilhamento com hostname usam esse servidor. Para arquivos locais em outro computador, informar a URL explicitamente.

Para escolher outro servidor, editar o mesmo arquivo, substituindo o IP do exemplo pelo endereço real da máquina que executa a API:

```javascript
globalThis.AUTO_CUSTO_CONFIG = Object.freeze({
    apiBaseUrl: 'http://192.168.1.50:9000'
});
```

São aceitos HTTP/HTTPS, domínio ou IP (inclusive IPv6 entre colchetes), porta e prefixo de proxy. Por exemplo, `https://farmacia.exemplo/api` produz chamadas como `https://farmacia.exemplo/api/produtos`. A barra final é opcional. Não informar usuário/senha, query ou fragmento na base. Não colocar chave JWT, token ou credenciais de banco em config.js. Recarregar as páginas com Ctrl+F5 depois da alteração.

As nove páginas carregam config.js e `js/api-client.js` antes dos scripts de tela; todas as chamadas usam `Api.url('/rota')`. A configuração é lida do arquivo servido, sem usar parâmetros da URL da página ou localStorage para escolher o destino.

## Acesso pela rede local

1. Na máquina servidora, executar a API compilada normalmente; o Horse já escuta todas as interfaces na porta 9000.
2. Servir a pasta `Front_End` por HTTP e abrir o endereço desse servidor no outro computador. Com Python 3 já instalado, um exemplo de servidor estático para desenvolvimento, executado na raiz do projeto, é:

   ```powershell
   python -m http.server 5500 --bind 0.0.0.0 --directory Front_End
   ```

3. No outro computador da mesma rede, acessar `http://IP_DO_SERVIDOR:5500/login.html`. O modo automático já aponta a API para `IP_DO_SERVIDOR:9000`; preencher apiBaseUrl se ela estiver em outra máquina.
4. Confirmar que as portas da API e do servidor estático estão alcançáveis pela rede e permitidas nas regras de firewall aplicáveis. Nenhuma regra de firewall foi alterada por esta implementação.

O servidor estático acima é para desenvolvimento; para publicar em HTTPS, usar a hospedagem/proxy escolhido e uma API também acessível por HTTPS. O processo Delphi continua na porta 9000; portas externas ou prefixos diferentes são configurados no proxy e em apiBaseUrl. O modo automático de uma página HTTPS usa HTTPS na porta 9000, exigindo que esse destino ofereça TLS; caso contrário, informar a URL HTTPS do proxy.

O CORS da API agora declara Authorization, Content-Type e os métodos utilizados pelas telas. Login, permissões e validação dos tokens continuam obrigatórios. Alterar o endereço não cria acesso sem autenticação.

## Migração deste ambiente

As credenciais do banco foram copiadas para `C:\Users\EBT\AppData\Local\AutoCusto\config.ini`. A chave JWT antiga foi substituída por uma nova chave gerada localmente. Os seis segredos fixos de integrações não usadas foram retirados do fonte. Valores encontrados no histórico da IDE foram removidos; artefatos compilados antigos que continham a chave antiga foram descartados. `.gitignore` exclui configuração real, históricos da IDE e saídas de compilação.

A pasta recebida não contém `.git`; esta limpeza não reescreve versões previamente publicadas em repositórios ou revoga credenciais de serviços externos. Credenciais que tenham sido publicadas devem ser trocadas no serviço correspondente pelo responsável.

## Testes

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-authorization.ps1
```

Os testes usam o `Secrets.pas` real, configuração e chaves fictícias e SQLite para dados HTTP. O teste do provider MSSQL real lê um INI fictício e verifica parâmetros sem se conectar ao banco. Resultados desta etapa: 21 verificações de configuração, 30 de tokens e 88 de permissões aprovadas.

Após os 12 itens, a suíte acumulada possui **463 verificações aprovadas**, incluindo 32 de composição/configuração do endereço e 27 no navegador. Dois casos usam requisições reais de navegador entre um servidor estático temporário em loopback e a API de testes na porta 19001; nenhum deles usa a API/banco reais. Uma suíte separada passou em **121 cenários com SQL Server real** em cópia temporária isolada; detalhes em `tests/README.md`. O teste em um segundo computador físico continua pendente. O banco Azure foi validado a partir da VM e ativado na publicação do domínio em 31/10/2026. A configuração Windows local foi preservada; ver `docs/conexao-azure.md` e `docs/deploy-autocusto.md`.
