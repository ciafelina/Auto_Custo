unit Excecoes;

interface

uses
  System.SysUtils, Horse, Horse.Exception.Interrupted, System.JSON, Mensagens;

type
  EErroApi = class(Exception)
  private
    FCodigo: string;
    FStatus: Integer;
  public
    constructor Create(const AStatus: Integer; const ACodigo, AMensagem: string);
    property Codigo: string read FCodigo;
    property Status: Integer read FStatus;
  end;

procedure MiddlewareTratarErros(Req: THorseRequest; Res: THorseResponse; Next: TProc);

implementation
{ EErroApi }
constructor EErroApi.Create(const AStatus: Integer; const ACodigo, AMensagem: string);
begin
  inherited Create(AMensagem);
  FStatus := AStatus;
  FCodigo := ACodigo;
end;
{ MiddlewareTratarErros }
procedure EnviarErro(Res: THorseResponse; AStatus: Integer;
  const ACodigo, AMensagem: string);
var
  LJSON: TJSONObject;
begin
  LJSON := TJSONObject.Create
    .AddPair('sucesso', TJSONBool.Create(False))
    .AddPair('erro', TJSONObject.Create
      .AddPair('codigo', ACodigo)
      .AddPair('mensagem', AMensagem)
      .AddPair('detalhes', TJSONArray.Create));
  try
    // Funciona também para erros de autenticação, anteriores ao middleware JSON.
    Res.Status(AStatus).ContentType('application/json; charset=UTF-8').Send(LJSON.ToJSON);
  finally
    LJSON.Free;
  end;
end;

procedure MiddlewareTratarErros(Req: THorseRequest; Res: THorseResponse; Next: TProc);
begin
  try
    Next();
    if Res.Status = 404 then
      raise EErroApi.Create(404, TCodigoErro.RecursoNaoEncontrado, 'Rota não encontrada.');
    if Res.Status = 405 then
      raise EErroApi.Create(405, TCodigoErro.MetodoNaoPermitido, 'Método não permitido para esta rota.');
  except
    on E: EHorseCallbackInterrupted do raise;
    on E: EErroApi do
    begin
      EnviarErro(Res, E.Status, E.Codigo, E.Message);
      raise EHorseCallbackInterrupted.Create;
    end;
    on E: EJSONException do
    begin
      EnviarErro(Res, 400, TCodigoErro.RequisicaoInvalida, 'Um dos campos JSON possui formato ou tipo inválido.');
      raise EHorseCallbackInterrupted.Create;
    end;
    on E: EHorseException do
    begin
      if (Integer(E.Status) >= 400) and (Integer(E.Status) < 500) then
        EnviarErro(Res, Integer(E.Status), TCodigoErro.RequisicaoInvalida, 'Requisição inválida.')
      else
        EnviarErro(Res, 500, TCodigoErro.ErroInterno, 'Não foi possível concluir a operação. Tente novamente mais tarde.');
      raise EHorseCallbackInterrupted.Create;
    end;
    on E: Exception do
    begin
      EnviarErro(Res, 500, TCodigoErro.ErroInterno, 'Não foi possível concluir a operação. Tente novamente mais tarde.');
      raise EHorseCallbackInterrupted.Create;
    end;
  end;
end;
end.
