// Expectativas literais: não usar a função de produção para calcular resultados.
export const stockCases = [
  {id:9001, estoque:0, estoqueMinimo:10, want:'out'},
  {id:9002, estoque:1, estoqueMinimo:10, want:'low'},
  {id:9003, estoque:10, estoqueMinimo:10, want:'low'},
  {id:9004, estoque:11, estoqueMinimo:10, want:'available'},
  {id:9005, estoque:3, estoqueMinimo:2, want:'available'},
  {id:9006, estoque:6, estoqueMinimo:10, want:'low'},
  {id:9007, estoque:0, estoqueMinimo:0, want:'out'},
  {id:9008, estoque:1, estoqueMinimo:0, want:'available'},
  {id:9009, estoque:5, estoqueMinimo:5, want:'low'},
  {id:9010, estoque:6, estoqueMinimo:5, want:'available'},
  {id:9011, estoque:1, estoqueMinimo:null, want:'available'},
  {id:9012, estoque:0, estoqueMinimo:null, want:'out'},
  {id:9013, estoque:-1, estoqueMinimo:10, want:'out'},
  {id:9014, estoque:null, estoqueMinimo:10, want:'out'},
  {id:9015, estoque:2, estoqueMinimo:-3, want:'available'}
].map(row=>({...row,nome:`Item10-${row.id}`,categoria:row.id%2===0?'Categoria A':'Categoria B',dosagem:'10 mg',fabricante:'Teste',descricao:'Descrição de teste'}));
