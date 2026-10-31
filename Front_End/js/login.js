document.addEventListener('DOMContentLoaded', () => {
  const formLogin = document.getElementById('form-login');
  const errorDiv = document.getElementById('login-error');
  const errorSpan = errorDiv.querySelector('span:nth-child(2)'); 
  
  const inputCPF = document.getElementById('usuario');

  // --- NOVA MÁSCARA AUTOMÁTICA DE CPF NO LOGIN ---
  if (inputCPF) {
      inputCPF.addEventListener('input', function (e) {
          let value = e.target.value;
          value = value.replace(/\D/g, ""); // Remove letras
          value = value.replace(/(\d{3})(\d)/, "$1.$2");
          value = value.replace(/(\d{3})(\d)/, "$1.$2");
          value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
          e.target.value = value;
      });
  }

  formLogin.addEventListener('submit', async (event) => {
    event.preventDefault(); 

    const cpfDigitado = document.getElementById('usuario').value;
    const senhaInput = document.getElementById('senha').value;
    const cpfLimpo = cpfDigitado.replace(/\D/g, '');

    errorDiv.classList.add('hidden');

    try {
      const response = await fetch(Api.url('/login'), {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json' 
          },
          body: JSON.stringify({
              cpf: cpfLimpo,
              senha: senhaInput
          })
      });

      // Captura a resposta como texto primeiro para evitar travamentos de parsing
      const responseText = await response.text();
      let data = {};
      
      try {
          data = JSON.parse(responseText);
      } catch (e) {
          data = { sucesso: false, mensagem: 'Não foi possível ler a resposta do servidor. Tente novamente.' };
      }

      if (response.ok && data.sucesso) {
        localStorage.setItem('token_jwt', data.dados.token_jwt);
        localStorage.setItem('nome_usuario', data.dados.nome);
        localStorage.setItem('usuario_cpf', cpfLimpo); 
        
        const cargoUsuario = data.cargo || data.dados.cargo;
        localStorage.setItem('usuario_cargo', cargoUsuario);

        if (cargoUsuario === 1 || cargoUsuario === 2) {
            window.location.replace('admin-dashboard.html');
        } else {
            window.location.replace('patient-dashboard.html');
        }
        
      } else {
        errorDiv.classList.remove('hidden');
        
        errorSpan.textContent = RespostaApi.mensagemErro(data, 'Não foi possível entrar. Tente novamente.');
      }

    } catch (error) {
      console.error('Erro na requisição:', error); 
      errorDiv.classList.remove('hidden');
      errorSpan.textContent = 'Erro de conexão. Verifique se o servidor está ligado.';
    }
  });
});
