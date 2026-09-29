let paginaAtual = 1;
const itensPorPagina = 5;

document.addEventListener('DOMContentLoaded', () => {
    // --- Lógica da Data ---
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const meses = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
    const hoje = new Date();
    
    const dataFormatada = `${dias[hoje.getDay()]}, ${hoje.getDate()} ${meses[hoje.getMonth()]} ${hoje.getFullYear()}`;
    const elementoData = document.getElementById('data-atual');
    if (elementoData) {
        elementoData.textContent = dataFormatada;
    }
    
    // --- Verificação de Segurança ---
    const token = localStorage.getItem('token_jwt');
    const cpf = localStorage.getItem('usuario_cpf');

    if (!token || !cpf) {
        window.location.replace('login.html'); // Usando replace para não ficar no histórico
        return;
    }

    // --- Paginação ---
    document.getElementById('btn-prev').addEventListener('click', () => {
        if (paginaAtual > 1) { paginaAtual--; carregarDashboard(); }
    });

    document.getElementById('btn-next').addEventListener('click', () => {
        paginaAtual++;
        carregarDashboard();
    });

    carregarDashboard();
});

async function carregarDashboard() {
    const token = localStorage.getItem('token_jwt');
    const cpf = localStorage.getItem('usuario_cpf');
    const nomeUsuario = localStorage.getItem('nome_usuario');
    
    const lista = document.getElementById('lista-solicitacoes');

    // 1. Atualiza Nome Principal (Com proteção caso esteja vazio)
    const primeiroNome = nomeUsuario ? nomeUsuario.split(' ')[0] : 'Usuário';
    document.getElementById('welcome-name').textContent = primeiroNome;

    // 2. ATUALIZA NOME DA BARRA LATERAL
    const sidebarName = document.getElementById('sidebar-user-name');
    const sidebarAvatar = document.getElementById('sidebar-avatar');

    if (sidebarName && nomeUsuario) {
        sidebarName.textContent = nomeUsuario;
    }

    if (sidebarAvatar && nomeUsuario) {
        const iniciais = nomeUsuario.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        sidebarAvatar.textContent = iniciais;
    }

    // 3. Garante que mostre o carregando de forma dinâmica antes da API responder
    lista.innerHTML = '<p class="text-gray-500">Carregando solicitações...</p>';

    // 4. Busca os Dados na API
    try {
        const response = await fetch(`http://localhost:9000/dashboard/paciente/${cpf}?page=${paginaAtual}&limit=${itensPorPagina}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // Se o token expirar
        if (response.status === 401) {
            sairDaConta();
            return;
        }

        const result = await response.json();

        if (response.ok && result.sucesso) {
            const d = result.dados;

            // Stats (Se vier nulo do banco, garante que mostre 0)
            document.getElementById('stats-total').textContent = d.total || 0;
            document.getElementById('stats-pendente').textContent = d.pendentes || 0;
            document.getElementById('stats-aprovado').textContent = d.aprovados || 0;
            document.getElementById('stats-reprovado').textContent = d.reprovados || 0;

            // Segurança extra para verificar se existe a lista
            const qtdSolicitacoes = d.solicitacoes ? d.solicitacoes.length : 0;

            // Paginação
            document.getElementById('lbl-page').textContent = paginaAtual;
            document.getElementById('btn-prev').disabled = (paginaAtual === 1);
            document.getElementById('btn-next').disabled = (qtdSolicitacoes < itensPorPagina);

            lista.innerHTML = ''; 

            // --- NOVA LÓGICA DE TELA VAZIA ---
            if (qtdSolicitacoes === 0) {
                if (d.total === 0) {
                    // Se o total no banco for 0, o usuário nunca fez pedidos
                    lista.innerHTML = `
                        <div class="text-center p-6 border border-dashed border-gray-300" style="border-radius: 8px; background-color: #f9fafb;">
                            <p class="text-gray-600 mb-2 font-medium">Você ainda não tem nenhuma solicitação.</p>
                            <a href="stock.html" class="text-blue-600 hover:text-blue-800 font-semibold" style="text-decoration: underline;">
                                Ir para o Estoque →
                            </a>
                        </div>
                    `;
                } else {
                    // Se ele tem pedidos, mas chegou na última página
                    lista.innerHTML = '<p class="text-gray-500 mt-4">Fim do histórico de solicitações.</p>';
                }
                return;
            }

            // Se tem dados, desenha os cards
            d.solicitacoes.forEach(s => {
                let badgeClass = '', statusClass = '', icon = '', extraInfo = '', btnAction = '';

                if (s.status === 'Aprovado') {
                    statusClass = 'status-aprovado'; badgeClass = 'badge-approved'; icon = '✅';
                    btnAction = `<button class="btn btn-primary btn-sm flex-shrink-0" onclick="confirmarRetirada(${s.id})">Confirmar Retirada</button>`;
                } else if (s.status === 'Pendente') {
                    statusClass = 'status-pendente'; badgeClass = 'badge-pending'; icon = '⏳';
                    extraInfo = `<p class="text-sm text-gray-600 mt-2">Aguardando análise da farmácia.</p>`;
                } else if (s.status === 'Retirado') {
                    statusClass = 'status-retirado'; badgeClass = 'badge-withdrawn'; icon = '📤';
                } else {
                    statusClass = 'status-cancelado'; badgeClass = 'badge-cancelled'; icon = '❌';
                }
                
                lista.innerHTML += `
                    <article class="card request-card ${statusClass} mb-3">
                      <div class="flex items-center justify-between flex-wrap gap-3">
                        <div style="flex:1">
                          <div class="flex items-center gap-3 mb-2 flex-wrap">
                            <span aria-hidden="true">${icon}</span>
                            <strong class="text-blue-900">${s.medicamento}</strong>
                            <span class="badge ${badgeClass}">${s.status}</span>
                          </div>
                          <dl class="flex flex-wrap gap-6 text-sm mt-2">
                            <div><dt class="text-gray-500">Nº Pedido</dt><dd class="font-semibold">#${s.id}</dd></div>
                            <div><dt class="text-gray-500">Qtd</dt><dd class="font-semibold">${s.quantidade}</dd></div>
                            <div><dt class="text-gray-500">Data</dt><dd class="font-semibold">${s.data}</dd></div>
                          </dl>
                          ${extraInfo}
                        </div>
                        ${btnAction}
                      </div>
                    </article>
                `;
            });
        } else {
            // Se a API não voltar sucesso, tira o "carregando" e avisa o erro
            lista.innerHTML = '<p class="text-red-500 mt-4">Nenhum dado encontrado.</p>';
        }
    } catch (error) { 
        console.error("Erro na API: ", error); 
        // Se a API cair ou demorar, ele avisa em vez de travar no "carregando"
        lista.innerHTML = '<p class="text-red-500 mt-4">Falha na comunicação com o servidor.</p>';
    }
}

async function confirmarRetirada(id) {
    if (!confirm('Você confirma que retirou este medicamento na unidade?')) return;

    const token = localStorage.getItem('token_jwt');
    try {
        const response = await fetch(`http://localhost:9000/solicitacoes/${id}/retirada`, {
            method: 'PATCH', 
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            alert('Retirada confirmada com sucesso!');
            carregarDashboard(); 
        }
    } catch (error) { alert('Erro ao confirmar retirada.'); }
}

// --- FUNÇÃO PARA SAIR DA CONTA ---
function sairDaConta(e) {
    if (e) e.preventDefault(); 
    localStorage.clear();
    // Usando replace para impedir o retorno
    window.location.replace('login.html');
}

// --- PROTEÇÃO CONTRA O BOTÃO VOLTAR ---
window.addEventListener('pageshow', (event) => {
    const token = localStorage.getItem('token_jwt');
    if (!token) {
        window.location.replace('login.html'); 
    }
});