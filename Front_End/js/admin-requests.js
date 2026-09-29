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
        const url = new URL('http://localhost:9000/admin/solicitacoes');
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

            lista.innerHTML = '';

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

                // Encoda o objeto para passar limpo para o Modal
                const reqJson = encodeURIComponent(JSON.stringify(req));

                // Botões Rápidos baseados no Status
                let botoesRapidos = `<button class="btn btn-outline btn-sm" onclick="abrirModalDetalhes('${reqJson}')">🔍 Detalhes</button>`;
                if (req.status === 'Pendente') {
                    botoesRapidos += `
                        <button class="btn btn-primary btn-sm" onclick="alterarStatus(${req.id}, 'Aprovado')">✅ Aprovar</button>
                        <button class="btn btn-secondary btn-sm" onclick="alterarStatus(${req.id}, 'Cancelado')">✕ Rejeitar</button>
                    `;
                } else if (req.status === 'Aprovado') {
                    botoesRapidos += `<button class="btn btn-primary btn-sm" onclick="alterarStatus(${req.id}, 'Retirado')">📤 Confirmar Retirada</button>`;
                }

                lista.innerHTML += `
                    <article class="card request-card ${statusClass} mb-3" role="listitem">
                      <div class="flex items-center justify-between flex-wrap gap-3">
                        <div style="flex:1">
                          <div class="flex items-center gap-3 mb-2 flex-wrap">
                            <span aria-hidden="true">${icon}</span>
                            <strong class="text-blue-900">Sol. #${req.id} — ${req.medicamento}</strong>
                            <span class="badge ${badgeClass}">${req.status}</span>
                          </div>
                          <dl class="flex flex-wrap gap-6 text-sm mt-2">
                            <div><dt class="text-gray-500">Paciente</dt><dd class="font-semibold">${req.nomePaciente}</dd></div>
                            <div><dt class="text-gray-500">CPF</dt><dd class="font-semibold">${req.cpfPaciente}</dd></div>
                            <div><dt class="text-gray-500">Quantidade</dt><dd class="font-semibold">${req.quantidade}</dd></div>
                            <div><dt class="text-gray-500">Solicitado em</dt><dd class="font-semibold">${req.dataSolicitacao}</dd></div>
                          </dl>
                        </div>
                        <div class="flex gap-2 flex-shrink-0">
                          ${botoesRapidos}
                        </div>
                      </div>
                    </article>
                `;
            });
        } else {
            lista.innerHTML = `<p class="text-center py-4 text-red-500">Erro: ${result.mensagem}</p>`;
        }
    } catch (error) {
        lista.innerHTML = '<p class="text-center py-4 text-red-500">Erro de conexão com o servidor.</p>';
    }
}

// --- FUNÇÕES DO MODAL E AÇÕES ---
function abrirModalDetalhes(reqJson) {
    const req = JSON.parse(decodeURIComponent(reqJson));
    
    document.getElementById('mod-req-id').value = req.id;
    document.getElementById('mod-req-med').textContent = req.medicamento;
    document.getElementById('mod-req-paciente').textContent = `${req.nomePaciente} (${req.cpfPaciente})`;
    document.getElementById('mod-req-qtd').textContent = `${req.quantidade} unidade(s)`;
    
    // Status Badge
    let badgeClass = req.status === 'Pendente' ? 'badge-pending' : 
                     req.status === 'Aprovado' ? 'badge-approved' : 
                     req.status === 'Retirado' ? 'badge-withdrawn' : 'badge-cancelled';
    document.getElementById('mod-req-status').innerHTML = `<span class="badge ${badgeClass}">${req.status}</span>`;

    // Histórico de Datas
    let dates = `Solicitado em: ${req.dataSolicitacao}`;
    if (req.dataAtualizacao) dates += `<br>Última atualização: ${req.dataAtualizacao}`;
    document.getElementById('mod-req-dates').innerHTML = dates;

    // Observação
    const inputObs = document.getElementById('mod-req-obs');
    inputObs.value = req.observacao || '';
    
    // Configura botões do Modal baseado no status
    const divActions = document.getElementById('mod-req-actions');
    let botoes = `<button type="button" class="btn btn-outline btn-sm" onclick="fecharModal('modal-detail')">Fechar</button>`;
    
    if (req.status === 'Pendente') {
        botoes += `
            <button type="button" class="btn btn-primary btn-sm" onclick="alterarStatus(${req.id}, 'Aprovado')">✅ Aprovar</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="alterarStatus(${req.id}, 'Cancelado')">✕ Rejeitar</button>
        `;
        inputObs.readOnly = false;
    } else if (req.status === 'Aprovado') {
        botoes += `<button type="button" class="btn btn-primary btn-sm" onclick="alterarStatus(${req.id}, 'Retirado')">📤 Confirmar Retirada</button>`;
        inputObs.readOnly = false;
    } else {
        inputObs.readOnly = true; // Se já foi finalizado, não edita mais a observação
    }
    
    divActions.innerHTML = botoes;
    document.getElementById('modal-detail').classList.remove('hidden');
}

async function alterarStatus(id, novoStatus) {
    let acao = novoStatus === 'Aprovado' ? 'aprovar' : novoStatus === 'Cancelado' ? 'rejeitar' : 'retirar';
    let msgConfirm = `Confirma a ação de ${acao.toUpperCase()} esta solicitação?`;
    
    if (!confirm(msgConfirm)) return;

    const token = localStorage.getItem('token_jwt');
    // Pega a observação (caso o admin tenha digitado o motivo da rejeição no modal)
    const observacao = document.getElementById('mod-req-obs').value;

    try {
        const response = await fetch(`http://localhost:9000/admin/solicitacoes/${id}/status`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: novoStatus, observacao: observacao })
        });

        const result = await response.json();

        if (response.ok && result.sucesso) {
            alert('Status atualizado com sucesso!');
            fecharModal('modal-detail');
            carregarSolicitacoes(); // Recarrega a lista para mostrar a mudança
        } else {
            alert('Erro: ' + (result.mensagem || 'Não foi possível alterar o status.'));
        }
    } catch (error) {
        alert('Falha na comunicação com o servidor.');
    }
}

// --- UTILS ---
function fecharModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
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