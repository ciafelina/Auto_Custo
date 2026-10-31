# Item 12 — endereço configurável da API

Objetivo autorizado: permitir usar as telas em outros computadores, sem editar os nove scripts de negócio. Configuração pública em Front_End/config.js, sem segredos nem alteração do banco.

Diagnóstico: 21 chamadas estão fixas em http://localhost:9000. O backend Horse já escuta todas as interfaces por padrão. CORS usa wildcard para headers/métodos; o acesso entre origens com Authorization precisa ser conferido em navegador real.

Decisão: config.js define AUTO_CUSTO_CONFIG.apiBaseUrl. Vazio usa protocolo/hostname da página e porta 9000; arquivo file:// sem hostname usa http://localhost:9000 como compatibilidade. Arquivo de compartilhamento com hostname usa esse servidor por HTTP, comportamento explicitado na documentação e coberto em teste. URL explícita HTTP/HTTPS permite domínio/IP, outra porta e prefixo de proxy. Helper Api.url('/rota') compartilha a composição e preserva query/prefixo. Aceitar somente base HTTP/HTTPS absoluta sem credenciais/query/fragmento; chamadas devem usar caminho interno, sem mudar origem ou escapar do prefixo. Configuração não vem da URL da página nem localStorage.

Alternativas: editar cada script mantém a duplicação; formulário/localStorage adicionaria configuração por navegador e risco de enviar tokens a um destino incorreto. Um arquivo público único atende a implantação atual. Porta do processo Delphi permanece 9000; porta externa diferente pode ser configurada no proxy. Configurar cabeçalhos/métodos CORS explicitamente se o teste real confirmar a necessidade.

- [x] Casos RED do helper: padrão LAN/local/file/IPv6/HTTPS, base explícita com prefixo/barra final, query, configuração inválida e caminhos externos.
- [x] Casos RED no navegador: chamadas das nove páginas, formulários e ações usam destino configurado; headers/métodos/corpos permanecem iguais.
- [x] Testar preflight e requisições reais de navegador para o harness local, sem interceptar a API.
- [x] Implementar config/helper, carregar antes das telas e substituir chamadas fixas; ajustar fixtures antigas à configuração explícita.
- [x] Suíte completa, sintaxe JS, build/revisão e documentação de acesso em rede.

Validação independente: expectativas de URLs literais; destino fictício com domínio, porta 9443 e prefixo /farmacia/v1 em testes interceptados. Teste real usa HTTP estático temporário em loopback e API fictícia 19001, chave fictícia e perfil Edge isolado. Não iniciar nem alterar a API/banco reais. Não abrir firewall ou publicar o servidor. Acesso físico de um segundo computador depende da rede e será documentado para homologação.

Evidências: item12-unit-red.log teve 31 falhas antes de criar o helper; item12-red.log repetiu essas 31 e mostrou 27 falhas no navegador/destino/CORS. Na primeira rodada após implementação, um mock de usuário sem cpfFormatado gerou URL com CPF vazio; a fixture foi completada, sem mudar código de produção. A revisão apontou diferença entre a descrição genérica de file:// e o compartilhamento com hostname; documentei o comportamento real e adicionei cobertura específica (32º caso do helper).

item12-green.log terminou com exit code 0: 463 verificações aprovadas, incluindo 32 de endereço e 27 de navegador. Os dois casos de rede reais fizeram GET administrativo e POST de eco com Bearer no harness, passando pelo preflight. item12-build.log confirmou Win32/Debug; node --check passou em todos os scripts e config.js. Revisão independente sem bloqueios P1/P2; observação de file:// resolvida por documentação/teste. Nenhum dado real foi alterado.
