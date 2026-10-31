document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token_jwt');
    const cpfCru = localStorage.getItem('usuario_cpf');

    if (!token || !cpfCru || cpfCru === "undefined") {
        window.location.replace('login.html');
        return;
    }

    // A MÁGICA SALVADORA: Limpa o CPF e garante que a URL nunca vai vazia!
    const cpf = cpfCru.replace(/\D/g, ''); 
    if (cpf === '') {
        alert("Erro de autenticação no navegador. Por favor, faça login novamente.");
        localStorage.clear();
        window.location.replace('login.html');
        return;
    }

    // --- Lógica da Data Atual no Topbar ---
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const meses = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
    const hoje = new Date();
    const dataTopo = `${dias[hoje.getDay()]}, ${hoje.getDate()} ${meses[hoje.getMonth()]} ${hoje.getFullYear()}`;
    if (document.querySelector('time')) document.querySelector('time').textContent = dataTopo;

    const cargo = parseInt(localStorage.getItem('usuario_cargo'));
    const menuPaciente = document.getElementById('menu-paciente');
    const menuAdmin = document.getElementById('menu-admin');
    const btnVoltar = document.getElementById('btn-voltar');
    const lblCargoSidebar = document.getElementById('sidebar-cargo');
    const badgeCargoPerfil = document.querySelector('.badge-patient');

    if (cargo === 1 || cargo === 2) {
        menuAdmin.classList.remove('hidden');
        btnVoltar.href = 'admin-dashboard.html';
        
        document.getElementById('link-usuarios').classList.remove('hidden');
        if (cargo === 1) {
            lblCargoSidebar.textContent = 'Administrador';
            badgeCargoPerfil.textContent = 'Administrador';
            badgeCargoPerfil.className = 'badge badge-approved'; 
        } else {
            lblCargoSidebar.textContent = 'Funcionário';
            badgeCargoPerfil.textContent = 'Funcionário';
            badgeCargoPerfil.className = 'badge badge-pending'; 
        }
    } else {
        menuPaciente.classList.remove('hidden');
        btnVoltar.href = 'patient-dashboard.html';
        lblCargoSidebar.textContent = 'Paciente';
        badgeCargoPerfil.textContent = 'Paciente';
        badgeCargoPerfil.className = 'badge badge-patient'; 
    }
    
    // --- Carregar Dados Iniciais ---
    await carregarDadosPerfil();

    // --- Evento de Salvar Alterações ---
    const formEdit = document.getElementById('form-edit-profile');
    formEdit.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
            telefone: document.getElementById('pe-phone').value,
            endereco: document.getElementById('pe-address').value,
            dataNascimento: document.getElementById('pe-birth').value,
            dadosSaude: document.getElementById('pe-health').value,
            senha: document.getElementById('pe-pass').value
        };

        try {
            const response = await fetch(Api.url(`/perfil/${cpf}`), {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                if (payload.senha !== '') {
                    alert('Senha alterada. Entre novamente com a nova senha.');
                    try {
                        for (const chave of ['token_jwt', 'usuario_cpf', 'nome_usuario', 'usuario_cargo']) localStorage.removeItem(chave);
                    } catch {
                        // A credencial anterior já foi revogada pelo servidor.
                    } finally {
                        window.location.replace('login.html');
                    }
                    return;
                }
                alert('Perfil atualizado com sucesso!');
                document.getElementById('edit-section').classList.add('hidden');
                document.getElementById('view-section').classList.remove('hidden');
                await carregarDadosPerfil();
            } else {
                const erroMsg = await RespostaApi.lerErro(response);
                alert('Erro ao atualizar perfil: ' + erroMsg);
            }
        } catch (error) {
            console.error(error);
            alert('Falha na comunicação com o servidor ao salvar.');
        }
    });
});

async function carregarDadosPerfil() {
    const token = localStorage.getItem('token_jwt');
    const cpfCru = localStorage.getItem('usuario_cpf');
    const cpf = cpfCru ? cpfCru.replace(/\D/g, '') : '';

    try {
        const response = await fetch(Api.url(`/perfil/${cpf}`), {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // BLINDAGEM 1: Se a API der um Erro 500 ou 404, ele avisa na tela e não trava!
        if (!response.ok) {
            const errorText = await RespostaApi.lerErro(response);
            document.getElementById('p-nome').textContent = 'Erro no Servidor';
            alert('Não foi possível carregar o perfil: ' + errorText);
            return;
        }

        const result = await response.json();

        if (result.sucesso) {
            const user = result.dados;
            
            // Sidebar
            document.getElementById('sidebar-nome').textContent = user.nomeCompleto || 'Sem nome';
            
            // BLINDAGEM 2: Se o nome estiver vazio, não deixa o ".split" quebrar o código
            const nomeSplit = user.nomeCompleto ? user.nomeCompleto.trim().split(' ') : ['U'];
            const iniciais = nomeSplit.map(n => n[0] ? n[0] : '').join('').substring(0, 2).toUpperCase();
            document.querySelectorAll('.avatar').forEach(el => el.textContent = iniciais || '--');

            // Visualização
            document.getElementById('p-nome').textContent = user.nomeCompleto || 'Sem nome';
            document.getElementById('p-email').textContent = user.email || 'Não informado';
            
            let cpfParaTela = user.cpf || '';
            cpfParaTela = cpfParaTela.padStart(11, '0');
            document.getElementById('p-cpf').textContent = cpfParaTela.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
            
            // BLINDAGEM 3: Impede travamento se a data vier nula ou errada
            if (user.dataNascimento && user.dataNascimento.includes('-')) {
                const [ano, mes, dia] = user.dataNascimento.split('-');
                document.getElementById('p-nascimento').textContent = `${dia}/${mes}/${ano}`;
                document.getElementById('pe-birth').value = user.dataNascimento;
            } else {
                document.getElementById('p-nascimento').textContent = 'Não informada';
                document.getElementById('pe-birth').value = '';
            }

            document.getElementById('p-telefone').textContent = user.telefone || 'Não informado';
            document.getElementById('p-endereco').textContent = user.endereco || 'Não informado';
            document.getElementById('p-saude').textContent = user.dadosSaude || 'Nenhuma informação registrada.';

            // Edição
            document.getElementById('pe-phone').value = user.telefone || '';
            document.getElementById('pe-address').value = user.endereco || '';
            document.getElementById('pe-health').value = user.dadosSaude || '';
            document.getElementById('pe-pass').value = '';
        } else {
            console.error("Erro da API:", RespostaApi.mensagemErro(result));
            document.getElementById('p-nome').textContent = 'Erro ao carregar';
            alert('Erro da API: ' + RespostaApi.mensagemErro(result));
        }
    } catch (error) {
        // BLINDAGEM 4: Se cair aqui, a internet caiu ou a API desligou. Ele pula um alerta!
        console.error("Falha fatal no carregamento:", error);
        document.getElementById('p-nome').textContent = 'Falha de Conexão';
        alert('Falha na comunicação com o servidor ao carregar o perfil.');
    }
}

function sairDaConta(e) {
    if (e) e.preventDefault(); 
    localStorage.clear();
    window.location.replace('login.html');
}

async function excluirConta() {
    const confirmacao = confirm('Deseja excluir sua conta?\n\nA exclusão só é permitida quando não há solicitações vinculadas. Contas com histórico são preservadas; para encerrar o acesso mantendo os registros, procure a administração.');
    if (!confirmacao) return; 

    const token = localStorage.getItem('token_jwt');
    const cpfCru = localStorage.getItem('usuario_cpf');
    const cpf = cpfCru.replace(/\D/g, ''); 

    try {
        const response = await fetch(Api.url(`/perfil/${cpf}`), {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            alert('Sua conta sem solicitações foi excluída com sucesso.');
            localStorage.clear();
            window.location.replace('login.html');
        } else {
            alert('Não foi possível excluir a conta: ' + await RespostaApi.lerErro(response, 'Contas com solicitações vinculadas são preservadas para manter o histórico.'));
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Falha na comunicação com o servidor.');
    }
}

window.addEventListener('pageshow', (event) => {
    const token = localStorage.getItem('token_jwt');
    if (!token) {
        window.location.replace('login.html'); 
    }
});
