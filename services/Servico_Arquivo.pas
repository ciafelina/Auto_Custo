unit Servico_Arquivo;

interface

uses
  System.SysUtils, FireDAC.Comp.Client, FireDAC.DApt, Data.DB,
  System.JSON, Conexao, Excecoes, Mensagens;

type
  TServicoArquivo = class
  public
    class procedure Cadastrar(const AProntuario, ACaixa, APrateleira, AUsuarioCPF: string; AIdDoc: Integer);
    class function Listar: TJSONArray;
  end;

implementation

{ TServicoArquivo }

class procedure TServicoArquivo.Cadastrar(const AProntuario, ACaixa, APrateleira, AUsuarioCPF: string; AIdDoc: Integer);
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;

    LQry.SQL.Add('INSERT INTO Arquivo (prontuario, caixa, prateleiraCorredor, dataHora, idDoc, idUsuarioCPF)');
    LQry.SQL.Add('VALUES (:Prontuario, :Caixa, :Prateleira, GETDATE(), :IdDoc, :IdUsuarioCPF)');

    LQry.ParamByName('Prontuario').AsString := AProntuario;
    LQry.ParamByName('Caixa').AsString := ACaixa;
    LQry.ParamByName('Prateleira').AsString := APrateleira;
    LQry.ParamByName('IdDoc').AsInteger := AIdDoc;
    LQry.ParamByName('IdUsuarioCPF').AsLargeInt := StrToInt64Def(AUsuarioCPF, 0);

    try
      LQry.ExecSQL;
    except
      on E: Exception do
      begin
        if Pos('FK_Arquivo_Documentos', E.Message) > 0 then
          raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'O Documento (idDoc) informado não existe.')
        else
          raise EErroApi.Create(500, TCodigoErro.ErroInterno, 'Erro ao salvar arquivo físico: ' + E.Message);
      end;
    end;
  finally
    LQry.Free;
    LConn.Free;
  end;
end;

class function TServicoArquivo.Listar: TJSONArray;
var
  LConn: TFDConnection;
  LQry: TFDQuery;
begin
  Result := TJSONArray.Create;
  LConn := TProvedorConexao.ObterConexao;
  LQry := TFDQuery.Create(nil);
  try
    LQry.Connection := LConn;
    LQry.SQL.Add('SELECT A.*, D.tipo AS tipoDoc, I.nomeInteressado ');
    LQry.SQL.Add('FROM Arquivo A ');
    LQry.SQL.Add('INNER JOIN Documentos D ON A.idDoc = D.idDoc ');
    LQry.SQL.Add('INNER JOIN Interessados I ON D.idInteressado = I.idInteressado ');
    LQry.SQL.Add('ORDER BY A.dataHora DESC');
    LQry.Open;

    while not LQry.Eof do
    begin
      Result.AddElement(
        TJSONObject.Create
          .AddPair('prontuario', LQry.FieldByName('prontuario').AsString)
          .AddPair('caixa', LQry.FieldByName('caixa').AsString)
          .AddPair('prateleiraCorredor', LQry.FieldByName('prateleiraCorredor').AsString)
          .AddPair('dataHoraGuarda', LQry.FieldByName('dataHora').AsString)
          .AddPair('idDoc', TJSONNumber.Create(LQry.FieldByName('idDoc').AsInteger))
          .AddPair('tipoDoc', LQry.FieldByName('tipoDoc').AsString)
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
