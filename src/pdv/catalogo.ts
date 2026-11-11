import { brl, precoDelivery, type Dados } from './dados'
import type { Config, Insumo, Produto } from './tipos'

// ---------------- seções do cardápio ----------------

export const SECOES = [
  'Espetos',
  'Combos e jantinhas',
  'Cervejas',
  'Fardos',
  'Doses e drinks',
  'Destilados e vinhos',
  'Refrigerantes, água e sucos',
  'Energéticos',
  'Petiscos',
  'Conveniência',
  'Outros',
] as const

const sem = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const CERVEJA = /cerveja|barrigudinha|latinha|chopp|lat[aã]o|long neck|litr[aã]o|heineken|brahma|skol|corona|budweiser|amstel|original|stella|spaten|itaipava|antarctica|eisenbahn|devassa|petra|imperio|bohemia|patagonia/
const DESTILADO = /cacha[cç]a|vodka|whisky|uisque|gin\b|rum\b|conhaque|tequila|licor|campari|vinho|catuaba|ypioca|dreher|smirnoff|absolut|velho barreiro|\b51\b|corote|ice\b|beats|jack|red label|aperol|martini|jurupinga|sake/
const ENERGETICO = /energ|red ?bull|monster|tnt|fusion|baly|burn/
const CONVENIENCIA = /gelo|carv[aã]o|copo|guardanapo|isqueiro|sal grosso/
const PETISCO = /amendoim|batata|torcida|salgadinho|petisco|castanha|chips|pururuca|torresmo|azeitona/

/** Fardo = combo de uma bebida só (ex.: 12 latas). */
const ehFardo = (p: Produto) => p.componentes?.length === 1 && p.componentes[0].opcoes.length === 1 && p.categoria === 'bebida'

export function secaoDe(p: Produto): string {
  if (p.secao?.trim()) return p.secao.trim()
  const n = sem(p.nome)
  if (ehFardo(p)) return 'Fardos'
  if (p.categoria === 'espeto') return 'Espetos'
  if (p.categoria === 'combo') return 'Combos e jantinhas'
  if (p.categoria === 'drink') return 'Doses e drinks'
  if (CONVENIENCIA.test(n)) return 'Conveniência'
  if (PETISCO.test(n)) return 'Petiscos'
  if (ENERGETICO.test(n)) return 'Energéticos'
  if (p.categoria === 'bebida') {
    if (DESTILADO.test(n)) return 'Destilados e vinhos'
    if (CERVEJA.test(n)) return 'Cervejas'
    return 'Refrigerantes, água e sucos'
  }
  return 'Outros'
}

export type ModoCardapio = 'balcao' | 'delivery'

export interface ItemCardapio {
  id: string
  nome: string
  emoji: string
  preco: number
  detalhe: string
  /** Tirado do cardápio à mão. */
  oculto: boolean
  /** Sem estoque agora (fardo: não dá para montar um). */
  esgotado: boolean
}

export interface SecaoCardapio {
  nome: string
  itens: ItemCardapio[]
}

/** Sem estoque para vender 1 unidade? (só para produtos que controlam estoque; fardo/combo olha as opções) */
export function esgotado(p: Produto, produtos: Produto[]): boolean {
  if (p.componentes?.length) {
    return p.componentes.some((c) => {
      const ops = c.opcoes.map((id) => produtos.find((x) => x.id === id)).filter((x): x is Produto => !!x)
      return ops.length > 0 && ops.every((o) => o.estoque !== undefined && o.estoque < c.qtd)
    })
  }
  return p.estoque !== undefined && p.estoque <= 0
}

/**
 * Seções do cardápio. Com `tudo`, inclui os itens tirados/esgotados (para a lista de marcar);
 * sem, só o que vai aparecer na imagem/texto.
 */
export function montarCardapio(
  produtos: Produto[],
  config: Config,
  modo: ModoCardapio,
  secoesFora: string[],
  tudo = false,
): SecaoCardapio[] {
  const mapa = new Map<string, SecaoCardapio>()
  for (const p of produtos) {
    if (!p.ativo || p.preco <= 0) continue
    if (modo === 'delivery' && p.foraDoDelivery) continue
    const nome = secaoDe(p)
    if (secoesFora.includes(nome)) continue
    const item: ItemCardapio = {
      id: p.id,
      nome: p.nome,
      emoji: p.emoji,
      preco: modo === 'delivery' ? precoDelivery(p, config) : p.preco,
      detalhe: [p.tamanho, p.descricao].filter(Boolean).join(' · '),
      oculto: !!p.foraDoCardapio,
      esgotado: esgotado(p, produtos),
    }
    if (!tudo && (item.oculto || (config.cardapioSemEsgotados && item.esgotado))) continue
    let s = mapa.get(nome)
    if (!s) mapa.set(nome, (s = { nome, itens: [] }))
    s.itens.push(item)
  }
  const ordem = (n: string) => {
    const i = (SECOES as readonly string[]).indexOf(n)
    return i < 0 ? SECOES.length - 1.5 : i
  }
  return [...mapa.values()].sort((a, b) => ordem(a.nome) - ordem(b.nome))
}

const temAlcool = (secoes: SecaoCardapio[]) => secoes.some((s) => ['Cervejas', 'Fardos', 'Doses e drinks', 'Destilados e vinhos'].includes(s.nome))
export const AVISO_18 = 'Venda de bebidas alcoólicas proibida para menores de 18 anos. Beba com moderação.'

// ---------------- texto (WhatsApp) ----------------

export function textoCardapio(secoes: SecaoCardapio[], config: Config, titulo: string) {
  const l: string[] = [`*${config.nomeLoja.toUpperCase()}*`, titulo]
  if (config.telefone) l.push(`📞 ${config.telefone}`)
  for (const s of secoes) {
    l.push('', `*${s.nome.toUpperCase()}*`)
    for (const i of s.itens) l.push(`${i.emoji} ${i.nome}${i.detalhe ? ` (${i.detalhe})` : ''} — ${brl(i.preco)}`)
  }
  if (temAlcool(secoes)) l.push('', `🔞 ${AVISO_18}`)
  return l.join('\n')
}

// ---------------- imagem (iFood / 99Food / redes / parede) ----------------

const W = 1240
const H = 1754 // proporção A4: serve para o iFood, para imprimir e para o WhatsApp
const MARGEM = 56
const VAO = 48
const COL = (W - MARGEM * 2 - VAO) / 2
const FONTE = 'Arial, Helvetica, sans-serif'

interface Bloco {
  tipo: 'secao' | 'item'
  altura: number
  desenhar: (c: CanvasRenderingContext2D, x: number, y: number) => void
}

function quebrar(c: CanvasRenderingContext2D, texto: string, largura: number) {
  const palavras = texto.split(/\s+/)
  const linhas: string[] = []
  let atual = ''
  for (const p of palavras) {
    const t = atual ? `${atual} ${p}` : p
    if (c.measureText(t).width > largura && atual) {
      linhas.push(atual)
      atual = p
    } else atual = t
  }
  if (atual) linhas.push(atual)
  return linhas
}

export function gerarImagensCardapio(secoes: SecaoCardapio[], config: Config, titulo: string, comEmoji: boolean): string[] {
  const medir = document.createElement('canvas').getContext('2d')!
  const blocos: Bloco[] = []

  for (const s of secoes) {
    blocos.push({
      tipo: 'secao',
      altura: 78,
      desenhar: (c, x, y) => {
        c.fillStyle = '#ea580c'
        c.font = `900 32px ${FONTE}`
        c.fillText(s.nome.toUpperCase(), x, y + 48, COL)
        c.fillRect(x, y + 62, COL, 4)
      },
    })
    for (const i of s.itens) {
      const nome = (comEmoji ? `${i.emoji} ` : '') + i.nome
      const preco = brl(i.preco)
      medir.font = `700 27px ${FONTE}`
      const largPreco = medir.measureText(preco).width
      const linhasNome = quebrar(medir, nome, COL - largPreco - 28)
      medir.font = `400 21px ${FONTE}`
      const linhasDet = i.detalhe ? quebrar(medir, i.detalhe, COL - 10) : []
      const altura = 14 + linhasNome.length * 33 + linhasDet.length * 26 + 8
      blocos.push({
        tipo: 'item',
        altura,
        desenhar: (c, x, y) => {
          let yy = y + 14 + 26
          c.font = `700 27px ${FONTE}`
          c.fillStyle = '#1c1917'
          linhasNome.forEach((ln, k) => c.fillText(ln, x, yy + k * 33))
          const larg = c.measureText(linhasNome[0]).width
          c.fillStyle = '#d6d3d1'
          for (let px = x + larg + 12; px < x + COL - largPreco - 12; px += 10) c.fillRect(px, yy - 5, 3, 3)
          c.fillStyle = '#1c1917'
          c.textAlign = 'right'
          c.fillText(preco, x + COL, yy)
          c.textAlign = 'left'
          yy += (linhasNome.length - 1) * 33 + 28
          c.font = `400 21px ${FONTE}`
          c.fillStyle = '#78716c'
          linhasDet.forEach((ln, k) => c.fillText(ln, x, yy + k * 26))
        },
      })
    }
  }

  const alcool = temAlcool(secoes)
  const CAB1 = 230
  const CAB2 = 120
  const RODAPE = 90

  // distribui em colunas: coluna 1, coluna 2, próxima página… (título de seção não fica sozinho no fim)
  type Coluna = Bloco[]
  const paginas: Coluna[][] = [[[]]]
  let usado = 0
  const limite = () => H - RODAPE - (paginas.length === 1 ? CAB1 : CAB2)
  blocos.forEach((b, idx) => {
    const prox = blocos[idx + 1]
    const precisa = b.tipo === 'secao' && prox ? b.altura + prox.altura : b.altura
    const pg = paginas[paginas.length - 1]
    const col = pg[pg.length - 1]
    if (usado + precisa > limite() && col.length) {
      if (pg.length < 2) pg.push([])
      else paginas.push([[]])
      usado = 0
      if (b.tipo === 'item') {
        const sec = blocos.slice(0, idx).reverse().find((x) => x.tipo === 'secao')
        if (sec) {
          const p2 = paginas[paginas.length - 1]
          p2[p2.length - 1].push(sec)
          usado += sec.altura
        }
      }
    }
    const p = paginas[paginas.length - 1]
    p[p.length - 1].push(b)
    usado += b.altura
  })

  return paginas.map((cols, n) => {
    const cab = n === 0 ? CAB1 : CAB2
    const ultima = n === paginas.length - 1
    const alturaCols = Math.max(...cols.map((c) => c.reduce((s, b) => s + b.altura, 0)))
    const altura = ultima && paginas.length === 1 ? Math.max(900, cab + alturaCols + RODAPE + 20) : H
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = altura
    const c = cv.getContext('2d')!
    c.textBaseline = 'alphabetic'
    c.fillStyle = '#fffaf3'
    c.fillRect(0, 0, W, altura)
    c.fillStyle = '#1c1917'
    c.fillRect(0, 0, W, cab - 30)
    c.fillStyle = '#ffffff'
    c.textAlign = 'center'
    if (n === 0) {
      c.font = `900 64px ${FONTE}`
      c.fillText(config.nomeLoja.toUpperCase(), W / 2, 92, W - MARGEM * 2)
      c.font = `700 32px ${FONTE}`
      c.fillStyle = '#fdba74'
      c.fillText(titulo, W / 2, 140, W - MARGEM * 2)
      const contato = [config.telefone, config.endereco].filter(Boolean).join(' · ')
      if (contato) {
        c.font = `400 24px ${FONTE}`
        c.fillStyle = '#d6d3d1'
        c.fillText(contato, W / 2, 180, W - MARGEM * 2)
      }
    } else {
      c.font = `900 40px ${FONTE}`
      c.fillText(`${config.nomeLoja.toUpperCase()} — ${titulo}`, W / 2, 62, W - MARGEM * 2)
    }
    c.textAlign = 'left'
    cols.forEach((col, k) => {
      let y = cab - 14
      const x = MARGEM + k * (COL + VAO)
      for (const b of col) {
        b.desenhar(c, x, y)
        y += b.altura
      }
    })
    c.textAlign = 'center'
    c.font = `400 20px ${FONTE}`
    c.fillStyle = '#78716c'
    if (alcool) c.fillText(AVISO_18, W / 2, altura - 52, W - MARGEM * 2)
    if (paginas.length > 1) c.fillText(`Página ${n + 1} de ${paginas.length}`, W / 2, altura - 22)
    return cv.toDataURL('image/png')
  })
}

export function imprimirImagens(imagens: string[], titulo: string) {
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  const doc = f.contentDocument!
  doc.open()
  doc.write(`<!doctype html><html><head><title>${titulo}</title><style>
    @page { size: A4; margin: 8mm; }
    body { margin: 0; }
    .pg { height: 279mm; display: flex; align-items: flex-start; justify-content: center; page-break-after: always; }
    .pg:last-child { page-break-after: auto; }
    img { max-width: 100%; max-height: 279mm; }
    .pg img { width: 100%; }
  </style></head><body>${imagens.map((i) => `<div class="pg"><img src="${i}"></div>`).join('')}</body></html>`)
  doc.close()
  const imgs = [...doc.images]
  Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => (i.onload = r))))).then(() => {
    f.contentWindow!.focus()
    f.contentWindow!.print()
    setTimeout(() => f.remove(), 60_000)
  })
}

// ---------------- catálogo completo de adega + bar + espetos ----------------

interface Extra {
  descricao?: string
  tamanho?: string
}

/** Descrições/tamanhos para os produtos que já vêm no sistema (só preenche o que estiver vazio). */
const DETALHES: Record<string, Extra> = {
  'p-carne': { descricao: 'Carne bovina temperada na brasa', tamanho: '100 g' },
  'p-frango': { descricao: 'Peito de frango temperado', tamanho: '100 g' },
  'p-linguica': { descricao: 'Linguiça toscana na brasa', tamanho: '100 g' },
  'p-misto': { descricao: 'Carne bovina e linguiça', tamanho: '110 g' },
  'p-coracao': { descricao: 'Coração de frango temperado', tamanho: '80 g' },
  'p-queijo': { descricao: 'Queijo coalho dourado na brasa', tamanho: '70 g' },
  'p-farofa': { descricao: 'Porção extra de farofa', tamanho: '50 g' },
  'p-jantinha': { descricao: 'Espeto à escolha + baião, mandioca, vinagrete e farofa', tamanho: 'serve 1 pessoa' },
  'p-combo3': { descricao: '3 espetos à escolha + 1 refrigerante lata', tamanho: 'serve 1 a 2 pessoas' },
  'p-coca': { descricao: 'Coca-Cola gelada', tamanho: '350 ml' },
  'p-guarana': { descricao: 'Guaraná gelado', tamanho: '350 ml' },
  'p-agua': { descricao: 'Água mineral sem gás', tamanho: '500 ml' },
  'p-cerveja': { descricao: 'Cerveja lata gelada', tamanho: '350 ml' },
  'bar-p-cachaca': { descricao: 'Cachaça', tamanho: '50 ml' },
  'bar-p-vodka': { descricao: 'Vodka', tamanho: '50 ml' },
  'bar-p-whisky': { descricao: 'Whisky', tamanho: '50 ml' },
  'bar-p-caipirinha': { descricao: 'Cachaça, limão, açúcar e gelo', tamanho: '400 ml' },
  'bar-p-caipiroska': { descricao: 'Vodka, limão, açúcar e gelo', tamanho: '400 ml' },
  'bar-p-chopp300': { descricao: 'Chopp gelado', tamanho: '300 ml' },
  'bar-p-chopp500': { descricao: 'Chopp gelado', tamanho: '500 ml' },
}

/** Itens do catálogo que já existem com outro id nos dados iniciais. */
const MESMO_QUE: Record<string, string> = { 'cat-coca-lata': 'p-coca', 'cat-guarana-lata': 'p-guarana', 'adega-agua': 'p-agua' }

/**
 * Adiciona um cardápio completo de adega (cervejas, destilados, doses, refrigerantes, energéticos, gelo, carvão, petiscos)
 * com descrição e tamanho. Não duplica o que já existe e não muda preços já cadastrados.
 * Os preços são uma base — ajuste para a sua região.
 */
export function adicionarCardapioCompleto(dados: Dados) {
  const b = (id: string, nome: string, emoji: string, preco: number, custo: number, caixa: number, tamanho: string, descricao: string, codigo?: string): Produto => ({
    id,
    nome,
    categoria: 'bebida',
    preco,
    emoji,
    ficha: [],
    custoDireto: custo,
    ativo: true,
    estoque: 0,
    unidadesCaixa: caixa,
    tamanho,
    descricao,
    ...(codigo ? { codigos: [codigo] } : {}),
  })
  const o = (id: string, nome: string, emoji: string, preco: number, custo: number, caixa: number, tamanho: string, descricao: string): Produto => ({
    ...b(id, nome, emoji, preco, custo, caixa, tamanho, descricao),
    categoria: 'outro',
  })
  const fardo = (id: string, base: string, nomeBase: string, qtd: number, preco: number): Produto => ({
    id,
    nome: `Fardo ${qtd} ${nomeBase}`,
    categoria: 'bebida',
    preco,
    emoji: '📦',
    ficha: [],
    custoDireto: 0,
    ativo: true,
    descricao: `${qtd} unidades geladas`,
    tamanho: `${qtd} un`,
    componentes: [{ id: 'c-unidade', nome: nomeBase, qtd, opcoes: [base] }],
  })
  const dose = (id: string, nome: string, preco: number, insumoId: string, ml: number, descricao: string): Produto => ({
    id,
    nome,
    categoria: 'drink',
    preco,
    emoji: '🥃',
    ficha: [{ insumoId, qtd: ml }],
    custoDireto: 0,
    ativo: true,
    tamanho: `${ml} ml`,
    descricao,
  })
  const ins = (id: string, nome: string, preco: number, litros: number): Insumo => ({ id, nome, unidade: 'L', precoCompra: preco, qtdCompra: litros, grupo: 'Bebidas', estoque: 0 })

  const insumos: Insumo[] = [
    ins('bar-cachaca', 'Cachaça', 25, 0.965),
    ins('bar-vodka', 'Vodka', 35, 1),
    ins('bar-whisky', 'Whisky', 90, 1),
    ins('bar-gin', 'Gin', 45, 1),
    ins('bar-conhaque', 'Conhaque', 20, 0.9),
    ins('bar-campari', 'Campari', 50, 0.9),
    { id: 'bar-limao', nome: 'Limão', unidade: 'un', precoCompra: 6, qtdCompra: 20, grupo: 'Bar' },
    { id: 'bar-acucar', nome: 'Açúcar', unidade: 'kg', precoCompra: 5, qtdCompra: 1, grupo: 'Bar' },
    { id: 'bar-gelo', nome: 'Gelo', unidade: 'kg', precoCompra: 12, qtdCompra: 5, grupo: 'Bar' },
  ]
  const caipi = (base: string) => [
    { insumoId: base, qtd: 60 },
    { insumoId: 'bar-limao', qtd: 1 },
    { insumoId: 'bar-acucar', qtd: 20 },
    { insumoId: 'bar-gelo', qtd: 150 },
  ]

  const produtos: Produto[] = [
    // cervejas — lata 350 ml
    b('adega-skol', 'Skol lata 350 ml', '🍺', 4.5, 2.8, 12, '350 ml', 'Pilsen, lata gelada'),
    b('adega-brahma', 'Brahma lata 350 ml', '🍺', 4.5, 2.9, 12, '350 ml', 'Pilsen, lata gelada'),
    b('cat-antarctica', 'Antarctica lata 350 ml', '🍺', 4.5, 2.8, 12, '350 ml', 'Pilsen, lata gelada'),
    b('cat-itaipava', 'Itaipava lata 350 ml', '🍺', 4, 2.5, 12, '350 ml', 'Pilsen, lata gelada'),
    b('cat-amstel', 'Amstel lata 350 ml', '🍺', 5.5, 3.5, 12, '350 ml', 'Puro malte, lata gelada'),
    b('cat-budweiser', 'Budweiser lata 350 ml', '🍺', 5.5, 3.6, 12, '350 ml', 'American lager, lata gelada'),
    b('cat-spaten', 'Spaten lata 350 ml', '🍺', 6, 3.9, 12, '350 ml', 'Puro malte, lata gelada'),
    b('adega-heineken', 'Heineken lata 350 ml', '🍺', 6.5, 4.2, 12, '350 ml', 'Puro malte, lata gelada'),
    // latinha 269 ml
    b('cat-skol-269', 'Skol latinha 269 ml', '🍺', 3.5, 2.2, 15, '269 ml', 'Pilsen, latinha gelada'),
    b('cat-brahma-269', 'Brahma latinha 269 ml', '🍺', 3.5, 2.3, 15, '269 ml', 'Pilsen, latinha gelada'),
    b('cat-brahma-dm-269', 'Brahma Duplo Malte latinha 269 ml', '🍺', 4, 2.6, 15, '269 ml', 'Puro malte, latinha gelada'),
    b('cat-antarctica-269', 'Antarctica latinha 269 ml', '🍺', 3.5, 2.2, 15, '269 ml', 'Pilsen, latinha gelada'),
    b('cat-itaipava-269', 'Itaipava latinha 269 ml', '🍺', 3, 1.9, 12, '269 ml', 'Pilsen, latinha gelada'),
    b('cat-amstel-269', 'Amstel latinha 269 ml', '🍺', 4.5, 2.9, 12, '269 ml', 'Puro malte, latinha gelada'),
    b('cat-budweiser-269', 'Budweiser latinha 269 ml', '🍺', 4.5, 2.9, 8, '269 ml', 'American lager, latinha gelada'),
    b('cat-heineken-269', 'Heineken latinha 269 ml', '🍺', 5.5, 3.6, 8, '269 ml', 'Puro malte, latinha gelada'),
    // barrigudinha 300 ml (garrafa de vidro retornável)
    b('cat-skol-300', 'Skol barrigudinha 300 ml', '🍾', 4, 2.4, 23, '300 ml', 'Garrafinha de vidro gelada (retornável)'),
    b('cat-brahma-300', 'Brahma barrigudinha 300 ml', '🍾', 4, 2.5, 23, '300 ml', 'Garrafinha de vidro gelada (retornável)'),
    b('cat-brahma-dm-300', 'Brahma Duplo Malte barrigudinha 300 ml', '🍾', 4.5, 2.8, 23, '300 ml', 'Puro malte, garrafinha de vidro (retornável)'),
    b('cat-antarctica-300', 'Antarctica barrigudinha 300 ml', '🍾', 4, 2.4, 23, '300 ml', 'Garrafinha de vidro gelada (retornável)'),
    b('cat-original-300', 'Original barrigudinha 300 ml', '🍾', 5.5, 3.4, 23, '300 ml', 'Pilsen, garrafinha de vidro (retornável)'),
    // latão 473 ml
    b('cat-brahma-latao', 'Brahma latão 473 ml', '🍺', 6, 3.9, 12, '473 ml', 'Pilsen, latão gelado'),
    b('cat-skol-latao', 'Skol latão 473 ml', '🍺', 6, 3.8, 12, '473 ml', 'Pilsen, latão gelado'),
    b('cat-heineken-latao', 'Heineken latão 473 ml', '🍺', 8.5, 5.6, 12, '473 ml', 'Puro malte, latão gelado'),
    // long neck
    b('adega-heineken-ln', 'Heineken long neck 330 ml', '🍺', 8, 5.2, 24, '330 ml', 'Puro malte, garrafa gelada'),
    b('adega-corona', 'Corona long neck 330 ml', '🍺', 9, 5.9, 24, '330 ml', 'Cerveja mexicana, garrafa gelada'),
    b('cat-stella-ln', 'Stella Artois long neck 330 ml', '🍺', 8, 5.1, 24, '330 ml', 'Puro malte, garrafa gelada'),
    b('cat-budweiser-ln', 'Budweiser long neck 330 ml', '🍺', 7, 4.4, 24, '330 ml', 'American lager, garrafa gelada'),
    // garrafas
    b('cat-original-600', 'Original 600 ml', '🍾', 12, 7.5, 24, '600 ml', 'Pilsen, garrafa gelada (retornável)'),
    b('cat-heineken-600', 'Heineken 600 ml', '🍾', 14, 9, 24, '600 ml', 'Puro malte, garrafa gelada (retornável)'),
    b('cat-skol-litrao', 'Skol litrão 1 L', '🍾', 10, 6.3, 12, '1 L', 'Pilsen, litrão gelado (traga o casco)'),
    b('cat-brahma-litrao', 'Brahma litrão 1 L', '🍾', 10, 6.5, 12, '1 L', 'Pilsen, litrão gelado (traga o casco)'),
    // fardos
    fardo('adega-f-skol', 'adega-skol', 'Skol lata', 12, 48),
    fardo('adega-f-brahma', 'adega-brahma', 'Brahma lata', 12, 48),
    fardo('adega-f-heineken', 'adega-heineken', 'Heineken lata', 12, 72),
    fardo('cat-f-amstel', 'cat-amstel', 'Amstel lata', 12, 60),
    fardo('cat-f-skol-269', 'cat-skol-269', 'Skol latinha 269', 15, 48),
    fardo('cat-f-brahma-269', 'cat-brahma-269', 'Brahma latinha 269', 15, 48),
    // doses e drinks (saem da garrafa aberta, em ml)
    dose('bar-p-cachaca', 'Dose de cachaça', 6, 'bar-cachaca', 50, 'Cachaça'),
    dose('bar-p-vodka', 'Dose de vodka', 8, 'bar-vodka', 50, 'Vodka'),
    dose('bar-p-whisky', 'Dose de whisky', 15, 'bar-whisky', 50, 'Whisky'),
    dose('cat-dose-gin', 'Dose de gin', 12, 'bar-gin', 50, 'Gin'),
    dose('cat-dose-conhaque', 'Dose de conhaque', 6, 'bar-conhaque', 50, 'Conhaque'),
    dose('cat-dose-campari', 'Dose de Campari', 10, 'bar-campari', 50, 'Campari'),
    { id: 'bar-p-caipirinha', nome: 'Caipirinha', categoria: 'drink', preco: 15, emoji: '🍹', ficha: caipi('bar-cachaca'), custoDireto: 0, ativo: true, tamanho: '400 ml', descricao: 'Cachaça, limão, açúcar e gelo' },
    { id: 'bar-p-caipiroska', nome: 'Caipiroska', categoria: 'drink', preco: 18, emoji: '🍸', ficha: caipi('bar-vodka'), custoDireto: 0, ativo: true, tamanho: '400 ml', descricao: 'Vodka, limão, açúcar e gelo' },
    // destilados e vinhos — garrafa fechada
    b('cat-51', 'Cachaça 51 965 ml', '🍶', 18, 12, 12, '965 ml', 'Garrafa fechada'),
    b('cat-ypioca', 'Ypióca Prata 965 ml', '🍶', 25, 17, 12, '965 ml', 'Garrafa fechada'),
    b('cat-velho-barreiro', 'Velho Barreiro 910 ml', '🍶', 18, 12, 12, '910 ml', 'Garrafa fechada'),
    b('cat-smirnoff', 'Vodka Smirnoff 998 ml', '🍾', 45, 32, 12, '998 ml', 'Garrafa fechada'),
    b('cat-absolut', 'Vodka Absolut 1 L', '🍾', 110, 82, 12, '1 L', 'Garrafa fechada'),
    b('cat-red-label', 'Whisky Red Label 1 L', '🥃', 120, 90, 12, '1 L', 'Garrafa fechada'),
    b('cat-jack', "Whisky Jack Daniel's 1 L", '🥃', 190, 145, 12, '1 L', 'Garrafa fechada'),
    b('cat-gin-rocks', 'Gin Rocks 1 L', '🍸', 50, 35, 12, '1 L', 'Garrafa fechada'),
    b('cat-tanqueray', 'Gin Tanqueray 750 ml', '🍸', 140, 105, 6, '750 ml', 'Garrafa fechada'),
    b('cat-campari', 'Campari 900 ml', '🍾', 60, 43, 12, '900 ml', 'Garrafa fechada'),
    b('cat-dreher', 'Conhaque Dreher 900 ml', '🍾', 22, 15, 12, '900 ml', 'Garrafa fechada'),
    b('cat-catuaba', 'Catuaba Selvagem 900 ml', '🍷', 18, 12, 12, '900 ml', 'Garrafa fechada'),
    b('cat-pergola', 'Vinho Pérgola tinto suave 1 L', '🍷', 25, 17, 12, '1 L', 'Garrafa fechada'),
    b('cat-corote', 'Corote 500 ml', '🍹', 7, 4.2, 12, '500 ml', 'Sabores variados'),
    b('cat-ice', 'Smirnoff Ice 275 ml', '🍹', 10, 6.5, 24, '275 ml', 'Long neck gelada'),
    b('cat-beats', 'Skol Beats 269 ml', '🍹', 9, 5.8, 12, '269 ml', 'Lata gelada, sabores variados'),
    // refrigerantes, água e sucos
    b('cat-coca-lata', 'Coca-Cola lata 350 ml', '🥤', 6, 3.2, 12, '350 ml', 'Lata gelada'),
    b('cat-coca-600', 'Coca-Cola 600 ml', '🥤', 8, 4.8, 12, '600 ml', 'Garrafa gelada'),
    b('adega-coca2l', 'Coca-Cola 2 L', '🥤', 14, 9.5, 6, '2 L', 'Garrafa gelada'),
    b('cat-guarana-lata', 'Guaraná Antarctica lata 350 ml', '🥤', 5, 2.9, 12, '350 ml', 'Lata gelada'),
    b('adega-guarana2l', 'Guaraná 2 L', '🥤', 10, 6.5, 6, '2 L', 'Garrafa gelada'),
    b('cat-fanta2l', 'Fanta Laranja 2 L', '🥤', 10, 6.5, 6, '2 L', 'Garrafa gelada'),
    b('cat-tonica', 'Água tônica lata 350 ml', '🥤', 6, 3.3, 12, '350 ml', 'Lata gelada'),
    b('cat-h2oh', 'H2OH! 500 ml', '🥤', 6, 3.5, 12, '500 ml', 'Garrafa gelada'),
    b('cat-suco', 'Suco Del Valle lata 290 ml', '🧃', 6, 3.4, 6, '290 ml', 'Sabores variados'),
    b('adega-agua', 'Água 500 ml', '💧', 3, 1.2, 12, '500 ml', 'Sem gás, gelada'),
    b('cat-agua-gas', 'Água com gás 500 ml', '💧', 4, 1.6, 12, '500 ml', 'Com gás, gelada'),
    // energéticos
    b('adega-redbull', 'Red Bull lata 250 ml', '⚡', 12, 7.5, 24, '250 ml', 'Energético, lata gelada'),
    b('cat-monster', 'Monster lata 473 ml', '⚡', 13, 8.5, 6, '473 ml', 'Energético, sabores variados'),
    b('cat-tnt', 'TNT lata 473 ml', '⚡', 9, 5.5, 6, '473 ml', 'Energético, lata gelada'),
    b('cat-baly2l', 'Energético Baly 2 L', '⚡', 18, 11, 6, '2 L', 'Garrafa gelada, sabores variados'),
    // petiscos
    o('cat-amendoim', 'Amendoim japonês', '🥜', 6, 3, 1, '150 g', 'Pacote'),
    o('cat-batata', 'Batata frita de pacote', '🥔', 8, 4.5, 1, '100 g', 'Pacote'),
    o('cat-torcida', 'Salgadinho Torcida', '🌽', 4, 2, 1, '70 g', 'Sabores variados'),
    // conveniência
    o('adega-gelo', 'Gelo saco 5 kg', '🧊', 12, 6, 1, '5 kg', 'Gelo em cubos'),
    o('cat-gelo2', 'Gelo saco 2 kg', '🧊', 6, 2.8, 1, '2 kg', 'Gelo em cubos'),
    o('cat-gelo-coco', 'Gelo de coco', '🥥', 4, 1.5, 1, '1 un', 'Sabores variados, para copão e drinks'),
    o('adega-carvao', 'Carvão 4 kg', '🔥', 25, 16, 1, '4 kg', 'Carvão vegetal'),
    o('cat-carvao2', 'Carvão 2 kg', '🔥', 14, 8.5, 1, '2 kg', 'Carvão vegetal'),
    o('cat-copo', 'Copo descartável 300 ml (50 un)', '🥛', 8, 4, 1, '50 un', 'Pacote'),
  ]

  dados.setInsumos((is) => [...is, ...insumos.filter((n) => !is.some((i) => i.id === n.id))])
  dados.setProdutos((ps) => {
    // completa descrição/tamanho do que já existe, sem mexer em preço
    const atualizados = ps.map((p) => {
      const d = DETALHES[p.id] ?? produtos.find((n) => n.id === p.id)
      if (!d) return p
      return { ...p, descricao: p.descricao || d.descricao, tamanho: p.tamanho || d.tamanho }
    })
    const jaTem = (id: string) => ps.some((p) => p.id === id)
    const novos = produtos.filter((n) => !ps.some((p) => p.id === n.id || sem(p.nome) === sem(n.nome)) && !(MESMO_QUE[n.id] && jaTem(MESMO_QUE[n.id])))
    return [...atualizados, ...novos]
  })
  return produtos.length
}
