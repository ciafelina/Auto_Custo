# ACBrMail usado pelo Alto Custo

Dependências de código aberto copiadas, sem alteração de bytes, da instalação ACBr deste computador em 31/10/2026. `source-manifest.json` registra SHA-256 dos fontes originais. `scripts/vendor-acbr-mail.py` seleciona a dependência de ACBrMail, preservando as licenças e os cabeçalhos ACBr/Synapse.

Origem pública: [Projeto ACBr](https://sourceforge.net/projects/acbr/). A licença ACBr está em `LICENSE.TXT`; arquivos Synapse mantêm seus avisos de licença próprios.

Somente fontes Pascal/includes são versionados. Não são incluídos DLLs, executáveis, arquivos de configuração ou credenciais do ÓTICOM. No servidor, o OpenSSL é carregado das bibliotecas Linux do sistema. SMTP exige TLS 1.2, cadeia CA e hostname válidos.
