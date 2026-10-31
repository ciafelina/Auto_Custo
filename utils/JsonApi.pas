unit JsonApi;

interface

uses Horse, System.JSON, System.SysUtils;

procedure MiddlewareJSON(Req: THorseRequest; Res: THorseResponse; Next: TProc);
function LerObjetoJSON(Req: THorseRequest): TJSONObject;
function LerTextoJSON(AObjeto: TJSONObject; const ACampo: string): string;

implementation

uses Web.HTTPApp, Excecoes, Mensagens;

function LerObjetoJSON(Req: THorseRequest): TJSONObject;
var
  LValor: TJSONValue;
begin
  LValor := Req.Body<TJSONValue>;
  if not (LValor is TJSONObject) then
    raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida,
      'O corpo da requisição deve ser um objeto JSON.');
  Result := TJSONObject(LValor);
end;

function LerTextoJSON(AObjeto: TJSONObject; const ACampo: string): string;
var
  LValor: TJSONValue;
begin
  LValor := AObjeto.GetValue(ACampo);
  if not Assigned(LValor) or (LValor is TJSONNull) then Exit('');
  if LValor.ClassType <> TJSONString then
    raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida,
      'O campo "' + ACampo + '" deve ser informado como texto.');
  Result := LValor.Value;
end;

procedure MiddlewareJSON(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LCorpo, LTipo: string;
  LJSON: TJSONValue;
begin
  try
    if Req.MethodType in [mtPost, mtPut, mtPatch] then
    begin
      LCorpo := Trim(Req.Body);
      if LCorpo <> '' then
      begin
        LTipo := Trim(Copy(Req.ContentType, 1, Pos(';', Req.ContentType + ';') - 1));
        if not SameText(LTipo, 'application/json') then
          raise EErroApi.Create(415, TCodigoErro.FormatoNaoSuportado,
            'Envie o corpo da requisição como application/json.');
        try
          LJSON := TJSONObject.ParseJSONValue(LCorpo, True, True);
        except
          on E: EJSONParseException do
            raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'Formato JSON inválido.');
        end;
        if not (LJSON is TJSONObject) then
        begin
          LJSON.Free;
          raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida,
            'O corpo da requisição deve ser um objeto JSON.');
        end;
        Req.Body(LJSON); // A requisição assume a propriedade e libera o objeto.
      end;
    end;
    Next();
  finally
    if (Res.Status <> 204) and (Res.Content is TJSONValue) then
    begin
      Res.RawWebResponse.Content := TJSONValue(Res.Content).ToJSON;
      Res.ContentType('application/json; charset=UTF-8');
    end;
  end;
end;

end.
