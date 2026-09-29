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
      const response = await fetch('http://localhost:9000/login', {
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
          // Caso não seja um JSON válido, joga o texto puro para a propriedade de mensagem
          data = { sucesso: false, mensagem: responseText };
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
        
        // Faz a varredura das possíveis estruturas de erro enviadas pela API
        let msgErro = 'CPF ou senha inválidos.';
        
        if (data.mensagem) {
            msgErro = data.mensagem;
        } else if (data.error) {
            if (typeof data.error === 'string') msgErro = data.error;
            else if (data.error.message) msgErro = data.error.message;
            else if (data.error.mensagem) msgErro = data.error.mensagem;
        }
        
        errorSpan.textContent = msgErro;
      }

    } catch (error) {
      console.error('Erro na requisição:', error); 
      errorDiv.classList.remove('hidden');
      errorSpan.textContent = 'Erro de conexão. Verifique se o servidor está ligado.';
    }
  });
});