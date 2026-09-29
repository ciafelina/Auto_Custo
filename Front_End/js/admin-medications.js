let paginaAtual = 1;
const itensPorPagina = 5;
let totalPaginas = 1;
let timeoutBusca;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Data e Segurança
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

    // 2. Eventos da Tela
    document.getElementById('med-search').addEventListener('input', () => {
        clearTimeout(timeoutBusca);
        timeoutBusca = setTimeout(() => { paginaAtual = 1; carregarMedicamentos(); }, 500);
    });

    document.getElementById('btn-prev-page').addEventListener('click', () => {
        if (paginaAtual > 1) { paginaAtual--; carregarMedicamentos(); }
    });

    document.getElementById('btn-next-page').addEventListener('click', () => {
        if (paginaAtual < totalPaginas) { paginaAtual++; carregarMedicamentos(); }
    });

    // 3. Eventos dos Formulários (Modais)
    document.getElementById('form-med').addEventListener('submit', salvarMedicamento);
    document.getElementById('form-stock').addEventListener('submit', salvarEstoque);
    document.getElementById('btn-confirm-delete').addEventListener('click', confirmarExclusao);

    // Carrega a tabela ao abrir
    carregarMedicamentos();
});

// --- FUNÇÕES DE BUSCA ---
async function carregarMedicamentos() {
    const lista = document.getElementById('tabela-medicamentos');
    lista.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">Carregando medicamentos...</td></tr>';

    const token = localStorage.getItem('token_jwt');
    const busca = document.getElementById('med-search').value;

    try {
        const url = new URL('http://localhost:9000/admin/medicamentos');
        url.searchParams.append('page', paginaAtual);
        url.searchParams.append('limit', itensPorPagina);
        if (busca) url.searchParams.append('search', busca);

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) { sairDaConta(); return; }

        const result = await response.json();

        if (response.ok && result.sucesso) {
            const medicamentos = result.dados.lista;
            const total = result.dados.total;

            totalPaginas = Math.ceil(total / itensPorPagina) || 1;
            document.getElementById('lbl-total-meds').textContent = total;
            document.getElementById('lbl-pagina-atual').textContent = paginaAtual;
            document.getElementById('lbl-total-paginas').textContent = totalPaginas;
            document.getElementById('btn-prev-page').disabled = (paginaAtual === 1);
            document.getElementById('btn-next-page').disabled = (paginaAtual === totalPaginas);

            lista.innerHTML = '';

            if (medicamentos.length === 0) {
                lista.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">Nenhum medicamento encontrado.</td></tr>';
                return;
            }

            medicamentos.forEach(med => {
                let badgeStatus = '';
                if (med.estoque === 0) {
                    badgeStatus = '<span class="badge badge-unavailable">Indisponível</span>';
                } else if (med.estoque <= med.estoqueMinimo) {
                    badgeStatus = '<span class="badge badge-low">Crítico</span>';
                } else {
                    badgeStatus = '<span class="badge badge-available">Disponível</span>';
                }

                const medJson = encodeURIComponent(JSON.stringify(med));

                lista.innerHTML += `
                    <tr>
                        <td>
                            <div class="font-semibold text-blue-900">${med.nome}</div>
                            <div class="text-xs text-gray-500 truncate" style="max-width:200px" title="${med.descricao}">${med.descricao || 'Sem descrição'}</div>
                        </td>
                        <td><span class="tag tag-blue">${med.categoria}</span></td>
                        <td class="text-gray-600">${med.dosagem || '-'}</td>
                        <td class="text-gray-600">${med.fabricante || '-'}</td>
                        <td><span class="font-bold ${med.estoque === 0 ? 'text-red-600' : (med.estoque <= med.estoqueMinimo ? 'text-orange-600' : 'text-green-600')}">${med.estoque}</span></td>
                        <td class="text-gray-600">${med.estoqueMinimo}</td>
                        <td>${badgeStatus}</td>
                        <td>
                            <div class="table-actions">
                                <button class="btn btn-outline btn-sm" onclick="abrirModalMedicamento('${medJson}')">✏️</button>
                                <button class="btn btn-outline btn-sm" onclick="abrirModalEstoque(${med.id}, '${med.nome}', ${med.estoque})">📦</button>
                                <button class="btn btn-danger btn-sm" onclick="abrirModalExcluir(${med.id}, '${med.nome}')">🗑️</button>
                            </div>
                        </td>
                    </tr>
                `;
            });
        } else {
            // CORREÇÃO: Se a API voltar com erro (ex: 500 do Delphi), mostra na tela!
            lista.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-red-500">Erro: ${result.mensagem || 'Falha no servidor.'}</td></tr>`;
        }
    } catch (error) {
        lista.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-red-500">Erro de conexão com o servidor.</td></tr>';
    }
}

// --- FUNÇÕES DOS MODAIS DE CADASTRO/EDIÇÃO ---
function abrirModalMedicamento(medJson = null) {
    const modal = document.getElementById('modal-med');
    const form = document.getElementById('form-med');
    const titulo = document.getElementById('modal-med-title');
    
    form.reset(); // Limpa o formulário

    if (medJson) {
        // Modo Edição
        titulo.textContent = 'Editar Medicamento';
        const med = JSON.parse(decodeURIComponent(medJson));
        
        document.getElementById('m-id').value = med.id;
        document.getElementById('m-name').value = med.nome;
        document.getElementById('m-cat').value = med.categoria;
        document.getElementById('m-dos').value = med.dosagem;
        document.getElementById('m-mfr').value = med.fabricante;
        document.getElementById('m-stock').value = med.estoque;
        document.getElementById('m-min').value = med.estoqueMinimo;
        document.getElementById('m-desc').value = med.descricao;
    } else {
        // Modo Inserção
        titulo.textContent = 'Novo Medicamento';
        document.getElementById('m-id').value = '';
    }

    modal.classList.remove('hidden');
}

async function salvarMedicamento(e) {
    e.preventDefault();
    const token = localStorage.getItem('token_jwt');
    const id = document.getElementById('m-id').value;
    const metodo = id ? 'PUT' : 'POST'; // Se tem ID, atualiza. Se não tem, cria.
    const url = id ? `http://localhost:9000/admin/medicamentos/${id}` : `http://localhost:9000/admin/medicamentos`;

    const payload = {
        nome: document.getElementById('m-name').value,
        categoria: document.getElementById('m-cat').value,
        dosagem: document.getElementById('m-dos').value,
        fabricante: document.getElementById('m-mfr').value,
        estoque: parseInt(document.getElementById('m-stock').value),
        estoqueMinimo: parseInt(document.getElementById('m-min').value),
        descricao: document.getElementById('m-desc').value
    };

    try {
        const response = await fetch(url, {
            method: metodo,
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert(id ? 'Medicamento atualizado!' : 'Medicamento cadastrado!');
            fecharModal('modal-med');
            carregarMedicamentos();
        } else {
            const erro = await response.json();
            alert('Erro: ' + erro.mensagem);
        }
    } catch (error) { alert('Falha ao salvar medicamento.'); }
}

// --- FUNÇÕES DE ESTOQUE RÁPIDO ---
function abrirModalEstoque(id, nome, qtdAtual) {
    document.getElementById('stock-id').value = id;
    document.getElementById('stock-med-name').textContent = nome;
    document.getElementById('stock-qty').value = qtdAtual;
    document.getElementById('modal-stock').classList.remove('hidden');
}

async function salvarEstoque(e) {
    e.preventDefault();
    const token = localStorage.getItem('token_jwt');
    const id = document.getElementById('stock-id').value;
    const qtdNova = document.getElementById('stock-qty').value;

    try {
        const response = await fetch(`http://localhost:9000/admin/medicamentos/${id}/estoque`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ estoque: parseInt(qtdNova) })
        });

        if (response.ok) {
            alert('Estoque atualizado!');
            fecharModal('modal-stock');
            carregarMedicamentos();
        } else {
            alert('Erro ao atualizar estoque.');
        }
    } catch (error) { alert('Falha ao comunicar com o servidor.'); }
}

// --- FUNÇÕES DE EXCLUSÃO ---
function abrirModalExcluir(id, nome) {
    document.getElementById('delete-id').value = id;
    document.getElementById('delete-med-name').textContent = nome;
    document.getElementById('modal-confirm').classList.remove('hidden');
}

async function confirmarExclusao() {
    const token = localStorage.getItem('token_jwt');
    const id = document.getElementById('delete-id').value;

    try {
        const response = await fetch(`http://localhost:9000/admin/medicamentos/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            alert('Medicamento excluído!');
            fecharModal('modal-confirm');
            carregarMedicamentos();
        } else {
            alert('Erro ao excluir. O medicamento pode estar vinculado a solicitações de pacientes.');
        }
    } catch (error) { alert('Falha ao excluir.'); }
}

// --- UTILS ---
function fecharModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function sairDaConta(e) {
    if (e) e.preventDefault();
    localStorage.clear();
    window.location.replace('login.html');
}