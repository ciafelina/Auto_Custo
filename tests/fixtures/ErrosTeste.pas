unit ErrosTeste;
interface
procedure RegistrarRotasErrosTeste;
implementation
uses Horse, Horse.Commons, System.SysUtils, System.JSON, Excecoes;

procedure RegistrarRotasErrosTeste;
begin
  THorse.Get('/__tests/erro',
    procedure(Req: THorseRequest; Res: THorseResponse; Next: TProc)
    begin
      raise EErroApi.Create(400, Req.Query['codigo'], Req.Query['mensagem']);
    end);
  THorse.Get('/__tests/inesperado',
    procedure(Req: THorseRequest; Res: THorseResponse; Next: TProc)
    begin
      raise Exception.Create('SQL interno senha=SEGREDO_FICTICIO C:\banco\dados "falha"');
    end);
  THorse.Get('/__tests/parcial',
    procedure(Req: THorseRequest; Res: THorseResponse; Next: TProc)
    begin
      Res.Send(TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True)).AddPair('parcial', 'NAO_ENVIAR'));
      raise Exception.Create('SEGREDO_FICTICIO depois da resposta parcial');
    end);
  THorse.Post('/__tests/eco',
    procedure(Req: THorseRequest; Res: THorseResponse; Next: TProc)
    begin
      Res.Send(TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True))
        .AddPair('dados', TJSONValue(Req.Body<TJSONValue>.Clone)));
    end);
end;
end.
