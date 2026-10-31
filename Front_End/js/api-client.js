(() => {
    const configurado = globalThis.AUTO_CUSTO_CONFIG?.apiBaseUrl ?? '';
    const erroConfiguracao = 'Endereço da API inválido. Verifique apiBaseUrl em config.js.';
    if (typeof configurado !== 'string') throw new Error(erroConfiguracao);

    let base;
    const endereco = configurado.trim();
    if (endereco) {
        if (!/^https?:\/\//i.test(endereco)) throw new Error(erroConfiguracao);
        try {
            base = new URL(endereco);
        } catch {
            throw new Error(erroConfiguracao);
        }
    } else {
        base = new URL('http://localhost:9000/');
        if (globalThis.location?.hostname) base.hostname = location.hostname;
        if (globalThis.location?.protocol === 'https:') base.protocol = 'https:';
    }
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
        base.href.includes('?') || base.href.includes('#')) {
        throw new Error(erroConfiguracao);
    }

    const prefixo = base.pathname.replace(/\/+$/, '');
    const baseUrl = base.origin + prefixo;
    globalThis.Api = Object.freeze({
        baseUrl,
        url(caminho) {
            if (typeof caminho !== 'string' || !caminho.startsWith('/') ||
                caminho.startsWith('//') || caminho.includes('\\') || caminho.includes('#')) {
                throw new Error('A chamada da API deve usar um caminho interno.');
            }
            const destino = new URL(baseUrl + caminho);
            if (destino.origin !== base.origin || !destino.pathname.startsWith(prefixo + '/')) {
                throw new Error('A chamada da API não pode sair do endereço configurado.');
            }
            return destino.href;
        }
    });
})();
