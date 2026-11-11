import { useState } from 'react'
import { NOMES_FORMA, brl, comEmbalagens, consumoDosItens, consumoInsumosDosItens, hora, moverEstoqueInsumos, moverEstoqueProdutos, pct, resumirCaixa, rendePara, type Dados } from './dados'
import { imprimirPedido } from './impressao'
import type { Pedido } from './tipos'
import { Cartao, btn } from './ui'

export default function Painel({ dados, irPara }: { dados: Dados; irPara: (aba: 'caixa' | 'estoque') => void }) {
  const { caixaAberto, pedidos, setPedidos, produtos, setProdutos, insumos, setInsumos, movEstoque, config } = dados
  const [verTodos, setVerTodos] = useState(false)

  if (!caixaAberto) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <p className="text-lg text-stone-600">Nenhum caixa aberto. O painel mostra as vendas do caixa atual.</p>
        <button className={`${btn.primario} mt-4`} onClick={() => irPara('caixa')}>
          Abrir caixa
        </button>
      </div>
    )
  }

  const r = resumirCaixa(caixaAberto, pedidos, produtos, movEstoque)
  const doCaixa = pedidos.filter((p) => p.caixaId === caixaAberto.id).slice().reverse()
  const naFila = doCaixa.filter((p) => !p.entregue && !p.cancelado)
  const lista = verTodos ? doCaixa : doCaixa.slice(0, 15)
  const espetosProntos = produtos.filter((p) => p.categoria === 'espeto' && p.estoque !== undefined)
  const totalProntos = espetosProntos.reduce((s, p) => s + Math.max(0, p.estoque ?? 0), 0)
  const linhas = r.porProduto.filter((l) => l.vendidos > 0 || l.final !== undefined)
  // acompanhamentos preparados em kg (baião…) que limitam produtos sem estoque de prontos
  const preparados = insumos
    .filter((i) => i.estoque !== undefined)
    .map((i) => ({ ins: i, rende: rendePara(i, produtos).filter((x) => x.produto.estoque === undefined) }))
    .filter((x) => x.rende.length)

  const atualizar = (id: string, mudanca: Partial<Pedido>) => setPedidos((ps) => ps.map((p) => (p.id === id ? { ...p, ...mudanca } : p)))

  function cancelar(p: Pedido) {
    if (p.comandaId) {
      // pagamento de comanda: o estoque é da comanda; cancelar só estorna o valor e a conta reabre
      if (!confirm(`Estornar o pagamento Nº ${p.numero} (${p.cliente})? Ele sai do faturamento e o valor volta a ficar em aberto na comanda.`)) return
      atualizar(p.id, { cancelado: true })
      return
    }
    if (!confirm(`Cancelar o pedido Nº ${p.numero}? Ele sai do faturamento e os itens voltam para o estoque.`)) return
    atualizar(p.id, { cancelado: true })
    setInsumos((is) => moverEstoqueInsumos(is, comEmbalagens(consumoInsumosDosItens(p.itens, produtos, insumos), p.embalagens), 1))
    setProdutos((ps) => moverEstoqueProdutos(ps, consumoDosItens(p.itens), 1))
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao titulo="Faturamento" valor={brl(r.faturamento)} detalhe={`${r.qtdPedidos} pedidos · ticket ${brl(r.ticketMedio)}`} cor="azul" />
        <Cartao titulo="Espetos vendidos" valor={r.espetosVendidos} detalhe="avulsos + dentro de combos/jantinhas" cor="laranja" />
        <Cartao
          titulo="Espetos prontos restantes"
          valor={espetosProntos.length ? totalProntos : '—'}
          detalhe={espetosProntos.length ? 'montados e ainda não vendidos' : 'sem controle de estoque'}
          cor={espetosProntos.length && totalProntos <= config.alertaEstoque ? 'vermelho' : 'stone'}
        />
        <Cartao
          titulo="Lucro até agora"
          valor={brl(r.lucroLiquido)}
          detalhe={`margem ${pct(r.margem)} · já descontado custo, taxas e despesas`}
          cor={r.lucroLiquido >= 0 ? 'verde' : 'vermelho'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold">Vendidos × restantes</h2>
            <button className="text-sm font-bold text-orange-700" onClick={() => irPara('estoque')}>
              + montar / repor
            </button>
          </div>
          {linhas.length === 0 && <p className="text-stone-500">Nenhuma venda ainda.</p>}
          <ul className="space-y-3">
            {linhas.map((l) => {
              const disponivel = (l.final ?? 0) + l.vendidos
              const prop = l.final !== undefined && disponivel > 0 ? Math.min(100, (l.vendidos / disponivel) * 100) : 0
              const pouco = l.final !== undefined && l.final <= config.alertaEstoque
              return (
                <li key={l.produtoId}>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{l.emoji}</span>
                    <span className="flex-1 font-bold">
                      {l.nome}
                      {l.emCombos > 0 && <span className="block text-xs font-semibold text-rose-700">{l.emCombos} em combos/jantinhas</span>}
                    </span>
                    <span className="text-sm text-stone-600">
                      vendeu <b className="text-lg text-stone-900">{l.vendidos}</b>
                    </span>
                    {l.final !== undefined && (
                      <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${pouco ? 'bg-red-600 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                        {l.final <= 0 ? 'acabou' : `restam ${l.final}`}
                      </span>
                    )}
                  </div>
                  {l.final !== undefined && (
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-100">
                      <div className={`h-full ${pouco ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: `${prop}%` }} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {preparados.length > 0 && (
            <div className="mt-4 space-y-2 border-t-2 border-stone-100 pt-3">
              {preparados.map(({ ins, rende }) => (
                <div key={ins.id} className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 font-bold">{ins.unidade === 'L' ? '🍾' : '🍚'} {ins.nome}</span>
                  <span className="text-sm text-stone-600">{(ins.estoque ?? 0).toLocaleString('pt-BR')} {ins.unidade}</span>
                  {rende.map((x) => (
                    <span
                      key={x.produto.id}
                      className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${x.qtd <= config.alertaEstoque ? 'bg-red-600 text-white' : 'bg-emerald-100 text-emerald-800'}`}
                    >
                      dá {x.qtd} {x.produto.nome.toLowerCase()}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-extrabold">Por forma de pagamento</h2>
          <ul className="space-y-2">
            {(Object.keys(r.porForma) as (keyof typeof r.porForma)[]).filter((f) => f !== 'app' || r.porForma.app > 0).map((f) => (
              <li key={f} className="flex justify-between border-b border-stone-100 pb-1">
                <span>{NOMES_FORMA[f]}</span>
                <b>{brl(r.porForma[f])}</b>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Cartao titulo="💵 Dinheiro na gaveta" valor={brl(r.dinheiroEsperado)} detalhe={`troco inicial ${brl(r.trocoInicial)}`} />
            <Cartao titulo="🏦 Em conta" valor={brl(r.emConta)} detalhe={`já sem taxas (${brl(r.taxas)})`} />
          </div>
          <div className="mt-4 space-y-1 text-sm text-stone-600">
            <div className="flex justify-between">
              <span>Custo dos produtos vendidos</span>
              <b>{brl(r.cmv)}</b>
            </div>
            <div className="flex justify-between">
              <span>Despesas do dia</span>
              <b>{brl(r.despesas)}</b>
            </div>
            <div className="flex justify-between">
              <span>Pedidos para viagem</span>
              <b>{r.qtdViagem}</b>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">
            Pedidos {naFila.length > 0 && <span className="ml-2 rounded-full bg-orange-600 px-2.5 py-0.5 text-sm text-white">{naFila.length} na brasa</span>}
          </h2>
        </div>
        {doCaixa.length === 0 && <p className="text-stone-500">Nenhum pedido ainda.</p>}
        <ul className="divide-y divide-stone-100">
          {lista.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-center gap-3 py-3 ${p.cancelado ? 'opacity-50' : ''}`}>
              <div className="w-16 text-center">
                <div className="text-2xl font-black">{String(p.numero).padStart(3, '0')}</div>
                <div className="text-xs text-stone-500">{hora(p.criadoEm)}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {p.cliente && <b>{p.cliente}</b>}
                  {p.viagem && <span className="rounded bg-orange-100 px-1.5 text-xs font-bold text-orange-800">VIAGEM</span>}
                  {p.cancelado ? (
                    <span className="rounded bg-red-100 px-1.5 text-xs font-bold text-red-800">CANCELADO</span>
                  ) : p.entregue ? (
                    <span className="rounded bg-emerald-100 px-1.5 text-xs font-bold text-emerald-800">ENTREGUE</span>
                  ) : (
                    <span className="rounded bg-yellow-100 px-1.5 text-xs font-bold text-yellow-800">PREPARANDO</span>
                  )}
                </div>
                <div className="truncate text-sm text-stone-600">
                  {p.itens
                    .map((i) => `${i.qtd}x ${i.nome}${i.escolhas?.length ? ` [${i.escolhas.map((e) => `${e.qtd}x ${e.nome}`).join(', ')}]` : ''}${i.obs ? ` (${i.obs})` : ''}`)
                    .join(' · ')}
                </div>
                <div className="text-sm">
                  {p.cortesia ? (
                    <span className="font-semibold text-orange-700">
                      🎁 {p.cortesia.motivo} · valia {brl(p.cortesia.valor)} · custo {brl(p.custoTotal)}
                    </span>
                  ) : (
                    <>
                      <b>{brl(p.total)}</b> · {p.pagamentos.map((pg) => NOMES_FORMA[pg.forma]).join(' + ')}
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!p.cancelado && !p.entregue && (
                  <button className={btn.verde + ' !py-2'} onClick={() => atualizar(p.id, { entregue: true })}>
                    Entregue
                  </button>
                )}
                <button className={btn.secundario} onClick={() => imprimirPedido(p, config)} title="Reimprimir">
                  🖨️
                </button>
                {!p.cancelado && (
                  <button
                    className={btn.perigo}
                    onClick={() => cancelar(p)}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {doCaixa.length > 15 && (
          <button className="mt-2 text-sm font-semibold text-orange-700" onClick={() => setVerTodos((v) => !v)}>
            {verTodos ? 'Mostrar menos' : `Ver todos os ${doCaixa.length} pedidos`}
          </button>
        )}
      </section>

    </div>
  )
}
