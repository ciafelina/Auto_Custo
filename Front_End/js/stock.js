let paginaAtual = 1;
const itensPorPagina = 4; 
let totalPaginas = 1;
let timeoutBusca; 

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

    // --- Verificação de Segurança e Dados Locais ---
    const token = localStorage.getItem('token_jwt');
    const cpf = localStorage.getItem('usuario_cpf');
    const nomeUsuario = localStorage.getItem('nome_usuario');
    const cargo = parseInt(localStorage.getItem('usuario_cargo'));

    if (!token || !cpf) {
        window.location.replace('login.html');
        return; 
    }

    // --- LÓGICA DINÂMICA DE CARGO E MENU NA SIDEBAR ---
    const menuPaciente = document.getElementById('menu-paciente');
    const menuAdmin = document.getElementById('menu-admin');
    const lblCargoSidebar = document.getElementById('sidebar-cargo');
    const lblNomeSidebar = document.getElementById('sidebar-nome');
    const avatarSidebar = document.getElementById('sidebar-avatar');

    // Preenche o nome e avatar na barra lateral
    if (lblNomeSidebar && nomeUsuario) lblNomeSidebar.textContent = nomeUsuario;
    if (avatarSidebar && nomeUsuario) {
        avatarSidebar.textContent = nomeUsuario.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }

    // Configura o menu dependendo do cargo
    if (cargo === 1 || cargo === 2) {
        // É Admin ou Funcionário
        if (menuAdmin) menuAdmin.classList.remove('hidden');
        
        if (cargo === 1) {
            const linkUsuarios = document.getElementById('link-usuarios');
            if (linkUsuarios) linkUsuarios.classList.remove('hidden');
            if (lblCargoSidebar) lblCargoSidebar.textContent = 'Administrador';
        } else {
            if (lblCargoSidebar) lblCargoSidebar.textContent = 'Funcionário';
        }
    } else {
        // É Paciente (Cargo 3)
        if (menuPaciente) menuPaciente.classList.remove('hidden');
        if (lblCargoSidebar) lblCargoSidebar.textContent = 'Paciente';
    }

    // --- EVENTOS DE FILTRO ---
    document.getElementById('f-search').addEventListener('input', () => {
        clearTimeout(timeoutBusca);
        timeoutBusca = setTimeout(() => {
            paginaAtual = 1; 
            carregarEstoque();
        }, 500);
    });

    document.getElementById('f-cat').addEventListener('change', () => {
        paginaAtual = 1;
        carregarEstoque();
    });

    document.getElementById('f-avail').addEventListener('change', () => {
        paginaAtual = 1;
        carregarEstoque();
    });

    // --- EVENTOS DE PAGINAÇÃO ---
    document.getElementById('btn-prev-page').addEventListener('click', () => {
        if (paginaAtual > 1) { paginaAtual--; carregarEstoque(); }
    });

    document.getElementById('btn-next-page').addEventListener('click', () => {
        if (paginaAtual < totalPaginas) { paginaAtual++; carregarEstoque(); }
    });

    // --- EVENTO DO MODAL ---
    document.getElementById('form-solicitar').addEventListener('submit', realizarPedido);

    // Carrega a tela pela primeira vez
    carregarEstoque();
});

// --- PROTEÇÃO CONTRA O BOTÃO VOLTAR ---
window.addEventListener('pageshow', (event) => {
    const token = localStorage.getItem('token_jwt');
    if (!token) window.location.replace('login.html');
});

async function carregarEstoque() {
    const lista = document.getElementById('lista-medicamentos');
    lista.innerHTML = '<p class="text-gray-500 text-center mt-4">Carregando estoque...</p>';

    const token = localStorage.getItem('token_jwt'); 

    const busca = document.getElementById('f-search').value;
    const categoria = document.getElementById('f-cat').value;
    const disponibilidade = document.getElementById('f-avail').value;

    try {
        const url = new URL('http://localhost:9000/produtos');
        url.searchParams.append('page', paginaAtual);
        url.searchParams.append('limit', itensPorPagina);
        
        if (busca) url.searchParams.append('search', busca);
        if (categoria) url.searchParams.append('categoria', categoria);
        if (disponibilidade) url.searchParams.append('disponibilidade', disponibilidade);

        const response = await fetch(url, {
            method: 'GET',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            }
        });

        if (response.status === 401) {
            sairDaConta();
            return;
        }

        const resJson = await response.json();

        if (response.ok && resJson.sucesso) {
            const totalRegistros = resJson.resultado.total_registros;
            const medicamentos = resJson.resultado.dados;

            totalPaginas = Math.ceil(totalRegistros / itensPorPagina);
            if (totalPaginas === 0) totalPaginas = 1;

            document.getElementById('lbl-total-registros').textContent = totalRegistros;
            document.getElementById('lbl-pagina-atual').textContent = paginaAtual;
            document.getElementById('lbl-total-paginas').textContent = totalPaginas;

            document.getElementById('btn-prev-page').disabled = (paginaAtual === 1);
            document.getElementById('btn-next-page').disabled = (paginaAtual === totalPaginas);

            lista.innerHTML = '';

            if (medicamentos.length === 0) {
                lista.innerHTML = '<p class="text-gray-500 text-center">Nenhum medicamento encontrado para estes filtros.</p>';
                return;
            }

            medicamentos.forEach(med => {
                let statusClass = '', statusText = '', statusColor = '', btnDisable = '';

                if (med.estoque === 0) {
                    statusClass = 'unavailable'; statusText = 'Indisponível'; statusColor = 'text-red-600'; btnDisable = 'disabled';
                } else if (med.estoque <= 5) {
                    statusClass = 'low'; statusText = 'Crítico'; statusColor = 'text-orange-600';
                } else {
                    statusClass = 'available'; statusText = 'Disponível'; statusColor = 'text-green-600';
                }

                const nomeFormatado = `${med.nome} ${med.dosagem}`;
                const botaoHtml = med.estoque === 0 
                    ? `<button class="btn btn-secondary btn-sm btn-block" disabled>Indisponível</button>`
                    : `<button class="btn btn-primary btn-sm btn-block" onclick="abrirModal(${med.id}, '${nomeFormatado}', ${med.estoque})">🛒 Solicitar</button>`;

                lista.innerHTML += `
                    <article class="card p-6 mb-4" role="listitem">
                      <div class="med-grid">
                        <div>
                          <h3 class="text-blue-900 mb-1" style="font-size:1rem">${med.nome}</h3>
                          <p class="text-sm text-gray-600 mb-3">${med.descricao}</p>
                          <div class="flex gap-2 flex-wrap">
                            <span class="tag tag-blue">${med.categoria}</span>
                            <span class="tag tag-gray">${med.dosagem}</span>
                            <span class="tag tag-gray">${med.fabricante}</span>
                          </div>
                        </div>
                        <div class="stock-box ${statusClass}">
                          <p class="stock-num ${statusColor}">${med.estoque}</p>
                          <p class="text-xs font-semibold ${statusColor}" style="margin-top:.15rem">${statusText}</p>
                        </div>
                        <div style="min-width:110px">
                          ${botaoHtml}
                        </div>
                      </div>
                    </article>
                `;
            });

        } else {
            lista.innerHTML = `<p class="text-red-500 text-center">Erro: ${resJson.mensagem}</p>`;
        }
    } catch (error) {
        console.error('Erro:', error);
        lista.innerHTML = '<p class="text-red-500 text-center">Falha ao conectar com o servidor.</p>';
    }
}

function abrirModal(idMedicamento, nomeMedicamento, estoqueMaximo) {
    document.getElementById('mod-id-med').value = idMedicamento;
    document.getElementById('mod-nome-med').textContent = nomeMedicamento;
    document.getElementById('mod-estoque').textContent = estoqueMaximo;
    
    const inputQty = document.getElementById('req-qty');
    inputQty.value = 1;
    inputQty.max = estoqueMaximo;

    document.getElementById('modal-request').classList.remove('hidden');
}

function fecharModal() {
    document.getElementById('modal-request').classList.add('hidden');
}

async function realizarPedido(e) {
    e.preventDefault();

    const token = localStorage.getItem('token_jwt');
    const cpf = localStorage.getItem('usuario_cpf');
    
    const nomeMedicamento = document.getElementById('mod-nome-med').textContent;
    const quantidadeDigitada = parseInt(document.getElementById('req-qty').value);
    const idMedicamento = parseInt(document.getElementById('mod-id-med').value);

    if (quantidadeDigitada < 1) {
        alert('A quantidade deve ser pelo menos 1.');
        return;
    }

    const payload = {
        cpf: cpf,
        medicamento: nomeMedicamento,
        quantidade: quantidadeDigitada,
        idMedicamento: idMedicamento 
    };

    try {
        const response = await fetch('http://localhost:9000/solicitacoes', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        let result;
        try {
            result = await response.json();
        } catch (err) {
            console.error("Erro ao ler JSON da resposta.");
            alert('Erro crítico no servidor (Delphi). Verifique o console da API.');
            return;
        }

        if (response.ok && result.sucesso) {
            alert('Pedido realizado com sucesso! Você pode acompanhá-lo no seu Dashboard.');
            fecharModal();
            window.location.reload(); 
        } else {
            alert('Erro ao solicitar: ' + (result.mensagem || 'Algo deu errado no servidor.'));
        }
    } catch (error) {
        console.error('Erro na requisição Fetch:', error);
        alert('Falha na comunicação com a API.');
    }
}

function sairDaConta(e) {
    if (e) e.preventDefault(); 
    localStorage.clear();
    window.location.replace('login.html'); 
}