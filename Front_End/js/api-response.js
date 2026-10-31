globalThis.RespostaApi = Object.freeze({
    mensagemErro(resultado, fallback = 'Não foi possível concluir a operação. Tente novamente.') {
        const mensagem = resultado?.erro?.mensagem ?? resultado?.mensagem;
        return typeof mensagem === 'string' && mensagem.trim() ? mensagem : fallback;
    },
    async lerErro(response, fallback) {
        try {
            return RespostaApi.mensagemErro(await response.json(), fallback);
        } catch {
            return fallback || 'Não foi possível concluir a operação. Tente novamente.';
        }
    }
});
