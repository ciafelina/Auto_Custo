program ProjetoFaculdade;

{$APPTYPE CONSOLE}

{$R *.res}

uses
  System.SysUtils,
  System.Classes,
  System.SyncObjs,
  Horse,
  Horse.CORS,
  Horse.Commons,
  System.JSON,
  Controlador_Login in 'controllers\Controlador_Login.pas',
  Servico_Login in 'services\Servico_Login.pas',
  Conexao in 'providers\Conexao.pas',
  Autenticacao in 'providers\Autenticacao.pas',
  Excecoes in 'utils\Excecoes.pas',
  Mensagens in 'utils\Mensagens.pas',
  Secrets in 'utils\Secrets.pas',
  Estoque in 'utils\Estoque.pas',
  JsonApi in 'utils\JsonApi.pas',
  RecuperacaoSeguranca in 'utils\RecuperacaoSeguranca.pas',
  EmailRecuperacao in 'providers\EmailRecuperacao.pas',
  Servico_RecuperacaoSenha in 'services\Servico_RecuperacaoSenha.pas',
  Controlador_RecuperacaoSenha in 'controllers\Controlador_RecuperacaoSenha.pas',
  Controlador_Usuario in 'controllers\Controlador_Usuario.pas',
  Servico_Usuario in 'services\Servico_Usuario.pas',
  Servico_Documento in 'services\Servico_Documento.pas',
  Controlador_Documento in 'controllers\Controlador_Documento.pas',
  Servico_Interessado in 'services\Servico_Interessado.pas',
  Controlador_Interessado in 'controllers\Controlador_Interessado.pas',
  Servico_Arquivo in 'services\Servico_Arquivo.pas',
  Controlador_Arquivo in 'controllers\Controlador_Arquivo.pas',
  Servico_Dashboard in 'services\Servico_Dashboard.pas',
  Controlador_Dashboard in 'controllers\Controlador_Dashboard.pas',
  Servico_Produtos in 'services\Servico_Produtos.pas',
  Controlador_Produtos in 'Controlador_Produtos.pas',
  Servico_Solicitacao in 'services\Servico_Solicitacao.pas',
  Controlador_Solicitacao in 'controllers\Controlador_Solicitacao.pas',
  Servico_AdminMedicamentos in 'services\Servico_AdminMedicamentos.pas',
  Controlador_AdminMedicamentos in 'controllers\Controlador_AdminMedicamentos.pas',
  Servico_AdminSolicitacoes in 'services\Servico_AdminSolicitacoes.pas',
  Controlador_AdminSolicitacoes in 'controllers\Controlador_AdminSolicitacoes.pas',
  Servico_AdminUsuarios in 'services\Servico_AdminUsuarios.pas',
  Controlador_AdminUsuarios in 'controllers\Controlador_AdminUsuarios.pas';

var LPortaAPI: Integer;
begin

   try
    CarregarSegredos;
    LPortaAPI:=9000;
    if GetEnvironmentVariable('AUTO_CUSTO_PORT')<>'' then
      if not TryStrToInt(GetEnvironmentVariable('AUTO_CUSTO_PORT'),LPortaAPI) or (LPortaAPI<1) or (LPortaAPI>65535) then
        raise EConfiguracaoSegura.Create('Porta da API inválida.');
    IniciarEmailRecuperacao;
    HorseCORS.AllowedHeaders('Content-Type, Authorization');
    HorseCORS.AllowedMethods('GET, POST, PUT, PATCH, DELETE, OPTIONS');
  	THorse.Use(CORS);
    THorse.Use(MiddlewareTratarErros);
    THorse.Use(MiddlewareAutenticacao);
    THorse.Use(MiddlewareJSON);

    TControladorAutenticacao.RegistrarRotas;
    TControladorRecuperacaoSenha.RegistrarRotas;
    TControladorUsuario.RegistrarRotas;
    TControladorDocumento.RegistrarRotas;
    TControladorInteressado.RegistrarRotas;
    TControladorArquivo.RegistrarRotas;
    TControladorDashbord.RegistrarRotas;
    TControladorProdutos.RegistrarRotas;
    TControladorSolicitacao.RegistrarRotas;
    TControladorAdminMedicamentos.RegistrarRotas;
    TControladorAdminSolicitacoes.RegistrarRotas;
    TControladorAdminUsuarios.RegistrarRotas;

    THorse.Listen(LPortaAPI,
{$IFDEF LINUX}
        '127.0.0.1',
{$ENDIF}
        procedure
        begin
          Writeln('======================================================');
          Writeln('                 SISTEMA API                   ');
          Writeln('======================================================');
          Writeln(' * Versao do Sistema : 26.0428-2201');
          Writeln(' * Iniciado em       : ' + FormatDateTime('dd/mm/yyyy hh:nn:ss', Now));
          Writeln(' * Status            : OPERACIONAL');
          Writeln(' * Porta de Escuta   : ' + IntToStr(LPortaAPI));
          Writeln('======================================================');
          Writeln('');
        end);
  except
    on E: EConfiguracaoSegura do
    begin
      Writeln('Falha na configuração: ' + E.Message);
      ExitCode := 1;
    end;
    on E: Exception do
    begin
      Writeln('Falha ao iniciar a API. Verifique a configuração e a disponibilidade da porta.');
      ExitCode := 1;
    end;
  end;

end.
