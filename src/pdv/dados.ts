import { useLocalStorage } from '../hooks/useLocalStorage'
import { SITE } from '../nuvem/site'
import type { Adicional, AdicionalItem, Caixa, Canal, Categoria, Comanda, Config, EmbalagemPedido, Escolha, FormaPagamento, Insumo, ItemFicha, ItemPedido, MovEstoque, Pedido, Produto, Unidade } from './tipos'

export const novoId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

// ---------- formatação ----------

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const brl = (v: number) => fmtBRL.format(Number.isFinite(v) ? v : 0)
export const pct = (v: number) => `${(Number.isFinite(v) ? v : 0).toFixed(1).replace('.', ',')}%`
export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
export const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
export const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
export const arred = (v: number) => Math.round(v * 100) / 100

export const NOMES_FORMA: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Débito',
  credito: 'Crédito',
  app: 'Pago no app',
}
export const EMOJI_FORMA: Record<FormaPagamento, string> = { dinheiro: '💵', pix: '⚡', debito: '💳', credito: '💳', app: '🛵' }
export const FORMAS: FormaPagamento[] = ['dinheiro', 'pix', 'debito', 'credito']

export const NOMES_CATEGORIA: Record<Categoria, string> = {
  prato: 'Pratos',
  porcao: 'Porções',
  espeto: 'Espetos',
  combo: 'Combos',
  bebida: 'Bebidas',
  drink: 'Doses e drinks',
  outro: 'Outros',
}
export const CATEGORIAS: Categoria[] = ['prato', 'porcao', 'espeto', 'combo', 'bebida', 'drink', 'outro']

// ---------- unidades ----------

export const NOMES_UNIDADE: Record<Unidade, string> = { kg: 'kg', un: 'unidade', L: 'litro', pct: 'pacote' }
/** Unidade usada na ficha técnica: gramas para kg, ml para litro. */
export const unidadeFicha = (u: Unidade) => (u === 'kg' ? 'g' : u === 'L' ? 'ml' : u)
const fatorFicha = (u: Unidade) => (u === 'kg' || u === 'L' ? 1000 : 1)

export const custoUnitarioInsumo = (i: Insumo) => (i.qtdCompra > 0 ? i.precoCompra / i.qtdCompra : 0)

export function custoItemFicha(item: ItemFicha, insumos: Insumo[]) {
  const ins = insumos.find((i) => i.id === item.insumoId)
  if (!ins) return 0
  return (item.qtd / fatorFicha(ins.unidade)) * custoUnitarioInsumo(ins)
}

/** Custo de 1 unidade só pela ficha técnica + custo direto (sem os itens de combo). */
export function custoProduto(p: Pick<Produto, 'ficha' | 'custoDireto'>, insumos: Insumo[]) {
  return (p.custoDireto || 0) + p.ficha.reduce((s, f) => s + custoItemFicha(f, insumos), 0)
}

/**
 * Custo de 1 unidade incluindo os produtos de um combo.
 * Com as escolhas da venda usa o custo real; sem elas, considera a opção mais cara (estimativa conservadora).
 */
export function custoCompleto(p: Produto, insumos: Insumo[], produtos: Produto[], escolhas?: Escolha[], nivel = 0): number {
  let total = custoProduto(p, insumos)
  if (!p.componentes?.length || nivel > 2) return total
  const custoDe = (id: string) => {
    const x = produtos.find((y) => y.id === id)
    return x ? custoCompleto(x, insumos, produtos, undefined, nivel + 1) : 0
  }
  if (escolhas) return total + escolhas.reduce((s, e) => s + custoDe(e.produtoId) * e.qtd, 0)
  for (const c of p.componentes) total += c.qtd * Math.max(0, ...c.opcoes.map(custoDe))
  return total
}

/** Preço de 1 unidade com as escolhas do combo (soma os acréscimos das opções escolhidas). */
/** Adicionais oferecidos para o produto (pela categoria dele). */
export const adicionaisDe = (p: Pick<Produto, 'categoria'>, config: Pick<Config, 'adicionais'>) =>
  (config.adicionais ?? []).filter((a) => a.ativo && a.nome.trim() && a.categorias.includes(p.categoria))

export const somaAdicionais = (a?: AdicionalItem[]) => (a ?? []).reduce((s, x) => s + x.preco, 0)
export const custoAdicionais = (a?: AdicionalItem[]) => (a ?? []).reduce((s, x) => s + (x.custo ?? 0), 0)
export const chaveAdicionais = (a?: AdicionalItem[]) => (a ?? []).map((x) => x.id).sort().join('|')
export const paraItem = (a: Adicional): AdicionalItem => ({ id: a.id, nome: a.nome, preco: a.preco, ...(a.custo ? { custo: a.custo } : {}) })

export function precoComEscolhas(p: Pick<Produto, 'preco' | 'componentes'>, escolhas?: Escolha[], base = p.preco) {
  let preco = base
  for (const e of escolhas ?? []) {
    const c = p.componentes?.find((x) => x.acrescimos?.[e.produtoId] !== undefined)
    if (c) preco += (c.acrescimos![e.produtoId] ?? 0) * e.qtd
  }
  return arred(preco)
}

/** Quantas unidades de cada produto saem do estoque com estes itens (inclui o que vai dentro dos combos). */
export function consumoDosItens(itens: Pick<ItemPedido, 'produtoId' | 'qtd' | 'escolhas'>[]) {
  const m: Record<string, number> = {}
  for (const i of itens) {
    m[i.produtoId] = (m[i.produtoId] ?? 0) + i.qtd
    for (const e of i.escolhas ?? []) m[e.produtoId] = (m[e.produtoId] ?? 0) + e.qtd * i.qtd
  }
  return m
}

/** Aplica uma baixa (sinal −1) ou devolução (+1) no estoque dos produtos controlados. */
/**
 * Insumos controlados que saem do estoque na venda (em kg/un do insumo).
 * Vale para produtos SEM estoque de unidades prontas — ex.: o baião da jantinha.
 * Espetos com estoque de prontos já baixaram a carne na montagem, então não entram aqui.
 */
export function consumoInsumosDosItens(itens: Pick<ItemPedido, 'produtoId' | 'qtd' | 'escolhas'>[], produtos: Produto[], insumos: Insumo[]) {
  const m: Record<string, number> = {}
  const somar = (produtoId: string, vezes: number) => {
    const p = produtos.find((x) => x.id === produtoId)
    if (!p || p.estoque !== undefined) return
    for (const f of p.ficha) {
      const ins = insumos.find((i) => i.id === f.insumoId)
      if (!ins || ins.estoque === undefined) continue
      m[ins.id] = (m[ins.id] ?? 0) + (f.qtd / fatorFicha(ins.unidade)) * vezes
    }
  }
  for (const i of itens) {
    somar(i.produtoId, i.qtd)
    for (const e of i.escolhas ?? []) somar(e.produtoId, e.qtd * i.qtd)
  }
  return m
}

export function moverEstoqueInsumos(insumos: Insumo[], consumo: Record<string, number>, sinal: 1 | -1) {
  return insumos.map((i) =>
    i.estoque !== undefined && consumo[i.id] ? { ...i, estoque: Math.round((i.estoque + sinal * consumo[i.id]) * 1000) / 1000 } : i,
  )
}

/** Quantas unidades de cada produto dá para fazer com o estoque deste insumo (ex.: 6 kg de baião → 24 jantinhas). */
export function rendePara(insumo: Insumo, produtos: Produto[], estoque = insumo.estoque ?? 0) {
  return produtos
    .filter((p) => p.ativo)
    .flatMap((p) => {
      const f = p.ficha.find((x) => x.insumoId === insumo.id)
      if (!f || f.qtd <= 0) return []
      const porcao = f.qtd / fatorFicha(insumo.unidade)
      return [{ produto: p, porcao: f.qtd, unidadePorcao: unidadeFicha(insumo.unidade), qtd: Math.max(0, Math.floor(estoque / porcao + 1e-6)) }]
    })
}

/** Embalagens sugeridas para um pedido para viagem, pelas regras da configuração. */
export function embalagensSugeridas(itens: ItemPedido[] | Pick<ItemPedido, 'categoria' | 'qtd' | 'escolhas'>[], config: Config, insumos: Insumo[]) {
  const espetos = itens.reduce(
    (s, i) => s + (i.categoria === 'espeto' ? i.qtd : 0) + (i.escolhas ?? []).reduce((t, e) => t + (e.categoria === 'espeto' ? e.qtd * i.qtd : 0), 0),
    0,
  )
  const m: Record<string, number> = {}
  for (const r of config.regrasViagem) {
    if (!insumos.some((i) => i.id === r.insumoId)) continue
    const extra = r.aCadaEspetos > 0 ? Math.floor(Math.max(0, espetos - 1) / r.aCadaEspetos) : 0
    m[r.insumoId] = (m[r.insumoId] ?? 0) + r.porPedido + extra
  }
  return m
}

export function montarEmbalagens(qtds: Record<string, number>, insumos: Insumo[]): EmbalagemPedido[] {
  return Object.entries(qtds).flatMap(([insumoId, qtd]) => {
    const ins = insumos.find((i) => i.id === insumoId)
    return ins && qtd > 0 ? [{ insumoId, nome: ins.nome, qtd, custo: arred(custoUnitarioInsumo(ins) * 1000) / 1000 }] : []
  })
}

/** Soma ao consumo de insumos as embalagens do pedido (para baixar/devolver estoque). */
export function comEmbalagens(consumo: Record<string, number>, embalagens?: EmbalagemPedido[]) {
  const m = { ...consumo }
  for (const e of embalagens ?? []) m[e.insumoId] = (m[e.insumoId] ?? 0) + e.qtd
  return m
}

export function moverEstoqueProdutos(produtos: Produto[], consumo: Record<string, number>, sinal: 1 | -1) {
  return produtos.map((p) =>
    p.estoque !== undefined && consumo[p.id] ? { ...p, estoque: p.estoque + sinal * consumo[p.id] } : p,
  )
}

/** Espetos que vão para a brasa (avulsos + dentro de combos), agrupados por nome. */
export function espetosParaBrasa(itens: ItemPedido[]) {
  const m = new Map<string, number>()
  for (const i of itens) {
    if (i.categoria === 'espeto') m.set(i.nome, (m.get(i.nome) ?? 0) + i.qtd)
    for (const e of i.escolhas ?? []) if (e.categoria === 'espeto') m.set(e.nome, (m.get(e.nome) ?? 0) + e.qtd * i.qtd)
  }
  return [...m.entries()].map(([nome, qtd]) => ({ nome, qtd }))
}

// ---------- dados iniciais (exemplo, pode editar tudo) ----------

const SAQUINHO_TERMICO: Insumo = {
  id: 'ins-saquinho',
  nome: 'Sacola para entrega',
  unidade: 'un',
  precoCompra: 30,
  qtdCompra: 100,
  grupo: 'Embalagens',
}

// Insumos de exemplo do Bar do Peixe: confira os preços de compra e monte as fichas técnicas em Cadastros.
const INSUMOS_INICIAIS: Insumo[] = [
  { id: 'ins-tilapia', nome: 'Tilápia inteira', unidade: 'kg', precoCompra: 0, qtdCompra: 1, grupo: 'Peixes' },
  { id: 'ins-file-frango', nome: 'Filé de frango', unidade: 'kg', precoCompra: 0, qtdCompra: 1, grupo: 'Carnes' },
  { id: 'ins-frango-passarinho', nome: 'Frango a passarinho', unidade: 'kg', precoCompra: 0, qtdCompra: 1, grupo: 'Carnes' },
  { id: 'ins-bisteca', nome: 'Bisteca suína', unidade: 'kg', precoCompra: 0, qtdCompra: 1, grupo: 'Carnes' },
  { id: 'ins-calabresa', nome: 'Calabresa', unidade: 'kg', precoCompra: 0, qtdCompra: 1, grupo: 'Carnes' },
  { id: 'ins-contra-file', nome: 'Contra filé', unidade: 'kg', precoCompra: 0, qtdCompra: 1, grupo: 'Carnes' },
  { id: 'ins-batata', nome: 'Batata palito congelada', unidade: 'kg', precoCompra: 0, qtdCompra: 1, grupo: 'Porções' },
  { id: 'ins-mandioca', nome: 'Mandioca', unidade: 'kg', precoCompra: 0, qtdCompra: 1, grupo: 'Porções' },
  { id: 'ins-arroz', nome: 'Arroz', unidade: 'kg', precoCompra: 0, qtdCompra: 1, grupo: 'Acompanhamentos' },
  { id: 'ins-feijao', nome: 'Feijão', unidade: 'kg', precoCompra: 0, qtdCompra: 1, grupo: 'Acompanhamentos' },
  { id: 'ins-oleo', nome: 'Óleo', unidade: 'L', precoCompra: 0, qtdCompra: 1, grupo: 'Cozinha' },
  { id: 'ins-marmita', nome: 'Marmitex', unidade: 'un', precoCompra: 0, qtdCompra: 100, grupo: 'Embalagens' },
  SAQUINHO_TERMICO,
]

const FOTOS = `${SITE}/fotos/`
const ACOMPANHA = 'Acompanha arroz, feijão, macarrão, farofa e salada'

const prato = (id: string, nome: string, preco: number, secao: string, emoji: string, extra: Partial<Produto> = {}): Produto => ({
  id,
  nome,
  categoria: 'prato',
  preco,
  emoji,
  custoDireto: 0,
  ativo: preco > 0,
  ficha: [],
  secao,
  ...extra,
})

const porcao = (id: string, nome: string, preco: number, emoji: string, extra: Partial<Produto> = {}): Produto => ({
  id,
  nome,
  categoria: 'porcao',
  preco,
  emoji,
  custoDireto: 0,
  ativo: true,
  ficha: [],
  secao: 'Porções',
  ...extra,
})

const bebida = (id: string, nome: string, emoji: string, preco: number, custo: number): Produto => ({
  id,
  nome,
  categoria: 'bebida',
  preco,
  emoji,
  custoDireto: custo,
  ativo: true,
  ficha: [],
})

// Cardápio do Bar do Peixe (do "Menu do dia"). Os executivos estão sem preço no cardápio impresso:
// ficam desativados até o preço ser colocado em Cadastros.
const PRODUTOS_INICIAIS: Produto[] = [
  prato('p-com-file-frango', 'Comercial — Filé de frango', 15, 'Prato comercial', '🍗', { descricao: ACOMPANHA, imagem: FOTOS + 'file-de-frango.jpg' }),
  prato('p-com-passarinho', 'Comercial — Frango a passarinho', 15, 'Prato comercial', '🍗', { descricao: ACOMPANHA }),
  prato('p-com-bisteca', 'Comercial — Bisteca', 15, 'Prato comercial', '🥩', { descricao: ACOMPANHA, imagem: FOTOS + 'bisteca.jpg' }),
  prato('p-com-calabresa', 'Comercial — Calabresa', 15, 'Prato comercial', '🌭', { descricao: ACOMPANHA }),
  prato('p-exe-tilapia-inteira', 'Executivo — Tilápia inteira', 0, 'Executivos', '🐟', { imagem: FOTOS + 'tilapia-inteira.jpg' }),
  prato('p-exe-tilapia-picada', 'Executivo — Tilápia picada', 0, 'Executivos', '🐟', { imagem: FOTOS + 'tilapia-frita.jpg' }),
  prato('p-exe-contra-file', 'Executivo — Contra filé com fritas', 0, 'Executivos', '🥩'),
  prato('p-exe-parmegiana', 'Executivo — Frango à parmegiana', 0, 'Executivos', '🍗'),
  porcao('p-por-batata', 'Batata frita', 15, '🍟'),
  porcao('p-por-tilapia-p', 'Tilápia P', 30, '🐟', { tamanho: 'pequena', imagem: FOTOS + 'tilapia-frita.jpg' }),
  porcao('p-por-tilapia-m', 'Tilápia M', 40, '🐟', { tamanho: 'média', imagem: FOTOS + 'tilapia-frita.jpg' }),
  porcao('p-por-tilapia-g', 'Tilápia G', 50, '🐟', { tamanho: 'grande', imagem: FOTOS + 'tilapia-frita.jpg' }),
  porcao('p-por-mandioca', 'Mandioca frita', 15, '🥔'),
  porcao('p-por-calabresa', 'Calabresa acebolada', 15, '🌭'),
  porcao('p-por-passarinho', 'Frango a passarinho', 25, '🍗'),
  bebida('p-coca', 'Coca-Cola lata', '🥤', 6, 3.2),
  bebida('p-guarana', 'Guaraná lata', '🥤', 6, 2.9),
  bebida('p-agua', 'Água', '💧', 4, 1.5),
  bebida('p-cerveja', 'Cerveja lata', '🍺', 8, 3.8),
]

/** Adicionais de exemplo — troque em Configurações → Adicionais dos pratos. */
const ADICIONAIS_INICIAIS: Adicional[] = [
  { id: 'ad-ovo', nome: 'Ovo frito', preco: 3, categorias: ['prato'], ativo: true },
  { id: 'ad-fritas', nome: 'Batata frita extra', preco: 5, categorias: ['prato'], ativo: true },
  { id: 'ad-vinagrete', nome: 'Vinagrete', preco: 2, categorias: ['prato', 'porcao'], ativo: true },
]

export const CONFIG_INICIAL: Config = {
  nomeLoja: 'Bar do Peixe',
  endereco: 'Rua João Theodoro Genesi, 138 — Diadema',
  telefone: '(11) 98236-9034',
  rodape: 'Obrigado e volte sempre!',
  larguraPapel: 80,
  imprimirAoFinalizar: true,
  viaChurrasqueira: true,
  viaCliente: true,
  viaMotoboy: true,
  taxaDebito: 1.99,
  taxaCredito: 4.98,
  taxaPix: 0,
  obsRapidas: ['Sem salada', 'Sem feijão', 'Sem farofa', 'Sem cebola', 'Bem passado', 'Pouco sal', 'Para viagem'],
  alertaEstoque: 5,
  regrasViagem: [],
  planilhaUrl: '',
  planilhaChave: '',
  planilhaAuto: true,
  espetoHoje: true,
  diasCobertura: 14,
  taxaIfood: 15.2,
  taxa99: 15,
  acrescimoDelivery: 20,
  adicionais: ADICIONAIS_INICIAIS,
  taxaServico: { ativa: true, pct: 10 },
  cozinhaSemBebidas: true,
  garcons: [],
}

export const NOMES_CANAL: Record<Canal, string> = { balcao: 'Balcão', ifood: 'iFood', '99food': '99Food', site: 'Cardápio digital' }

/** Comissão do app de delivery, em %. */
export function taxaDoCanal(canal: Canal | undefined, config: Config) {
  if (canal === 'ifood') return config.taxaIfood ?? 0
  if (canal === '99food') return config.taxa99 ?? 0
  return 0
}

/** Preço do produto no iFood/99Food: o preço próprio do app ou o do balcão + acréscimo (arredondado para cima de 10 em 10 centavos). */
export function precoDelivery(p: Pick<Produto, 'preco' | 'precoDelivery'>, config: Pick<Config, 'acrescimoDelivery'>) {
  if (p.precoDelivery) return p.precoDelivery
  const pc = config.acrescimoDelivery ?? 0
  if (!pc) return p.preco
  return Math.ceil(arred(p.preco * (1 + pc / 100)) * 10 - 1e-6) / 10
}

// ---------- armazenamento ----------

export function useEspetoDados() {
  const [insumos, setInsumos] = useLocalStorage<Insumo[]>('espeto:insumos', INSUMOS_INICIAIS)
  const [produtos, setProdutos] = useLocalStorage<Produto[]>('espeto:produtos', PRODUTOS_INICIAIS)
  const [pedidos, setPedidos] = useLocalStorage<Pedido[]>('espeto:pedidos', [])
  const [caixas, setCaixas] = useLocalStorage<Caixa[]>('espeto:caixas', [])
  const [configSalva, setConfig] = useLocalStorage<Config>('espeto:config', CONFIG_INICIAL)
  const [movEstoque, setMovEstoque] = useLocalStorage<MovEstoque[]>('espeto:estoque-mov', [])
  const [comandas, setComandas] = useLocalStorage<Comanda[]>('espeto:comandas', [])
  const config = { ...CONFIG_INICIAL, ...configSalva }

  const caixaAberto = caixas.find((c) => !c.fechadoEm) ?? null
  return {
    insumos,
    setInsumos,
    produtos,
    setProdutos,
    pedidos,
    setPedidos,
    caixas,
    setCaixas,
    config,
    setConfig,
    movEstoque,
    setMovEstoque,
    comandas,
    setComandas,
    caixaAberto,
  }
}
export type Dados = ReturnType<typeof useEspetoDados>

// ---------- regras de caixa ----------

export function taxaDaForma(forma: FormaPagamento, config: Config) {
  if (forma === 'debito') return config.taxaDebito
  if (forma === 'credito') return config.taxaCredito
  if (forma === 'pix') return config.taxaPix
  return 0
}

export interface LinhaProduto {
  produtoId: string
  nome: string
  emoji: string
  categoria: Categoria
  /** Unidades que saíram, avulsas + dentro de combos. */
  vendidos: number
  /** Quantas dessas saíram dentro de combos/jantinhas. */
  emCombos: number
  /** Estoque na abertura do caixa. */
  inicial?: number
  /** Entradas no período (montagem, compra, contagem). */
  entradas: number
  /** Estoque no fechamento (ou agora, se o caixa está aberto). */
  final?: number
  receita: number
  custo: number
}

export interface Resumo {
  pedidos: Pedido[]
  cancelados: Pedido[]
  qtdPedidos: number
  qtdViagem: number
  espetosVendidos: number
  itensVendidos: number
  faturamento: number
  /** Taxa de serviço recebida nas mesas (repassar aos garçons). Já está no faturamento. */
  servico: number
  descontos: number
  porForma: Record<FormaPagamento, number>
  taxas: number
  cmv: number
  despesas: number
  despesasDinheiro: number
  despesasConta: number
  sangrias: number
  suprimentos: number
  lucroBruto: number
  lucroLiquido: number
  margem: number
  ticketMedio: number
  trocoInicial: number
  dinheiroEsperado: number
  emConta: number
  porProduto: LinhaProduto[]
  /** Compras de insumos/mercadorias registradas no período (dinheiro que saiu para repor estoque). */
  compras: number
  /** Embalagens para viagem usadas (já incluídas no custo dos produtos). */
  embalagens: { nome: string; qtd: number; custo: number }[]
  /** Saídas sem venda (consumo próprio, cortesia…): custo já está no CMV; valor = quanto valeria vendido. */
  cortesias: { qtd: number; custo: number; valor: number; porMotivo: { motivo: string; qtd: number; custo: number; valor: number }[] }
}

export function resumirCaixa(caixa: Caixa, todosPedidos: Pedido[], produtos: Produto[], movEstoque: MovEstoque[] = []): Resumo {
  const doCaixa = todosPedidos.filter((p) => p.caixaId === caixa.id)
  const pedidos = doCaixa.filter((p) => !p.cancelado)
  const cancelados = doCaixa.filter((p) => p.cancelado)
  const vendas = pedidos.filter((p) => !p.cortesia)
  const cortesias = pedidos.filter((p) => p.cortesia)
  const porForma: Record<FormaPagamento, number> = { dinheiro: 0, pix: 0, debito: 0, credito: 0, app: 0 }
  let faturamento = 0
  let servico = 0
  let descontos = 0
  let taxas = 0
  let cmv = 0
  let espetosVendidos = 0
  let itensVendidos = 0
  const linhas = new Map<string, LinhaProduto>()

  const embs = new Map<string, { nome: string; qtd: number; custo: number }>()
  for (const p of pedidos) {
    for (const e of p.embalagens ?? []) {
      const x = embs.get(e.insumoId) ?? { nome: e.nome, qtd: 0, custo: 0 }
      x.qtd += e.qtd
      x.custo += e.qtd * e.custo
      embs.set(e.insumoId, x)
    }
    faturamento += p.total
    servico += p.taxaServico ?? 0
    descontos += p.desconto
    taxas += p.taxas
    cmv += p.custoTotal
    for (const pg of p.pagamentos) porForma[pg.forma] += pg.valor
    for (const i of p.itens) {
      itensVendidos += i.qtd
      if (i.categoria === 'espeto') espetosVendidos += i.qtd
      const l = linha(i.produtoId, i)
      l.vendidos += i.qtd
      l.receita += i.preco * i.qtd
      l.custo += i.custo * i.qtd
      for (const e of i.escolhas ?? []) {
        const q = e.qtd * i.qtd
        if (e.categoria === 'espeto') espetosVendidos += q
        const le = linha(e.produtoId, { nome: e.nome, categoria: e.categoria, emoji: produtos.find((x) => x.id === e.produtoId)?.emoji ?? '' })
        le.vendidos += q
        le.emCombos += q
      }
    }
  }

  function linha(produtoId: string, base: { nome: string; categoria: Categoria; emoji: string }) {
    let l = linhas.get(produtoId)
    if (!l) {
      l = { produtoId, nome: base.nome, emoji: base.emoji, categoria: base.categoria, vendidos: 0, emCombos: 0, entradas: 0, receita: 0, custo: 0 }
      linhas.set(produtoId, l)
    }
    return l
  }

  // estoque: abertura, entradas no período e fechamento
  const fim = caixa.fechadoEm ?? '9999'
  const noPeriodo = movEstoque.filter((m) => m.criadoEm >= caixa.abertoEm && m.criadoEm <= fim)
  const controlados = new Set([
    ...Object.keys(caixa.estoque),
    ...Object.keys(caixa.estoqueFinal ?? {}),
    ...(caixa.fechadoEm ? [] : produtos.filter((p) => p.estoque !== undefined).map((p) => p.id)),
  ])
  for (const id of controlados) {
    const prod = produtos.find((x) => x.id === id)
    if (!prod && !linhas.has(id)) continue
    const l = linha(id, prod ?? { nome: '?', categoria: 'outro', emoji: '' })
    l.inicial = caixa.estoque[id]
    l.final = caixa.fechadoEm ? caixa.estoqueFinal?.[id] : prod?.estoque
    l.entradas = noPeriodo.filter((m) => m.produtoId === id).reduce((s, m) => s + m.qtd, 0)
  }
  const compras = noPeriodo.filter((m) => m.tipo === 'compra').reduce((s, m) => s + (m.valor ?? 0), 0)

  const soma = (tipo: string, origem?: string) =>
    caixa.movimentos
      .filter((m) => m.tipo === tipo && (!origem || m.origem === origem))
      .reduce((s, m) => s + m.valor, 0)
  const despesas = soma('despesa')
  const despesasDinheiro = soma('despesa', 'dinheiro')
  const despesasConta = soma('despesa', 'conta')
  const sangrias = soma('sangria')
  const suprimentos = soma('suprimento')

  // a taxa de serviço é dos garçons: entra no caixa, mas não é lucro da casa
  const lucroBruto = faturamento - servico - cmv
  const lucroLiquido = faturamento - servico - taxas - cmv - despesas
  const ordemCat: Record<Categoria, number> = { prato: 0, porcao: 1, espeto: 2, combo: 3, outro: 4, bebida: 5, drink: 6 }
  const ordemProd = (id: string) => {
    const i = produtos.findIndex((p) => p.id === id)
    return i < 0 ? 999 : i
  }

  return {
    pedidos,
    cancelados,
    qtdPedidos: vendas.length,
    qtdViagem: pedidos.filter((p) => p.viagem).length,
    // conta dividida gera frações (⅓ de espeto); arredonda para não aparecer 2,9999
    espetosVendidos: Math.round(espetosVendidos * 100) / 100,
    itensVendidos: Math.round(itensVendidos * 100) / 100,
    faturamento,
    servico,
    descontos,
    porForma,
    taxas,
    cmv,
    despesas,
    despesasDinheiro,
    despesasConta,
    sangrias,
    suprimentos,
    lucroBruto,
    lucroLiquido,
    margem: faturamento > 0 ? (lucroLiquido / faturamento) * 100 : 0,
    ticketMedio: vendas.length ? faturamento / vendas.length : 0,
    cortesias: {
      qtd: cortesias.length,
      custo: cortesias.reduce((s, p) => s + p.custoTotal, 0),
      valor: cortesias.reduce((s, p) => s + (p.cortesia?.valor ?? 0), 0),
      porMotivo: [...new Set(cortesias.map((p) => p.cortesia!.motivo))].map((motivo) => {
        const ps = cortesias.filter((p) => p.cortesia!.motivo === motivo)
        return { motivo, qtd: ps.length, custo: ps.reduce((s, p) => s + p.custoTotal, 0), valor: ps.reduce((s, p) => s + (p.cortesia?.valor ?? 0), 0) }
      }),
    },
    trocoInicial: caixa.trocoInicial,
    dinheiroEsperado: caixa.trocoInicial + porForma.dinheiro + suprimentos - sangrias - despesasDinheiro,
    emConta: porForma.pix + porForma.debito + porForma.credito + porForma.app - taxas - despesasConta,
    porProduto: [...linhas.values()].map((l) => ({ ...l, vendidos: Math.round(l.vendidos * 100) / 100, emCombos: Math.round(l.emCombos * 100) / 100 })).sort(
      (a, b) => ordemCat[a.categoria] - ordemCat[b.categoria] || ordemProd(a.produtoId) - ordemProd(b.produtoId),
    ),
    compras,
    embalagens: [...embs.values()],
  }
}

/** Reduz uma foto para caber no armazenamento do navegador. */
/**
 * Prepara uma foto para o botão do produto: corta o centro em 4:3, reduz para 480×360 e salva em JPEG.
 * Fica nítida em tela de alta resolução e pequena o bastante (~30 KB) para caber no navegador e no backup.
 */
export function reduzirImagem(arquivo: Blob, largura = 480, altura = 360): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Imagem inválida'))
    }
    img.onload = () => {
      URL.revokeObjectURL(url)
      const alvo = largura / altura
      // recorte central na proporção do botão
      let sw = img.width
      let sh = img.height
      if (sw / sh > alvo) sw = sh * alvo
      else sh = sw / alvo
      const sx = (img.width - sw) / 2
      const sy = (img.height - sh) / 2
      const escala = Math.min(1, largura / sw)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(sw * escala)
      canvas.height = Math.round(sh * escala)
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.src = url
  })
}

// ---------- backup ----------

export function montarBackup(d: Pick<Dados, 'insumos' | 'produtos' | 'pedidos' | 'caixas' | 'movEstoque' | 'comandas' | 'config'>) {
  return {
    versao: 2,
    geradoEm: new Date().toISOString(),
    insumos: d.insumos,
    produtos: d.produtos,
    pedidos: d.pedidos,
    caixas: d.caixas,
    movEstoque: d.movEstoque,
    comandas: d.comandas,
    config: d.config,
  }
}

/** Troca todos os dados por um backup. Mantém as ligações de salvamento deste aparelho (planilha). */
export function aplicarBackup(d: Dados, b: Partial<ReturnType<typeof montarBackup>>) {
  if (!Array.isArray(b.produtos) || !Array.isArray(b.pedidos) || !Array.isArray(b.caixas)) throw new Error('Arquivo de backup inválido.')
  d.setInsumos(b.insumos ?? [])
  d.setProdutos(b.produtos)
  d.setPedidos(b.pedidos)
  d.setCaixas(b.caixas)
  d.setMovEstoque(b.movEstoque ?? [])
  d.setComandas(b.comandas ?? [])
  if (b.config)
    d.setConfig({ ...b.config, planilhaUrl: d.config.planilhaUrl, planilhaChave: d.config.planilhaChave, planilhaAuto: d.config.planilhaAuto })
}

// ---------- adega: código de barras, compras e reposição ----------

/** Só os dígitos/letras do código (leitores às vezes mandam espaços). */
export const limparCodigo = (c: string) => c.replace(/\s+/g, '').trim()

export function acharPorCodigo(produtos: Produto[], codigo: string) {
  const c = limparCodigo(codigo)
  if (!c) return undefined
  return produtos.find((p) => p.codigos?.some((x) => limparCodigo(x) === c))
}

/** Busca por nome: “heine lat” encontra “Heineken lata”. */
export function buscarProdutos(produtos: Produto[], termo: string) {
  const norm = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  const partes = norm(termo).split(/\s+/).filter(Boolean)
  if (!partes.length) return produtos
  return produtos.filter((p) => {
    const alvo = norm(`${p.nome} ${(p.codigos ?? []).join(' ')}`)
    return partes.every((x) => alvo.includes(x))
  })
}

/** Unidades que saíram de cada produto (inclui as de dentro de fardos/combos) desde uma data. */
export function saidasDesde(pedidos: Pedido[], desdeIso: string) {
  return consumoDosItens(pedidos.filter((p) => !p.cancelado && p.criadoEm >= desdeIso).flatMap((p) => p.itens))
}

/** Última compra de um produto: quanto pagou por unidade, de quem e quando. */
export function ultimaCompra(movs: MovEstoque[], produtoId: string) {
  for (let i = movs.length - 1; i >= 0; i--) {
    const m = movs[i]
    if (m.tipo === 'compra' && m.produtoId === produtoId && m.qtd > 0 && m.valor) {
      return { unitario: m.valor / m.qtd, fornecedor: m.fornecedor ?? '', em: m.criadoEm, qtd: m.qtd }
    }
  }
  return null
}

/** Menor preço por unidade pago nos últimos 90 dias (e de quem), para comparar fornecedores. */
export function melhorCompra(movs: MovEstoque[], produtoId: string) {
  const desde = new Date(Date.now() - 90 * 86400000).toISOString()
  let melhor: { unitario: number; fornecedor: string; em: string } | null = null
  for (const m of movs) {
    if (m.tipo !== 'compra' || m.produtoId !== produtoId || m.qtd <= 0 || !m.valor || m.criadoEm < desde) continue
    const u = m.valor / m.qtd
    if (!melhor || u < melhor.unitario) melhor = { unitario: u, fornecedor: m.fornecedor ?? '', em: m.criadoEm }
  }
  return melhor
}

export const fornecedoresConhecidos = (movs: MovEstoque[]) =>
  [...new Set(movs.map((m) => m.fornecedor?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b))
