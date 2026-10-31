# Publicação AutoCusto — domínio DuckDNS e Azure SQL

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publicar as melhorias no domínio gratuito AutoCusto, com banco Azure do amigo.

**Architecture:** Release Linux imutável, nginx HTTPS e proxy `/api`, serviço Delphi em loopback; INI privado com Azure SQL e confiança TLS normal. Preservar instalação ativa para recuperação.

**Tech Stack:** Delphi 11 Linux64, nginx, systemd, Certbot existente, DuckDNS, Microsoft ODBC 18 e Azure SQL.

**Spec:** `docs/superpowers/specs/2026-10-31-dominio-autocusto-design.md`.

## Global Constraints

- Não alterar dados ou schema real; validar o Azure antes da troca de serviço.
- Não publicar segredos, não usar senha em argumento e não reduzir a validação TLS do Azure.
- Não reutilizar identificador/configuração da release ativa nem modificar o INI Windows em uso.
- Preservar retorno e continuar na pasta principal, sem Git neste workspace.

## Review Focus

- Banco bloqueado ou schema incompatível não pode virar publicação aparentemente funcional.
- Renovação precisa atender o domínio por HTTP mesmo após o redirecionamento HTTPS.
- Retorno deve restaurar serviço, nginx e timer sem perder os estados anteriores.
- O navegador deve permanecer no domínio e usar `/api`, sem localhost/IP fixo.
- Os testes externos não devem gravar registros ou movimentar estoque real.

### Tarefa 1 — Pré-verificação de servidor e Azure

**Files:** `scripts/inspect-autocusto-domain.py`, probe Linux existente e evidências `tests/.build/deploy-domain`.

- [x] Confirmar DNS e HTTPS do IP externamente.
- [x] Inspecionar serviço, nginx, driver e IP de saída da VM em leitura.
- [x] Validar banco Azure como usuário do serviço e conferir compatibilidade necessária da API.

### Tarefa 2 — Preparar release, HTTPS e recuperação

**Files:** scripts específicos de publicação, testes de retorno, artefatos Linux e configuração externa.

- [x] Compilar Linux64 e preservar manifesto da release anterior.
- [x] Preparar front-end com API na própria origem e hashes dos arquivos públicos.
- [x] Preparar certificado do domínio e validar desafio de emissão.
- [x] Preparar arquivos privados, nginx e service/timer com backup e testes de falha/retorno.

### Tarefa 3 — Ativação e aceite

**Files:** teste externo do domínio, documentação de operação e evidências.

- [x] Revisar a preparação e ativar somente após validar banco, certificado e candidatos de configuração.
- [x] Conferir executável/configuração efetivos, HTTPS, nomes, API, arquivos privados e renovação.
- [x] Executar testes externos seguros e conferir tela em navegador.
- [x] Registrar resultado e passos de operação/recuperação, mantendo limitações explícitas.

Resultado: release `20261031-dd8afbbb9e14` ativa, Azure com TLS estrito, 64 testes externos aprovados, 12 verificações nativas em leitura e seis testes Linux de recuperação e prontidão aprovados. Renovação/reload, configuração privada e logs conferidos. A primeira ativação foi restaurada automaticamente devido à janela de reload do nginx; espera limitada com TLS integral foi testada e a nova ativação passou. Nenhum registro real alterado. Documentação atual em `docs/deploy-autocusto.md`.
