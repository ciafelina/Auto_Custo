unit Servico_Documento;

interface

uses
  System.SysUtils, System.Variants, FireDAC.Comp.Client, FireDAC.DApt, Data.DB,
  System.JSON, Conexao, Excecoes, Mensagens;

type
  TServicoDocumento = class
  public
    class procedure Cadastrar(const ATipo, ADataDoc, ANivelEnsino, ASerie, AVia,
                              AObservacao, AAnoRef, ANFolhas, AUsuarioCPF: string;
                              AIdInteressado: Integer);
    class function Listar: TJSONArray;
  end;

implementation

{ TServicoDocumento }

class procedure TServicoDocumento.Cadastrar(const ATipo, ADataDoc, ANivelEnsino, ASerie, AVia,
  AObservacao, AAnoRef, ANFolhas, AUsuarioCPF: string; AIdInteressado: Integer);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    LQry.SQL.Add('INSERT INTO Documentos ');
    LQry.SQL.Add('(tipo, dataDoc, nivelEnsino, serieAnoCicloModulo, via, observacao, anoRef, n_folhas, dataHora, idInteressado, idUsuarioCPF)');
    LQry.SQL.Add('VALUES ');
    LQry.SQL.Add('(:Tipo, :DataDoc, :Nivel, :Serie, :Via, :Obs, :AnoRef, :NFolhas, GETDATE(), :IdInteressado, :IdUsuarioCPF)');

    LQry.ParamByName('Tipo').AsString := ATipo;
    LQry.ParamByName('Nivel').AsString := ANivelEnsino;
    LQry.ParamByName('Serie').AsString := ASerie;
    LQry.ParamByName('Via').AsString := AVia;
    LQry.ParamByName('Obs').AsString := AObservacao;
    LQry.ParamByName('AnoRef').AsString := AAnoRef;
    LQry.ParamByName('NFolhas').AsString := ANFolhas;
    LQry.ParamByName('IdInteressado').AsInteger := AIdInteressado;
    LQry.ParamByName('IdUsuarioCPF').AsLargeInt := StrToInt64Def(AUsuarioCPF, 0);

    if ADataDoc.Trim.IsEmpty then
      LQry.ParamByName('DataDoc').Value := Null
    else
      LQry.ParamByName('DataDoc').AsString := ADataDoc;

    LQry.ExecSQL;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class function TServicoDocumento.Listar: TJSONArray;
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  Result := TJSONArray.Create;
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    LQry.SQL.Add('SELECT D.*, I.nomeInteressado ');
    LQry.SQL.Add('FROM Documentos D ');
    LQry.SQL.Add('INNER JOIN Interessados I ON D.idInteressado = I.idInteressado ');
    LQry.SQL.Add('ORDER BY D.dataHora DESC');
    LQry.Open;

    while not LQry.Eof do
    begin
      Result.AddElement(
        TJSONObject.Create
          .AddPair('idDoc', TJSONNumber.Create(LQry.FieldByName('idDoc').AsInteger))
          .AddPair('tipo', LQry.FieldByName('tipo').AsString)
          .AddPair('dataDoc', LQry.FieldByName('dataDoc').AsString)
          .AddPair('nivelEnsino', LQry.FieldByName('nivelEnsino').AsString)
          .AddPair('serie', LQry.FieldByName('serieAnoCicloModulo').AsString)
          .AddPair('via', LQry.FieldByName('via').AsString)
          .AddPair('observacao', LQry.FieldByName('observacao').AsString)
          .AddPair('anoRef', LQry.FieldByName('anoRef').AsString)
          .AddPair('n_folhas', LQry.FieldByName('n_folhas').AsString)
          .AddPair('dataHoraCadastro', LQry.FieldByName('dataHora').AsString)
          .AddPair('interessado', LQry.FieldByName('nomeInteressado').AsString)
      );
      LQry.Next;
    end;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

end.
