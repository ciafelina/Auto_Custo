unit Excecoes;

interface

uses
  System.SysUtils, Horse, System.JSON;

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
procedure MiddlewareTratarErros(Req: THorseRequest; Res: THorseResponse; Next: TProc);
begin
  try
    // O Next() manda a API executar a rota que o usuário chamou (ex: DoLogin)
    Next();
  except
    // Se em qualquer lugar do código alguém der um "raise EErroApi", cai aqui!
    on E: EErroApi do
    begin
      Res.Status(E.Status).Send(
        '{' +
        '  "sucesso": false,' +
        '  "erro": {' +
        '    "codigo": "' + E.Codigo + '",' +
        '    "mensagem": "' + E.Message + '",' +
        '    "detalhes": []' +
        '  }' +
        '}'
      );
    end;
    // Se der um erro inesperado (ex: banco offline, violação de acesso), cai aqui
    on E: Exception do
    begin
      Res.Status(500).Send(
        '{' +
        '  "sucesso": false,' +
        '  "erro": {' +
        '    "codigo": "ERRO_INTERNO",' +
        '    "mensagem": "' + E.Message + '",' +
        '    "detalhes": []' +
        '  }' +
        '}'
      );
    end;
  end;
end;
end.
