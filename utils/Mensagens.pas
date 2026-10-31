unit Mensagens;

interface

type
  TCodigoErro = record
  public
    const RequisicaoInvalida   = 'REQUISICAO_INVALIDA';
    const FormatoNaoSuportado  = 'FORMATO_NAO_SUPORTADO';
    const MetodoNaoPermitido  = 'METODO_NAO_PERMITIDO';
    const ParametroAusente     = 'PARAMETRO_AUSENTE';
    const CredenciaisInvalidas = 'CREDENCIAIS_INVALIDAS';
    const AcessoNegado         = 'ACESSO_NEGADO';
    const NaoEncontrado        = 'NAO_ENCONTRADO';
    const ErroInterno          = 'ERRO_INTERNO_SERVIDOR';
    const LicencaExpirada      = 'LICENCA_EXPIRADA';

    const TipoMovimentoInvalido = 'TIPO_MOVIMENTO_INVALIDO';
    const NroOsInvalido         = 'NRO_OS_INVALIDO';
    const CamposAusentes        = 'CAMPOS_AUSENTES';
    const CarrinhoVazio         = 'CARRINHO_VAZIO';
    const DataInvalida          = 'DATA_INVALIDA';
    const ReceitaInvalida       = 'RECEITA_INVALIDA';

    const LojaNaoEncontrada     = 'LOJA_NAO_ENCONTRADA';
    const ClienteNaoEncontrado  = 'CLIENTE_NAO_ENCONTRADO';
    const MedicoNaoEncontrado   = 'MEDICO_NAO_ENCONTRADO';
    const LojaSemPermissao      = 'LOJA_SEM_PERMISSAO';
    const NroOsDuplicado        = 'NRO_OS_DUPLICADO';
    const ProdutoInvalido       = 'PRODUTO_INVALIDO';
    const ProdutoSemEstoque     = 'PRODUTO_INVALIDO_OU_SEM_ESTOQUE';
    const QuantidadeInvalida    = 'QUANTIDADE_INVALIDA';
    const EstoqueInsuficiente   = 'ESTOQUE_INSUFICIENTE';
    const StatusInvalido        = 'STATUS_INVALIDO';
    const TransicaoStatusInvalida = 'TRANSICAO_STATUS_INVALIDA';
    const EstornoEstoqueInvalido = 'ESTORNO_ESTOQUE_INVALIDO';
    const HistoricoVinculado     = 'HISTORICO_VINCULADO';
    const FiltroObrigatorio     = 'FILTRO_OBRIGATORIO';
    const BuscaInvalida         = 'BUSCA_INVALIDA';
    const ErroCriacaoOS         = 'ERRO_CRIACAO_OS';
    const ErroGravacaoBanco     = 'ERRO_GRAVACAO_BANCO';
    const OsNaoEncontrada       = 'OS_NAO_ENCONTRADA';
    const FiltroIncompleto      = 'FILTRO_INCOMPLETO';
    const CpfInvalido           = 'CPF_INVALIDO';
    const CpfDuplicado          = 'CPF_DUPLICADO';
    const DataNascimentoFutura  = 'DATA_NASCIMENTO_FUTURA';
    const GeneroInvalido        = 'GENERO_INVALIDO';
    const BaseInvalida          = 'LICENCA_INVALIDA';
    const MovimentoBaixado      = 'MOVIMENTO_BAIXADO';
    const TipoMovimentoAlterado = 'TIPO_MOVIMENTO_ALTERADO';
    const RecursoNaoEncontrado  = 'RECURSO_NAO_ENCONTRADO';
  end;

implementation

end.
