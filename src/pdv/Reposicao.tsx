import { useState } from 'react'
import { NOMES_CATEGORIA, brl, buscarProdutos, pct, saidasDesde, ultimaCompra, type Dados } from './dados'
import { ehRevenda } from './Compras'
import { imprimirListaCompra } from './impressao'
import type { Pedido, Produto } from './tipos'
import { CampoNumero, Cartao, Imagem, btn } from './ui'

type Status = 'ja' | 'breve' | 'ok' | 'parado' | 'semdados'
const ROTULO: Record<Status, { t: string; cor: string }> = {
  ja: { t: 'Comprar já', cor: 'bg-red-600 text-white' },
  breve: { t: 'Comprar em breve', cor: 'bg-amber-400 text-amber-950' },
  ok: { t: 'Estoque ok', cor: 'bg-emerald-100 text-emerald-800' },
  parado: { t: 'Parado — não recompre', cor: 'bg-stone-700 text-white' },
  semdados: { t: 'Sem vendas ainda', cor: 'bg-stone-100 text-stone-600' },
}

export interface LinhaReposicao {
  p: Produto
  estoque: number
  v7: number
  v30: number
  mediaDia: number
  dura: number
  sugestao: number
  caixas: number | null
  custo: number
  fornecedor: string
  margem: number
  lucro30: number
  valorEstoque: number
  curva: 'A' | 'B' | 'C'
  status: Status
}

/** Lucro real dos últimos 30 dias de um produto (vendas diretas + a parte dele dentro de fardos). */
function lucroDe(p: Produto, pedidos: Pedido[], desde: string) {
  let lucro = 0
  for (const ped of pedidos) {
    if (ped.cancelado || ped.criadoEm < desde) continue
    for (const i of ped.itens) {
      const l = (i.preco - i.custo) * i.qtd
      if (i.produtoId === p.id) lucro += l
      else if (i.escolhas?.length && i.escolhas.every((e) => e.produtoId === i.escolhas![0].produtoId) && i.escolhas[0].produtoId === p.id) lucro += l
    }
  }
  return lucro
}

export function calcularReposicao(dados: Dados, dias: number): LinhaReposicao[] {
  const { produtos, pedidos, movEstoque, config } = dados
  const agora = Date.now()
  const d7 = new Date(agora - 7 * 86400000).toISOString()
  const d30 = new Date(agora - 30 * 86400000).toISOString()
  const s7 = saidasDesde(pedidos, d7)
  const s30 = saidasDesde(pedidos, d30)
  // sistema em uso há menos de 30 dias: a média usa só os dias que existem
  const primeiro = pedidos.reduce((m, p) => (p.criadoEm < m ? p.criadoEm : m), new Date().toISOString())
  const diasUso = Math.min(30, Math.max(1, Math.ceil((agora - new Date(primeiro).getTime()) / 86400000)))

  const linhas = produtos
    .filter((p) => ehRevenda(p) && (p.estoque !== undefined || (s30[p.id] ?? 0) > 0))
    .map((p) => {
      const estoque = Math.max(0, p.estoque ?? 0)
      const v7 = s7[p.id] ?? 0
      const v30 = s30[p.id] ?? 0
      const mediaDia = v30 / diasUso
      const dura = mediaDia > 0 ? estoque / mediaDia : Infinity
      const falta = Math.max(0, Math.ceil(mediaDia * dias - estoque))
      const uc = p.unidadesCaixa && p.unidadesCaixa > 1 ? p.unidadesCaixa : null
      const caixas = uc ? Math.ceil(falta / uc) : null
      const sugestao = uc ? (caixas ?? 0) * uc : falta
      const ult = ultimaCompra(movEstoque, p.id)
      const custo = ult?.unitario ?? p.custoDireto
      const margem = p.preco > 0 ? ((p.preco - custo) / p.preco) * 100 : 0
      let status: Status
      if (v30 === 0) status = estoque > 0 && diasUso >= 14 ? 'parado' : 'semdados'
      else if (dura < 3 || estoque <= config.alertaEstoque) status = 'ja'
      else if (dura < 7) status = 'breve'
      else status = 'ok'
      return {
        p,
        estoque,
        v7,
        v30,
        mediaDia,
        dura,
        sugestao,
        caixas,
        custo,
        fornecedor: ult?.fornecedor ?? '',
        margem,
        lucro30: lucroDe(p, pedidos, d30),
        valorEstoque: estoque * custo,
        curva: 'C' as 'A' | 'B' | 'C',
        status,
      }
    })

  // curva ABC pelo lucro: A = os que somam 80% do lucro, B = até 95%, C = o resto
  const totalLucro = linhas.reduce((s, l) => s + Math.max(0, l.lucro30), 0)
  let acum = 0
  for (const l of [...linhas].sort((a, b) => b.lucro30 - a.lucro30)) {
    acum += Math.max(0, l.lucro30)
    const parte = totalLucro > 0 ? acum / totalLucro : 1
    l.curva = l.lucro30 <= 0 ? 'C' : parte <= 0.8 || acum === Math.max(0, l.lucro30) ? 'A' : parte <= 0.95 ? 'B' : 'C'
  }
  const ordem: Record<Status, number> = { ja: 0, breve: 1, parado: 2, ok: 3, semdados: 4 }
  return linhas.sort((a, b) => ordem[a.status] - ordem[b.status] || a.dura - b.dura || b.lucro30 - a.lucro30)
}

const fmtDias = (d: number) => (d === Infinity ? '—' : d < 1 ? '< 1 dia' : `${Math.floor(d)} dias`)

export default function Reposicao({ dados }: { dados: Dados }) {
  const { config, setConfig } = dados
  const [filtro, setFiltro] = useState<'todos' | Status>('todos')
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const todas = calcularReposicao(dados, config.diasCobertura)
  const visiveis = (busca.trim() ? todas.filter((l) => buscarProdutos([l.p], busca).length) : todas).filter((l) => filtro === 'todos' || l.status === filtro)
  const marcado = (l: LinhaReposicao) => marcados[l.p.id] ?? ((l.status === 'ja' || l.status === 'breve') && l.sugestao > 0)
  const naLista = todas.filter((l) => marcado(l) && l.sugestao > 0)
  const conta = (s: Status) => todas.filter((l) => l.status === s).length
  const parados = todas.filter((l) => l.status === 'parado')

  function textoLista() {
    const porForn = new Map<string, LinhaReposicao[]>()
    for (const l of naLista) porForn.set(l.fornecedor || 'Sem fornecedor', [...(porForn.get(l.fornecedor || 'Sem fornecedor') ?? []), l])
    const linhas: string[] = [`*Lista de compra — ${config.nomeLoja}*`, new Date().toLocaleDateString('pt-BR'), '']
    let total = 0
    for (const [f, ls] of porForn) {
      linhas.push(`*${f}*`)
      for (const l of ls) {
        total += l.sugestao * l.custo
        linhas.push(`- ${l.caixas !== null ? `${l.caixas} cx (${l.sugestao} un)` : `${l.sugestao} un`} ${l.p.nome}`)
      }
      linhas.push('')
    }
    linhas.push(`Estimado: ${brl(total)}`)
    return linhas.join('\n')
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold">Reposição — o que recomprar</h2>
        <p className="text-sm text-stone-600">
          Calculado pelas vendas dos últimos 30 dias (inclusive as latas que saíram em fardos). “Dura” = quantos dias o estoque aguenta no ritmo atual.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao titulo="Comprar já" valor={conta('ja')} detalhe="acaba em menos de 3 dias" cor="vermelho" />
        <Cartao titulo="Comprar em breve" valor={conta('breve')} detalhe="acaba em menos de 7 dias" cor="laranja" />
        <Cartao
          titulo="Parados (não recompre)"
          valor={parados.length}
          detalhe={`${brl(parados.reduce((s, l) => s + l.valorEstoque, 0))} empatados sem vender há 30 dias`}
        />
        <Cartao titulo="Valor em estoque" valor={brl(todas.reduce((s, l) => s + l.valorEstoque, 0))} detalhe="pelo último custo de compra" cor="azul" />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <input
          className="min-w-0 flex-1 rounded-xl border-2 border-stone-200 bg-white px-3 py-2"
          placeholder="Buscar bebida…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <CampoNumero
          className="w-44"
          rotulo="Comprar para durar"
          sufixo="dias"
          valor={config.diasCobertura}
          aoMudar={(v) => setConfig((c) => ({ ...c, diasCobertura: Math.max(1, Math.round(v)) }))}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {(['todos', 'ja', 'breve', 'parado', 'ok', 'semdados'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${filtro === f ? 'bg-stone-900 text-white' : 'bg-white ring-2 ring-stone-200'}`}
          >
            {f === 'todos' ? `Todos (${todas.length})` : `${ROTULO[f].t} (${conta(f)})`}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border-2 border-stone-200 bg-white">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b-2 border-stone-200 text-left text-stone-600">
              <th className="p-2" />
              <th className="p-2">Bebida</th>
              <th className="p-2 text-right">Estoque</th>
              <th className="p-2 text-right">Vendeu 7d</th>
              <th className="p-2 text-right">Vendeu 30d</th>
              <th className="p-2 text-right">Dura</th>
              <th className="p-2 text-right">Comprar</th>
              <th className="p-2 text-right">Último custo</th>
              <th className="p-2 text-right">Margem</th>
              <th className="p-2 text-right">Lucro 30d</th>
              <th className="p-2 text-center">Curva</th>
              <th className="p-2">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.p.id} className="border-b border-stone-100">
                <td className="p-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-orange-600"
                    disabled={l.sugestao <= 0}
                    checked={marcado(l) && l.sugestao > 0}
                    onChange={(e) => setMarcados((m) => ({ ...m, [l.p.id]: e.target.checked }))}
                  />
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <Imagem emoji={l.p.emoji} imagem={l.p.imagem} className="h-8 w-8 shrink-0 rounded text-xl" />
                    <div>
                      <div className="font-bold">{l.p.nome}</div>
                      <div className="text-xs text-stone-500">
                        {NOMES_CATEGORIA[l.p.categoria]}
                        {l.fornecedor && ` · ${l.fornecedor}`}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="p-2 text-right font-bold">{l.estoque}</td>
                <td className="p-2 text-right">{l.v7}</td>
                <td className="p-2 text-right">{l.v30}</td>
                <td className={`p-2 text-right ${l.dura < 3 ? 'font-bold text-red-700' : l.dura < 7 ? 'font-bold text-amber-700' : ''}`}>{fmtDias(l.dura)}</td>
                <td className="p-2 text-right font-bold">
                  {l.sugestao > 0 ? (l.caixas !== null ? `${l.caixas} cx (${l.sugestao})` : `${l.sugestao} un`) : '—'}
                </td>
                <td className="p-2 text-right">{brl(l.custo)}</td>
                <td className={`p-2 text-right ${l.margem < 25 ? 'font-bold text-red-700' : ''}`}>{pct(l.margem)}</td>
                <td className="p-2 text-right font-semibold text-emerald-700">{brl(l.lucro30)}</td>
                <td className="p-2 text-center">
                  <span
                    className={`rounded px-1.5 font-black ${l.curva === 'A' ? 'bg-emerald-600 text-white' : l.curva === 'B' ? 'bg-sky-100 text-sky-800' : 'bg-stone-100 text-stone-500'}`}
                  >
                    {l.curva}
                  </span>
                </td>
                <td className="p-2">
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${ROTULO[l.status].cor}`}>{ROTULO[l.status].t}</span>
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={12} className="p-6 text-center text-stone-500">
                  Nada aqui. Bebidas com estoque controlado e vendas aparecem nesta lista.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">
        <b>Curva A</b>: as bebidas que dão 80% do seu lucro — nunca deixe faltar. <b>Parado</b>: tem estoque e não vendeu nada em 30 dias — não recompre,
        pense em promoção. A sugestão arredonda para caixas fechadas quando a bebida tem “unidades por caixa” (vem da última compra).
      </p>

      <section className="rounded-2xl border-2 border-orange-300 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-extrabold">🛒 Lista de compra ({naLista.length})</h3>
          <div className="flex flex-wrap gap-2">
            <button className={btn.secundario} disabled={!naLista.length} onClick={() => imprimirListaCompra(textoLista(), config)}>
              🖨️ Imprimir
            </button>
            <button
              className={btn.secundario}
              disabled={!naLista.length}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(textoLista())
                  alert('Lista copiada.')
                } catch {
                  prompt('Copie a lista:', textoLista())
                }
              }}
            >
              📋 Copiar
            </button>
            <a
              className={`${btn.verde} !py-2 ${naLista.length ? '' : 'pointer-events-none opacity-50'}`}
              href={`https://wa.me/?text=${encodeURIComponent(textoLista())}`}
              target="_blank"
              rel="noreferrer"
            >
              💬 WhatsApp
            </a>
          </div>
        </div>
        {naLista.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Marque na tabela o que quer comprar (os “Comprar já/em breve” já vêm marcados).</p>
        ) : (
          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-sm">{textoLista().replace(/\*/g, '')}</pre>
        )}
      </section>
    </div>
  )
}
