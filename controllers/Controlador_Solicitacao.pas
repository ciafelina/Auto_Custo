unit Controlador_Solicitacao;

interface

uses
  Horse, System.JSON, System.SysUtils, Servico_Solicitacao, Excecoes, Mensagens;

type
  TControladorSolicitacao = class
  public
    class procedure RegistrarRotas;
  end;

implementation

procedure DoConfirmarRetirada(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LId: Integer;
begin
  LId := StrToIntDef(Req.Params['id'], 0);
  TServicoSolicitacao.ConfirmarRetirada(LId);
  Res.Status(204).Send('');
end;

procedure DoNovaSolicitacao(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LBody: TJSONObject;
  LCPF: string;
  LQuantidade, LIdMedicamento: Integer;
begin
  LBody := Req.Body<TJSONObject>;

  LCPF := LBody.GetValue<string>('cpf', '');
  LQuantidade := LBody.GetValue<Integer>('quantidade', 1);
  LIdMedicamento := LBody.GetValue<Integer>('idMedicamento', 0);

  if (LCPF = '') or (LIdMedicamento = 0) then
    raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'Dados do medicamento inválidos.');

  // Chama a nova versão do serviço (sem a string do nome)
  TServicoSolicitacao.NovaSolicitacao(LCPF, LQuantidade, LIdMedicamento);

  Res.Status(201).Send(
    TJSONObject.Create
      .AddPair('sucesso', TJSONBool.Create(True))
      .AddPair('mensagem', 'Solicitação enviada com sucesso!')
  );
end;

class procedure TControladorSolicitacao.RegistrarRotas;
begin
  THorse.Post('/solicitacoes', DoNovaSolicitacao);
  THorse.Patch('/solicitacoes/:id/retirada', DoConfirmarRetirada);
end;

end.
