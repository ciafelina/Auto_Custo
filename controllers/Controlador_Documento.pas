unit Controlador_Documento;

interface

uses
  Horse, System.JSON, System.SysUtils, Servico_Documento, Autenticacao, Excecoes, Mensagens;

type
  TControladorDocumento = class
  public
    class procedure RegistrarRotas;
  end;

implementation

procedure DoListarDocumentos(Req: THorseRequest; Res: THorseResponse; Next: TProc);
begin
  ValidarToken(Req);

  Res.Status(200).Send<TJSONArray>(TServicoDocumento.Listar);
end;

procedure DoCadastrarDocumento(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LBody: TJSONObject;
  LTokenDados: TDadosToken;
  LTipo, LDataDoc, LNivel, LSerie, LVia, LObs, LAnoRef, LNFolhas: string;
  LIdInteressado: Integer;
begin
  LTokenDados := ValidarToken(Req);

  LBody := Req.Body<TJSONObject>;
  if (not Assigned(LBody)) or (LBody.Count = 0) then
    raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'Corpo da requisição vazio.');

  LTipo          := LBody.GetValue<string>('tipo', '');
  LDataDoc       := LBody.GetValue<string>('dataDoc', '');
  LNivel         := LBody.GetValue<string>('nivelEnsino', '');
  LSerie         := LBody.GetValue<string>('serieAnoCicloModulo', '');
  LVia           := LBody.GetValue<string>('via', '');
  LObs           := LBody.GetValue<string>('observacao', '');
  LAnoRef        := LBody.GetValue<string>('anoRef', '');
  LNFolhas       := LBody.GetValue<string>('n_folhas', '');
  LIdInteressado := LBody.GetValue<Integer>('idInteressado', 0);

  if LTipo.Trim.IsEmpty then
    raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'O "tipo" do documento é obrigatório.');

  TServicoDocumento.Cadastrar(LTipo, LDataDoc, LNivel, LSerie, LVia, LObs, LAnoRef, LNFolhas,
                              LTokenDados.UsuarioCPF, LIdInteressado);

  Res.Status(201).Send(
    TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True))
                      .AddPair('mensagem', 'Documento cadastrado com sucesso!')
  );
end;

class procedure TControladorDocumento.RegistrarRotas;
begin
  THorse.Post('/documentos', DoCadastrarDocumento);
  THorse.Get('/documentos', DoListarDocumentos);
end;

end.
