(() => {
    'use strict';
    const solicitar = document.getElementById('form-recuperar');
    const redefinir = document.getElementById('form-redefinir');
    const mensagem = document.getElementById('rec-mensagem');
    let token = '';
    if (redefinir) {
        token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
        history.replaceState(null, '', location.pathname);
    }
    function mostrar(texto, erro = false) {
        mensagem.textContent = texto;
        mensagem.className = `alert mt-4 ${erro ? 'alert-danger' : 'alert-info'}`;
        mensagem.setAttribute('role', erro ? 'alert' : 'status');
        mensagem.focus();
    }
    async function enviar(form, rota, dados) {
        const botao = form.querySelector('button[type="submit"]');
        if (botao.disabled) return;
        const texto = botao.textContent;
        botao.disabled = true;
        botao.textContent = 'Aguarde…';
        try {
            const resposta = await fetch(Api.url(rota), {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
                body: JSON.stringify(dados)
            });
            if (!resposta.ok) throw new Error(await RespostaApi.lerErro(resposta));
            const resultado = await resposta.json();
            if (!resultado.sucesso) throw new Error(RespostaApi.mensagemErro(resultado));
            mostrar(resultado.mensagem);
            if (redefinir) {
                token = '';
                redefinir.reset();
                redefinir.hidden = true;
                try {
                    for (const chave of ['token_jwt', 'usuario_cpf', 'nome_usuario', 'usuario_cargo']) localStorage.removeItem(chave);
                } catch { /* A senha foi alterada mesmo com armazenamento do navegador bloqueado. */ }
            }
        } catch (erro) {
            mostrar(erro instanceof TypeError ? 'Não foi possível conectar ao servidor. Tente novamente.' : erro.message, true);
        } finally {
            botao.disabled = false;
            botao.textContent = texto;
        }
    }
    if (solicitar) {
        solicitar.addEventListener('submit', event => {
            event.preventDefault();
            const cpf = document.getElementById('rec-cpf').value.replace(/[.\-]/g, '').trim();
            const email = document.getElementById('rec-email').value.trim();
            if (!/^\d{11}$/.test(cpf) || !document.getElementById('rec-email').checkValidity() || !email) {
                mostrar('Informe um CPF e um e-mail válidos.', true);
                return;
            }
            enviar(solicitar, '/senha/recuperar', {cpf, email});
        });
    }
    if (redefinir) {
        if (!/^[a-f0-9]{64}$/.test(token)) {
            redefinir.hidden = true;
            mostrar('Link inválido ou expirado. Solicite uma nova recuperação de senha.', true);
        }
        redefinir.addEventListener('submit', event => {
            event.preventDefault();
            const senha = document.getElementById('nova-senha').value;
            const confirmacao = document.getElementById('confirma-senha').value;
            if (senha.length < 8 || senha.length > 64 || new TextEncoder().encode(senha).length > 72 || !senha.trim()) {
                mostrar('Use de 8 a 64 caracteres e até 72 bytes na nova senha.', true);
                return;
            }
            if (senha !== confirmacao) { mostrar('As senhas não coincidem.', true); return; }
            enviar(redefinir, '/senha/redefinir', {token, senha});
        });
    }
})();
