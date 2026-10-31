// Mesma regra dos filtros e indicadores da API. Crítico continua solicitável.
globalThis.Estoque = Object.freeze({
    classificar(estoque, estoqueMinimo) {
        const saldo = Number(estoque ?? 0);
        const minimo = Math.max(0, Number(estoqueMinimo ?? 0));
        if (saldo <= 0) return 'out';
        return saldo <= minimo ? 'low' : 'available';
    }
});
