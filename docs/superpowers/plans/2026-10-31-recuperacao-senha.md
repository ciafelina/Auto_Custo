# Recuperação de senha — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Recuperação por e-mail ACBr, testada isoladamente e depois publicada no Alto Custo.
**Architecture:** Rotas Horse; tokens aleatórios persistidos somente como hash; atualização BCrypt transacional; fila de envio ACBrMail e configuração SMTP externa. Front estático na mesma origem.
**Tech Stack:** Delphi 11, ACBrMail/Synapse/OpenSSL, FireDAC/SQL Server Azure, HTML/JS.
**Spec:** docs/superpowers/specs/2026-10-31-recuperacao-senha-design.md

## Global Constraints

- Testar somente a funcionalidade nova, login e publicação afetada; não repetir suíte completa.
- Nenhuma alteração em dados reais ou arquivos/configurações do ÓTICOM.
- Link HTTPS de uso único com validade de 15 minutos; conta ativa, CPF e e-mail correspondentes.
- SMTP privado, TLS obrigatório, sem segredos ou tokens em logs/Git/arquivos públicos.
- Publicar somente depois de validação da nova funcionalidade e envio real.

## Review Focus

Contas duplicadas no mesmo e-mail não autorizam acesso sem CPF correspondente; sessões/links antigos devem falhar após redefinição; concorrência não permite dois usos; fila e SMTP falhos não revelam contas; retorno de publicação preserva Azure e domínio.

### Task 1: API e envio seguro

**Files:** utils/RecuperacaoSeguranca.pas; providers/EmailRecuperacao.pas; services/Servico_RecuperacaoSenha.pas; controllers/Controlador_RecuperacaoSenha.pas; scripts/sql/recuperacao-senha.sql; modules/acbr-mail; login/auth/DPR/dproj; tests/password-recovery.mjs e harness específico.
**Interfaces:** Solicitar(CPF,email,IP); Redefinir(token,senha); Enfileirar(email,token); MarcaCredencial(hashSenha).

- [x] Escrever cenários API de dados válidos, inexistentes/inativos/divergentes, formato, limites, expiração, repetição, concorrência, troca de credencial e login.
- [x] Rodar e comprovar falha antes da implementação.
- [x] Implementar migração aditiva, segurança, rotas e trabalhador ACBrMail; compilar Windows/Linux.
- [x] Rodar os novos cenários, incluindo transporte TLS confiável e rejeição de cadeia/hostname inválidos.

### Task 2: Telas e integração

**Files:** Front_End/recuperar-senha.html; Front_End/redefinir-senha.html; Front_End/js/recuperacao-senha.js; Front_End/login.html; testes navegador específicos.
**Interfaces:** POST /senha/recuperar {cpf,email}; POST /senha/redefinir {token,senha}; resposta JSON padronizada.

- [x] Escrever e executar teste inicialmente falho para navegação/formulários/erros/token no fragmento.
- [x] Implementar telas acessíveis no estilo existente, sem token em localStorage/URL de requisição; limpar fragmento imediatamente.
- [x] Testar celular/desktop, envio duplicado, divergência de senhas e retorno ao login.

### Task 3: Configuração e publicação

**Files:** scripts/configurar-email.ps1; publicação específica; docs/qa-recuperacao-senha.md; docs/recuperacao-senha.md.
**Interfaces:** AUTO_CUSTO_EMAIL_CONFIG aponta arquivo privado; banco/JWT preservados; rollback API/front/config.

- [x] Revisão independente da alteração e correções necessárias.
- [x] Configurar SMTP externo com credencial fornecida privadamente; validar ACBr no Linux e envio real.
- [x] Aplicar migração aditiva, exercitar novo binário em porta privada com conta temporária; remover dados de teste.
- [x] Publicar após testes, conferir rota/login/HTTPS; guardar retorno e atualizar roteiro QA.
- [x] Varredura de segredos e entrega da branch na pasta principal.
