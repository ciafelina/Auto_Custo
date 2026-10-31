unit Controlador_Usuario;

interface

uses
  Horse, System.JSON, System.SysUtils, Servico_Usuario, Autenticacao, Excecoes, Mensagens;

type
  TControladorUsuario = class
  public
    class procedure RegistrarRotas;
  end;

implementation

uses JsonApi;



procedure DoObterPerfil(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LCPF: string;
  LJSON: TJSONObject;
begin
  LCPF := Req.Params['cpf'];
  ExigirTitular(Req, LCPF);
  LCPF := ValidarToken(Req).UsuarioCPF;
  if LCPF = '' then
    raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'CPF não informado.');
  LJSON := TServicoUsuario.ObterPorCPF(LCPF);
  Res.Status(200).Send(
    TJSONObject.Create
      .AddPair('sucesso', TJSONBool.Create(True))
      .AddPair('dados', LJSON)
  );
end;

procedure DoCadastrarUsuario(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LBody: TJSONObject;
  LCPF, LNome, LEmail, LDataNascimento, LTelefone, LEndereco, LDadosSaude, LSenha: string;
begin
  LBody := LerObjetoJSON(Req);
  if (not Assigned(LBody)) or (LBody.Count = 0) then
    raise EErroApi.Create(400, TCodigoErro.RequisicaoInvalida, 'Corpo da requisição vazio.');
  LCPF            := LBody.GetValue<string>('cpf', '');
  LNome           := LBody.GetValue<string>('nomeCompleto', '');
  LEmail          := LBody.GetValue<string>('email', '');
  LDataNascimento := LBody.GetValue<string>('dataNascimento', '');
  LTelefone       := LBody.GetValue<string>('telefone', '');
  LEndereco       := LBody.GetValue<string>('endereco', '');
  LDadosSaude     := LBody.GetValue<string>('dadosSaude', '');
  LSenha          := LBody.GetValue<string>('senha', '');
  // Validações básicas e obrigatórias
  if LCPF = ''   then raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'CPF é obrigatório.');
  if LNome = ''  then raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'Nome é obrigatório.');
  if LSenha = '' then raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'Senha é obrigatória.');
  // Repassa tudo para o Serviço
  TServicoUsuario.Cadastrar(LCPF, LNome, LEmail, LDataNascimento, LTelefone, LEndereco, LDadosSaude, LSenha);
  Res.Status(201).Send(
    TJSONObject.Create
      .AddPair('sucesso', TJSONBool.Create(True))
      .AddPair('mensagem', 'Usuário cadastrado com sucesso!')
  );
end;

procedure DoAtualizarPerfil(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LBody: TJSONObject;
  LCPF: string;
begin
  LCPF := Req.Params['cpf'];
  ExigirTitular(Req, LCPF);
  LCPF := ValidarToken(Req).UsuarioCPF;
  LBody := LerObjetoJSON(Req);
  TServicoUsuario.AtualizarPerfil(
    LCPF,
    LBody.GetValue<string>('telefone', ''),
    LBody.GetValue<string>('endereco', ''),
    LBody.GetValue<string>('dataNascimento', ''),
    LBody.GetValue<string>('dadosSaude', ''),
    LBody.GetValue<string>('senha', '')
  );
  Res.Status(200).Send(
    TJSONObject.Create.AddPair('sucesso', TJSONBool.Create(True))
  );
end;

procedure DoExcluirPerfil(Req: THorseRequest; Res: THorseResponse; Next: TProc);
var
  LCPF: string;
begin
  LCPF := Req.Params['cpf'];
  ExigirTitular(Req, LCPF);
  LCPF := ValidarToken(Req).UsuarioCPF;

  if LCPF = '' then
    raise EErroApi.Create(400, TCodigoErro.ParametroAusente, 'CPF não informado.');

  TServicoUsuario.ExcluirConta(LCPF);

  // Retorna 204 (No Content), que significa: Deu certo e não tem mensagem de volta.
  Res.Status(204).Send('');
end;

class procedure TControladorUsuario.RegistrarRotas;
begin
  THorse.Post('/usuarios', DoCadastrarUsuario);
  THorse.Get('/perfil/:cpf', DoObterPerfil);
  THorse.Put('/perfil/:cpf', DoAtualizarPerfil);
  THorse.Delete('/perfil/:cpf', DoExcluirPerfil);
end;

end.

