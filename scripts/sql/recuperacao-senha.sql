-- Migração aditiva/idempotente; não modifica cadastros, pedidos ou estoque.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.RecuperacoesSenha', N'U') IS NULL
BEGIN
 CREATE TABLE dbo.RecuperacoesSenha (
  tokenHash CHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  idUsuarioCPF BIGINT NOT NULL,
  emailVinculo CHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
  senhaVinculo CHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
  criadoEm BIGINT NOT NULL,
  expiraEm BIGINT NOT NULL,
  usado BIT NOT NULL DEFAULT(0),
  CONSTRAINT CK_RecuperacoesSenha_Validade CHECK(expiraEm > criadoEm)
 );
 CREATE INDEX IX_RecuperacoesSenha_Usuario ON dbo.RecuperacoesSenha(idUsuarioCPF,criadoEm);
END;
COMMIT;
