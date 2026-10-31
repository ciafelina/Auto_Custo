# RecuperaÃ§Ã£o de senha â€” plano de implementaÃ§Ã£o

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** RecuperaÃ§Ã£o por e-mail ACBr, testada isoladamente e depois publicada no Alto Custo.
**Architecture:** Rotas Horse; tokens aleatÃ³rios persistidos somente como hash; atualizaÃ§Ã£o BCrypt transacional; fila de envio ACBrMail e configuraÃ§Ã£o SMTP externa. Front estÃ¡tico na mesma origem.
**Tech Stack:** Delphi 11, ACBrMail/Synapse/OpenSSL, FireDAC/SQL Server Azure, HTML/JS.
**Spec:** docs/superpowers/specs/2026-10-31-recuperacao-senha-design.md

## Global Constraints

- Testar somente a funcionalidade nova, login e publicaÃ§Ã£o afetada; nÃ£o repetir suÃ­te completa.
- Nenhuma alteraÃ§Ã£o em dados reais ou arquivos/configuraÃ§Ãµes do Ã“TICOM.
- Link HTTPS de uso Ãºnico com validade de 15 minutos; conta ativa, CPF e e-mail correspondentes.
- SMTP privado, TLS obrigatÃ³rio, sem segredos ou tokens em logs/Git/arquivos pÃºblicos.
- Publicar somente depois de validaÃ§Ã£o da nova funcionalidade e envio real.

## Review Focus

Contas duplicadas no mesmo e-mail nÃ£o autorizam acesso sem CPF correspondente; sessÃµes/links antigos devem falhar apÃ³s redefiniÃ§Ã£o; concorrÃªncia nÃ£o permite dois usos; fila e SMTP falhos nÃ£o revelam contas; retorno de publicaÃ§Ã£o preserva Azure e domÃ­nio.

### Task 1: API e envio seguro

**Files:** utils/RecuperacaoSeguranca.pas; providers/EmailRecuperacao.pas; services/Servico_RecuperacaoSenha.pas; controllers/Controlador_RecuperacaoSenha.pas; scripts/sql/recuperacao-senha.sql; modules/acbr-mail; login/auth/DPR/dproj; tests/password-recovery.mjs e harness especÃ­fico.
**Interfaces:** Solicitar(CPF,email,IP); Redefinir(token,senha); Enfileirar(email,token); MarcaCredencial(hashSenha).

- [x] Escrever cenÃ¡rios API de dados vÃ¡lidos, inexistentes/inativos/divergentes, formato, limites, expiraÃ§Ã£o, repetiÃ§Ã£o, concorrÃªncia, troca de credencial e login.
- [x] Rodar e comprovar falha antes da implementaÃ§Ã£o.
- [x] Implementar migraÃ§Ã£o aditiva, seguranÃ§a, rotas e trabalhador ACBrMail; compilar Windows/Linux.
- [x] Rodar os novos cenÃ¡rios, incluindo transporte TLS confiÃ¡vel e rejeiÃ§Ã£o de cadeia/hostname invÃ¡lidos.

### Task 2: Telas e integraÃ§Ã£o

**Files:** Front_End/recuperar-senha.html; Front_End/redefinir-senha.html; Front_End/js/recuperacao-senha.js; Front_End/login.html; testes navegador especÃ­ficos.
**Interfaces:** POST /senha/recuperar {cpf,email}; POST /senha/redefinir {token,senha}; resposta JSON padronizada.

- [x] Escrever e executar teste inicialmente falho para navegaÃ§Ã£o/formulÃ¡rios/erros/token no fragmento.
- [x] Implementar telas acessÃ­veis no estilo existente, sem token em localStorage/URL de requisiÃ§Ã£o; limpar fragmento imediatamente.
- [x] Testar celular/desktop, envio duplicado, divergÃªncia de senhas e retorno ao login.

### Task 3: ConfiguraÃ§Ã£o e publicaÃ§Ã£o

**Files:** scripts/configurar-email.ps1; publicaÃ§Ã£o especÃ­fica; docs/qa-recuperacao-senha.md; docs/recuperacao-senha.md.
**Interfaces:** AUTO_CUSTO_EMAIL_CONFIG aponta arquivo privado; banco/JWT preservados; rollback API/front/config.

- [ ] RevisÃ£o independente da alteraÃ§Ã£o e correÃ§Ãµes necessÃ¡rias.
- [x] Configurar SMTP externo com credencial fornecida privadamente; validar ACBr no Linux e envio real.
- [ ] Aplicar migraÃ§Ã£o aditiva, exercitar novo binÃ¡rio em porta privada com conta temporÃ¡ria; remover dados de teste.
- [ ] Publicar apÃ³s testes, conferir rota/login/HTTPS; guardar retorno e atualizar roteiro QA.
- [x] Varredura de segredos e entrega da branch na pasta principal.
