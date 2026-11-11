import { useEffect, useState } from 'react'
import {
  criarPedidoDaComanda,
  fmtQtd,
  pagamentosDaComanda,
  partesPagas,
  proximaParte,
  restantes,
  rotuloComanda,
  saldoComanda,
  statusComanda,
  totalComanda,
} from './comanda'
import { NOMES_FORMA, arred, brl, consumoDosItens, consumoInsumosDosItens, hora, moverEstoqueInsumos, moverEstoqueProdutos, novoId, type Dados } from './dados'
import { imprimirConferencia, imprimirContaCompleta, imprimirCupons, imprimirLancamento, imprimirPedido } from './impressao'
import type { Comanda, ItemComanda, Pagamento, Pedido } from './tipos'
import { CampoNumero, CampoTexto, Imagem, Modal, btn } from './ui'
import Venda, { ModalCortesia, ModalPagamento, ModalPreco } from './Venda'

const tempoDesde = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

export default function Comandas({ dados, irPara }: { dados: Dados; irPara: (aba: 'caixa') => void }) {
  const { comandas, setComandas, pedidos } = dados
  const [selId, setSelId] = useState<string | null>(null)
  const [lancando, setLancando] = useState(false)
  const [nova, setNova] = useState(false)
  const [, setTique] = useState(0)

  // atualiza o "aberta há X min" a cada minuto
  useEffect(() => {
    const t = setInterval(() => setTique((x) => x + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const sel = comandas.find((c) => c.id === selId) ?? null
  const abertas = comandas.filter((c) => statusComanda(c, pedidos) === 'aberta').sort((a, b) => a.abertaEm.localeCompare(b.abertaEm))
  const hoje = new Date().toDateString()
  const encerradasHoje = comandas
    .filter((c) => statusComanda(c, pedidos) !== 'aberta')
    .filter((c) => {
      const ult = c.canceladaEm ?? pagamentosDaComanda(c, pedidos).slice(-1)[0]?.criadoEm ?? c.abertaEm
      return new Date(ult).toDateString() === hoje
    })
    .reverse()

  function abrir(mesa: string, nome: string) {
    const c: Comanda = {
      id: novoId(),
      numero: comandas.reduce((m, x) => Math.max(m, x.numero), 0) + 1,
      mesa: mesa.trim(),
      nome: nome.trim(),
      abertaEm: new Date().toISOString(),
      itens: [],
    }
    setComandas((cs) => [...cs, c])
    setNova(false)
    setSelId(c.id)
    setLancando(true)
  }

  if (sel && lancando) {
    return (
      <Venda
        dados={dados}
        irPara={irPara}
        comanda={{
          titulo: rotuloComanda(sel),
          aoVoltar: () => setLancando(false),
          aoLancar: (itens) => {
            const primeiro = sel.itens.length === 0
            setComandas((cs) => cs.map((c) => (c.id === sel.id ? { ...c, itens: [...c.itens, ...itens] } : c)))
            if (dados.config.imprimirAoFinalizar && dados.config.viaChurrasqueira) imprimirLancamento(sel, itens, dados.config, primeiro)
            setLancando(false)
          },
        }}
      />
    )
  }

  if (sel) return <DetalheComanda dados={dados} comanda={sel} aoVoltar={() => setSelId(null)} aoLancar={() => setLancando(true)} irPara={irPara} />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">Comandas abertas</h2>
          <p className="text-sm text-stone-600">Anote o que cada mesa vai pedindo e receba no final — tudo junto, por itens ou dividido.</p>
        </div>
        <button className={`${btn.primario} text-lg`} onClick={() => setNova(true)}>
          + Nova comanda
        </button>
      </div>

      {abertas.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-stone-300 bg-white p-10 text-center text-stone-500">Nenhuma comanda aberta.</div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {abertas.map((c) => {
          const saldo = saldoComanda(c, pedidos)
          const total = totalComanda(c)
          const qtd = c.itens.reduce((s, i) => s + i.qtd, 0)
          return (
            <button
              key={c.id}
              onClick={() => setSelId(c.id)}
              className="rounded-2xl border-2 border-stone-200 bg-white p-4 text-left shadow-sm transition hover:border-orange-400 hover:shadow-md active:scale-[.98]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-xl font-black leading-tight">{rotuloComanda(c)}</div>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-600">nº {c.numero}</span>
              </div>
              <div className="mt-1 text-sm text-stone-500">
                aberta há {tempoDesde(c.abertaEm)} · {qtd} {qtd === 1 ? 'item' : 'itens'}
              </div>
              <div className="mt-3 text-2xl font-black text-orange-700">{brl(saldo)}</div>
              {saldo < total - 0.004 && <div className="text-xs text-stone-500">de {brl(total)} (parte já paga)</div>}
              {c.divisao && <div className="text-xs font-semibold text-sky-700">dividida por {c.divisao.pessoas}</div>}
            </button>
          )
        })}
      </div>

      {encerradasHoje.length > 0 && (
        <details className="rounded-2xl border-2 border-stone-200 bg-white p-4">
          <summary className="cursor-pointer font-extrabold">Encerradas hoje ({encerradasHoje.length})</summary>
          <ul className="mt-2 divide-y divide-stone-100">
            {encerradasHoje.map((c) => (
              <li key={c.id}>
                <button className="flex w-full justify-between py-2 text-left hover:bg-stone-50" onClick={() => setSelId(c.id)}>
                  <span>
                    <b>{rotuloComanda(c)}</b> <span className="text-sm text-stone-500">nº {c.numero}</span>
                  </span>
                  <span className={statusComanda(c, pedidos) === 'cancelada' ? 'text-red-600' : 'text-emerald-700'}>
                    {statusComanda(c, pedidos) === 'cancelada' ? (c.juntadaNa ? `juntada na nº ${c.juntadaNa}` : 'cancelada') : `paga · ${brl(totalComanda(c))}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {nova && <ModalNovaComanda abertas={abertas} aoFechar={() => setNova(false)} aoAbrir={abrir} />}
    </div>
  )
}

function ModalNovaComanda({ abertas, aoFechar, aoAbrir }: { abertas: Comanda[]; aoFechar: () => void; aoAbrir: (mesa: string, nome: string) => void }) {
  const [mesa, setMesa] = useState('')
  const [nome, setNome] = useState('')
  const ocupadas = new Set(abertas.map((c) => c.mesa))
  return (
    <Modal titulo="Nova comanda" aberto aoFechar={aoFechar}>
      <div className="text-sm font-semibold text-stone-600">Mesa</div>
      <div className="mt-1 grid grid-cols-6 gap-1.5 sm:grid-cols-8">
        {Array.from({ length: 24 }, (_, i) => String(i + 1)).map((m) => (
          <button
            key={m}
            onClick={() => setMesa(m)}
            className={`relative rounded-lg py-2 text-lg font-bold ${mesa === m ? 'bg-orange-600 text-white' : 'bg-stone-100 text-stone-800 hover:bg-stone-200'}`}
          >
            {m}
            {ocupadas.has(m) && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" title="já tem comanda aberta" />}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <CampoTexto valor={mesa} aoMudar={setMesa} placeholder="Outra (ex.: Balcão, Varanda)" />
        <CampoTexto valor={nome} aoMudar={setNome} placeholder="Nome do cliente (opcional)" />
      </div>
      {ocupadas.has(mesa.trim()) && (
        <p className="mt-2 text-sm text-amber-700">A mesa {mesa} já tem comanda aberta. Pode abrir outra (ex.: pessoas que pagam separado) — coloque o nome.</p>
      )}
      <button className={`${btn.primario} mt-4 w-full py-3 text-lg`} disabled={!mesa.trim() && !nome.trim()} onClick={() => aoAbrir(mesa, nome)}>
        Abrir comanda e lançar itens
      </button>
    </Modal>
  )
}

type Cobranca =
  | { tipo: 'tudo' }
  | { tipo: 'itens'; selecao: Record<string, number> }
  | { tipo: 'parte' }

export function DetalheComanda({
  dados,
  comanda: c,
  aoVoltar,
  aoLancar,
  irPara,
  rotuloVoltar = '← Todas as comandas',
}: {
  dados: Dados
  comanda: Comanda
  aoVoltar: () => void
  aoLancar: () => void
  irPara: (aba: 'caixa') => void
  rotuloVoltar?: string
}) {
  const { pedidos, setPedidos, setComandas, caixaAberto, config, produtos, insumos, setProdutos, setInsumos } = dados
  const [modo, setModo] = useState<'ver' | 'escolher'>('ver')
  const [selecao, setSelecao] = useState<Record<string, number>>({})
  const [cobrando, setCobrando] = useState<Cobranca | null>(null)
  const [editando, setEditando] = useState(false)
  const [pessoas, setPessoas] = useState(c.divisao?.pessoas ?? 2)
  const [ultimo, setUltimo] = useState<Pedido | null>(null)
  const [juntando, setJuntando] = useState(false)
  const [cortesiaAberta, setCortesiaAberta] = useState(false)
  const [precoDe, setPrecoDe] = useState<ItemComanda | null>(null)
  const outrasAbertas = dados.comandas.filter((x) => x.id !== c.id && statusComanda(x, pedidos) === 'aberta')

  /** Mesas que se juntaram: passa todos os itens desta comanda para outra (o estoque não muda). */
  function juntarCom(destino: Comanda) {
    if (pagos.length) return alert('Esta comanda já tem pagamento — receba ou estorne antes de juntar.')
    if (!confirm(`Passar todos os itens de ${rotuloComanda(c)} para ${rotuloComanda(destino)} (comanda ${destino.numero})?`)) return
    setComandas((cs) =>
      cs.map((x) =>
        x.id === destino.id
          ? { ...x, itens: [...x.itens, ...c.itens] }
          : x.id === c.id
            ? { ...x, itens: [], canceladaEm: new Date().toISOString(), juntadaNa: destino.numero }
            : x,
      ),
    )
    setJuntando(false)
    aoVoltar()
  }

  const linhas = restantes(c, pedidos)
  const total = totalComanda(c)
  const saldo = saldoComanda(c, pedidos)
  const status = statusComanda(c, pedidos)
  const pagos = pagamentosDaComanda(c, pedidos)
  const parte = proximaParte(c, pedidos)
  const pagas = partesPagas(c, pedidos)
  const aberta = status === 'aberta'
  const valorSelecao = arred(linhas.reduce((s, l) => s + (selecao[l.item.id] ?? 0) * l.item.preco, 0))

  const atualizar = (m: Partial<Comanda>) => setComandas((cs) => cs.map((x) => (x.id === c.id ? { ...x, ...m } : x)))

  /** Tira 1 unidade ainda não paga (lançada por engano) e devolve ao estoque. */
  function tirarUm(item: ItemComanda) {
    const um = [{ ...item, qtd: 1 }]
    setProdutos((ps) => moverEstoqueProdutos(ps, consumoDosItens(um), 1))
    setInsumos((is) => moverEstoqueInsumos(is, consumoInsumosDosItens(um, produtos, insumos), 1))
    atualizar({ itens: c.itens.map((i) => (i.id === item.id ? { ...i, qtd: i.qtd - 1 } : i)).filter((i) => i.qtd > 0) })
  }

  function cancelarComanda() {
    if (pagos.length) return alert('Esta comanda já tem pagamento. Cancele os pagamentos no Painel antes.')
    if (!confirm(`Cancelar a comanda de ${rotuloComanda(c)}? Os itens voltam para o estoque.`)) return
    setProdutos((ps) => moverEstoqueProdutos(ps, consumoDosItens(c.itens), 1))
    setInsumos((is) => moverEstoqueInsumos(is, consumoInsumosDosItens(c.itens, produtos, insumos), 1))
    atualizar({ canceladaEm: new Date().toISOString() })
    aoVoltar()
  }

  /** Itens marcados viram cortesia/consumo próprio: quitados na comanda sem entrar dinheiro (o estoque já saiu ao lançar). */
  function darCortesia(motivo: string) {
    if (!caixaAberto) return
    const alocacao = linhas.filter((l) => (selecao[l.item.id] ?? 0) > 0).map((l) => ({ item: l.item, qtd: Math.min(l.falta, selecao[l.item.id]) }))
    const valor = arred(alocacao.reduce((s, a) => s + a.qtd * a.item.preco, 0))
    const base = criarPedidoDaComanda({ comanda: c, alocacao, valor, desconto: 0, pagamentos: [], recebidoDinheiro: 0, caixa: caixaAberto, pedidos, config })
    const pedido: Pedido = {
      ...base,
      itens: base.itens.map((i) => ({ ...i, preco: 0 })),
      subtotal: 0,
      total: 0,
      cortesia: { motivo, valor },
      cliente: `🎁 ${motivo} — ${base.cliente}`,
    }
    setPedidos((ps) => [...ps, pedido])
    setCortesiaAberta(false)
    setModo('ver')
    setSelecao({})
  }

  function cobrar(desconto: number, pagamentos: Pagamento[], recebido: number) {
    if (!caixaAberto || !cobrando) return
    let alocacao: { item: ItemComanda; qtd: number }[]
    let valor: number
    let parteInfo: { divisaoId: string; texto: string } | undefined
    if (cobrando.tipo === 'tudo') {
      alocacao = linhas.filter((l) => l.falta > 0.0005).map((l) => ({ item: l.item, qtd: l.falta }))
      valor = saldo
    } else if (cobrando.tipo === 'itens') {
      alocacao = linhas.filter((l) => (cobrando.selecao[l.item.id] ?? 0) > 0).map((l) => ({ item: l.item, qtd: Math.min(l.falta, cobrando.selecao[l.item.id]) }))
      valor = arred(alocacao.reduce((s, a) => s + a.qtd * a.item.preco, 0))
    } else {
      if (!parte || !c.divisao) return
      alocacao = parte.alocacao
      valor = parte.valor
      parteInfo = { divisaoId: c.divisao.id, texto: `${parte.numero}/${parte.de}` }
    }
    const pedido = criarPedidoDaComanda({ comanda: c, alocacao, valor, desconto, pagamentos, recebidoDinheiro: recebido, caixa: caixaAberto, pedidos, config, parte: parteInfo })
    setPedidos((ps) => [...ps, pedido])
    if (config.imprimirAoFinalizar && config.viaCliente) imprimirPedido(pedido, config, { churrasqueira: false, cliente: true })
    setUltimo(pedido)
    setCobrando(null)
    setModo('ver')
    setSelecao({})
  }

  const valorCobranca = !cobrando ? 0 : cobrando.tipo === 'tudo' ? saldo : cobrando.tipo === 'itens' ? valorSelecao : (parte?.valor ?? 0)

  return (
    <div className="space-y-4">
      <button className="text-sm font-bold text-stone-600 hover:underline" onClick={aoVoltar}>
        {rotuloVoltar}
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-stone-900 p-4 text-white">
        <div>
          <div className="text-3xl font-black">{rotuloComanda(c)}</div>
          <div className="text-sm text-stone-300">
            comanda nº {c.numero} · aberta às {hora(c.abertaEm)} ({tempoDesde(c.abertaEm)})
            {status === 'paga' && <span className="ml-2 rounded bg-emerald-600 px-2 font-bold text-white">PAGA</span>}
            {status === 'cancelada' && (
              <span className="ml-2 rounded bg-red-600 px-2 font-bold text-white">{c.juntadaNa ? `JUNTADA NA COMANDA ${c.juntadaNa}` : 'CANCELADA'}</span>
            )}
          </div>
          {aberta && (
            <button className="mt-1 text-xs text-stone-300 underline" onClick={() => setEditando(true)}>
              trocar mesa / nome
            </button>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm text-stone-300">{saldo < total - 0.004 ? 'Falta pagar' : 'Total'}</div>
          <div className="text-4xl font-black">{brl(saldo)}</div>
          {saldo < total - 0.004 && <div className="text-sm text-stone-300">consumo total {brl(total)}</div>}
        </div>
      </div>

      {status === 'paga' && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-3">
          <span className="flex-1 font-extrabold text-emerald-900">✔ Conta quitada — {brl(total)}</span>
          <button className={btn.secundario + ' !py-2'} onClick={() => imprimirContaCompleta(c, pagos, config)}>
            🖨️ Conta completa
          </button>
          {pagos.length > 1 && (
            <button className={btn.secundario + ' !py-2'} onClick={() => imprimirCupons(pagos, config)}>
              🖨️ Cupom de cada pagamento ({pagos.length})
            </button>
          )}
        </div>
      )}

      {ultimo && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-600 p-3 text-white">
          <span className="flex-1 font-bold">
            ✅ Recebido {brl(ultimo.total)}
            {ultimo.parte && ` (parte ${ultimo.parte})`}
            {ultimo.troco > 0 && <span className="ml-2 rounded bg-yellow-300 px-2 text-yellow-950">TROCO {brl(ultimo.troco)}</span>}
          </span>
          <button className="rounded-lg bg-white/20 px-3 py-1 font-bold" onClick={() => imprimirPedido(ultimo, config, { churrasqueira: false, cliente: true })}>
            🖨️ Cupom
          </button>
          <button className="text-sm underline" onClick={() => setUltimo(null)}>
            ok
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-extrabold">{modo === 'escolher' ? 'Escolha o que vai pagar agora' : 'Consumo'}</h3>
            {aberta && modo === 'ver' && (
              <div className="flex flex-wrap gap-2">
                <button className={btn.primario + ' !py-2'} onClick={aoLancar}>
                  + Lançar itens
                </button>
                {c.itens.length > 0 && (
                  <button
                    className={btn.secundario}
                    onClick={() => {
                      const faltam = c.divisao ? c.divisao.pessoas - pagas : 0
                      imprimirConferencia(c, linhas, config, c.divisao && parte ? { faltam, valor: parte.valor } : undefined)
                    }}
                  >
                    🖨️ Conferência
                  </button>
                )}
              </div>
            )}
          </div>
          {c.itens.length === 0 && <p className="py-6 text-center text-stone-500">Nada lançado ainda.</p>}
          <ul className="divide-y divide-stone-100">
            {linhas.map(({ item, pago, falta }) => {
              const sel = selecao[item.id] ?? 0
              return (
                <li key={item.id} className={`flex items-center gap-3 py-2 ${falta < 0.0005 ? 'opacity-50' : ''}`}>
                  <Imagem emoji={item.emoji} imagem={produtos.find((p) => p.id === item.produtoId)?.imagem} className="h-10 w-10 shrink-0 rounded-lg text-2xl" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">
                      {item.qtd}× {item.nome}
                    </div>
                    <div className="text-xs text-stone-500">
                      {hora(item.lancadoEm)}
                      {item.escolhas?.length ? ` · ${item.escolhas.map((e) => `${e.qtd}x ${e.nome}`).join(' + ')}` : ''}
                      {item.obs ? ` · ${item.obs}` : ''}
                    </div>
                    {pago > 0.0005 && (
                      <div className="text-xs font-semibold text-emerald-700">
                        {falta < 0.0005 ? 'pago' : `pago ${fmtQtd(pago)} de ${item.qtd} — falta ${fmtQtd(falta)}`}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{brl(item.preco * item.qtd)}</div>
                    {item.precoNormal !== undefined && (
                      <div className="text-xs">
                        <span className="text-stone-400 line-through">{brl(item.precoNormal)}</span>{' '}
                        <span className="rounded bg-emerald-100 px-1 font-bold text-emerald-800">PROMO {brl(item.preco)}</span>
                      </div>
                    )}
                    {aberta && modo === 'ver' && pago < 0.0005 && (
                      <button className="text-xs text-stone-500 underline decoration-dotted hover:text-orange-700" onClick={() => setPrecoDe(item)}>
                        ✏️ preço
                      </button>
                    )}
                  </div>
                  {modo === 'escolher' && falta > 0.0005 && (
                    <div className="flex items-center gap-1">
                      <button
                        className="h-9 w-9 rounded-full bg-stone-100 text-xl font-bold"
                        onClick={() => setSelecao((s) => ({ ...s, [item.id]: Math.max(0, sel - 1) }))}
                        aria-label="Menos"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-lg font-black">{fmtQtd(sel)}</span>
                      <button
                        className="h-9 w-9 rounded-full bg-emerald-100 text-xl font-bold text-emerald-800"
                        onClick={() => setSelecao((s) => ({ ...s, [item.id]: Math.min(falta, sel + 1) }))}
                        aria-label="Mais"
                      >
                        +
                      </button>
                    </div>
                  )}
                  {modo === 'ver' && aberta && falta >= 1 && (
                    <button className="px-2 text-lg text-stone-400 hover:text-red-600" title="Tirar 1 (lançado por engano)" onClick={() => confirm(`Tirar 1× ${item.nome} da comanda? Volta para o estoque.`) && tirarUm(item)}>
                      −1
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {modo === 'escolher' && (
            <div className="sticky bottom-0 mt-3 flex flex-wrap items-center gap-2 border-t-2 border-stone-200 bg-white pt-3">
              <button className="text-sm font-semibold text-emerald-700 underline" onClick={() => setSelecao(Object.fromEntries(linhas.map((l) => [l.item.id, Math.floor(l.falta + 0.0005)])))}>
                marcar tudo
              </button>
              <span className="flex-1 text-right text-lg">
                Selecionado: <b>{brl(valorSelecao)}</b>
              </span>
              <button className={btn.secundario} onClick={() => (setModo('ver'), setSelecao({}))}>
                Voltar
              </button>
              <button className={btn.secundario} disabled={valorSelecao <= 0 || !caixaAberto} onClick={() => setCortesiaAberta(true)} title="Cortesia / consumo próprio: não entra dinheiro">
                🎁 Cortesia
              </button>
              <button className={btn.verde} disabled={valorSelecao <= 0 || !caixaAberto} onClick={() => setCobrando({ tipo: 'itens', selecao })}>
                Receber {brl(valorSelecao)}
              </button>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          {aberta && c.itens.length > 0 && (
            <section className="rounded-2xl border-2 border-emerald-300 bg-white p-4">
              <h3 className="text-lg font-extrabold">Receber</h3>
              {!caixaAberto ? (
                <div className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  Abra o caixa para receber.{' '}
                  <button className="font-bold underline" onClick={() => irPara('caixa')}>
                    Abrir caixa
                  </button>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <button className={`${btn.verde} w-full py-3 text-lg`} onClick={() => setCobrando({ tipo: 'tudo' })}>
                    💰 Pagar tudo · {brl(saldo)}
                  </button>
                  <button className={`${btn.secundario} w-full py-3`} onClick={() => setModo('escolher')} disabled={modo === 'escolher'}>
                    ☑ Pagar só alguns itens
                  </button>

                  <div className="rounded-xl bg-sky-50 p-3">
                    <div className="font-bold text-sky-900">➗ Dividir igualmente</div>
                    {!c.divisao ? (
                      <div className="mt-2 flex items-end gap-2">
                        <CampoNumero className="w-24" rotulo="Pessoas" valor={pessoas} aoMudar={(v) => setPessoas(Math.max(2, Math.round(v)))} />
                        <div className="flex-1 pb-2 text-sm text-sky-900">
                          {brl(saldo / Math.max(2, pessoas))} <span className="text-sky-700">cada</span>
                        </div>
                        <button className={btn.primario + ' !py-2'} onClick={() => atualizar({ divisao: { id: novoId(), pessoas: Math.max(2, pessoas) } })}>
                          Dividir
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <div className="flex gap-1">
                          {Array.from({ length: c.divisao.pessoas }, (_, i) => (
                            <div key={i} className={`h-2 flex-1 rounded-full ${i < pagas ? 'bg-emerald-500' : 'bg-sky-200'}`} />
                          ))}
                        </div>
                        <div className="text-sm text-sky-900">
                          {pagas} de {c.divisao.pessoas} pessoas já pagaram
                        </div>
                        {parte && (
                          <button className={`${btn.verde} w-full`} onClick={() => setCobrando({ tipo: 'parte' })}>
                            Receber pessoa {parte.numero} de {parte.de} · {brl(parte.valor)}
                          </button>
                        )}
                        {pagas === 0 && (
                          <button className="text-xs text-sky-800 underline" onClick={() => atualizar({ divisao: undefined })}>
                            desfazer divisão
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {pagos.length > 0 && (
            <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
              <h3 className="font-extrabold">Pagamentos</h3>
              <ul className="mt-2 divide-y divide-stone-100 text-sm">
                {pagos.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 py-2">
                    <span className="flex-1">
                      {hora(p.criadoEm)} · {p.parte ? `pessoa ${p.parte} · ` : ''}
                      {p.cortesia ? (
                        <span className="font-semibold text-orange-700">
                          🎁 {p.cortesia.motivo} (valia {brl(p.cortesia.valor)})
                        </span>
                      ) : (
                        p.pagamentos.map((pg) => NOMES_FORMA[pg.forma]).join(' + ')
                      )}
                    </span>
                    <b>{brl(p.total)}</b>
                    <button title="Reimprimir cupom" onClick={() => imprimirPedido(p, config, { churrasqueira: false, cliente: true })}>
                      🖨️
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className={btn.secundario + ' !px-3 !py-1.5 text-sm'} onClick={() => imprimirContaCompleta(c, pagos, config)}>
                  🖨️ Conta completa
                </button>
                {pagos.length > 1 && (
                  <button className={btn.secundario + ' !px-3 !py-1.5 text-sm'} onClick={() => imprimirCupons(pagos, config)}>
                    🖨️ Todos os cupons
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-stone-500">Para estornar um pagamento, cancele o pedido no Painel — a conta reabre sozinha.</p>
            </section>
          )}

          {aberta && outrasAbertas.length > 0 && c.itens.length > 0 && pagos.length === 0 && (
            <button className={`${btn.secundario} w-full`} onClick={() => setJuntando(true)}>
              🔗 Juntar com outra mesa
            </button>
          )}
          {aberta && (
            <button className="w-full text-sm text-red-600 underline" onClick={cancelarComanda}>
              Cancelar comanda
            </button>
          )}
        </aside>
      </div>

      {precoDe && (
        <ModalPreco
          nome={precoDe.nome}
          normal={precoDe.precoNormal ?? precoDe.preco}
          atual={precoDe.preco}
          aoFechar={() => setPrecoDe(null)}
          aoSalvar={(v) => {
            const normal = precoDe.precoNormal ?? precoDe.preco
            atualizar({
              itens: c.itens.map((i) => {
                if (i.id !== precoDe.id) return i
                if (v === undefined) {
                  const { precoNormal: _n, ...resto } = i
                  void _n
                  return { ...resto, preco: normal }
                }
                return { ...i, preco: v, precoNormal: normal }
              }),
            })
            setPrecoDe(null)
          }}
        />
      )}
      {cortesiaAberta && (
        <ModalCortesia
          valor={valorSelecao}
          custo={arred(linhas.reduce((t, l) => t + Math.min(l.falta, selecao[l.item.id] ?? 0) * l.item.custo, 0))}
          aoFechar={() => setCortesiaAberta(false)}
          aoConfirmar={darCortesia}
        />
      )}
      {cobrando && (
        <ModalPagamento subtotal={valorCobranca} viagem={false} aoFechar={() => setCobrando(null)} aoConfirmar={cobrar} />
      )}

      {juntando && (
        <Modal titulo={`Juntar ${rotuloComanda(c)} com…`} aberto aoFechar={() => setJuntando(false)}>
          <p className="mb-3 text-sm text-stone-600">Os itens desta comanda passam para a escolhida, que fica com a conta toda.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {outrasAbertas.map((x) => (
              <button key={x.id} className="rounded-xl border-2 border-stone-200 p-3 text-left hover:border-orange-400" onClick={() => juntarCom(x)}>
                <div className="font-extrabold">{rotuloComanda(x)}</div>
                <div className="text-sm text-stone-500">
                  comanda {x.numero} · {brl(saldoComanda(x, pedidos))}
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {editando && (
        <Modal titulo="Trocar mesa / nome" aberto aoFechar={() => setEditando(false)}>
          <EditarMesa
            comanda={c}
            aoSalvar={(mesa, nome) => {
              atualizar({ mesa, nome })
              setEditando(false)
            }}
          />
        </Modal>
      )}
    </div>
  )
}

function EditarMesa({ comanda, aoSalvar }: { comanda: Comanda; aoSalvar: (mesa: string, nome: string) => void }) {
  const [mesa, setMesa] = useState(comanda.mesa)
  const [nome, setNome] = useState(comanda.nome)
  return (
    <div className="space-y-3">
      <CampoTexto rotulo="Mesa" valor={mesa} aoMudar={setMesa} />
      <CampoTexto rotulo="Nome" valor={nome} aoMudar={setNome} />
      <button className={`${btn.primario} w-full`} disabled={!mesa.trim() && !nome.trim()} onClick={() => aoSalvar(mesa.trim(), nome.trim())}>
        Salvar
      </button>
    </div>
  )
}
