# AutoCusto em domínio gratuito e banco Azure

Objetivo autorizado pelo usuário: publicar API e front-end corrigidos no servidor do amigo, usando o banco do amigo. O usuário escolheu não comprar domínio, criou `autocusto.duckdns.org` no DuckDNS e confirmou a atualização do IP para `102.37.16.34`.

## Abordagem

Manter a VM Linux existente, nginx e API Delphi em loopback. Usar DuckDNS para o nome gratuito e Let's Encrypt para o certificado do domínio, sem Cloudflare nesta opção. A alternativa de domínio próprio/Cloudflare exige registro de domínio ou controle de um domínio já existente; foi preterida pelo requisito de não pagar pelo endereço.

- Domínio público: `https://autocusto.duckdns.org`, API na mesma origem em `/api`.
- Banco alvo obrigatório: `db-altocusto` em `db-altocusto.database.windows.net:1433`.
- Conexão ao Azure com criptografia e validação de certificado; não transferir a exceção temporária de confiança usada pelo banco anterior.
- Credenciais somente no INI externo protegido e arquivos privados da VM. Token DuckDNS não é necessário para emissão HTTP do certificado.
- Validar acesso e compatibilidade do banco em leitura antes de trocar o serviço. Não executar migração, limpeza, cadastro, pedido ou movimento de estoque no banco real.
- Compilar Linux64 da fonte corrigida, servir o front-end validado e manter as regras dos itens 1 a 12. Configuração pública usa a própria origem + `/api`.
- Preparar release nova, configuração privada, HTTPS, renovação e retorno à instalação atual. Não sobrescrever release ativa.
- Manter acesso anterior até a ativação verificada. DNS confirmado externamente e também na VM; IP de saída da VM confirmado `102.37.16.34`.
- Caso Azure bloqueie conexão/credenciais/estrutura, preparar o restante e informar a correção concreta necessária, sem publicar uma troca de banco não validada.

Aceite: domínio com HTTPS validado, páginas e API corrigidas disponíveis; processo usa configuração Azure validada; renovação e recuperação prontas; testes externos somente leitura e tentativas inválidas seguras, sem dados reais alterados.
