import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORIAS,
  acharPorCodigo,
  buscarProdutos,
  limparCodigo,
  EMOJI_FORMA,
  FORMAS,
  NOMES_CATEGORIA,
  NOMES_FORMA,
  arred,
  brl,
  comEmbalagens,
  consumoDosItens,
  consumoInsumosDosItens,
  embalagensSugeridas,
  montarEmbalagens,
  precoComEscolhas,
  custoCompleto,
  moverEstoqueInsumos,
  moverEstoqueProdutos,
  novoId,
  taxaDaForma,
  taxaDoCanal,
  precoDelivery,
  NOMES_CANAL,
  type Dados,
} from './dados'
import { imprimirLancamento, imprimirPedido } from './impressao'
import { DetalheComanda } from './Comandas'
import { statusComanda } from './comanda'
import type { Canal, Categoria, Comanda, Escolha, ItemComanda, Pagamento, Pedido, Produto } from './tipos'
import { CampoNumero, Imagem, Modal, btn } from './ui'
import { LerComCamera, cameraLeSuportada, useLeitorCodigo } from './leitor'

interface Linha {
  id: string
  produtoId: string
  qtd: number
  obs: string
  escolhas?: Escolha[]
  /** Preço mudado na hora (promoção): vale só para esta linha. */
  precoManual?: number
}

const chaveEscolhas = (e?: Escolha[]) => (e ?? []).map((x) => `${x.produtoId}:${x.qtd}`).sort().join('|')

type Filtro = 'todos' | Categoria

/** Modo comanda: a mesma tela de venda, mas os itens são lançados numa comanda em vez de cobrados na hora. */
export interface ModoComanda {
  titulo: string
  aoLancar: (itens: ItemComanda[]) => void
  aoVoltar: () => void
}

export default function Venda({ dados, irPara, comanda }: { dados: Dados; irPara: (aba: 'caixa') => void; comanda?: ModoComanda }) {
  const { produtos, setProdutos, insumos, setInsumos, pedidos, setPedidos, caixaAberto, config, setConfig } = dados
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [cliente, setCliente] = useState('')
  const [viagem, setViagem] = useState(false)
  const [canal, setCanal] = useState<Canal>('balcao')
  const app = canal !== 'balcao'
  const precoBase = (p: Produto) => (app ? precoDelivery(p, config) : p.preco)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [codigoNovo, setCodigoNovo] = useState<string | null>(null)
  const [camera, setCamera] = useState(false)
  // leitor de código de barras: bipou sem clicar em nada, entra no pedido
  useLeitorCodigo(true, (c) => lerCodigoRef.current(c))
  const lerCodigoRef = useRef<(c: string) => void>(() => {})
  const [pagando, setPagando] = useState(false)
  /** Venda dividida: o pedido vira uma comanda "Balcão" e usa a tela de pagar por itens / dividir. */
  const [divididaId, setDivididaId] = useState<string | null>(null)
  const [lancandoMais, setLancandoMais] = useState(false)
  const [cortesiaAberta, setCortesiaAberta] = useState(false)
  /** Linha com o preço sendo mudado (promoção). */
  const [precoDe, setPrecoDe] = useState<string | null>(null)
  const [obsAberta, setObsAberta] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<Pedido | null>(null)
  const [montandoCombo, setMontandoCombo] = useState<Produto | null>(null)
  /** Quantidade de embalagens escolhida à mão; null = usa a sugestão automática. */
  const [embManual, setEmbManual] = useState<Record<string, number> | null>(null)

  useEffect(() => {
    if (!ultimo) return
    const t = setTimeout(() => setUltimo(null), 8000)
    return () => clearTimeout(t)
  }, [ultimo])

  // dia sem espeto (só adega): espetos e combos/jantinhas somem da venda
  const ativos = produtos.filter((p) => p.ativo && (config.espetoHoje || (p.categoria !== 'espeto' && p.categoria !== 'combo')))
  const filtrados = busca.trim() ? buscarProdutos(ativos, busca) : filtro === 'todos' ? ativos : ativos.filter((p) => p.categoria === filtro)
  const categorias = CATEGORIAS.filter((c) => ativos.some((p) => p.categoria === c))

  const consumoCarrinho = useMemo(() => consumoDosItens(linhas), [linhas])
  const noCarrinhoDireto = (id: string) => linhas.filter((l) => l.produtoId === id).reduce((s, l) => s + l.qtd, 0)
  /** Quanto ainda pode vender (estoque − o que já está no carrinho). undefined = sem controle. */
  const restante = (id: string) => {
    const est = produtos.find((p) => p.id === id)?.estoque
    return est === undefined ? undefined : est - (consumoCarrinho[id] ?? 0)
  }
  const insumosCarrinho = useMemo(() => consumoInsumosDosItens(linhas, produtos, insumos), [linhas, produtos, insumos])
  /** Quantas unidades ainda dá para vender pelo estoque de insumos controlados (ex.: baião). undefined = sem limite. */
  const limiteInsumos = (p: Produto) => {
    if (p.estoque !== undefined) return undefined
    let lim: number | undefined
    for (const f of p.ficha) {
      const ins = insumos.find((i) => i.id === f.insumoId)
      if (!ins || ins.estoque === undefined || f.qtd <= 0) continue
      const porcao = f.qtd / (ins.unidade === 'kg' || ins.unidade === 'L' ? 1000 : 1)
      const n = Math.floor((ins.estoque - (insumosCarrinho[ins.id] ?? 0)) / porcao + 1e-6)
      lim = lim === undefined ? n : Math.min(lim, n)
    }
    return lim
  }
  /** Combo esgotado quando algum componente não tem opções suficientes. */
  const comboDisponivel = (p: Produto) =>
    (p.componentes ?? []).every((c) => {
      let livre = 0
      for (const id of c.opcoes) {
        const r = restante(id)
        if (r === undefined) return true
        livre += Math.max(0, r)
      }
      return livre >= c.qtd
    })
  const restanteBotao = (p: Produto) => {
    if (p.componentes?.length && !comboDisponivel(p)) return 0
    // fardo/caixa (componentes de opção única): quantos fardos ainda dá com as unidades em estoque
    if (p.componentes?.length && p.componentes.every((c) => c.opcoes.length === 1)) {
      const fardos = p.componentes
        .map((c) => {
          const r = restante(c.opcoes[0])
          return r === undefined ? undefined : Math.floor(Math.max(0, r) / c.qtd)
        })
        .filter((v): v is number => v !== undefined)
      if (fardos.length) return Math.min(...fardos)
    }
    const valores = [restante(p.id), limiteInsumos(p)].filter((v): v is number => v !== undefined)
    return valores.length ? Math.min(...valores) : undefined
  }

  // disponíveis primeiro em ordem alfabética, esgotados no fim (na busca mantém a relevância).
  // O que já está no carrinho conta como disponível, para o botão não pular de lugar ao vender o último.
  const indisponivel = (p: Produto) => {
    const r = restanteBotao(p)
    return r !== undefined && r <= 0 && noCarrinhoDireto(p.id) === 0
  }
  const visiveis = (busca.trim() ? filtrados : [...filtrados].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base', numeric: true })))
    .map((p) => ({ p, fora: indisponivel(p) }))
    .sort((a, b) => Number(a.fora) - Number(b.fora))
    .map((x) => x.p)

  const prodPorId = (id: string) => produtos.find((p) => p.id === id)
  const precoLinha = (l: Linha) => {
    const p = prodPorId(l.produtoId)
    return p ? (l.precoManual ?? precoComEscolhas(p, l.escolhas, precoBase(p))) : 0
  }
  const subtotal = arred(linhas.reduce((s, l) => s + precoLinha(l) * l.qtd, 0))
  const qtdItens = linhas.reduce((s, l) => s + l.qtd, 0)

  const itensParaRegra = linhas.map((l) => ({ categoria: prodPorId(l.produtoId)?.categoria ?? 'outro', qtd: l.qtd, escolhas: l.escolhas }))
  const embSugeridas = embalagensSugeridas(itensParaRegra, config, insumos)
  const embQtds = viagem ? { ...embSugeridas, ...(embManual ?? {}) } : {}

  function adicionar(p: Produto, escolhas?: Escolha[]) {
    const r = restanteBotao(p)
    if (r !== undefined && r <= 0) return
    if (p.componentes?.length && !escolhas) {
      // componentes com uma opção só já entram sozinhos; com várias, pergunta
      if (p.componentes.every((c) => c.opcoes.length === 1)) {
        escolhas = p.componentes.map((c) => {
          const x = produtos.find((y) => y.id === c.opcoes[0])
          return { produtoId: c.opcoes[0], nome: x?.nome ?? '?', categoria: x?.categoria ?? 'outro', qtd: c.qtd }
        })
      } else {
        setMontandoCombo(p)
        return
      }
    }
    const chave = chaveEscolhas(escolhas)
    setLinhas((ls) => {
      const ultima = [...ls].reverse().find((l) => l.produtoId === p.id && !l.obs && chaveEscolhas(l.escolhas) === chave && l.precoManual === undefined)
      if (ultima) return ls.map((l) => (l.id === ultima.id ? { ...l, qtd: l.qtd + 1 } : l))
      return [...ls, { id: novoId(), produtoId: p.id, qtd: 1, obs: '', escolhas }]
    })
  }

  /** Código bipado (leitor, câmera ou digitado): acha o produto e põe no pedido. */
  function lerCodigo(codigo: string) {
    const p = acharPorCodigo(produtos, codigo)
    if (!p) {
      setCodigoNovo(limparCodigo(codigo))
      return
    }
    if (!p.ativo) {
      alert(`${p.nome} está desativado em Cadastros.`)
      return
    }
    const r = restanteBotao(p)
    if (r !== undefined && r <= 0) {
      alert(`${p.nome}: sem estoque.`)
      return
    }
    adicionar(p)
  }

  lerCodigoRef.current = lerCodigo

  function mudarQtd(id: string, delta: number) {
    const linha = linhas.find((l) => l.id === id)
    if (!linha) return
    if (delta > 0) {
      const precisa = consumoDosItens([{ ...linha, qtd: 1 }])
      if (Object.entries(precisa).some(([pid, q]) => {
        const r = restante(pid)
        return r !== undefined && r < q
      })) return
      const prod = prodPorId(linha.produtoId)
      const lim = prod ? limiteInsumos(prod) : undefined
      if (lim !== undefined && lim <= 0) return
    }
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, qtd: l.qtd + delta } : l)).filter((l) => l.qtd > 0))
  }

  function alternarObs(id: string, obs: string) {
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.id !== id) return l
        const partes = l.obs ? l.obs.split(', ') : []
        const nova = partes.includes(obs) ? partes.filter((x) => x !== obs) : [...partes, obs]
        return { ...l, obs: nova.join(', ') }
      }),
    )
  }

  function limpar() {
    setLinhas([])
    setCliente('')
    setViagem(false)
    setCanal('balcao')
    setEmbManual(null)
    setObsAberta(null)
  }

  function montarItens() {
    return linhas
      .map((l) => {
        const p = prodPorId(l.produtoId)
        if (!p) return null
        return {
          produtoId: p.id,
          nome: p.nome,
          categoria: p.categoria,
          emoji: p.emoji,
          preco: l.precoManual ?? precoComEscolhas(p, l.escolhas, precoBase(p)),
          ...(l.precoManual !== undefined ? { precoNormal: precoComEscolhas(p, l.escolhas, precoBase(p)) } : {}),
          custo: arred(custoCompleto(p, insumos, produtos, l.escolhas)),
          qtd: l.qtd,
          obs: l.obs,
          ...(l.escolhas?.length ? { escolhas: l.escolhas } : {}),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }

  /** Comanda: anota os itens na mesa, tira do estoque (vão para a brasa) e limpa a tela. */
  function lancarNaComanda() {
    if (!comanda || !linhas.length) return
    const itens = montarItens()
    const agora = new Date().toISOString()
    setInsumos((is) => moverEstoqueInsumos(is, consumoInsumosDosItens(itens, produtos, insumos), -1))
    setProdutos((ps) => moverEstoqueProdutos(ps, consumoDosItens(itens), -1))
    comanda.aoLancar(itens.map((i) => ({ ...i, id: novoId(), lancadoEm: agora })))
    limpar()
  }

  /** Dividir a conta / pagar itens separados: mesma tela das comandas. */
  function dividir() {
    if (!linhas.length) return
    const itens = montarItens()
    const agora = new Date().toISOString()
    const c: Comanda = {
      id: novoId(),
      numero: dados.comandas.reduce((m, x) => Math.max(m, x.numero), 0) + 1,
      mesa: 'Balcão',
      nome: cliente.trim(),
      abertaEm: agora,
      itens: itens.map((i) => ({ ...i, id: novoId(), lancadoEm: agora })),
    }
    setInsumos((is) => moverEstoqueInsumos(is, consumoInsumosDosItens(itens, produtos, insumos), -1))
    setProdutos((ps) => moverEstoqueProdutos(ps, consumoDosItens(itens), -1))
    dados.setComandas((cs) => [...cs, c])
    if (config.imprimirAoFinalizar && config.viaChurrasqueira) imprimirLancamento(c, c.itens, config, true)
    limpar()
    setDivididaId(c.id)
  }

  /** Consumo próprio / cortesia: sai do estoque, não entra dinheiro, o custo sai do lucro. */
  function registrarCortesia(motivo: string) {
    if (!caixaAberto || !linhas.length) return
    const itensVenda = montarItens()
    const valor = arred(itensVenda.reduce((s, i) => s + i.preco * i.qtd, 0))
    const itens = itensVenda.map((i) => ({ ...i, preco: 0 }))
    const numero = pedidos.filter((p) => p.caixaId === caixaAberto.id).reduce((m, p) => Math.max(m, p.numero), 0) + 1
    const pedido: Pedido = {
      id: novoId(),
      numero,
      caixaId: caixaAberto.id,
      criadoEm: new Date().toISOString(),
      cliente: `🎁 ${motivo}${cliente.trim() ? ` — ${cliente.trim()}` : ''}`,
      viagem,
      itens,
      subtotal: 0,
      desconto: 0,
      total: 0,
      pagamentos: [],
      recebidoDinheiro: 0,
      troco: 0,
      taxas: 0,
      custoTotal: arred(itens.reduce((s, i) => s + i.custo * i.qtd, 0)),
      cortesia: { motivo, valor },
      cancelado: false,
      entregue: false,
    }
    setPedidos((ps) => [...ps, pedido])
    setInsumos((is) => moverEstoqueInsumos(is, consumoInsumosDosItens(itens, produtos, insumos), -1))
    setProdutos((ps) => moverEstoqueProdutos(ps, consumoDosItens(itens), -1))
    // só a via de preparo (se tiver o que preparar); não tem cupom de cliente
    if (config.imprimirAoFinalizar && config.viaChurrasqueira && itens.some((i) => i.categoria !== 'bebida'))
      imprimirPedido(pedido, config, { churrasqueira: true, cliente: false })
    setCortesiaAberta(false)
    limpar()
  }

  function finalizar(desconto: number, pagamentos: Pagamento[], recebidoDinheiro: number) {
    if (!caixaAberto) return
    const itens = montarItens()
    const total = arred(subtotal - desconto)
    const emDinheiro = pagamentos.filter((p) => p.forma === 'dinheiro').reduce((s, p) => s + p.valor, 0)
    const numero = pedidos.filter((p) => p.caixaId === caixaAberto.id).reduce((m, p) => Math.max(m, p.numero), 0) + 1
    const embalagens = montarEmbalagens(embQtds, insumos)
    const custoEmbalagens = embalagens.reduce((s, e) => s + e.qtd * e.custo, 0)
    const pedido: Pedido = {
      id: novoId(),
      numero,
      caixaId: caixaAberto.id,
      criadoEm: new Date().toISOString(),
      cliente: cliente.trim(),
      viagem,
      itens,
      subtotal,
      desconto,
      total,
      pagamentos: pagamentos.filter((p) => p.valor > 0),
      recebidoDinheiro: recebidoDinheiro > 0 ? recebidoDinheiro : 0,
      troco: recebidoDinheiro > emDinheiro ? arred(recebidoDinheiro - emDinheiro) : 0,
      taxas: arred(
        pagamentos.reduce((s, p) => s + (p.valor * taxaDaForma(p.forma, config)) / 100, 0) + (total * taxaDoCanal(canal, config)) / 100,
      ),
      ...(app ? { canal } : {}),
      custoTotal: arred(itens.reduce((s, i) => s + i.custo * i.qtd, 0) + custoEmbalagens),
      ...(embalagens.length ? { embalagens } : {}),
      cancelado: false,
      entregue: false,
    }
    setPedidos((ps) => [...ps, pedido])
    setInsumos((is) => moverEstoqueInsumos(is, comEmbalagens(consumoInsumosDosItens(itens, produtos, insumos), embalagens), -1))
    setProdutos((ps) => moverEstoqueProdutos(ps, consumoDosItens(itens), -1))
    if (config.imprimirAoFinalizar) imprimirPedido(pedido, config)
    setUltimo(pedido)
    setPagando(false)
    limpar()
  }

  const dividida = divididaId ? dados.comandas.find((c) => c.id === divididaId) : undefined
  if (dividida && !comanda) {
    if (lancandoMais) {
      return (
        <Venda
          dados={dados}
          irPara={irPara}
          comanda={{
            titulo: `Balcão${dividida.nome ? ` · ${dividida.nome}` : ''}`,
            aoVoltar: () => setLancandoMais(false),
            aoLancar: (itens) => {
              dados.setComandas((cs) => cs.map((c) => (c.id === dividida.id ? { ...c, itens: [...c.itens, ...itens] } : c)))
              if (config.imprimirAoFinalizar && config.viaChurrasqueira) imprimirLancamento(dividida, itens, config, false)
              setLancandoMais(false)
            },
          }}
        />
      )
    }
    return (
      <div className="mx-auto max-w-4xl">
        <DetalheComanda dados={dados} comanda={dividida} aoVoltar={() => setDivididaId(null)} aoLancar={() => setLancandoMais(true)}
          irPara={irPara}
          rotuloVoltar={statusComanda(dividida, dados.pedidos) === 'aberta' ? '← Voltar para a venda (a conta fica em Comandas)' : '← Nova venda'}
        />
      </div>
    )
  }

  if (!caixaAberto && !comanda) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border-2 border-dashed border-stone-300 bg-white p-8 text-center">
        <div className="text-5xl">🔒</div>
        <h2 className="mt-3 text-2xl font-extrabold">Caixa fechado</h2>
        <p className="mt-2 text-stone-600">Abra o caixa para começar a vender. Lá você informa o troco e quantos espetos preparou hoje.</p>
        <button className={`${btn.primario} mt-6 w-full text-lg`} onClick={() => irPara('caixa')}>
          Abrir caixa
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-24 lg:flex-row lg:items-start lg:pb-0">
      {/* Botões de produtos */}
      <section className="min-w-0 flex-1">
        <div className="mb-3 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-xl border-2 border-stone-200 bg-white px-4 py-3 text-lg outline-none focus:border-orange-500"
            placeholder="🔎 Bipe o código ou digite o nome…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setBusca('')
              if (e.key !== 'Enter' || !busca.trim()) return
              e.preventDefault()
              const porCodigo = acharPorCodigo(produtos, busca)
              if (porCodigo) lerCodigo(busca)
              else if (visiveis.length === 1) adicionar(visiveis[0])
              else if (/^\d{6,}$/.test(busca.trim())) setCodigoNovo(limparCodigo(busca))
              else return
              setBusca('')
            }}
          />
          {cameraLeSuportada() && (
            <button className="rounded-xl bg-white px-4 text-2xl ring-2 ring-stone-200" onClick={() => setCamera(true)} title="Ler código pela câmera">
              📷
            </button>
          )}
          {!comanda && (
            <button
              onClick={() => setConfig((c) => ({ ...c, espetoHoje: !c.espetoHoje }))}
              className={`shrink-0 rounded-xl px-3 text-sm font-bold ${config.espetoHoje ? 'bg-orange-600 text-white' : 'bg-white text-stone-500 ring-2 ring-stone-200'}`}
              title="Nos dias sem espeto, os espetos e combos somem da venda e não sai cupom da churrasqueira"
            >
              🔥 Espeto hoje: {config.espetoHoje ? 'SIM' : 'NÃO'}
            </button>
          )}
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {(['todos', ...categorias] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`shrink-0 rounded-full px-5 py-2 text-base font-bold ${filtro === f ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 ring-2 ring-stone-200'}`}
            >
              {f === 'todos' ? 'Todos' : NOMES_CATEGORIA[f]}
            </button>
          ))}
        </div>
        {visiveis.length === 0 && (
          <p className="rounded-xl bg-white p-6 text-center text-stone-500">
            {busca.trim() ? `Nada encontrado para “${busca}”.` : 'Nenhum produto ativo. Cadastre em “Cadastros”.'}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {visiveis.map((p) => {
            const r = restanteBotao(p)
            const esgotado = r !== undefined && r <= 0
            const qtd = noCarrinhoDireto(p.id)
            const cor =
              p.categoria === 'espeto'
                ? 'border-orange-300'
                : p.categoria === 'combo'
                  ? 'border-rose-300'
                  : p.categoria === 'drink'
                    ? 'border-violet-300'
                    : p.categoria === 'bebida'
                    ? 'border-sky-300'
                    : 'border-amber-300'
            return (
              <button
                key={p.id}
                onClick={() => adicionar(p)}
                disabled={esgotado}
                className={`relative flex select-none flex-col items-center overflow-hidden rounded-2xl border-4 bg-white text-center shadow-sm transition active:scale-95 ${cor} ${esgotado ? 'opacity-40 grayscale' : 'hover:shadow-md'} ${qtd ? 'ring-4 ring-orange-500' : ''}`}
              >
                <Imagem emoji={p.emoji} imagem={p.imagem} className="h-20 w-full text-5xl sm:h-24" />
                <div className="w-full px-2 pb-2 pt-1">
                  <div className="line-clamp-2 text-base font-extrabold leading-tight text-stone-900">{p.nome}</div>
                  <div className="text-lg font-bold text-orange-700">{brl(precoBase(p))}</div>
                </div>
                {qtd > 0 && (
                  <span className="absolute left-1.5 top-1.5 flex h-9 min-w-9 items-center justify-center rounded-full bg-orange-600 px-2 text-lg font-black text-white shadow">
                    {qtd}
                  </span>
                )}
                {r !== undefined && (
                  <span
                    className={`absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${esgotado ? 'bg-stone-800 text-white' : r <= config.alertaEstoque ? 'bg-red-600 text-white' : 'bg-stone-100 text-stone-700'}`}
                  >
                    {esgotado ? 'ESGOTADO' : `resta ${r}`}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* Comanda */}
      <aside id="comanda" className="w-full shrink-0 rounded-2xl border-2 border-stone-200 bg-white p-4 lg:sticky lg:top-4 lg:w-[400px]">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold">{comanda ? `+ Itens para ${comanda.titulo}` : 'Pedido'}</h2>
          {linhas.length > 0 && (
            <button className="text-sm font-semibold text-red-600 hover:underline" onClick={limpar}>
              Limpar
            </button>
          )}
        </div>

{!comanda && (
          <>
        <input
          className="mt-3 w-full rounded-xl border-2 border-stone-200 px-3 py-2 text-lg outline-none focus:border-orange-500"
          placeholder="Nome do cliente ou mesa (opcional)"
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setViagem(false)}
            className={`rounded-xl py-3 text-base font-extrabold ${!viagem ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}
          >
            🍽️ Comer aqui
          </button>
          <button
            onClick={() => setViagem(true)}
            className={`rounded-xl py-3 text-base font-extrabold ${viagem ? 'bg-orange-600 text-white' : 'bg-stone-100 text-stone-600'}`}
          >
            🛍️ Para viagem
          </button>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1 text-sm font-bold">
          {(['balcao', 'ifood', '99food'] as Canal[]).map((c) => (
            <button
              key={c}
              onClick={() => {
                setCanal(c)
                if (c !== 'balcao') setViagem(true)
              }}
              className={`rounded-lg py-1.5 ${canal === c ? (c === 'balcao' ? 'bg-white text-stone-900 shadow' : c === 'ifood' ? 'bg-red-600 text-white' : 'bg-amber-400 text-stone-900') : 'text-stone-500'}`}
            >
              {c === 'balcao' ? '🏪' : '🛵'} {NOMES_CANAL[c]}
            </button>
          ))}
        </div>
        {app && (
          <p className="mt-1 text-xs text-stone-500">
            Preços do {NOMES_CANAL[canal]} (+{config.acrescimoDelivery}% ou o preço próprio do produto). Comissão de {taxaDoCanal(canal, config)}% sai do lucro.
          </p>
        )}

        {viagem && Object.keys(embQtds).length > 0 && (
          <div className="mt-2 rounded-xl bg-orange-50 p-2">
            {Object.entries(embQtds).map(([id, q]) => {
              const ins = insumos.find((i) => i.id === id)
              if (!ins) return null
              const mudar = (d: number) => setEmbManual((m) => ({ ...(m ?? {}), [id]: Math.max(0, q + d) }))
              return (
                <div key={id} className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-bold text-orange-900">
                    🧊 {ins.nome}
                    {ins.estoque !== undefined && ins.estoque - q < 0 && <span className="block text-xs font-semibold text-red-600">estoque acabando — lance a compra</span>}
                  </span>
                  <button className="h-8 w-8 rounded-full bg-white text-xl font-bold" onClick={() => mudar(-1)} aria-label="Menos">
                    −
                  </button>
                  <span className="w-6 text-center text-lg font-black">{q}</span>
                  <button className="h-8 w-8 rounded-full bg-white text-xl font-bold text-orange-700" onClick={() => mudar(1)} aria-label="Mais">
                    +
                  </button>
                </div>
              )
            })}
          </div>
        )}

          </>
        )}

        <ul className="mt-3 divide-y divide-stone-100">
          {linhas.length === 0 && <li className="py-8 text-center text-stone-400">Toque nos produtos para adicionar</li>}
          {linhas.map((l) => {
            const p = prodPorId(l.produtoId)
            if (!p) return null
            const aberta = obsAberta === l.id
            return (
              <li key={l.id} className="py-2">
                <div className="flex items-center gap-2">
                  <Imagem emoji={p.emoji} imagem={p.imagem} className="h-10 w-10 shrink-0 rounded-lg text-2xl" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{p.nome}</div>
                    {l.escolhas && p.componentes?.some((c) => c.opcoes.length > 1) && (
                      <div className="text-sm font-semibold text-rose-700">{l.escolhas.map((e) => `${e.qtd}x ${e.nome}`).join(' + ')}</div>
                    )}
                    <div className="text-sm text-stone-500">
                      <button className="rounded px-1 underline decoration-dotted hover:bg-orange-50" title="Mudar o preço (promoção)" onClick={() => setPrecoDe(l.id)}>
                        {l.precoManual !== undefined && (
                          <span className="mr-1 text-xs text-stone-400 line-through">{brl(precoComEscolhas(p, l.escolhas, precoBase(p)))}</span>
                        )}
                        <span className={l.precoManual !== undefined ? 'font-bold text-emerald-700' : ''}>{brl(precoLinha(l))}</span> ✏️
                      </button>{' '}
                      · <span className="font-semibold text-stone-800">{brl(precoLinha(l) * l.qtd)}</span>
                      {l.precoManual !== undefined && <span className="ml-1 rounded bg-emerald-100 px-1 text-xs font-bold text-emerald-800">PROMO</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="h-10 w-10 rounded-full bg-stone-100 text-2xl font-bold" onClick={() => mudarQtd(l.id, -1)} aria-label="Menos">
                      −
                    </button>
                    <span className="w-8 text-center text-xl font-black">{l.qtd}</span>
                    <button className="h-10 w-10 rounded-full bg-orange-100 text-2xl font-bold text-orange-700" onClick={() => mudarQtd(l.id, 1)} aria-label="Mais">
                      +
                    </button>
                  </div>
                </div>
                <div className="mt-1 pl-12">
                  {l.obs && <div className="text-sm font-semibold text-orange-700">» {l.obs}</div>}
                  <button className="text-sm text-stone-500 underline" onClick={() => setObsAberta(aberta ? null : l.id)}>
                    {aberta ? 'ok, fechar' : l.obs ? 'editar observação' : '+ observação'}
                  </button>
                  {aberta && (
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {config.obsRapidas.map((o) => {
                          const marcado = l.obs.split(', ').includes(o)
                          return (
                            <button
                              key={o}
                              onClick={() => alternarObs(l.id, o)}
                              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${marcado ? 'bg-orange-600 text-white' : 'bg-stone-100 text-stone-700'}`}
                            >
                              {o}
                            </button>
                          )
                        })}
                      </div>
                      <input
                        className="w-full rounded-lg border-2 border-stone-200 px-2 py-1.5 text-sm outline-none focus:border-orange-500"
                        placeholder="Outra observação…"
                        value={l.obs}
                        onChange={(e) => setLinhas((ls) => ls.map((x) => (x.id === l.id ? { ...x, obs: e.target.value } : x)))}
                      />
                      {l.qtd > 1 && (
                        <p className="text-xs text-stone-500">
                          Dica: para só 1 dos {l.qtd} ficar diferente, diminua aqui e toque no produto de novo.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="mt-3 flex items-end justify-between border-t-2 border-stone-200 pt-3">
          <span className="text-stone-600">{qtdItens} {qtdItens === 1 ? 'item' : 'itens'}</span>
          <span className="text-3xl font-black">{brl(subtotal)}</span>
        </div>
        {comanda ? (
          <>
            <button className={`${btn.verde} mt-3 w-full py-4 text-xl`} disabled={!linhas.length} onClick={lancarNaComanda}>
              ✔ Lançar na comanda
            </button>
            <button className={`${btn.secundario} mt-2 w-full`} onClick={comanda.aoVoltar}>
              {linhas.length ? 'Cancelar e voltar' : '← Voltar para a comanda'}
            </button>
          </>
        ) : (
          <>
            <button className={`${btn.verde} mt-3 w-full py-4 text-xl`} disabled={!linhas.length} onClick={() => setPagando(true)}>
              Finalizar pedido
            </button>
            {!app && (
              <button
                className={`${btn.secundario} mt-2 w-full`}
                disabled={!linhas.length}
                onClick={dividir}
                title="Pagar itens separados ou dividir a conta entre pessoas"
              >
                👥 Dividir conta / pagar itens separados
              </button>
            )}
            {!app && (
              <button className="mt-2 w-full py-1 text-sm font-semibold text-stone-500 hover:text-orange-700" disabled={!linhas.length} onClick={() => setCortesiaAberta(true)}>
                🎁 Cortesia / consumo próprio (não é venda)
              </button>
            )}
          </>
        )}
      </aside>

      {/* Barra fixa no celular */}
      {linhas.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t-2 border-stone-200 bg-white p-3 shadow-2xl lg:hidden">
          <button className="flex-1 text-left" onClick={() => document.getElementById('comanda')?.scrollIntoView({ behavior: 'smooth' })}>
            <div className="text-sm text-stone-500">{qtdItens} itens · ver pedido</div>
            <div className="text-2xl font-black">{brl(subtotal)}</div>
          </button>
          <button className={`${btn.verde} text-lg`} onClick={() => (comanda ? lancarNaComanda() : setPagando(true))}>
            {comanda ? 'Lançar' : 'Finalizar'}
          </button>
        </div>
      )}

      {camera && (
        <LerComCamera
          aoFechar={() => setCamera(false)}
          aoLer={(c) => {
            setCamera(false)
            lerCodigo(c)
          }}
        />
      )}
      {codigoNovo && (
        <ModalVincularCodigo
          codigo={codigoNovo}
          produtos={produtos.filter((p) => p.ativo)}
          aoFechar={() => setCodigoNovo(null)}
          aoVincular={(p) => {
            setProdutos((ps) => ps.map((x) => (x.id === p.id ? { ...x, codigos: [...(x.codigos ?? []), codigoNovo] } : x)))
            setCodigoNovo(null)
            adicionar(p)
          }}
        />
      )}

      {montandoCombo && (
        <ModalCombo
          combo={montandoCombo}
          produtos={produtos}
          restante={restante}
          aoFechar={() => setMontandoCombo(null)}
          aoConfirmar={(esc) => {
            adicionar(montandoCombo, esc)
            setMontandoCombo(null)
          }}
        />
      )}

      {precoDe &&
        (() => {
          const l = linhas.find((x) => x.id === precoDe)
          const p = l && prodPorId(l.produtoId)
          if (!l || !p) return null
          return (
            <ModalPreco
              nome={p.nome}
              normal={precoComEscolhas(p, l.escolhas, precoBase(p))}
              atual={precoLinha(l)}
              aoFechar={() => setPrecoDe(null)}
              aoSalvar={(v) => {
                setLinhas((ls) => ls.map((x) => (x.id === l.id ? { ...x, precoManual: v } : x)))
                setPrecoDe(null)
              }}
            />
          )
        })()}
      {cortesiaAberta && <ModalCortesia valor={subtotal} custo={arred(montarItens().reduce((s, i) => s + i.custo * i.qtd, 0))} aoFechar={() => setCortesiaAberta(false)} aoConfirmar={registrarCortesia} />}
      {pagando && (
        <ModalPagamento subtotal={subtotal} viagem={viagem} app={app ? NOMES_CANAL[canal] : undefined} aoFechar={() => setPagando(false)} aoConfirmar={finalizar} />
      )}

      {ultimo && (
        <div className="fixed inset-x-3 bottom-24 z-40 mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-stone-900 p-4 text-white shadow-2xl lg:bottom-6">
          <div className="text-3xl">✅</div>
          <div className="flex-1">
            <div className="font-extrabold">Pedido Nº {String(ultimo.numero).padStart(3, '0')} finalizado</div>
            <div className="text-sm text-stone-300">
              {brl(ultimo.total)}
              {ultimo.troco > 0 && (
                <>
                  {' '}
                  · <span className="font-bold text-yellow-300">TROCO {brl(ultimo.troco)}</span>
                </>
              )}
            </div>
          </div>
          <button className="rounded-lg bg-white/15 px-3 py-2 text-sm font-bold" onClick={() => imprimirPedido(ultimo, config)}>
            🖨️ Imprimir
          </button>
        </div>
      )}
    </div>
  )
}

export function ModalPagamento({
  subtotal,
  viagem,
  app,
  aoFechar,
  aoConfirmar,
}: {
  subtotal: number
  viagem: boolean
  /** Pedido de app de delivery (nome do app): mostra “Pago no app”. */
  app?: string
  aoFechar: () => void
  aoConfirmar: (desconto: number, pagamentos: Pagamento[], recebidoDinheiro: number) => void
}) {
  const [desconto, setDesconto] = useState(0)
  const [pagamentos, setPagamentos] = useState<Pagamento[]>(app ? [{ forma: 'app', valor: subtotal }] : [])
  const [recebido, setRecebido] = useState(0)
  const total = arred(Math.max(0, subtotal - desconto))
  const pago = arred(pagamentos.reduce((s, p) => s + p.valor, 0))
  const falta = arred(total - pago)
  const emDinheiro = pagamentos.find((p) => p.forma === 'dinheiro')?.valor ?? 0
  const troco = recebido > emDinheiro ? arred(recebido - emDinheiro) : 0
  const recebidoInsuficiente = emDinheiro > 0 && recebido > 0 && recebido < emDinheiro
  const pode = pagamentos.length > 0 && Math.abs(falta) < 0.01 && !recebidoInsuficiente

  // ao mudar o desconto com uma única forma escolhida, acompanha o novo total
  useEffect(() => {
    setPagamentos((ps) => (ps.length === 1 ? [{ ...ps[0], valor: total }] : ps))
  }, [total])

  function escolher(forma: Pagamento['forma']) {
    if (pagamentos.some((p) => p.forma === forma)) return
    if (falta <= 0.005 && pagamentos.length === 1) {
      setPagamentos([{ forma, valor: total }])
      if (forma !== 'dinheiro') setRecebido(0)
      return
    }
    if (falta > 0) setPagamentos((ps) => [...ps, { forma, valor: falta }])
  }

  const notas = [5, 10, 20, 50, 100, 200].filter((n) => n > emDinheiro)

  return (
    <Modal titulo="Pagamento" aberto aoFechar={aoFechar}>
      <div className="rounded-2xl bg-stone-900 p-4 text-white">
        <div className="flex items-center justify-between text-sm text-stone-300">
          <span>Total a pagar</span>
          {viagem && <span className="rounded bg-orange-600 px-2 py-0.5 font-bold text-white">{app ? `${app.toUpperCase()} — VIAGEM` : 'PARA VIAGEM'}</span>}
        </div>
        <div className="text-4xl font-black">{brl(total)}</div>
        {desconto > 0 && <div className="text-sm text-stone-300">Subtotal {brl(subtotal)} − desconto {brl(desconto)}</div>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(app ? (['app', ...FORMAS] as Pagamento['forma'][]) : FORMAS).map((f) => {
          const sel = pagamentos.some((p) => p.forma === f)
          return (
            <button
              key={f}
              onClick={() => escolher(f)}
              className={`rounded-xl border-4 py-4 text-lg font-extrabold ${sel ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-stone-200 bg-white text-stone-800'}`}
            >
              {EMOJI_FORMA[f]} {f === 'app' ? `Pago no ${app}` : NOMES_FORMA[f]}
            </button>
          )
        })}
      </div>

      {pagamentos.length > 0 && (
        <div className="mt-4 space-y-3">
          {pagamentos.map((p, idx) => (
            <div key={p.forma} className="rounded-xl border-2 border-stone-200 p-3">
              <div className="flex items-center gap-2">
                <span className="w-24 font-bold">{p.forma === 'app' && app ? `Pago no ${app}` : NOMES_FORMA[p.forma]}</span>
                <CampoNumero
                  className="flex-1"
                  prefixo="R$"
                  valor={p.valor}
                  aoMudar={(v) => setPagamentos((ps) => ps.map((x, i) => (i === idx ? { ...x, valor: v } : x)))}
                />
                <button
                  className="rounded-lg px-2 py-1 text-xl text-stone-400 hover:text-red-600"
                  onClick={() => {
                    setPagamentos((ps) => ps.filter((_, i) => i !== idx))
                    if (p.forma === 'dinheiro') setRecebido(0)
                  }}
                  aria-label="Remover"
                >
                  ×
                </button>
              </div>
              {p.forma === 'dinheiro' && (
                <div className="mt-3">
                  <CampoNumero rotulo="Cliente entregou" prefixo="R$" grande valor={recebido} aoMudar={setRecebido} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className={btn.secundario} onClick={() => setRecebido(emDinheiro)}>
                      Exato
                    </button>
                    {notas.map((n) => (
                      <button key={n} className={btn.secundario} onClick={() => setRecebido(n)}>
                        R$ {n}
                      </button>
                    ))}
                  </div>
                  {troco > 0 && (
                    <div className="mt-3 rounded-xl bg-yellow-100 p-3 text-center">
                      <div className="text-sm font-semibold text-yellow-900">TROCO</div>
                      <div className="text-4xl font-black text-yellow-900">{brl(troco)}</div>
                    </div>
                  )}
                  {recebidoInsuficiente && <p className="mt-2 font-semibold text-red-600">Valor entregue é menor que o valor em dinheiro.</p>}
                </div>
              )}
            </div>
          ))}
          {Math.abs(falta) >= 0.01 && (
            <p className={`font-bold ${falta > 0 ? 'text-red-600' : 'text-amber-700'}`}>
              {falta > 0 ? `Falta ${brl(falta)} — escolha outra forma para dividir.` : `Passou ${brl(-falta)} do total — ajuste os valores.`}
            </p>
          )}
        </div>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-stone-600">Dar desconto</summary>
        <div className="mt-2 flex gap-2">
          <CampoNumero className="flex-1" prefixo="R$" valor={desconto} aoMudar={(v) => setDesconto(Math.min(v, subtotal))} />
          {[5, 10].map((pc) => (
            <button key={pc} className={btn.secundario} onClick={() => setDesconto(arred((subtotal * pc) / 100))}>
              {pc}%
            </button>
          ))}
        </div>
      </details>

      <div className="sticky -bottom-4 -mx-4 mt-5 bg-white px-4 pb-4 pt-2 sm:-bottom-6 sm:-mx-6 sm:px-6 sm:pb-6">
        <button className={`${btn.verde} w-full py-4 text-xl`} disabled={!pode} onClick={() => aoConfirmar(desconto, pagamentos, recebido)}>
          {pagamentos.length ? `✔ Confirmar ${brl(total)}` : 'Escolha a forma de pagamento'}
        </button>
      </div>
    </Modal>
  )
}

function ModalCombo({
  combo,
  produtos,
  restante,
  aoFechar,
  aoConfirmar,
}: {
  combo: Produto
  produtos: Produto[]
  restante: (id: string) => number | undefined
  aoFechar: () => void
  aoConfirmar: (escolhas: Escolha[]) => void
}) {
  const comps = combo.componentes ?? []
  // escolhas[componenteId][produtoId] = qtd
  const [sel, setSel] = useState<Record<string, Record<string, number>>>(() =>
    Object.fromEntries(comps.map((c) => [c.id, c.opcoes.length === 1 ? { [c.opcoes[0]]: c.qtd } : {}])),
  )
  const totalComp = (cid: string) => Object.values(sel[cid] ?? {}).reduce((s, q) => s + q, 0)
  const usadoNoModal = (pid: string) => Object.values(sel).reduce((s, m) => s + (m[pid] ?? 0), 0)
  const completo = comps.every((c) => totalComp(c.id) === c.qtd)

  function tocar(cid: string, pid: string, max: number) {
    const r = restante(pid)
    if (r !== undefined && r - usadoNoModal(pid) <= 0) return
    setSel((s) => {
      const atual = { ...(s[cid] ?? {}) }
      if (max === 1) return { ...s, [cid]: { [pid]: 1 } }
      if (Object.values(atual).reduce((a, b) => a + b, 0) >= max) return s
      atual[pid] = (atual[pid] ?? 0) + 1
      return { ...s, [cid]: atual }
    })
  }

  function confirmar() {
    const m = new Map<string, number>()
    for (const c of comps) for (const [pid, q] of Object.entries(sel[c.id] ?? {})) if (q > 0) m.set(pid, (m.get(pid) ?? 0) + q)
    aoConfirmar(
      [...m.entries()].map(([pid, qtd]) => {
        const p = produtos.find((x) => x.id === pid)
        return { produtoId: pid, nome: p?.nome ?? '?', categoria: p?.categoria ?? 'outro', qtd }
      }),
    )
  }

  return (
    <Modal titulo={`${combo.emoji} ${combo.nome}`} aberto aoFechar={aoFechar}>
      <div className="space-y-5">
        {comps.map((c) => {
          const tot = totalComp(c.id)
          return (
            <div key={c.id}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-lg font-extrabold">
                  Escolha {c.qtd} {c.nome.toLowerCase()}
                  {c.qtd > 1 ? 's' : ''}{' '}
                  <span className={tot === c.qtd ? 'text-emerald-600' : 'text-stone-400'}>
                    ({tot}/{c.qtd})
                  </span>
                </h3>
                {tot > 0 && c.opcoes.length > 1 && (
                  <button className="text-sm font-semibold text-red-600" onClick={() => setSel((s) => ({ ...s, [c.id]: {} }))}>
                    limpar
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {c.opcoes.map((pid) => {
                  const p = produtos.find((x) => x.id === pid)
                  if (!p) return null
                  const q = sel[c.id]?.[pid] ?? 0
                  const r = restante(pid)
                  const livre = r === undefined ? undefined : r - usadoNoModal(pid)
                  const acabou = livre !== undefined && livre <= 0 && q === 0
                  return (
                    <button
                      key={pid}
                      disabled={acabou}
                      onClick={() => tocar(c.id, pid, c.qtd)}
                      className={`relative flex items-center gap-2 rounded-xl border-4 p-2 text-left font-bold ${q ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 bg-white'} ${acabou ? 'opacity-40' : ''}`}
                    >
                      <Imagem emoji={p.emoji} imagem={p.imagem} className="h-10 w-10 shrink-0 rounded-lg text-3xl" />
                      <span className="leading-tight">
                        {p.nome}
                        {!!c.acrescimos?.[pid] && <span className="block text-xs font-bold text-emerald-700">+ {brl(c.acrescimos[pid])}</span>}
                        {livre !== undefined && <span className="block text-xs font-semibold text-stone-500">{acabou ? 'esgotado' : `resta ${Math.max(0, livre)}`}</span>}
                      </span>
                      {q > 0 && (
                        <span className="absolute -right-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-sm font-black text-white">
                          {q}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <button className={`${btn.verde} mt-5 w-full py-4 text-lg`} disabled={!completo} onClick={confirmar}>
        Adicionar ao pedido
      </button>
    </Modal>
  )
}

/** Código bipado que ainda não está em nenhum produto: escolhe a qual produto ele pertence (fica gravado). */
function ModalVincularCodigo({
  codigo,
  produtos,
  aoFechar,
  aoVincular,
}: {
  codigo: string
  produtos: Produto[]
  aoFechar: () => void
  aoVincular: (p: Produto) => void
}) {
  const [termo, setTermo] = useState('')
  const lista = buscarProdutos(produtos, termo).slice(0, 30)
  return (
    <Modal titulo="Código não cadastrado" aberto aoFechar={aoFechar}>
      <p className="text-sm text-stone-600">
        O código <b className="font-mono">{codigo}</b> ainda não está em nenhum produto. De qual produto ele é? (Fica gravado: da próxima vez é só bipar.)
      </p>
      <input
        autoFocus
        className="mt-3 w-full rounded-xl border-2 border-stone-200 px-3 py-2 outline-none focus:border-orange-500"
        placeholder="Buscar produto…"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
      />
      <ul className="mt-2 max-h-72 divide-y divide-stone-100 overflow-y-auto">
        {lista.map((p) => (
          <li key={p.id}>
            <button className="flex w-full items-center gap-2 py-2 text-left hover:bg-stone-50" onClick={() => aoVincular(p)}>
              <Imagem emoji={p.emoji} imagem={p.imagem} className="h-8 w-8 shrink-0 rounded text-xl" />
              <span className="flex-1 font-semibold">{p.nome}</span>
              <span className="text-sm text-stone-500">{brl(p.preco)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-stone-500">Produto novo? Cadastre em Cadastros (dá para bipar o código no campo “Código de barras”).</p>
    </Modal>
  )
}

const MOTIVOS_CORTESIA = ['Consumo próprio', 'Cortesia para cliente', 'Funcionário', 'Degustação']

/** Saída sem venda: escolhe o motivo; mostra quanto valeria e quanto custa (o custo sai do lucro). */
export function ModalCortesia({ valor, custo, aoFechar, aoConfirmar }: { valor: number; custo: number; aoFechar: () => void; aoConfirmar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState(MOTIVOS_CORTESIA[0])
  const [outro, setOutro] = useState('')
  const final = motivo === 'outro' ? outro.trim() : motivo
  return (
    <Modal titulo="🎁 Cortesia / consumo próprio" aberto aoFechar={aoFechar}>
      <p className="text-sm text-stone-600">
        Os itens <b>saem do estoque</b>, mas <b>não entram como venda</b> nem no caixa. O custo deles sai do lucro e aparece separado nos relatórios.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {MOTIVOS_CORTESIA.map((m) => (
          <button key={m} onClick={() => setMotivo(m)} className={`rounded-full px-3 py-2 font-bold ${motivo === m ? 'bg-orange-600 text-white' : 'bg-stone-100'}`}>
            {m}
          </button>
        ))}
        <button onClick={() => setMotivo('outro')} className={`rounded-full px-3 py-2 font-bold ${motivo === 'outro' ? 'bg-orange-600 text-white' : 'bg-stone-100'}`}>
          Outro…
        </button>
      </div>
      {motivo === 'outro' && (
        <input
          className="mt-2 w-full rounded-xl border-2 border-stone-200 px-3 py-2 outline-none focus:border-orange-500"
          placeholder="Ex.: Aniversário do cliente, sorteio…"
          value={outro}
          autoFocus
          onChange={(e) => setOutro(e.target.value)}
        />
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-stone-100 p-3">
          <div className="text-xs text-stone-600">Valeria na venda</div>
          <div className="text-xl font-extrabold">{brl(valor)}</div>
        </div>
        <div className="rounded-xl bg-red-50 p-3">
          <div className="text-xs text-red-700">Custo (sai do lucro)</div>
          <div className="text-xl font-extrabold text-red-700">{brl(custo)}</div>
        </div>
      </div>
      <button className={`${btn.primario} mt-4 w-full text-lg`} disabled={!final} onClick={() => aoConfirmar(final)}>
        ✔ Registrar {final ? `(${final})` : ''}
      </button>
    </Modal>
  )
}

/** Mudar o preço de um item na hora (promoção). `aoSalvar(undefined)` volta ao preço normal. */
export function ModalPreco({
  nome,
  normal,
  atual,
  aoFechar,
  aoSalvar,
}: {
  nome: string
  normal: number
  atual: number
  aoFechar: () => void
  aoSalvar: (preco: number | undefined) => void
}) {
  const [v, setV] = useState(atual)
  const off = normal > 0 ? ((normal - v) / normal) * 100 : 0
  return (
    <Modal titulo="✏️ Mudar preço" aberto aoFechar={aoFechar}>
      <p className="font-bold">{nome}</p>
      <p className="text-sm text-stone-500">Preço normal: {brl(normal)} — a mudança vale só para este item, não muda o cadastro.</p>
      <CampoNumero className="mt-3" rotulo="Preço de cada" prefixo="R$" grande autoFocus valor={v} aoMudar={setV} />
      <div className="mt-2 flex flex-wrap gap-2">
        {[10, 20, 50].map((pc) => (
          <button key={pc} className={btn.secundario + ' !py-1.5'} onClick={() => setV(arred(normal * (1 - pc / 100)))}>
            −{pc}%
          </button>
        ))}
      </div>
      {v !== normal && v >= 0 && (
        <p className={`mt-2 text-sm font-semibold ${v < normal ? 'text-emerald-700' : 'text-orange-700'}`}>
          {v < normal ? `Desconto de ${brl(normal - v)} (${off.toFixed(0)}%) em cada` : `${brl(v - normal)} a mais em cada`}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        {atual !== normal && (
          <button className={`${btn.secundario} flex-1`} onClick={() => aoSalvar(undefined)}>
            Voltar ao normal
          </button>
        )}
        <button className={`${btn.verde} flex-1`} onClick={() => aoSalvar(Math.abs(v - normal) < 0.005 ? undefined : arred(v))}>
          ✔ Usar {brl(v)}
        </button>
      </div>
    </Modal>
  )
}
