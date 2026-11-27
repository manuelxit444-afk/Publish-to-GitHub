// Catálogo de exemplo. No futuro, os dados virão de um banco de dados.
const produtos = [
  { id: 1, nome: 'Teclado Bluetooth', categoria: 'Periféricos', preco: 109.90, desenho: 'teclado' },
  { id: 2, nome: 'Mouse Gamer RGB', categoria: 'Periféricos', preco: 59.90, desenho: 'mouse' },
  { id: 3, nome: 'SSD 480 GB', categoria: 'Hardware', preco: 189.90, desenho: 'ssd' },
  { id: 4, nome: 'Hub USB-C', categoria: 'Acessórios', preco: 79.90, desenho: 'hub' }
];

const desenhos = {
  teclado: `<g transform="rotate(-12 100 65)"><rect x="12" y="30" width="176" height="75" rx="8" fill="#333b45" stroke="#171d25" stroke-width="3"/>${Array.from({length:48},(_,i)=>`<rect x="${20+(i%12)*13.4}" y="${38+Math.floor(i/12)*14}" width="10" height="10" rx="1.5" fill="#141a22" stroke="#717b88" stroke-width=".7"/>`).join('')}<rect x="70" y="94" width="60" height="5" rx="2" fill="#171d25"/></g>`,
  mouse: '<g transform="rotate(-24 100 70)"><path d="M100 10c-30 0-43 22-43 53v21c0 29 18 43 43 43s43-14 43-43V63c0-31-13-53-43-53Z" fill="#21272e" stroke="#0d1015" stroke-width="3"/><path d="M100 12v47M59 60h82" stroke="#555e6b" fill="none"/><rect x="95" y="27" width="10" height="21" rx="5" fill="#fd536c"/><path d="M63 88q7 25 32 32" stroke="#28c9ef" stroke-width="4" fill="none"/><path d="M105 120q24-8 31-29" stroke="#8f58fa" stroke-width="4" fill="none"/></g>',
  ssd: '<g transform="rotate(-15 100 65)"><rect x="25" y="17" width="150" height="96" rx="7" fill="#303640" stroke="#151a21" stroke-width="3"/><rect x="34" y="25" width="132" height="78" rx="4" fill="#242a32"/><text x="100" y="65" text-anchor="middle" fill="#d9e1ea" font-size="24" font-family="Arial" font-weight="bold">SSD</text><text x="100" y="83" text-anchor="middle" fill="#a0abb9" font-size="12">480 GB</text></g>',
  hub: '<g transform="rotate(-15 100 65)"><rect x="20" y="45" width="117" height="39" rx="5" fill="#a2aab6" stroke="#596473" stroke-width="2"/><path d="M137 60q49-19 45 20l-12 12" stroke="#252a33" stroke-width="6" fill="none"/><rect x="158" y="90" width="18" height="11" rx="2" fill="#626b79"/><rect x="32" y="72" width="22" height="8" rx="1" fill="#184983"/><rect x="61" y="72" width="22" height="8" rx="1" fill="#184983"/><rect x="93" y="72" width="17" height="8" rx="1" fill="#2b3038"/></g>'
};

const dinheiro = valor => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
let categoriaAtual = 'Todos';
let carrinho = {};
const lista = document.querySelector('#lista-produtos');
const busca = document.querySelector('#busca');
const modal = document.querySelector('#modal-carrinho');
let tempoMensagem;

// Busca e filtros de categoria funcionam juntos.
function normalizar(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function mostrarProdutos() {
  const termo = normalizar(busca.value.trim());
  const filtrados = produtos.filter(p =>
    (categoriaAtual === 'Todos' || p.categoria === categoriaAtual) &&
    normalizar(p.nome + ' ' + p.categoria).includes(termo)
  );
  lista.innerHTML = filtrados.map(p => `
    <article class="produto">
      <div class="foto"><svg viewBox="0 0 200 130" role="img" aria-label="Ilustração de ${p.nome}">${desenhos[p.desenho]}</svg></div>
      <p class="categoria">${p.categoria}</p>
      <h3>${p.nome}</h3>
      <p class="preco">${dinheiro(p.preco)}</p>
      <button class="comprar" data-id="${p.id}" aria-label="Adicionar ${p.nome} ao carrinho">🛒 Comprar</button>
    </article>`).join('');
  document.querySelector('#total-produtos').textContent = `${filtrados.length} ${filtrados.length === 1 ? 'produto' : 'produtos'}`;
  document.querySelector('#sem-produtos').hidden = filtrados.length !== 0;
}

function atualizarCarrinho() {
  let total = 0, quantidade = 0;
  const itens = Object.entries(carrinho).map(([id, qtd]) => {
    const p = produtos.find(produto => produto.id === Number(id));
    total += p.preco * qtd;
    quantidade += qtd;
    return `<div class="item-carrinho"><div><strong>${p.nome}</strong><br>${dinheiro(p.preco * qtd)}</div><div class="controle"><button data-id="${id}" data-acao="menos" aria-label="Remover uma unidade de ${p.nome}">−</button><span>${qtd}</span><button data-id="${id}" data-acao="mais" aria-label="Adicionar uma unidade de ${p.nome}">+</button></div></div>`;
  });
  document.querySelector('#quantidade').textContent = quantidade;
  document.querySelector('#subtotal').textContent = dinheiro(total);
  document.querySelector('#itens-carrinho').innerHTML = itens.join('') || '<p>Seu carrinho está vazio.</p>';
}

function alterarQuantidade(id, diferenca) {
  carrinho[id] = (carrinho[id] || 0) + diferenca;
  if (carrinho[id] <= 0) delete carrinho[id];
  atualizarCarrinho();
}

busca.addEventListener('input', mostrarProdutos);
document.querySelectorAll('.categorias button').forEach(botao => {
  botao.addEventListener('click', () => {
    categoriaAtual = botao.dataset.categoria;
    document.querySelectorAll('.categorias button').forEach(b => {
      b.classList.toggle('ativo', b === botao);
      b.setAttribute('aria-pressed', String(b === botao));
    });
    mostrarProdutos();
  });
});
lista.addEventListener('click', evento => {
  const botao = evento.target.closest('.comprar');
  if (!botao) return;
  alterarQuantidade(botao.dataset.id, 1);
  const mensagem = document.querySelector('#mensagem');
  mensagem.textContent = 'Produto adicionado ao carrinho!';
  mensagem.classList.add('visivel');
  clearTimeout(tempoMensagem);
  tempoMensagem = setTimeout(() => mensagem.classList.remove('visivel'), 1900);
});
document.querySelector('#itens-carrinho').addEventListener('click', evento => {
  const botao = evento.target.closest('button[data-acao]');
  if (botao) alterarQuantidade(botao.dataset.id, botao.dataset.acao === 'mais' ? 1 : -1);
});
document.querySelector('#abrir-carrinho').addEventListener('click', () => modal.showModal());
document.querySelector('#fechar-carrinho').addEventListener('click', () => modal.close());
document.querySelector('#continuar').addEventListener('click', () => modal.close());
mostrarProdutos();
atualizarCarrinho();
