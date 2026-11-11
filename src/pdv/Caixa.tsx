import { useState } from 'react'
import { brl, dataHora, novoId, resumirCaixa, type Dados } from './dados'
import { imprimirRelatorio } from './impressao'
import { RelatorioCaixa } from './Relatorios'
import { rotuloComanda, saldoComanda, statusComanda } from './comanda'
import type { Movimento, TipoMovimento } from './tipos'
import { CampoNumero, CampoTexto, Imagem, btn } from './ui'

const TIPOS: { tipo: TipoMovimento; nome: string; ajuda: string }[] = [
  { tipo: 'despesa', nome: '🧾 Despesa', ajuda: 'Gasto do dia: carvão, gelo, gás, ajudante… Sai do lucro.' },
  { tipo: 'sangria', nome: '⬆️ Retirada', ajuda: 'Tirou dinheiro da gaveta (ex.: guardar). Não mexe no lucro.' },
  { tipo: 'suprimento', nome: '⬇️ Reforço', ajuda: 'Colocou mais troco na gaveta. Não mexe no lucro.' },
]

const fotoEstoque = (produtos: { id: string; estoque?: number }[]) =>
  Object.fromEntries(produtos.filter((p) => p.estoque !== undefined).map((p) => [p.id, p.estoque!]))

export default function CaixaTela({ dados, irPara }: { dados: Dados; irPara: (aba: 'venda' | 'estoque') => void }) {
  const { caixaAberto, caixas, setCaixas, produtos, pedidos, config, movEstoque } = dados
  const [fechadoAgora, setFechadoAgora] = useState<string | null>(null)

  if (fechadoAgora) {
    const c = caixas.find((x) => x.id === fechadoAgora)
    if (c) {
      const r = resumirCaixa(c, pedidos, produtos, movEstoque)
      return (
        <div className="space-y-4">
          <div className="rounded-2xl bg-emerald-600 p-4 text-white">
            <div className="text-xl font-extrabold">Caixa fechado ✔</div>
            <div>Confira o relatório abaixo. Ele fica salvo em “Relatórios”.</div>
          </div>
          <RelatorioCaixa caixa={c} r={r} dados={dados} />
          <button className={btn.primario} onClick={() => setFechadoAgora(null)}>
            Abrir novo caixa
          </button>
        </div>
      )
    }
  }

  if (!caixaAberto) return <AbrirCaixa dados={dados} aoAbrir={() => irPara('venda')} irEstoque={() => irPara('estoque')} />

  const r = resumirCaixa(caixaAberto, pedidos, produtos, movEstoque)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
          <h2 className="text-lg font-extrabold">Caixa Nº {caixaAberto.numero} aberto</h2>
          <p className="text-sm text-stone-600">Desde {dataHora(caixaAberto.abertoEm)} · troco inicial {brl(caixaAberto.trocoInicial)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="text-sm text-stone-600">Faturamento</div>
              <div className="text-xl font-extrabold">{brl(r.faturamento)}</div>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="text-sm text-stone-600">Na gaveta (esperado)</div>
              <div className="text-xl font-extrabold">{brl(r.dinheiroEsperado)}</div>
            </div>
          </div>
        </section>
        <Movimentos dados={dados} />
      </div>
      <FecharCaixa
        esperado={r.dinheiroEsperado}
        aoFechar={(contado, obs, imprimir) => {
          const fechado = {
            ...caixaAberto,
            fechadoEm: new Date().toISOString(),
            dinheiroContado: contado,
            observacao: obs,
            estoqueFinal: fotoEstoque(produtos),
          }
          setCaixas((cs) => cs.map((c) => (c.id === caixaAberto.id ? fechado : c)))
          if (imprimir) imprimirRelatorio(fechado, resumirCaixa(fechado, pedidos, produtos, movEstoque), config)
          setFechadoAgora(caixaAberto.id)
        }}
        pendentes={pedidos.filter((p) => p.caixaId === caixaAberto.id && !p.entregue && !p.cancelado).length}
        comandasAbertas={dados.comandas
          .filter((c) => statusComanda(c, pedidos) === 'aberta' && c.itens.length > 0)
          .map((c) => ({ rotulo: `${rotuloComanda(c)} (nº ${c.numero})`, saldo: saldoComanda(c, pedidos) }))}
      />
    </div>
  )
}

function AbrirCaixa({ dados, aoAbrir, irEstoque }: { dados: Dados; aoAbrir: () => void; irEstoque: () => void }) {
  const { caixas, setCaixas, produtos } = dados
  const anterior = caixas.slice().sort((a, b) => b.abertoEm.localeCompare(a.abertoEm))[0]
  const [troco, setTroco] = useState(anterior?.trocoInicial ?? 50)
  const controlados = produtos.filter((p) => p.ativo && p.estoque !== undefined)

  function abrir() {
    setCaixas((cs) => [
      ...cs,
      {
        id: novoId(),
        numero: cs.reduce((m, c) => Math.max(m, c.numero), 0) + 1,
        abertoEm: new Date().toISOString(),
        trocoInicial: troco,
        estoque: fotoEstoque(produtos),
        movimentos: [],
      },
    ])
    aoAbrir()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
        <h2 className="text-xl font-extrabold">Abrir caixa</h2>
        <p className="text-sm text-stone-600">Comece o dia informando o troco que está na gaveta.</p>
        <CampoNumero className="mt-4" rotulo="Troco inicial na gaveta" prefixo="R$" grande valor={troco} aoMudar={setTroco} />
      </section>

      {controlados.length > 0 && (
        <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-extrabold">Estoque pronto para vender</h3>
            <button className="text-sm font-bold text-orange-700" onClick={irEstoque}>
              Montar espetos / lançar compra →
            </button>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {controlados.map((p) => (
              <li key={p.id} className={`flex items-center gap-2 rounded-xl p-2 ${(p.estoque ?? 0) <= 0 ? 'bg-red-50' : 'bg-stone-50'}`}>
                <Imagem emoji={p.emoji} imagem={p.imagem} className="h-8 w-8 shrink-0 rounded text-2xl" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.nome}</span>
                <b className={(p.estoque ?? 0) <= 0 ? 'text-red-600' : ''}>{p.estoque}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button className={`${btn.primario} w-full py-4 text-xl`} onClick={abrir}>
        Abrir caixa e começar a vender
      </button>
    </div>
  )
}

function Movimentos({ dados }: { dados: Dados }) {
  const { caixaAberto, setCaixas } = dados
  const [tipo, setTipo] = useState<TipoMovimento>('despesa')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState(0)
  const [origem, setOrigem] = useState<Movimento['origem']>('dinheiro')
  if (!caixaAberto) return null

  const sugestoes = tipo === 'despesa' ? ['Carvão', 'Gelo', 'Gás', 'Ajudante', 'Embalagens', 'Pão'] : []

  function lancar() {
    const m: Movimento = {
      id: novoId(),
      tipo,
      descricao: descricao.trim() || { despesa: 'Despesa', sangria: 'Retirada', suprimento: 'Reforço de troco' }[tipo],
      valor,
      origem: tipo === 'despesa' ? origem : 'dinheiro',
      criadoEm: new Date().toISOString(),
    }
    setCaixas((cs) => cs.map((c) => (c.id === caixaAberto!.id ? { ...c, movimentos: [...c.movimentos, m] } : c)))
    setDescricao('')
    setValor(0)
  }

  const remover = (id: string) =>
    setCaixas((cs) => cs.map((c) => (c.id === caixaAberto.id ? { ...c, movimentos: c.movimentos.filter((m) => m.id !== id) } : c)))

  return (
    <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
      <h2 className="text-lg font-extrabold">Despesas e movimentações</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {TIPOS.map((t) => (
          <button
            key={t.tipo}
            onClick={() => setTipo(t.tipo)}
            className={`rounded-xl py-2 text-sm font-bold ${tipo === t.tipo ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`}
          >
            {t.nome}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-stone-600">{TIPOS.find((t) => t.tipo === tipo)!.ajuda}</p>
      <div className="mt-3 grid grid-cols-[1fr_8rem] gap-2">
        <CampoTexto valor={descricao} aoMudar={setDescricao} placeholder="Descrição" />
        <CampoNumero prefixo="R$" valor={valor} aoMudar={setValor} />
      </div>
      {sugestoes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sugestoes.map((s) => (
            <button key={s} className="rounded-full bg-stone-100 px-3 py-1 text-sm" onClick={() => setDescricao(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      {tipo === 'despesa' && (
        <div className="mt-3 flex gap-2 text-sm">
          <span className="self-center text-stone-600">Pagou com:</span>
          {(['dinheiro', 'conta'] as const).map((o) => (
            <button
              key={o}
              onClick={() => setOrigem(o)}
              className={`rounded-full px-3 py-1 font-semibold ${origem === o ? 'bg-orange-600 text-white' : 'bg-stone-100'}`}
            >
              {o === 'dinheiro' ? 'Dinheiro da gaveta' : 'Pix/cartão (conta)'}
            </button>
          ))}
        </div>
      )}
      <button className={`${btn.primario} mt-3 w-full`} disabled={valor <= 0} onClick={lancar}>
        Lançar
      </button>

      {caixaAberto.movimentos.length > 0 && (
        <ul className="mt-4 divide-y divide-stone-100">
          {caixaAberto.movimentos.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="flex-1">
                <b className="capitalize">{m.tipo}</b> · {m.descricao}
                <span className="text-stone-500"> ({m.origem === 'dinheiro' ? 'gaveta' : 'conta'})</span>
              </span>
              <b>{brl(m.valor)}</b>
              <button className="px-2 text-lg text-stone-400 hover:text-red-600" onClick={() => confirm('Excluir este lançamento?') && remover(m.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function FecharCaixa({
  esperado,
  pendentes,
  comandasAbertas,
  aoFechar,
}: {
  esperado: number
  pendentes: number
  comandasAbertas: { rotulo: string; saldo: number }[]
  aoFechar: (contado: number, obs: string, imprimir: boolean) => void
}) {
  const [contado, setContado] = useState(0)
  const [obs, setObs] = useState('')
  const [imprimir, setImprimir] = useState(true)
  const dif = contado - esperado

  return (
    <section className="h-fit rounded-2xl border-2 border-red-200 bg-white p-4">
      <h2 className="text-lg font-extrabold">Fechar caixa</h2>
      <p className="text-sm text-stone-600">Conte o dinheiro da gaveta e informe abaixo. O sistema compara com o que deveria ter.</p>
      <div className="mt-3 rounded-xl bg-stone-50 p-3 text-center">
        <div className="text-sm text-stone-600">Deveria ter na gaveta</div>
        <div className="text-3xl font-black">{brl(esperado)}</div>
      </div>
      <CampoNumero className="mt-3" rotulo="Dinheiro contado" prefixo="R$" grande valor={contado} aoMudar={setContado} />
      {contado > 0 && (
        <div
          className={`mt-2 rounded-lg p-2 text-center font-bold ${Math.abs(dif) < 0.01 ? 'bg-emerald-100 text-emerald-800' : dif > 0 ? 'bg-sky-100 text-sky-800' : 'bg-red-100 text-red-800'}`}
        >
          {Math.abs(dif) < 0.01 ? 'Bateu certinho ✔' : dif > 0 ? `Sobrando ${brl(dif)}` : `Faltando ${brl(-dif)}`}
        </div>
      )}
      <CampoTexto className="mt-3" rotulo="Observação (opcional)" valor={obs} aoMudar={setObs} placeholder="Ex.: choveu, movimento fraco" />
      <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" className="h-5 w-5 accent-orange-600" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} />
        Imprimir relatório na térmica
      </label>
      {pendentes > 0 && <p className="mt-2 text-sm font-semibold text-amber-700">Atenção: {pendentes} pedido(s) ainda não marcados como entregues.</p>}
      {comandasAbertas.length > 0 && (
        <div className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <b>
            {comandasAbertas.length} comanda(s) aberta(s), somando {brl(comandasAbertas.reduce((s, c) => s + c.saldo, 0))} a receber:
          </b>
          <ul className="mt-1 list-disc pl-5">
            {comandasAbertas.map((c) => (
              <li key={c.rotulo}>
                {c.rotulo}: {brl(c.saldo)}
              </li>
            ))}
          </ul>
          <p className="mt-1">Se fechar agora, elas continuam abertas e o pagamento entra no próximo caixa.</p>
        </div>
      )}
      <button
        className={`${btn.primario} mt-4 w-full !bg-red-600 py-4 text-lg hover:!bg-red-700`}
        onClick={() =>
          confirm(
            (comandasAbertas.length
              ? `Ainda há ${comandasAbertas.length} comanda(s) aberta(s) (${brl(comandasAbertas.reduce((s, c) => s + c.saldo, 0))}). Elas continuam abertas para o próximo caixa.\n\n`
              : '') + 'Fechar o caixa agora? Depois disso, novas vendas exigem abrir outro caixa.',
          ) && aoFechar(contado, obs.trim(), imprimir)
        }
      >
        Fechar caixa e gerar relatório
      </button>
    </section>
  )
}
