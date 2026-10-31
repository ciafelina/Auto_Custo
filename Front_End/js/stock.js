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
        
        const linkUsuarios = document.getElementById('link-usuarios');
        if (linkUsuarios) linkUsuarios.classList.remove('hidden');
        if (lblCargoSidebar) lblCargoSidebar.textContent = cargo === 1 ? 'Administrador' : 'Funcionário';
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
    document.querySelector('.pedido-aviso-fechar').addEventListener('click', () => {
        document.getElementById('pedido-aviso').classList.add('hidden');
        document.getElementById('f-search').focus();
    });

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
        const url = new URL(Api.url('/produtos'));
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
                const classificacao = Estoque.classificar(med.estoque, med.estoqueMinimo);
                let statusClass = '', statusText = '', statusColor = '';

                if (classificacao === 'out') {
                    statusClass = 'unavailable'; statusText = 'Indisponível'; statusColor = 'text-red-600';
                } else if (classificacao === 'low') {
                    statusClass = 'low'; statusText = 'Crítico'; statusColor = 'text-orange-600';
                } else {
                    statusClass = 'available'; statusText = 'Disponível'; statusColor = 'text-green-600';
                }

                const nomeFormatado = `${med.nome ?? ''} ${med.dosagem ?? ''}`;
                const botao = classificacao === 'out'
                    ? UI.btn('Indisponível', 'btn btn-secondary btn-sm btn-block', () => {}, {disabled: true})
                    : UI.btn('🛒 Solicitar', 'btn btn-primary btn-sm btn-block', () => abrirModal(med.id, nomeFormatado, med.estoque));
                const titulo = UI.el('h3', 'text-blue-900 mb-1', med.nome);
                titulo.style.fontSize = '1rem';
                const dados = UI.add(UI.el('div'), titulo,
                    UI.el('p', 'text-sm text-gray-600 mb-3', med.descricao),
                    UI.add(UI.el('div', 'flex gap-2 flex-wrap'),
                        UI.el('span', 'tag tag-blue', med.categoria),
                        UI.el('span', 'tag tag-gray', med.dosagem),
                        UI.el('span', 'tag tag-gray', med.fabricante)));
                const status = UI.el('p', `text-xs font-semibold ${statusColor}`, statusText);
                status.style.marginTop = '.15rem';
                const saldo = UI.add(UI.el('div', `stock-box ${statusClass}`),
                    UI.el('p', `stock-num ${statusColor}`, med.estoque), status);
                const acoes = UI.add(UI.el('div'), botao);
                acoes.style.minWidth = '110px';
                const card = UI.add(UI.el('article', 'card p-6 mb-4'),
                    UI.add(UI.el('div', 'med-grid'), dados, saldo, acoes));
                card.setAttribute('role', 'listitem');
                lista.append(card);
            });

        } else {
            UI.msg(lista, 'Erro: ' + RespostaApi.mensagemErro(resJson, 'Falha no servidor.'), {className: 'text-red-500 text-center'});
        }
    } catch (error) {
        console.error('Erro:', error);
        lista.innerHTML = '<p class="text-red-500 text-center">Falha ao conectar com o servidor.</p>';
    }
}

function abrirModal(idMedicamento, nomeMedicamento, estoqueMaximo) {
    document.getElementById('pedido-aviso').classList.add('hidden');
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
    const quantidadeDigitada = Number(document.getElementById('req-qty').value);
    const idMedicamento = parseInt(document.getElementById('mod-id-med').value);

    if (!Number.isSafeInteger(quantidadeDigitada) || quantidadeDigitada < 1 || quantidadeDigitada > 2147483647) {
        alert('Informe uma quantidade inteira maior que zero dentro do limite permitido.');
        return;
    }

    const payload = {
        cpf: cpf,
        medicamento: nomeMedicamento,
        quantidade: quantidadeDigitada,
        idMedicamento: idMedicamento 
    };

    try {
        const response = await fetch(Api.url('/solicitacoes'), {
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
            alert('Não foi possível ler a resposta do servidor. Tente novamente.');
            return;
        }

        if (response.ok && result.sucesso) {
            fecharModal();
            const aviso = document.getElementById('pedido-aviso');
            aviso.classList.remove('hidden');
            await carregarEstoque();
            if (!aviso.classList.contains('hidden')) aviso.focus();
        } else {
            alert('Erro ao solicitar: ' + RespostaApi.mensagemErro(result));
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
