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
        timeoutBusca = setTimeout(() => { paginaAtual = 1; carregarUsuarios(); }, 500);
    });

    document.getElementById('f-cargo').addEventListener('change', () => { paginaAtual = 1; carregarUsuarios(); });
    document.getElementById('f-status').addEventListener('change', () => { paginaAtual = 1; carregarUsuarios(); });

    // 3. Eventos de Paginação
    document.getElementById('btn-prev-page').addEventListener('click', () => {
        if (paginaAtual > 1) { paginaAtual--; carregarUsuarios(); }
    });

    document.getElementById('btn-next-page').addEventListener('click', () => {
        if (paginaAtual < totalPaginas) { paginaAtual++; carregarUsuarios(); }
    });

    // --- NOVA MÁSCARA DO CPF NO MODAL ---
    const inputCpfAdmin = document.getElementById('u-cpf');
    const cpfErrorAdmin = document.getElementById('u-cpf-error');

    if (inputCpfAdmin) {
        inputCpfAdmin.addEventListener('input', function (e) {
            let value = e.target.value;
            value = value.replace(/\D/g, ""); // Tira letras
            value = value.replace(/(\d{3})(\d)/, "$1.$2");
            value = value.replace(/(\d{3})(\d)/, "$1.$2");
            value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
            e.target.value = value;
            
            // Esconde a mensagem de erro se o usuário voltar a digitar
            if(cpfErrorAdmin) cpfErrorAdmin.classList.add('hidden');
            inputCpfAdmin.style.borderColor = '';
        });
    }

    // 4. Eventos de Submit dos Modais
    document.getElementById('form-user').addEventListener('submit', salvarUsuario);
    document.getElementById('form-role').addEventListener('submit', salvarCargo);
    document.getElementById('btn-confirm-status').addEventListener('click', confirmarStatus);

    // Carrega a lista inicial
    carregarUsuarios();
});

// --- FUNÇÃO PARA BUSCAR OS USUÁRIOS ---
async function carregarUsuarios() {
    const lista = document.getElementById('tabela-usuarios');
    lista.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-gray-500">Carregando usuários...</td></tr>';

    const token = localStorage.getItem('token_jwt');
    const busca = document.getElementById('f-search').value;
    const filtroCargo = document.getElementById('f-cargo').value;
    const filtroStatus = document.getElementById('f-status').value;

    try {
        const url = new URL('http://localhost:9000/admin/usuarios');
        url.searchParams.append('page', paginaAtual);
        url.searchParams.append('limit', itensPorPagina);
        if (busca) url.searchParams.append('search', busca);
        if (filtroCargo && filtroCargo !== "0") url.searchParams.append('cargo', filtroCargo);
        if (filtroStatus) url.searchParams.append('status', filtroStatus);

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) { sairDaConta(); return; }

        const result = await response.json();

        if (response.ok && result.sucesso) {
            const usuarios = result.dados.lista;
            
            // Preenche os cards de estatísticas
            document.getElementById('stat-total-users').textContent = result.dados.total;
            document.getElementById('stat-admins').textContent = result.dados.totalAdmins;
            document.getElementById('stat-funcionarios').textContent = result.dados.totalFuncionarios;
            document.getElementById('stat-pacientes').textContent = result.dados.totalPacientes;

            // Paginação
            totalPaginas = Math.ceil(result.dados.totalLista / itensPorPagina) || 1;
            document.getElementById('lbl-total-list').textContent = result.dados.totalLista;
            document.getElementById('lbl-pagina-atual').textContent = paginaAtual;
            document.getElementById('lbl-total-paginas').textContent = totalPaginas;
            document.getElementById('btn-prev-page').disabled = (paginaAtual === 1);
            document.getElementById('btn-next-page').disabled = (paginaAtual === totalPaginas);

            lista.innerHTML = '';

            if (usuarios.length === 0) {
                lista.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-gray-500">Nenhum usuário encontrado.</td></tr>';
                return;
            }

            usuarios.forEach(user => {
                const iniciais = user.nome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                
                // Formatação do Cargo
                let cargoHtml = '';
                if (user.idCargo === 1) cargoHtml = '<span class="role-tag">🛡️ Administrador</span>';
                else if (user.idCargo === 2) cargoHtml = '<span class="role-tag">💊 Funcionário</span>';
                else if (user.idCargo === 3) cargoHtml = '<span class="role-tag" style="background:var(--gray-100);color:var(--gray-700);border-color:var(--gray-300)">🧑‍⚕️ Paciente</span>';
                else cargoHtml = '<span class="role-empty">Nenhum cargo</span>';

                // Formatação do Status
                const isAtivo = user.status === 'Ativo';
                const statusHtml = isAtivo 
                    ? '<div class="flex items-center gap-2"><span class="status-dot active"></span><span class="text-sm font-semibold text-green-600">Ativo</span></div>'
                    : '<div class="flex items-center gap-2"><span class="status-dot inactive"></span><span class="text-sm font-semibold text-gray-500">Inativo</span></div>';

                const opacity = isAtivo ? '1' : '0.6';

                // Encode para os botões do modal
                const userJson = encodeURIComponent(JSON.stringify(user));

                // Botão de Ativar/Desativar
                const btnStatus = isAtivo
                    ? `<button class="btn btn-danger btn-sm" onclick="abrirModalStatus('${user.cpf}', '${user.nome}', true)" title="Desativar">🚫</button>`
                    : `<button class="btn btn-success btn-sm" onclick="abrirModalStatus('${user.cpf}', '${user.nome}', false)" title="Reativar">✅ Reativar</button>`;

                lista.innerHTML += `
                    <tr style="opacity: ${opacity}">
                        <td>
                            <div class="flex items-center gap-3">
                                <div class="user-avatar" ${!isAtivo ? 'style="background:var(--gray-400)"' : ''}>${iniciais}</div>
                                <div>
                                    <div class="font-semibold ${isAtivo ? 'text-blue-900' : 'text-gray-600'}">${user.nome}</div>
                                </div>
                            </div>
                        </td>
                        <td class="${isAtivo ? 'text-gray-600' : 'text-gray-400'} text-sm">${user.cpfFormatado}</td>
                        <td class="${isAtivo ? 'text-gray-600' : 'text-gray-400'} text-sm">${user.email}</td>
                        <td>${cargoHtml}</td>
                        <td>${statusHtml}</td>
                        <td>
                            <div class="table-actions">
                                <button class="btn btn-primary btn-sm" onclick="abrirModalCargo('${user.cpf}', '${user.nome}', ${user.idCargo}, '${iniciais}')">+ Cargo</button>
                                <button class="btn btn-outline btn-sm" onclick="abrirModalEditarUsuario('${userJson}')">✏️</button>
                                ${btnStatus}
                            </div>
                        </td>
                    </tr>
                `;
            });
        } else {
            lista.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-red-500">Erro: ${result.mensagem}</td></tr>`;
        }
    } catch (error) {
        lista.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-red-500">Erro de conexão com o servidor.</td></tr>';
    }
}

// --- VALIDAÇÃO MATEMÁTICA DE CPF ---
function validarCPF(cpf) {
    cpf = cpf.replace(/\D/g, '');
    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false; // Bloqueia 00000000000, 11111111111...
    let soma = 0, resto;
    for (let i = 1; i <= 9; i++) soma += parseInt(cpf.substring(i-1, i)) * (11 - i);
    resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;
    soma = 0;
    for (let i = 1; i <= 10; i++) soma += parseInt(cpf.substring(i-1, i)) * (12 - i);
    resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(10, 11))) return false;
    return true;
}

// --- MODAL: NOVO / EDITAR USUÁRIO ---
function abrirModalNovoUsuario() {
    document.getElementById('form-user').reset();
    document.getElementById('u-modo').value = 'novo';
    document.getElementById('user-title').textContent = 'Novo Usuário';
    
    // Libera edição do CPF e esconde erros antigos
    const cpfInput = document.getElementById('u-cpf');
    cpfInput.readOnly = false;
    cpfInput.classList.remove('bg-gray-100');
    cpfInput.style.borderColor = '';
    const cpfError = document.getElementById('u-cpf-error');
    if(cpfError) cpfError.classList.add('hidden');
    document.getElementById('u-cpf-hint').textContent = 'O CPF será usado como login.';
    
    // Mostra campo de senha
    document.getElementById('u-pass').parentElement.classList.remove('hidden');
    document.getElementById('modal-user').classList.remove('hidden');
}

function abrirModalEditarUsuario(userJson) {
    const user = JSON.parse(decodeURIComponent(userJson));
    document.getElementById('form-user').reset();
    
    document.getElementById('u-modo').value = 'editar';
    document.getElementById('user-title').textContent = 'Editar Usuário';
    
    document.getElementById('u-name').value = user.nome;
    document.getElementById('u-email').value = user.email;
    
    // Bloqueia o CPF (não pode mudar CPF de conta existente para não quebrar chaves estrangeiras)
    const cpfInput = document.getElementById('u-cpf');
    cpfInput.value = user.cpfFormatado;
    cpfInput.readOnly = true;
    cpfInput.classList.add('bg-gray-100');
    cpfInput.style.borderColor = '';
    const cpfError = document.getElementById('u-cpf-error');
    if(cpfError) cpfError.classList.add('hidden');
    document.getElementById('u-cpf-hint').textContent = 'O CPF não pode ser alterado.';
    
    // Esconde a senha na edição básica
    document.getElementById('u-pass').parentElement.classList.add('hidden');
    
    document.getElementById('modal-user').classList.remove('hidden');
}

async function salvarUsuario(e) {
    e.preventDefault();
    
    const form = document.getElementById('form-user');
    
    // 1. Validação Nativa (Exige que tudo com 'required' esteja preenchido e e-mail seja válido)
    if (!form.checkValidity()) {
        form.reportValidity(); 
        return; 
    }

    const token = localStorage.getItem('token_jwt');
    const modo = document.getElementById('u-modo').value;
    const cpfRaw = document.getElementById('u-cpf').value;
    const inputPass = document.getElementById('u-pass').value;
    
    // 2. Validação Matemática do CPF (Somente ao cadastrar 'novo')
    if (modo === 'novo') {
        if (!validarCPF(cpfRaw)) {
            const cpfErrorAdmin = document.getElementById('u-cpf-error');
            const inputCpfAdmin = document.getElementById('u-cpf');
            if (cpfErrorAdmin) cpfErrorAdmin.classList.remove('hidden');
            inputCpfAdmin.style.borderColor = 'var(--red-600)';
            inputCpfAdmin.focus();
            return;
        }

        if (!inputPass) {
            alert('A senha é obrigatória para novos usuários.');
            return;
        }
    }

    const payload = {
        nome: document.getElementById('u-name').value,
        email: document.getElementById('u-email').value
    };

    let url = 'http://localhost:9000/admin/usuarios';
    let metodo = 'POST';

    if (modo === 'novo') {
        payload.cpf = cpfRaw.replace(/\D/g, ''); // Só números
        payload.senha = inputPass;
    } else {
        // Modo edição
        metodo = 'PUT';
        const cpfLimpo = cpfRaw.replace(/\D/g, '');
        url = `http://localhost:9000/admin/usuarios/${cpfLimpo}`;
    }

    try {
        const response = await fetch(url, {
            method: metodo,
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert(modo === 'novo' ? 'Usuário criado com sucesso!' : 'Usuário atualizado!');
            fecharModal('modal-user');
            carregarUsuarios();
        } else {
            const erro = await response.json();
            alert('Erro: ' + (erro.mensagem || 'Falha ao salvar.'));
        }
    } catch (error) { alert('Erro na comunicação com a API.'); }
}

// --- MODAL: DEFINIR CARGO ---
function abrirModalCargo(cpf, nome, idCargoAtual, iniciais) {
    document.getElementById('role-user-id').value = cpf;
    document.getElementById('role-name').textContent = nome;
    document.getElementById('role-cpf').textContent = cpf;
    document.getElementById('role-avatar').textContent = iniciais;

    // Marca o radio button correspondente ao cargo atual
    const radios = document.getElementsByName('idCargo');
    for (let i = 0; i < radios.length; i++) {
        radios[i].checked = (parseInt(radios[i].value) === idCargoAtual);
    }

    document.getElementById('modal-role').classList.remove('hidden');
}

async function salvarCargo(e) {
    e.preventDefault();
    const token = localStorage.getItem('token_jwt');
    const cpf = document.getElementById('role-user-id').value;
    
    let novoCargo = 0;
    const radios = document.getElementsByName('idCargo');
    for (let i = 0; i < radios.length; i++) {
        if (radios[i].checked) { novoCargo = parseInt(radios[i].value); break; }
    }

    if (novoCargo === 0) { alert('Selecione um cargo.'); return; }

    try {
        const response = await fetch(`http://localhost:9000/admin/usuarios/${cpf}/cargo`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ idCargo: novoCargo })
        });

        if (response.ok) {
            alert('Cargo atualizado com sucesso!');
            fecharModal('modal-role');
            carregarUsuarios();
        } else {
            alert('Erro ao atualizar cargo.');
        }
    } catch (error) { alert('Falha de conexão.'); }
}

// --- MODAL: ATIVAR/DESATIVAR STATUS ---
function abrirModalStatus(cpf, nome, isAtivo) {
    document.getElementById('st-user-cpf').value = cpf;
    document.getElementById('st-user-name').textContent = nome;
    
    const titulo = document.getElementById('status-title');
    const acaoNome = document.getElementById('st-acao-nome');
    const alertBox = document.getElementById('st-alert-box');
    const btnConfirmar = document.getElementById('btn-confirm-status');
    const inputNovoStatus = document.getElementById('st-novo-status');

    if (isAtivo) {
        titulo.textContent = 'Desativar Usuário';
        acaoNome.textContent = 'desativar';
        alertBox.classList.remove('hidden'); // Mostra aviso de perda de acesso
        btnConfirmar.className = 'btn btn-danger btn-sm';
        btnConfirmar.textContent = 'Desativar';
        inputNovoStatus.value = 'Inativo';
    } else {
        titulo.textContent = 'Reativar Usuário';
        acaoNome.textContent = 'reativar';
        alertBox.classList.add('hidden'); // Esconde aviso
        btnConfirmar.className = 'btn btn-success btn-sm';
        btnConfirmar.textContent = '✅ Reativar';
        inputNovoStatus.value = 'Ativo';
    }

    document.getElementById('modal-status').classList.remove('hidden');
}

async function confirmarStatus() {
    const token = localStorage.getItem('token_jwt');
    const cpf = document.getElementById('st-user-cpf').value;
    const novoStatus = document.getElementById('st-novo-status').value;

    try {
        const response = await fetch(`http://localhost:9000/admin/usuarios/${cpf}/status`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: novoStatus })
        });

        if (response.ok) {
            alert(`Usuário marcado como ${novoStatus}!`);
            fecharModal('modal-status');
            carregarUsuarios();
        } else {
            alert('Erro ao alterar status.');
        }
    } catch (error) { alert('Falha de conexão.'); }
}

// --- UTILS ---
function fecharModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

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