let paginaAtual = 1;
const itensPorPagina = 5;
let totalPaginas = 1;
let timeoutBusca;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Data e Segurança (RBAC)
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const meses = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
    const hoje = new Date();
    const elementoData = document.getElementById('data-atual');
    if (elementoData) elementoData.textContent = `${dias[hoje.getDay()]}, ${hoje.getDate()} ${meses[hoje.getMonth()]} ${hoje.getFullYear()}`;

    const token = localStorage.getItem('token_jwt');
    const cpf = localStorage.getItem('usuario_cpf');
    const nomeUsuario = localStorage.getItem('nome_usuario');
    const cargo = parseInt(localStorage.getItem('usuario_cargo'));

    if (!token || !cpf) { window.location.replace('login.html'); return; }
    if (cargo === 3) {
        alert('Acesso negado!');
        window.location.replace('patient-dashboard.html');
        return;
    }

    // Preenche Sidebar
    if (document.getElementById('sidebar-user-name')) document.getElementById('sidebar-user-name').textContent = nomeUsuario;
    if (document.getElementById('sidebar-avatar')) document.getElementById('sidebar-avatar').textContent = nomeUsuario.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    if (document.getElementById('sidebar-role')) document.getElementById('sidebar-role').textContent = cargo === 1 ? 'Administrador' : 'Funcionário';

    // 2. Eventos de Filtro e Busca
    document.getElementById('f-search').addEventListener('input', () => {
        clearTimeout(timeoutBusca);
        timeoutBusca = setTimeout(() => { paginaAtual = 1; carregarSolicitacoes(); }, 500);
    });

    document.getElementById('f-status').addEventListener('change', () => {
        paginaAtual = 1;
        carregarSolicitacoes();
    });

    // 3. Eventos de Paginação
    document.getElementById('btn-prev-page').addEventListener('click', () => {
        if (paginaAtual > 1) { paginaAtual--; carregarSolicitacoes(); }
    });

    document.getElementById('btn-next-page').addEventListener('click', () => {
        if (paginaAtual < totalPaginas) { paginaAtual++; carregarSolicitacoes(); }
    });

    // Carrega a lista pela primeira vez
    carregarSolicitacoes();
});

// --- FUNÇÃO PARA BUSCAR AS SOLICITAÇÕES ---
async function carregarSolicitacoes() {
    const lista = document.getElementById('lista-solicitacoes');
    lista.innerHTML = '<p class="text-center py-4 text-gray-500">Carregando solicitações...</p>';

    const token = localStorage.getItem('token_jwt');
    const busca = document.getElementById('f-search').value;
    const status = document.getElementById('f-status').value;

    try {
        const url = new URL(Api.url('/admin/solicitacoes'));
        url.searchParams.append('page', paginaAtual);
        url.searchParams.append('limit', itensPorPagina);
        if (busca) url.searchParams.append('search', busca);
        if (status) url.searchParams.append('status', status);

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) { sairDaConta(); return; }

        const result = await response.json();

        if (response.ok && result.sucesso) {
            const solicitacoes = result.dados.lista;
            const total = result.dados.total;

            // Paginação
            totalPaginas = Math.ceil(total / itensPorPagina) || 1;
            document.getElementById('lbl-total-reqs').textContent = total;
            document.getElementById('lbl-pagina-atual').textContent = paginaAtual;
            document.getElementById('lbl-total-paginas').textContent = totalPaginas;
            document.getElementById('btn-prev-page').disabled = (paginaAtual === 1);
            document.getElementById('btn-next-page').disabled = (paginaAtual === totalPaginas);

            lista.replaceChildren();

            if (solicitacoes.length === 0) {
                lista.innerHTML = '<p class="text-center py-4 text-gray-500">Nenhuma solicitação encontrada.</p>';
                return;
            }

            // Desenhando os cards
            solicitacoes.forEach(req => {
                let statusClass = '', badgeClass = '', icon = '';
                
                if (req.status === 'Pendente') {
                    statusClass = 'status-pendente'; badgeClass = 'badge-pending'; icon = '⏳';
                } else if (req.status === 'Aprovado') {
                    statusClass = 'status-aprovado'; badgeClass = 'badge-approved'; icon = '✅';
                } else if (req.status === 'Retirado') {
                    statusClass = 'status-retirado'; badgeClass = 'badge-withdrawn'; icon = '📤';
                } else {
                    statusClass = 'status-cancelado'; badgeClass = 'badge-cancelled'; icon = '❌';
                }

                // Botões Rápidos baseados no Status
                const botoesRapidos = UI.add(UI.el('div', 'flex gap-2 flex-shrink-0'),
                    UI.btn('🔍 Detalhes', 'btn btn-outline btn-sm', () => abrirModalDetalhes(req)));
                if (req.status === 'Pendente') {
                    UI.add(botoesRapidos,
                        UI.btn('✅ Aprovar', 'btn btn-primary btn-sm', () => alterarStatus(req.id, 'Aprovado')),
                        UI.btn('✕ Rejeitar', 'btn btn-secondary btn-sm', () => alterarStatus(req.id, 'Cancelado')));
                } else if (req.status === 'Aprovado') {
                    UI.add(botoesRapidos, UI.btn('📤 Confirmar Retirada', 'btn btn-primary btn-sm', () => alterarStatus(req.id, 'Retirado')));
                }

                const card = UI.el('article', `card request-card ${statusClass} mb-3`);
                card.setAttribute('role', 'listitem');
                const info = UI.el('div');
                info.style.flex = '1';
                const statusIcon = UI.el('span', '', icon);
                statusIcon.setAttribute('aria-hidden', 'true');
                UI.add(info,
                    UI.add(UI.el('div', 'flex items-center gap-3 mb-2 flex-wrap'),
                        statusIcon,
                        UI.el('strong', 'text-blue-900', `Sol. #${req.id} — ${req.medicamento}`),
                        UI.el('span', `badge ${badgeClass}`, req.status)),
                    UI.add(UI.el('dl', 'flex flex-wrap gap-6 text-sm mt-2'),
                        UI.detail('Paciente', req.nomePaciente),
                        UI.detail('CPF', req.cpfPaciente),
                        UI.detail('Quantidade', req.quantidade),
                        UI.detail('Solicitado em', req.dataSolicitacao)));
                UI.add(lista, UI.add(card,
                    UI.add(UI.el('div', 'flex items-center justify-between flex-wrap gap-3'), info, botoesRapidos)));
            });
        } else {
            UI.msg(lista, `Erro: ${RespostaApi.mensagemErro(result)}`, { className: 'text-center py-4 text-red-500' });
        }
    } catch (error) {
        lista.innerHTML = '<p class="text-center py-4 text-red-500">Erro de conexão com o servidor.</p>';
    }
}

// --- FUNÇÕES DO MODAL E AÇÕES ---
function abrirModalDetalhes(reqJson) {
    const req = typeof reqJson === 'string' ? JSON.parse(decodeURIComponent(reqJson)) : reqJson;
    
    document.getElementById('mod-req-id').value = req.id;
    document.getElementById('mod-req-med').textContent = req.medicamento;
    document.getElementById('mod-req-paciente').textContent = `${req.nomePaciente} (${req.cpfPaciente})`;
    document.getElementById('mod-req-qtd').textContent = `${req.quantidade} unidade(s)`;
    
    // Status Badge
    let badgeClass = req.status === 'Pendente' ? 'badge-pending' : 
                     req.status === 'Aprovado' ? 'badge-approved' : 
                     req.status === 'Retirado' ? 'badge-withdrawn' : 'badge-cancelled';
    document.getElementById('mod-req-status').replaceChildren(UI.el('span', `badge ${badgeClass}`, req.status));

    // Histórico de Datas
    const dates = document.getElementById('mod-req-dates');
    dates.replaceChildren(document.createTextNode(`Solicitado em: ${req.dataSolicitacao}`));
    if (req.dataAtualizacao) UI.add(dates, UI.el('br'), document.createTextNode(`Última atualização: ${req.dataAtualizacao}`));

    // Observação
    const inputObs = document.getElementById('mod-req-obs');
    inputObs.value = req.observacao || '';
    
    // Configura botões do Modal baseado no status
    const divActions = document.getElementById('mod-req-actions');
    const botoes = [UI.btn('Fechar', 'btn btn-outline btn-sm', () => fecharModal('modal-detail'))];
    
    if (req.status === 'Pendente') {
        botoes.push(
            UI.btn('✅ Aprovar', 'btn btn-primary btn-sm', () => alterarStatus(req.id, 'Aprovado', true)),
            UI.btn('✕ Rejeitar', 'btn btn-secondary btn-sm', () => alterarStatus(req.id, 'Cancelado', true)));
        inputObs.readOnly = false;
    } else if (req.status === 'Aprovado') {
        botoes.push(UI.btn('📤 Confirmar Retirada', 'btn btn-primary btn-sm', () => alterarStatus(req.id, 'Retirado', true)));
        inputObs.readOnly = false;
    } else {
        inputObs.readOnly = true; // Se já foi finalizado, não edita mais a observação
    }
    
    divActions.replaceChildren(...botoes);
    document.getElementById('modal-detail').classList.remove('hidden');
}

async function alterarStatus(id, novoStatus, usarObservacaoDoModal = false) {
    const payload = { status: novoStatus };
    const modal = document.getElementById('modal-detail');
    const campoId = document.getElementById('mod-req-id');
    if (usarObservacaoDoModal) {
        if (modal.classList.contains('hidden') || campoId.value !== String(id)) {
            alert('Abra os detalhes desta solicitação antes de salvar a observação.');
            return;
        }
        payload.observacao = document.getElementById('mod-req-obs').value;
    }

    let acao = novoStatus === 'Aprovado' ? 'aprovar' : novoStatus === 'Cancelado' ? 'rejeitar' : 'retirar';
    let msgConfirm = `Confirma a ação de ${acao.toUpperCase()} esta solicitação?`;
    
    if (!confirm(msgConfirm)) return;

    const token = localStorage.getItem('token_jwt');

    try {
        const response = await fetch(Api.url(`/admin/solicitacoes/${id}/status`), {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.sucesso) {
            alert('Status atualizado com sucesso!');
            if (usarObservacaoDoModal && campoId.value === String(id)) {
                fecharModal('modal-detail');
            }
            carregarSolicitacoes(); // Recarrega a lista para mostrar a mudança
        } else {
            alert('Erro: ' + RespostaApi.mensagemErro(result, 'Não foi possível alterar o status.'));
        }
    } catch (error) {
        alert('Falha na comunicação com o servidor.');
    }
}

// --- UTILS ---
function fecharModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    if (modalId === 'modal-detail') {
        document.getElementById('mod-req-id').value = '';
        document.getElementById('mod-req-obs').value = '';
        document.getElementById('mod-req-actions').replaceChildren();
    }
}

// Proteção do Botão Voltar
window.addEventListener('pageshow', (event) => {
    const token = localStorage.getItem('token_jwt');
    const cargo = parseInt(localStorage.getItem('usuario_cargo'));
    if (!token) window.location.replace('login.html');
    else if (cargo === 3) window.location.replace('patient-dashboard.html');
});

function sairDaConta(e) {
    if (e) e.preventDefault(); 
    localStorage.clear();
    window.location.replace('login.html');
}
