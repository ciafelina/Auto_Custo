document.addEventListener('DOMContentLoaded', () => {
    // 1. Lógica da Data Atual
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const meses = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
    const hoje = new Date();
    
    const dataFormatada = `${dias[hoje.getDay()]}, ${hoje.getDate()} ${meses[hoje.getMonth()]} ${hoje.getFullYear()}`;
    const elementoData = document.getElementById('data-atual');
    if (elementoData) elementoData.textContent = dataFormatada;

    // 2. VALIDAÇÃO DE SEGURANÇA E CARGO (RBAC)
    const token = localStorage.getItem('token_jwt');
    const cpf = localStorage.getItem('usuario_cpf');
    const nomeUsuario = localStorage.getItem('nome_usuario');
    const cargo = parseInt(localStorage.getItem('usuario_cargo'));

    if (!token || !cpf) {
        window.location.replace('login.html');
        return; 
    }

    if (cargo === 3) {
        alert('Acesso negado! Esta área é restrita para funcionários.');
        window.location.replace('patient-dashboard.html');
        return;
    }

    // 3. Atualização da Interface (Barra Lateral)
    const sidebarName = document.getElementById('sidebar-user-name');
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const sidebarRole = document.getElementById('sidebar-role');

    if (sidebarName && nomeUsuario) {
        sidebarName.textContent = nomeUsuario;
    }

    if (sidebarAvatar && nomeUsuario) {
        const iniciais = nomeUsuario.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        sidebarAvatar.textContent = iniciais;
    }
    
    if (sidebarRole) {
        sidebarRole.textContent = cargo === 1 ? 'Administrador' : 'Funcionário';
    }

    // 4. Carrega os dados reais do painel
    carregarDadosEstatisticosAdmin();
});

window.addEventListener('pageshow', (event) => {
    const token = localStorage.getItem('token_jwt');
    const cargo = parseInt(localStorage.getItem('usuario_cargo'));
    
    if (!token) {
        window.location.replace('login.html');
    } else if (cargo === 3) {
        window.location.replace('patient-dashboard.html');
    }
});

function sairDaConta(e) {
    if (e) e.preventDefault(); 
    localStorage.clear();
    window.location.replace('login.html');
}

// --- NOVA FUNÇÃO QUE BUSCA OS DADOS DA API ---
async function carregarDadosEstatisticosAdmin() {
    const token = localStorage.getItem('token_jwt');

    try {
        const response = await fetch('http://localhost:9000/admin/dashboard', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            sairDaConta();
            return;
        }

        const result = await response.json();

        if (response.ok && result.sucesso) {
            const d = result.dados;

            // Preenche os 4 cards numéricos
            document.getElementById('stat-usuarios').textContent = d.totalUsuarios;
            document.getElementById('stat-medicamentos').textContent = d.totalMedicamentos;
            document.getElementById('stat-critico').textContent = d.estoqueCritico;
            document.getElementById('stat-pendentes').textContent = d.solicitacoesPendentes;

            // Lida com o Alerta Vermelho de Medicamentos Zerados
            const alertDiv = document.getElementById('alert-out-of-stock');
            const alertText = document.getElementById('out-of-stock-text');

            if (d.medicamentosZerados && d.medicamentosZerados.length > 0) {
                alertDiv.classList.remove('hidden'); // Mostra o alerta
                
                // Pega os nomes da lista e formata em negrito: "<strong>Aspirina</strong>, <strong>Dipirona</strong>"
                const nomesFormatados = d.medicamentosZerados.map(nome => `<strong>${nome}</strong>`).join(', ');
                
                alertText.innerHTML = `${d.medicamentosZerados.length} medicamento(s) sem estoque disponível: ${nomesFormatados}. Verifique e providencie o reabastecimento.`;
            } else {
                alertDiv.classList.add('hidden'); // Esconde o alerta se estiver tudo OK
            }
        }
    } catch (error) {
        console.error('Erro ao carregar estatísticas do admin:', error);
    }
}