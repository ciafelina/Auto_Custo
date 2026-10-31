unit Estoque;

interface

// Predicados sobre Medicamentos, compartilhados por filtros e indicadores.
function FiltroEstoque(const ADisponibilidade: string): string;

implementation

function FiltroEstoque(const ADisponibilidade: string): string;
const
  LSaldo = 'COALESCE(quantidadeEstoque, 0)';
  LMinimo = '(CASE WHEN estoqueMinimo > 0 THEN estoqueMinimo ELSE 0 END)';
begin
  if ADisponibilidade = 'available' then
    Result := LSaldo + ' > ' + LMinimo
  else if ADisponibilidade = 'low' then
    Result := LSaldo + ' > 0 AND ' + LSaldo + ' <= ' + LMinimo
  else if ADisponibilidade = 'out' then
    Result := LSaldo + ' <= 0'
  else
    Result := '';
end;

end.
