import {createHmac} from 'node:crypto';
// A fixture SQLite antiga usa senha vazia para os atores de autorização.
// Contas com senha real recebem o vínculo pela rota /login.
export const fixtureCredential = createHmac('sha256','chave-exclusiva-de-testes-nao-usar-em-producao-2026')
    .update('alto-custo/sessao/v1/').digest('hex');
