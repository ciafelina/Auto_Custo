unit Servico_Interessado;

interface

uses
  System.SysUtils, FireDAC.Comp.Client, FireDAC.DApt, Data.DB,
  System.JSON, Conexao, Excecoes, Mensagens;

type
  TServicoInteressado = class
  public
    class procedure Cadastrar(const ADocumento, ANome: string);
    class function Listar: TJSONArray;
  end;

implementation

{ TServicoInteressado }

class procedure TServicoInteressado.Cadastrar(const ADocumento, ANome: string);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;

    LQry.SQL.Add('INSERT INTO Interessados (documentoInteressado, nomeInteressado)');
    LQry.SQL.Add('VALUES (:Doc, :Nome)');

    LQry.ParamByName('Doc').AsString  := ADocumento;
    LQry.ParamByName('Nome').AsString := ANome;

    LQry.ExecSQL;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class function TServicoInteressado.Listar: TJSONArray;
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  Result := TJSONArray.Create;
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    LQry.SQL.Add('SELECT idInteressado, documentoInteressado, nomeInteressado FROM Interessados ORDER BY nomeInteressado');
    LQry.Open;

    while not LQry.Eof do
    begin
      Result.AddElement(
        TJSONObject.Create
          .AddPair('idInteressado', TJSONNumber.Create(LQry.FieldByName('idInteressado').AsInteger))
          .AddPair('documento', LQry.FieldByName('documentoInteressado').AsString)
          .AddPair('nome', LQry.FieldByName('nomeInteressado').AsString)
      );
      LQry.Next;
    end;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

end.
