document.addEventListener('DOMContentLoaded', () => {
    const formRegister = document.getElementById('form-register');
    const cpfInput = document.getElementById('r-cpf');
    const cpfError = document.getElementById('cpf-error');

    // --- MÁSCARA DO CPF (Apenas números e formatação automática) ---
    cpfInput.addEventListener('input', function (e) {
        let value = e.target.value;
        
        // Remove tudo que não for número (bloqueia letras)
        value = value.replace(/\D/g, "");
        
        // Aplica a formatação (000.000.000-00)
        value = value.replace(/(\d{3})(\d)/, "$1.$2");
        value = value.replace(/(\d{3})(\d)/, "$1.$2");
        value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        
        e.target.value = value;
        
        // Esconde o erro se o usuário voltar a digitar
        cpfError.classList.add('hidden');
        cpfInput.style.borderColor = '';
    });

    // --- FUNÇÃO MATEMÁTICA DE VALIDAÇÃO DE CPF ---
    function validarCPF(cpf) {
        cpf = cpf.replace(/\D/g, ''); // Garante que só tem números
        
        if (cpf.length !== 11) return false;
        
        // Elimina CPFs inválidos conhecidos (todos os números iguais)
        if (/^(\d)\1{10}$/.test(cpf)) return false;
        
        let soma = 0;
        let resto;
        
        // Valida o primeiro dígito verificador
        for (let i = 1; i <= 9; i++) soma = soma + parseInt(cpf.substring(i-1, i)) * (11 - i);
        resto = (soma * 10) % 11;
        if ((resto === 10) || (resto === 11)) resto = 0;
        if (resto !== parseInt(cpf.substring(9, 10))) return false;
        
        soma = 0;
        // Valida o segundo dígito verificador
        for (let i = 1; i <= 10; i++) soma = soma + parseInt(cpf.substring(i-1, i)) * (12 - i);
        resto = (soma * 10) % 11;
        if ((resto === 10) || (resto === 11)) resto = 0;
        if (resto !== parseInt(cpf.substring(10, 11))) return false;
        
        return true;
    }

    // --- ENVIO DO FORMULÁRIO ---
    formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!formRegister.checkValidity()) {
            formRegister.reportValidity(); 
            return; 
        }

        const nome = document.getElementById('r-name').value;
        const email = document.getElementById('r-email').value;
        const cpfRaw = document.getElementById('r-cpf').value;
        const dataNascimento = document.getElementById('r-birth').value; 
        const telefone = document.getElementById('r-phone').value;
        const endereco = document.getElementById('r-address').value;
        const dadosSaude = document.getElementById('r-health').value;
        const senha = document.getElementById('r-senha').value;
        const confirmaSenha = document.getElementById('r-confirma-senha').value;

        // 1. Valida as Senhas
        if (senha !== confirmaSenha) {
            alert('As senhas não coincidem. Por favor, verifique.');
            return;
        }

        // 2. Valida o CPF
        if (!validarCPF(cpfRaw)) {
            cpfError.classList.remove('hidden');
            cpfInput.style.borderColor = 'var(--red-600)'; // Deixa a borda vermelha
            cpfInput.focus();
            return; // Bloqueia o envio para a API!
        }

        const cpfLimpo = cpfRaw.replace(/\D/g, '');

        const payload = {
            cpf: cpfLimpo,
            nomeCompleto: nome,
            email: email,
            dataNascimento: dataNascimento,
            telefone: telefone,
            endereco: endereco,
            dadosSaude: dadosSaude,
            senha: senha
        };

        try {
            const response = await fetch('http://localhost:9000/usuarios', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok && data.sucesso) {
                alert('Cadastro realizado com sucesso!');
                window.location.href = 'login.html'; 
            } else {
                alert(data.mensagem || 'Erro ao processar cadastro. Verifique os dados.');
            }

        } catch (error) {
            console.error('Erro na requisição:', error);
            alert('Erro de comunicação: Não foi possível conectar ao servidor. Verifique se a API está rodando.');
        }
    });
});