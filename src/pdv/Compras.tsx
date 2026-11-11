import { useRef, useState } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import {
  acharPorCodigo,
  arred,
  brl,
  custoProduto,
  custoUnitarioInsumo,
  buscarProdutos,
  dataHora,
  fornecedoresConhecidos,
  limparCodigo,
  melhorCompra,
  novoId,
  pct,
  ultimaCompra,
  type Dados,
} from './dados'
import { LerComCamera, cameraLeSuportada, useLeitorCodigo } from './leitor'
import { LerNotaFoto, type ResultadoNota } from './NotaFoto'
import type { Insumo, MovEstoque, Movimento, Produto, Unidade } from './tipos'
import { CampoNumero, CampoTexto, Imagem, Modal, btn } from './ui'

/** Bebidas/produtos de revenda: sem ficha (não são montados) e sem componentes (não são fardo/combo). */
export const ehRevenda = (p: Produto) => !p.ficha.length && !p.componentes?.length && p.categoria !== 'espeto'
/** O que pode entrar numa compra pronto: bebidas, espetos (comprados prontos), gelo, carvão… (não combos/fardos nem doses). */
export const compravel = (p: Produto) =>
  !p.componentes?.length && p.categoria !== 'drink' && p.categoria !== 'combo' && !(p.categoria === 'bebida' && p.ficha.length > 0)

export interface LinhaCompra {
  /** Id do produto — ou do insumo, quando `insumo` é true. */
  produtoId: string
  /** Linha de insumo (carne em kg, embalagem…): soma no estoque de insumos, sem preço de venda. */
  insumo?: boolean
  porCaixa: boolean
  caixas: number
  porCaixaUn: number
  unidades: number
  total: number
  /** Preço de venda que o produto passa a ter depois de lançar. */
  precoVenda: number
}

interface Rascunho {
  fornecedor: string
  nota: string
  margem: number
  /** Ao precificar todos, não diminuir preço que já está acima do sugerido. */
  naoBaixar?: boolean
  linhas: LinhaCompra[]
}

const RASCUNHO_VAZIO: Rascunho = { fornecedor: '', nota: '', margem: 35, naoBaixar: true, linhas: [] }

const unidadesDa = (l: LinhaCompra) => (l.porCaixa ? l.caixas * l.porCaixaUn : l.unidades)
const custoUnit = (l: LinhaCompra) => {
  const un = unidadesDa(l)
  return un > 0 ? l.total / un : 0
}
/** Preço "redondo" para cima, de 50 em 50 centavos. */
const precoRedondo = (v: number) => Math.ceil(v * 2 - 1e-9) / 2
/** Preço que dá a margem pedida sobre o custo (margem = lucro ÷ preço). */
export const precoPelaMargem = (custo: number, margem: number) => (custo > 0 && margem < 100 ? precoRedondo(custo / (1 - margem / 100)) : 0)
const margemDe = (preco: number, custo: number) => (preco > 0 ? ((preco - custo) / preco) * 100 : 0)

export default function Compras({ dados }: { dados: Dados }) {
  const { movEstoque } = dados
  const [rascunho, setRascunho] = useLocalStorage<Rascunho>('espeto:compra-rascunho', RASCUNHO_VAZIO)
  const [nova, setNova] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const temRascunho = rascunho.linhas.length > 0 || !!rascunho.fornecedor.trim()

  if (nova) {
    return (
      <NovaCompra
        dados={dados}
        rascunho={rascunho}
        setRascunho={setRascunho}
        aoSair={(msg) => {
          setNova(false)
          if (msg) {
            setAviso(msg)
            setTimeout(() => setAviso(''), 8000)
          }
        }}
      />
    )
  }

  // agrupa as linhas de compra por nota (compraId); compras antigas sem nota viram uma cada
  const notas = new Map<string, MovEstoque[]>()
  for (const m of movEstoque) {
    if (m.tipo !== 'compra') continue
    const k = m.compraId ?? m.id
    notas.set(k, [...(notas.get(k) ?? []), m])
  }
  const lista = [...notas.entries()].reverse()
  const mes = new Date().toISOString().slice(0, 7)
  const totalMes = movEstoque.filter((m) => m.tipo === 'compra' && m.criadoEm.slice(0, 7) === mes).reduce((s, m) => s + (m.valor ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">🧾 Compras</h2>
          <p className="text-sm text-stone-600">
            Comprado este mês: <b>{brl(totalMes)}</b>
          </p>
        </div>
      </div>

      {aviso && <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 font-semibold text-emerald-900">✔ {aviso}</div>}

      <button
        className="flex w-full items-center gap-4 rounded-2xl border-4 border-orange-500 bg-orange-50 p-5 text-left transition hover:bg-orange-100"
        onClick={() => setNova(true)}
      >
        <span className="text-5xl">🧾</span>
        <span className="flex-1">
          <span className="block text-2xl font-black text-orange-700">{temRascunho ? 'Continuar compra' : '+ Nova compra'}</span>
          <span className="block text-stone-600">
            {temRascunho
              ? `${rascunho.fornecedor || 'Sem fornecedor'} · ${rascunho.linhas.length} ${rascunho.linhas.length === 1 ? 'produto' : 'produtos'} anotados`
              : 'Fornecedor → produtos (bipe o código ou digite o nome) → lança no estoque e atualiza os preços'}
          </span>
        </span>
        <span className="text-3xl text-orange-600">→</span>
      </button>

      <h3 className="pt-2 font-extrabold">Compras lançadas</h3>
      {lista.length === 0 && <div className="rounded-2xl border-2 border-dashed border-stone-300 bg-white p-10 text-center text-stone-500">Nenhuma compra lançada.</div>}
      <ul className="space-y-2">
        {lista.map(([id, linhas]) => {
          const total = linhas.reduce((s, m) => s + (m.valor ?? 0), 0)
          const forn = linhas[0].fornecedor
          return (
            <li key={id} className="rounded-2xl border-2 border-stone-200 bg-white">
              <button className="flex w-full flex-wrap items-center gap-3 p-3 text-left" onClick={() => setAberta(aberta === id ? null : id)}>
                <span className="w-32 text-sm text-stone-500">{dataHora(linhas[0].criadoEm)}</span>
                <span className="flex-1 font-bold">
                  {forn || <span className="text-stone-400">sem fornecedor</span>}
                  {linhas[0].nota && <span className="ml-2 text-sm font-normal text-stone-500">nota {linhas[0].nota}</span>}
                </span>
                <span className="text-sm text-stone-600">
                  {linhas.length} {linhas.length === 1 ? 'item' : 'itens'}
                </span>
                <b>{brl(total)}</b>
              </button>
              {aberta === id && (
                <ul className="border-t border-stone-100 px-3 pb-3 text-sm">
                  {linhas.map((m) => (
                    <li key={m.id} className="flex justify-between py-1">
                      <span>
                        {m.qtd.toLocaleString('pt-BR')} {m.unidade} · {m.nome}
                      </span>
                      <span>
                        {brl(m.valor ?? 0)} <span className="text-stone-400">({brl((m.valor ?? 0) / m.qtd)}/{m.unidade})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function NovaCompra({
  dados,
  rascunho,
  setRascunho,
  aoSair,
}: {
  dados: Dados
  rascunho: Rascunho
  setRascunho: (r: Rascunho | ((r: Rascunho) => Rascunho)) => void
  aoSair: (mensagem?: string) => void
}) {
  const { produtos, insumos, movEstoque, caixaAberto } = dados
  const revenda = produtos.filter(compravel)
  const { fornecedor, nota, margem } = rascunho
  const naoBaixar = rascunho.naoBaixar ?? true
  // só linhas de produtos/insumos que ainda existem
  const linhas = rascunho.linhas.filter((l) => (l.insumo ? insumos.some((i) => i.id === l.produtoId) : produtos.some((p) => p.id === l.produtoId)))
  const linhasProd = linhas.filter((l) => !l.insumo)
  const set = (m: Partial<Rascunho>) => setRascunho((r) => ({ ...r, ...m }))
  const setLinhas = (f: (ls: LinhaCompra[]) => LinhaCompra[]) => setRascunho((r) => ({ ...r, linhas: f(r.linhas) }))
  const [busca, setBusca] = useState('')
  const [daGaveta, setDaGaveta] = useState(false)
  const [codigoNovo, setCodigoNovo] = useState<string | null>(null)
  const [camera, setCamera] = useState(false)
  const [conferindo, setConferindo] = useState(false)
  const [notaFoto, setNotaFoto] = useState(false)
  /** Linha de garrafa que o dono quer vender em doses. */
  const [emDoses, setEmDoses] = useState<LinhaCompra | null>(null)
  const campoBusca = useRef<HTMLInputElement>(null)
  const prod = (id: string) => produtos.find((p) => p.id === id)!
  const ins = (id: string) => insumos.find((i) => i.id === id)!
  const nomeLinha = (l: LinhaCompra) => (l.insumo ? ins(l.produtoId).nome : prod(l.produtoId).nome)

  function incluirInsumo(i: Insumo) {
    setLinhas((ls) => {
      if (ls.some((l) => l.insumo && l.produtoId === i.id)) return ls
      return [...ls, { produtoId: i.id, insumo: true, porCaixa: false, caixas: 0, porCaixaUn: 1, unidades: 0, total: 0, precoVenda: 0 }]
    })
    setBusca('')
    campoBusca.current?.focus()
  }

  function incluir(p: Produto) {
    setLinhas((ls) => {
      const ja = ls.findIndex((l) => l.produtoId === p.id)
      if (ja >= 0) return ls.map((l, i) => (i === ja ? (l.porCaixa ? { ...l, caixas: l.caixas + 1 } : { ...l, unidades: l.unidades + 1 }) : l))
      const ult = ultimaCompra(movEstoque, p.id)
      const uc = p.unidadesCaixa ?? 12
      const custo = ult?.unitario ?? p.custoDireto
      return [...ls, { produtoId: p.id, porCaixa: true, caixas: 1, porCaixaUn: uc, unidades: uc, total: arred(custo * uc), precoVenda: p.preco }]
    })
    setBusca('')
    campoBusca.current?.focus()
  }

  function lerCodigo(c: string) {
    const p = acharPorCodigo(produtos, c)
    const i = insumos.find((x) => x.codigos?.some((k) => limparCodigo(k) === limparCodigo(c)))
    if (i) incluirInsumo(i)
    else if (p && compravel(p)) incluir(p)
    else setCodigoNovo(limparCodigo(c))
  }
  useLeitorCodigo(codigoNovo === null && !camera && !conferindo && !notaFoto, lerCodigo)

  /** Itens que vieram da foto da nota (já conferidos): cadastra os novos, guarda o que aprendeu e junta na compra. */
  function usarNota(r: ResultadoNota) {
    dados.setProdutos((ps) => [
      ...ps.map((p) => {
        const ap = r.aprendidos.filter((a) => !a.insumo && a.produtoId === p.id)
        if (!ap.length) return p
        const nomes = [...new Set([...(p.nomesNota ?? []), ...ap.map((a) => a.nomeNota)])].slice(-10)
        const cods = [...new Set([...(p.codigos ?? []), ...ap.flatMap((a) => (a.codigo ? [a.codigo] : []))])]
        return { ...p, nomesNota: nomes, ...(cods.length ? { codigos: cods } : {}) }
      }),
      ...r.novos,
    ])
    dados.setInsumos((is) => [
      ...is.map((i) => {
        const ap = r.aprendidos.filter((a) => a.insumo && a.produtoId === i.id)
        if (!ap.length) return i
        const nomes = [...new Set([...(i.nomesNota ?? []), ...ap.map((a) => a.nomeNota)])].slice(-10)
        const cods = [...new Set([...(i.codigos ?? []), ...ap.flatMap((a) => (a.codigo ? [a.codigo] : []))])]
        return { ...i, nomesNota: nomes, ...(cods.length ? { codigos: cods } : {}) }
      }),
      ...r.novosInsumos,
    ])
    setRascunho((rs) => {
      const ls = [...rs.linhas]
      for (const n of r.linhas) {
        const i = ls.findIndex((l) => l.produtoId === n.produtoId && !!l.insumo === !!n.insumo)
        if (i < 0) ls.push(n)
        else ls[i] = { ...ls[i], porCaixa: false, unidades: unidadesDa(ls[i]) + unidadesDa(n), total: arred(ls[i].total + n.total) }
      }
      return { ...rs, fornecedor: rs.fornecedor.trim() || r.fornecedor, nota: rs.nota.trim() || r.nota, linhas: ls }
    })
    setNotaFoto(false)
  }

  const muda = (i: number, m: Partial<LinhaCompra>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...m } : l)))
  const total = arred(linhas.reduce((s, l) => s + l.total, 0))
  const unidadesTotal = arred(linhasProd.reduce((s, l) => s + unidadesDa(l), 0))
  const resultados = busca.trim() ? buscarProdutos(revenda, busca).slice(0, 8) : []
  const insumosAchados = busca.trim() ? buscarProdutos(insumos.map((i) => ({ ...i, ficha: [], categoria: 'outro' as const, preco: 0, emoji: '', custoDireto: 0, ativo: true })), busca).slice(0, 4) : []
  const mudaPreco = linhasProd.filter((l) => l.precoVenda > 0 && Math.abs(l.precoVenda - prod(l.produtoId).preco) >= 0.005).length
  const abaixoMargem = linhasProd.filter((l) => custoUnit(l) > 0 && margemDe(l.precoVenda, custoUnit(l)) < margem - 0.05).length
  const voltarParaBusca = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') campoBusca.current?.focus()
  }

  function aplicarMargem() {
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.insumo || custoUnit(l) <= 0) return l
        const sug = precoPelaMargem(custoUnit(l), margem)
        const atual = prod(l.produtoId).preco
        return { ...l, precoVenda: naoBaixar && atual > sug ? atual : sug }
      }),
    )
  }
  function manterPrecos() {
    setLinhas((ls) => ls.map((l) => (l.insumo ? l : { ...l, precoVenda: prod(l.produtoId).preco })))
  }

  function lancar() {
    const compraId = novoId()
    const agora = new Date().toISOString()
    const forn = fornecedor.trim() || undefined
    const movs: MovEstoque[] = []
    let precos = 0
    dados.setProdutos((ps) =>
      ps.map((p) => {
        const l = linhasProd.find((x) => x.produtoId === p.id)
        if (!l) return p
        const un = unidadesDa(l)
        if (un <= 0) return p
        const estoqueAtual = Math.max(0, p.estoque ?? 0)
        // custo médio: o que tinha + o que chegou (espeto que era montado: o custo antigo vinha da ficha)
        const custoAntigo = custoProduto(p, insumos)
        const custo = l.total > 0 ? (estoqueAtual * custoAntigo + l.total) / (estoqueAtual + un) : custoAntigo
        return {
          ...p,
          estoque: (p.estoque ?? 0) + un,
          custoDireto: arred(custo),
          // espeto comprado pronto: a ficha de insumos não vale mais (fica guardada)
          ...(p.ficha.length && p.categoria === 'espeto' ? { ficha: [], fichaAnterior: p.ficha } : {}),
          preco: l.precoVenda > 0 ? l.precoVenda : p.preco,
          ...(l.porCaixa ? { unidadesCaixa: l.porCaixaUn } : {}),
        }
      }),
    )
    dados.setInsumos((is) =>
      is.map((i) => {
        const l = linhas.find((x) => x.insumo && x.produtoId === i.id)
        if (!l || l.unidades <= 0) return i
        const atual = Math.max(0, i.estoque ?? 0)
        const custoAtual = custoUnitarioInsumo(i)
        const novo = l.total > 0 ? (atual * custoAtual + l.total) / (atual + l.unidades) : custoAtual
        return { ...i, estoque: Math.round(((i.estoque ?? 0) + l.unidades) * 1000) / 1000, precoCompra: arred(novo * 1000) / 1000, qtdCompra: 1 }
      }),
    )
    for (const l of linhas) {
      const un = unidadesDa(l)
      if (un <= 0) continue
      if (!l.insumo && l.precoVenda > 0 && Math.abs(l.precoVenda - prod(l.produtoId).preco) >= 0.005) precos++
      movs.push({
        id: novoId(),
        criadoEm: agora,
        tipo: 'compra',
        ...(l.insumo ? { insumoId: l.produtoId } : { produtoId: l.produtoId }),
        nome: nomeLinha(l),
        qtd: un,
        unidade: l.insumo ? ins(l.produtoId).unidade : 'un',
        valor: l.total,
        fornecedor: forn,
        compraId,
        ...(nota.trim() ? { nota: nota.trim() } : {}),
        obs: l.porCaixa ? `${l.caixas} cx × ${l.porCaixaUn}` : undefined,
      })
    }
    dados.setMovEstoque((ms) => [...ms, ...movs])
    if (daGaveta && caixaAberto && total > 0) {
      const mov: Movimento = {
        id: novoId(),
        tipo: 'sangria',
        descricao: `Compra${forn ? ` ${forn}` : ''}`,
        valor: total,
        origem: 'dinheiro',
        criadoEm: agora,
      }
      dados.setCaixas((cs) => cs.map((c) => (c.id === caixaAberto.id ? { ...c, movimentos: [...c.movimentos, mov] } : c)))
    }
    setRascunho(RASCUNHO_VAZIO)
    aoSair(
      `Compra lançada${forn ? ` (${forn})` : ''}: ${movs.length} ${movs.length === 1 ? 'item' : 'itens'}, ${brl(total)}. ` +
        `Estoque atualizado${precos ? ` e ${precos} ${precos === 1 ? 'preço novo' : 'preços novos'}` : ''}.`,
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className={btn.secundario} onClick={() => aoSair()}>
          ← Voltar
        </button>
        <h2 className="flex-1 text-2xl font-extrabold">🧾 Nova compra</h2>
        {(linhas.length > 0 || fornecedor) && (
          <button
            className="text-sm font-semibold text-red-600"
            onClick={() => confirm('Descartar esta compra? Nada foi lançado ainda.') && (setRascunho(RASCUNHO_VAZIO), aoSair())}
          >
            Descartar
          </button>
        )}
      </div>

      {/* 1. fornecedor */}
      <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
        <h3 className="mb-2 font-extrabold">
          <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-white">1</span>Fornecedor
        </h3>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-stone-600">De quem comprou</span>
            <input
              list="fornecedores"
              className="w-full rounded-xl border-2 border-stone-200 px-3 py-2 text-lg outline-none focus:border-orange-500"
              placeholder="Ex.: Distribuidora Silva, Atacadão"
              value={fornecedor}
              onChange={(e) => set({ fornecedor: e.target.value })}
            />
            <datalist id="fornecedores">
              {fornecedoresConhecidos(movEstoque).map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </label>
          <CampoTexto rotulo="Nº da nota (opcional)" valor={nota} aoMudar={(v) => set({ nota: v })} placeholder="Ex.: 12345" />
        </div>
        {fornecedoresConhecidos(movEstoque).length > 0 && !fornecedor && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {fornecedoresConhecidos(movEstoque).map((f) => (
              <button key={f} className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold hover:bg-orange-100" onClick={() => set({ fornecedor: f })}>
                {f}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 2. produtos */}
      <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
        <h3 className="mb-2 font-extrabold">
          <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-white">2</span>Produtos da nota
        </h3>
        <div className="relative flex gap-2">
          <input
            ref={campoBusca}
            className="min-w-0 flex-1 rounded-xl border-2 border-orange-300 px-3 py-3 text-lg outline-none focus:border-orange-500"
            autoFocus
            placeholder="🔎 Bipe o código de barras ou digite o nome e aperte Enter…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !busca.trim()) return
              e.preventDefault()
              if (/^\d{6,}$/.test(busca.trim())) {
                // código de barras digitado/bipado no campo
                lerCodigo(busca.trim())
                setBusca('')
                return
              }
              const p = acharPorCodigo(produtos, busca)
              if (p && compravel(p)) incluir(p)
              else if (resultados.length >= 1 && !/^\d{6,}$/.test(busca.trim())) incluir(resultados[0])
              else if (insumosAchados.length >= 1 && !/^\d{6,}$/.test(busca.trim())) incluirInsumo(ins(insumosAchados[0].id))
              else setCodigoNovo('')
            }}
          />
          {cameraLeSuportada() && (
            <button className="rounded-xl bg-white px-4 text-2xl ring-2 ring-stone-200" onClick={() => setCamera(true)} aria-label="Ler com a câmera">
              📷
            </button>
          )}
          <button className="shrink-0 rounded-xl bg-white px-4 font-bold text-orange-700 ring-2 ring-orange-300 hover:bg-orange-50" onClick={() => setCodigoNovo('')}>
            ➕ <span className="hidden sm:inline">Produto novo</span>
          </button>
          <button className="shrink-0 rounded-xl bg-violet-600 px-4 font-bold text-white hover:bg-violet-700" onClick={() => setNotaFoto(true)}>
            📸 <span className="hidden sm:inline">Ler nota por foto</span>
          </button>
          {busca.trim() !== '' && !/^\d{6,}$/.test(busca.trim()) && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-xl border-2 border-stone-200 bg-white shadow-xl">
              {resultados.map((p, k) => (
                <li key={p.id}>
                  <button className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-orange-50 ${k === 0 ? 'bg-orange-50/60' : ''}`} onClick={() => incluir(p)}>
                    <Imagem emoji={p.emoji} imagem={p.imagem} className="h-8 w-8 shrink-0 rounded text-xl" />
                    <span className="flex-1 font-semibold">{p.nome}</span>
                    <span className="text-xs text-stone-500">
                      tem {p.estoque ?? 0} · {brl(p.preco)}
                    </span>
                  </button>
                </li>
              ))}
              {insumosAchados.map((x) => {
                const i = ins(x.id)
                return (
                  <li key={`ins-${i.id}`}>
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-amber-50" onClick={() => incluirInsumo(i)}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-amber-100 text-xs font-bold text-amber-800">{i.unidade}</span>
                      <span className="flex-1 font-semibold">{i.nome}</span>
                      <span className="text-xs text-stone-500">
                        insumo · tem {(i.estoque ?? 0).toLocaleString('pt-BR')} {i.unidade}
                      </span>
                    </button>
                  </li>
                )
              })}
              <li>
                <button
                  className="w-full border-t border-stone-100 px-3 py-2 text-left text-sm font-bold text-orange-700 hover:bg-orange-50"
                  onClick={() => {
                    setCodigoNovo('')
                  }}
                >
                  ➕ {resultados.length || insumosAchados.length ? 'Não achei — cadastrar' : 'Não tem — cadastrar'} “{busca.trim()}” como produto novo
                </button>
              </li>
            </ul>
          )}
        </div>

        {/* precificação */}
        {linhas.length > 0 && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-stone-50 p-3">
            <CampoNumero className="w-36" rotulo="Margem desejada" sufixo="%" valor={margem} aoMudar={(v) => set({ margem: Math.min(95, v) })} />
            <button className={`${btn.primario} !py-2`} onClick={aplicarMargem}>
              💲 Precificar todos com {margem}%
            </button>
            <button className={`${btn.secundario} !py-2`} onClick={manterPrecos}>
              Manter preços atuais
            </button>
            <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={naoBaixar} onChange={(e) => set({ naoBaixar: e.target.checked })} />
              Não baixar preço
            </label>
            {abaixoMargem > 0 && <span className="pb-2 text-sm font-bold text-red-700">{abaixoMargem} abaixo de {margem}%</span>}
          </div>
        )}

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b-2 border-stone-200 text-left text-xs uppercase text-stone-500">
                <th className="p-2">Produto</th>
                <th className="p-2">Quantidade</th>
                <th className="p-2 text-right">Custo unit.</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-right">Preço atual</th>
                <th className="p-2 text-right">Preço novo</th>
                <th className="p-2 text-right">Margem</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-stone-400">
                    Bipe ou busque as bebidas da nota — ou toque em 📸 Ler nota por foto — cada uma vira uma linha aqui.
                  </td>
                </tr>
              )}
              {linhas.map((l) => {
                const i = rascunho.linhas.indexOf(l)
                if (l.insumo) {
                  const it = ins(l.produtoId)
                  const unitI = l.unidades > 0 ? l.total / l.unidades : 0
                  const antes = custoUnitarioInsumo(it)
                  return (
                    <tr key={`ins-${l.produtoId}`} className="border-b border-stone-100 bg-amber-50/40 align-top">
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-amber-100 text-xs font-bold text-amber-800">{it.unidade}</span>
                          <div>
                            <div className="font-bold">{it.nome}</div>
                            <div className="text-xs text-stone-500">
                              insumo · tem {(it.estoque ?? 0).toLocaleString('pt-BR')} →{' '}
                              <b className="text-emerald-700">{(Math.round(((it.estoque ?? 0) + l.unidades) * 1000) / 1000).toLocaleString('pt-BR')}</b> {it.unidade}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-2" onKeyDown={voltarParaBusca}>
                        <div className="flex items-center gap-1">
                          <CampoNumero className="w-28" valor={l.unidades} aoMudar={(v) => muda(i, { unidades: v })} />
                          <span className="text-stone-500">{it.unidade}</span>
                        </div>
                      </td>
                      <td className="p-2 text-right" onKeyDown={voltarParaBusca}>
                        <CampoNumero className="ml-auto w-28" prefixo="R$" valor={arred(unitI)} aoMudar={(v) => muda(i, { total: arred(v * l.unidades) })} />
                        <div className="mt-1 text-xs text-stone-500">
                          por {it.unidade} · antes {brl(antes)}
                        </div>
                      </td>
                      <td className="p-2 text-right" onKeyDown={voltarParaBusca}>
                        <CampoNumero className="ml-auto w-28" prefixo="R$" valor={l.total} aoMudar={(v) => muda(i, { total: v })} />
                      </td>
                      <td colSpan={3} className="p-2 pt-4 text-center text-xs text-stone-500">
                        insumo — o custo novo entra nos espetos/receitas que usam {it.nome.toLowerCase()}
                      </td>
                      <td className="p-2 pt-4">
                        <button className="px-1 text-xl text-stone-400 hover:text-red-600" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} aria-label="Tirar">
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                }
                const p = prod(l.produtoId)
                const un = unidadesDa(l)
                const unit = custoUnit(l)
                const ult = ultimaCompra(movEstoque, p.id)
                const melhor = melhorCompra(movEstoque, p.id)
                const variacao = ult && ult.unitario > 0 ? ((unit - ult.unitario) / ult.unitario) * 100 : 0
                const mg = margemDe(l.precoVenda, unit)
                const sugerido = precoPelaMargem(unit, margem)
                const mudou = Math.abs(l.precoVenda - p.preco) >= 0.005
                return (
                  <tr key={l.produtoId} className="border-b border-stone-100 align-top">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <Imagem emoji={p.emoji} imagem={p.imagem} className="h-9 w-9 shrink-0 rounded text-2xl" />
                        <div>
                          <div className="font-bold">{p.nome}</div>
                          <div className="text-xs text-stone-500">
                            tem {p.estoque ?? 0} → <b className="text-emerald-700">{(p.estoque ?? 0) + un}</b>
                            {p.codigos?.[0] && <span className="ml-1 font-mono">{p.codigos[0]}</span>}
                          </div>
                          {p.ficha.length > 0 && (
                            <div className="mt-0.5 text-xs font-semibold text-amber-700">comprado pronto: o custo passa a ser o desta compra</div>
                          )}
                          {p.categoria !== 'espeto' && (
                            <button className="mt-1 text-xs font-bold text-violet-700 underline" onClick={() => setEmDoses(l)}>
                              🥃 Vou vender em doses
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="mb-1 flex gap-1 text-xs font-bold">
                        {(
                          [
                            [true, 'Caixas'],
                            [false, 'Unidades'],
                          ] as const
                        ).map(([cx, r]) => (
                          <button
                            key={r}
                            className={`rounded-full px-2 py-0.5 ${l.porCaixa === cx ? 'bg-stone-900 text-white' : 'bg-stone-100'}`}
                            onClick={() => muda(i, { porCaixa: cx, unidades: un })}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1" onKeyDown={voltarParaBusca}>
                        {l.porCaixa ? (
                          <>
                            <CampoNumero className="w-16" valor={l.caixas} aoMudar={(v) => muda(i, { caixas: Math.round(v) })} />
                            <span className="text-stone-500">cx ×</span>
                            <CampoNumero className="w-16" valor={l.porCaixaUn} aoMudar={(v) => muda(i, { porCaixaUn: Math.round(v) })} />
                          </>
                        ) : (
                          <CampoNumero className="w-24" valor={l.unidades} aoMudar={(v) => muda(i, { unidades: Math.round(v) })} />
                        )}
                      </div>
                      <div className="mt-1 text-xs text-stone-500">= {un} un</div>
                    </td>
                    <td className="p-2 text-right" onKeyDown={voltarParaBusca}>
                      <CampoNumero className="ml-auto w-28" prefixo="R$" valor={arred(unit)} aoMudar={(v) => muda(i, { total: arred(v * un) })} />
                      {ult && (
                        <div className={`mt-1 text-xs ${Math.abs(variacao) < 0.5 ? 'text-stone-500' : variacao > 0 ? 'font-bold text-red-700' : 'font-bold text-emerald-700'}`}>
                          última {brl(ult.unitario)} {Math.abs(variacao) >= 0.5 && `${variacao > 0 ? '▲' : '▼'}${pct(Math.abs(variacao))}`}
                        </div>
                      )}
                      {melhor && ult && melhor.unitario < ult.unitario - 0.004 && (
                        <div className="text-xs text-sky-700">
                          + barato: {brl(melhor.unitario)}
                          {melhor.fornecedor ? ` (${melhor.fornecedor})` : ''}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-right" onKeyDown={voltarParaBusca}>
                      <CampoNumero className="ml-auto w-28" prefixo="R$" valor={l.total} aoMudar={(v) => muda(i, { total: v })} />
                    </td>
                    <td className="p-2 pt-4 text-right text-stone-500">{brl(p.preco)}</td>
                    <td className="p-2 text-right" onKeyDown={voltarParaBusca}>
                      <CampoNumero
                        className={`ml-auto w-28 ${mudou ? 'rounded-xl ring-2 ring-orange-400' : ''}`}
                        prefixo="R$"
                        valor={l.precoVenda}
                        aoMudar={(v) => muda(i, { precoVenda: v })}
                      />
                      {sugerido > 0 && Math.abs(sugerido - l.precoVenda) >= 0.005 && (
                        <button className="mt-1 text-xs font-bold text-orange-700 underline" onClick={() => muda(i, { precoVenda: sugerido })}>
                          usar {brl(sugerido)} ({margem}%)
                        </button>
                      )}
                      {l.precoVenda <= 0 && <div className="mt-1 text-xs font-bold text-red-700">sem preço de venda!</div>}
                    </td>
                    <td className={`p-2 pt-4 text-right font-bold ${unit <= 0 ? 'text-stone-400' : mg < margem - 0.05 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {unit > 0 ? pct(mg) : '—'}
                      {unit > 0 && <div className="text-xs font-normal text-stone-500">lucro {brl(l.precoVenda - unit)}</div>}
                    </td>
                    <td className="p-2 pt-4">
                      <button className="px-1 text-xl text-stone-400 hover:text-red-600" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} aria-label="Tirar">
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. lançar */}
      <div className="sticky bottom-0 z-30 -mx-3 border-t-2 border-stone-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur sm:-mx-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex-1">
            <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 font-bold text-white">3</span>
            {linhas.length} {linhas.length === 1 ? 'produto' : 'produtos'} · {unidadesTotal} un · Total: <b className="text-2xl">{brl(total)}</b>
          </span>
          {caixaAberto && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-5 w-5 accent-orange-600" checked={daGaveta} onChange={(e) => setDaGaveta(e.target.checked)} />
              Paguei com dinheiro da gaveta
            </label>
          )}
          <button className={`${btn.verde} text-lg`} disabled={!linhas.some((l) => unidadesDa(l) > 0)} onClick={() => setConferindo(true)}>
            ✔ Lançar no estoque{mudaPreco ? ' e atualizar preços' : ''}
          </button>
        </div>
      </div>

      {conferindo && (
        <Modal titulo="Conferir antes de lançar" aberto aoFechar={() => setConferindo(false)} largo>
          <p className="text-sm text-stone-600">
            {fornecedor.trim() || 'Sem fornecedor'}
            {nota.trim() && ` · nota ${nota.trim()}`} · {brl(total)}
            {daGaveta && caixaAberto && ' · sai da gaveta'}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b-2 border-stone-200 text-left text-xs uppercase text-stone-500">
                  <th className="p-2">Produto</th>
                  <th className="p-2 text-right">Estoque</th>
                  <th className="p-2 text-right">Custo un.</th>
                  <th className="p-2 text-right">Preço de venda</th>
                </tr>
              </thead>
              <tbody>
                {linhas
                  .filter((l) => unidadesDa(l) > 0)
                  .map((l) => {
                    if (l.insumo) {
                      const it = ins(l.produtoId)
                      return (
                        <tr key={`ins-${l.produtoId}`} className="border-b border-stone-100">
                          <td className="p-2 font-semibold">{it.nome} <span className="text-xs font-normal text-stone-500">(insumo)</span></td>
                          <td className="p-2 text-right">
                            {(it.estoque ?? 0).toLocaleString('pt-BR')} → <b className="text-emerald-700">{arred((it.estoque ?? 0) + l.unidades).toLocaleString('pt-BR')}</b> {it.unidade}
                          </td>
                          <td className="p-2 text-right">
                            {brl(l.unidades > 0 ? l.total / l.unidades : 0)}/{it.unidade}
                          </td>
                          <td className="p-2 text-right text-stone-400">—</td>
                        </tr>
                      )
                    }
                    const p = prod(l.produtoId)
                    const mudou = l.precoVenda > 0 && Math.abs(l.precoVenda - p.preco) >= 0.005
                    return (
                      <tr key={l.produtoId} className="border-b border-stone-100">
                        <td className="p-2 font-semibold">
                          {p.emoji} {p.nome}
                        </td>
                        <td className="p-2 text-right">
                          {p.estoque ?? 0} → <b className="text-emerald-700">{(p.estoque ?? 0) + unidadesDa(l)}</b>
                        </td>
                        <td className="p-2 text-right">{brl(custoUnit(l))}</td>
                        <td className="p-2 text-right">
                          {mudou ? (
                            <>
                              <span className="text-stone-400 line-through">{brl(p.preco)}</span> <b className="text-orange-700">{brl(l.precoVenda)}</b>
                            </>
                          ) : p.preco <= 0 ? (
                            <b className="text-red-700">sem preço!</b>
                          ) : (
                            <span className="text-stone-500">{brl(p.preco)} (igual)</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex gap-2">
            <button className={`${btn.secundario} flex-1`} onClick={() => setConferindo(false)}>
              Voltar e corrigir
            </button>
            <button className={`${btn.verde} flex-1 text-lg`} onClick={lancar}>
              ✔ Confirmar e lançar
            </button>
          </div>
        </Modal>
      )}

      {emDoses && (
        <ModalVenderEmDoses
          dados={dados}
          produto={prod(emDoses.produtoId)}
          garrafas={unidadesDa(emDoses)}
          totalPago={emDoses.total}
          aoFechar={() => setEmDoses(null)}
          aoConfirmar={(insumoId, litros) => {
            // a linha da garrafa vira linha do insumo, em litros (mesmo valor pago)
            setLinhas((ls) => [
              ...ls.filter((x) => !(x.produtoId === emDoses.produtoId && !x.insumo)),
              { produtoId: insumoId, insumo: true, porCaixa: false, caixas: 0, porCaixaUn: 1, unidades: litros, total: emDoses.total, precoVenda: 0 },
            ])
            setEmDoses(null)
          }}
        />
      )}
      {notaFoto && <LerNotaFoto revenda={revenda} insumos={insumos} aoFechar={() => setNotaFoto(false)} aoUsar={usarNota} />}
      {camera && (
        <LerComCamera
          aoFechar={() => setCamera(false)}
          aoLer={(c) => {
            setCamera(false)
            lerCodigo(c)
          }}
        />
      )}
      {codigoNovo !== null && (
        <ModalProdutoNovo
          codigo={codigoNovo}
          nomeInicial={/^\d+$/.test(busca.trim()) ? '' : busca.trim()}
          revenda={revenda}
          aoFechar={() => setCodigoNovo(null)}
          aoNovoInsumo={(i) => {
            dados.setInsumos((is) => [...is, i])
            setCodigoNovo(null)
            setTimeout(() => incluirInsumo(i), 0)
          }}
          aoEscolher={(p, novo) => {
            const cod = novo ? '' : codigoNovo
            if (novo) dados.setProdutos((ps) => [...ps, p])
            else if (cod) dados.setProdutos((ps) => ps.map((x) => (x.id === p.id ? { ...x, codigos: [...(x.codigos ?? []), cod] } : x)))
            setCodigoNovo(null)
            // espera o produto entrar na lista
            setTimeout(() => incluir(cod && !novo ? { ...p, codigos: [...(p.codigos ?? []), cod] } : p), 0)
          }}
        />
      )}
    </div>
  )
}

type TipoNovo = 'bebida' | 'outro' | 'espeto' | 'insumo'
const TIPOS_NOVO: { id: TipoNovo; rotulo: string; dica: string }[] = [
  { id: 'bebida', rotulo: '🍺 Bebida', dica: 'cerveja, refri, água, garrafa…' },
  { id: 'outro', rotulo: '🧊 Outro p/ vender', dica: 'gelo, carvão, cigarro, bala…' },
  { id: 'espeto', rotulo: '🍢 Espeto pronto', dica: 'espeto que já vem montado' },
  { id: 'insumo', rotulo: '🥩 Insumo', dica: 'carne, pão, embalagem (não vende direto)' },
]
const emojiDoNome = (nome: string, tipo: TipoNovo) =>
  tipo === 'espeto'
    ? '🍢'
    : /gelo/i.test(nome)
      ? '🧊'
      : /carv/i.test(nome)
        ? '🔥'
        : /cerv|chopp|heine|brahma|skol|amstel|corona|budw|stella|itaip|original|spaten|antarc|devassa|eisen|lat[aã]o/i.test(nome)
          ? '🍺'
          : /vinho/i.test(nome)
            ? '🍷'
            : /cacha|pinga|vodka|whisk|conhaque|montilla|gin|rum|tequila|licor/i.test(nome)
              ? '🥃'
              : /[áa]gua/i.test(nome)
                ? '💧'
                : tipo === 'outro'
                  ? '🛒'
                  : '🥤'

/** Produto que ainda não existe: cadastra na hora (ou vincula o código a um que já existe). */
function ModalProdutoNovo({
  codigo,
  nomeInicial = '',
  revenda,
  aoFechar,
  aoEscolher,
  aoNovoInsumo,
}: {
  codigo: string
  nomeInicial?: string
  revenda: Produto[]
  aoFechar: () => void
  aoEscolher: (p: Produto, novo: boolean) => void
  aoNovoInsumo: (i: Insumo) => void
}) {
  const [nome, setNome] = useState(nomeInicial)
  const [tipo, setTipo] = useState<TipoNovo>(/gelo|carv/i.test(nomeInicial) ? 'outro' : 'bebida')
  const [preco, setPreco] = useState(0)
  const [porCaixa, setPorCaixa] = useState(12)
  const [unidade, setUnidade] = useState<Unidade>('kg')
  const [cod, setCod] = useState(codigo)
  const [termo, setTermo] = useState('')
  const lista = termo.trim() ? buscarProdutos(revenda, termo).slice(0, 6) : []
  const ehInsumo = tipo === 'insumo'

  function cadastrar() {
    const n = nome.trim()
    const c = limparCodigo(cod)
    if (ehInsumo) {
      aoNovoInsumo({ id: novoId(), nome: n, unidade, precoCompra: 0, qtdCompra: 1, estoque: 0, ...(c ? { codigos: [c] } : {}) })
      return
    }
    aoEscolher(
      {
        id: novoId(),
        nome: n,
        categoria: tipo === 'espeto' ? 'espeto' : tipo === 'outro' ? 'outro' : 'bebida',
        preco,
        emoji: emojiDoNome(n, tipo),
        ficha: [],
        custoDireto: 0,
        ativo: true,
        estoque: 0,
        unidadesCaixa: porCaixa > 0 ? porCaixa : 1,
        ...(c ? { codigos: [c] } : {}),
      },
      true,
    )
  }

  return (
    <Modal titulo="➕ Produto novo" aberto aoFechar={aoFechar}>
      {codigo ? (
        <p className="text-sm text-stone-600">
          O código <b className="font-mono">{codigo}</b> não está cadastrado. Cadastre agora — ele já entra nesta compra.
        </p>
      ) : (
        <p className="text-sm text-stone-600">Cadastre o produto e ele já entra nesta compra (e fica salvo em Cadastros).</p>
      )}
      <div className="mt-3 space-y-3 rounded-xl bg-orange-50 p-3">
        <CampoTexto rotulo="Nome do produto" valor={nome} aoMudar={setNome} placeholder="Ex.: Itaipava Latão 550 ml" />
        <div>
          <div className="mb-1 text-sm font-semibold text-stone-600">O que é?</div>
          <div className="grid grid-cols-2 gap-2">
            {TIPOS_NOVO.map((t) => (
              <button
                key={t.id}
                className={`rounded-xl border-2 px-3 py-2 text-left ${tipo === t.id ? 'border-orange-500 bg-white ring-2 ring-orange-200' : 'border-stone-200 bg-white/60'}`}
                onClick={() => setTipo(t.id)}
              >
                <div className="font-bold">{t.rotulo}</div>
                <div className="text-xs text-stone-500">{t.dica}</div>
              </button>
            ))}
          </div>
        </div>
        {ehInsumo ? (
          <div>
            <div className="mb-1 text-sm font-semibold text-stone-600">Controlar em</div>
            <div className="flex gap-2">
              {(['kg', 'L', 'un', 'pct'] as Unidade[]).map((u) => (
                <button key={u} className={`flex-1 rounded-xl border-2 py-2 font-bold ${unidade === u ? 'border-orange-500 bg-white' : 'border-stone-200 bg-white/60'}`} onClick={() => setUnidade(u)}>
                  {u}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-stone-500">A quantidade e o valor pago você põe na linha da compra.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <CampoNumero rotulo="Preço de venda (un.)" prefixo="R$" valor={preco} aoMudar={setPreco} />
            <CampoNumero rotulo="Unidades por caixa/fardo" valor={porCaixa} aoMudar={setPorCaixa} />
            <p className="col-span-2 text-xs text-stone-500">Pode deixar o preço em 0 — a compra sugere pela margem.</p>
          </div>
        )}
        <CampoTexto rotulo="Código de barras (opcional)" valor={cod} aoMudar={setCod} placeholder="Bipe ou digite" />
        <button className={`${btn.primario} w-full`} disabled={!nome.trim()} onClick={cadastrar}>
          ✓ Cadastrar e incluir na compra
        </button>
      </div>
      {codigo && (
        <div className="mt-3">
          <div className="text-sm font-semibold text-stone-600">…ou é um produto que já existe? (o código fica ligado a ele)</div>
          <input className="mt-1 w-full rounded-xl border-2 border-stone-200 px-3 py-2" placeholder="Buscar…" value={termo} onChange={(e) => setTermo(e.target.value)} />
          <ul className="mt-1 divide-y divide-stone-100">
            {lista.map((p) => (
              <li key={p.id}>
                <button className="w-full py-2 text-left font-semibold hover:bg-stone-50" onClick={() => aoEscolher(p, false)}>
                  {p.emoji} {p.nome}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}

/** Tamanho da garrafa escrito no nome ("Montilla 1L" → 1000 ml; "51 965 ml" → 965). */
function mlDoNome(nome: string) {
  const m = nome.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(ml|l|lt|litros?)\b/)
  if (!m) return 1000
  const n = Number(m[1].replace(',', '.'))
  return m[2] === 'ml' ? n : Math.round(n * 1000)
}

/**
 * Garrafa comprada para vender em doses: cria a bebida como insumo em litros e o produto "Dose de …",
 * e a compra passa a lançar litros no estoque da bebida.
 */
export function ModalVenderEmDoses({
  dados,
  produto,
  garrafas,
  totalPago,
  aoFechar,
  aoConfirmar,
}: {
  dados: Dados
  produto: Produto
  garrafas: number
  totalPago: number
  aoFechar: () => void
  aoConfirmar: (insumoId: string, litros: number) => void
}) {
  const nomeBase = produto.nome.replace(/\s*\d+(?:[.,]\d+)?\s*(ml|l|lt|litros?)\b/i, '').trim() || produto.nome
  const [nome, setNome] = useState(nomeBase)
  const [mlGarrafa, setMlGarrafa] = useState(mlDoNome(produto.nome))
  const [mlDose, setMlDose] = useState(100)
  const [precoDose, setPrecoDose] = useState(0)
  const [manterGarrafa, setManterGarrafa] = useState(false)
  const litros = Math.round(((garrafas * mlGarrafa) / 1000) * 1000) / 1000
  const custoGarrafa = garrafas > 0 && totalPago > 0 ? totalPago / garrafas : produto.custoDireto
  const custoDose = mlGarrafa > 0 ? (custoGarrafa * mlDose) / mlGarrafa : 0
  const dosesPorGarrafa = mlDose > 0 ? Math.floor(mlGarrafa / mlDose) : 0
  const lucro = precoDose - custoDose
  // garrafas que já estavam no estoque como produto viram litros também
  const jaTinha = Math.max(0, produto.estoque ?? 0)
  const litrosJaTinha = Math.round(((jaTinha * mlGarrafa) / 1000) * 1000) / 1000

  function confirmar() {
    const insumoId = novoId()
    dados.setInsumos((is) => [
      ...is,
      {
        id: insumoId,
        nome: nome.trim(),
        unidade: 'L',
        precoCompra: Math.round(custoGarrafa * 100) / 100,
        qtdCompra: mlGarrafa / 1000,
        estoque: litrosJaTinha,
        grupo: 'Bebidas',
        // o código de barras da garrafa lança a bebida (em litros) nas compras
        ...(produto.codigos?.length ? { codigos: produto.codigos } : {}),
      },
    ])
    dados.setProdutos((ps) => [
      ...ps.map((p) =>
        p.id !== produto.id
          ? p
          : manterGarrafa
            ? // garrafa fechada vendida sai do mesmo estoque em litros
              { ...p, ficha: [{ insumoId, qtd: mlGarrafa }], custoDireto: 0, estoque: undefined }
            : { ...p, ativo: false, codigos: undefined, estoque: 0 },
      ),
      {
        id: novoId(),
        nome: `Dose de ${nome.trim()} ${mlDose} ml`,
        categoria: 'drink',
        preco: precoDose,
        emoji: '🥃',
        ficha: [{ insumoId, qtd: mlDose }],
        custoDireto: 0,
        ativo: true,
        tamanho: `${mlDose} ml`,
        descricao: nome.trim(),
      },
    ])
    aoConfirmar(insumoId, litros)
  }

  return (
    <Modal titulo="🥃 Vender em doses" aberto aoFechar={aoFechar}>
      <p className="text-sm text-stone-600">
        A garrafa vira <b>bebida em litros</b> no estoque, e é criado o produto <b>“Dose”</b>: cada dose vendida tira os ml da garrafa aberta.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <CampoTexto className="col-span-2" rotulo="Nome da bebida" valor={nome} aoMudar={setNome} />
        <CampoNumero rotulo="Cada garrafa tem" sufixo="ml" valor={mlGarrafa} aoMudar={(v) => setMlGarrafa(Math.max(1, Math.round(v)))} />
        <div>
          <span className="mb-1 block text-sm font-semibold text-stone-600">Tamanho da dose</span>
          <div className="flex gap-1">
            {[50, 100].map((m) => (
              <button key={m} onClick={() => setMlDose(m)} className={`rounded-full px-3 py-2 font-bold ${mlDose === m ? 'bg-violet-600 text-white' : 'bg-stone-100'}`}>
                {m} ml
              </button>
            ))}
            <CampoNumero className="w-24" sufixo="ml" valor={mlDose} aoMudar={(v) => setMlDose(Math.max(1, Math.round(v)))} />
          </div>
        </div>
        <CampoNumero className="col-span-2" rotulo="Preço da dose" prefixo="R$" grande valor={precoDose} aoMudar={setPrecoDose} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl bg-stone-100 p-2">
          <div className="text-xs text-stone-600">Doses por garrafa</div>
          <div className="text-lg font-extrabold">{dosesPorGarrafa}</div>
        </div>
        <div className="rounded-xl bg-stone-100 p-2">
          <div className="text-xs text-stone-600">Custo da dose</div>
          <div className="text-lg font-extrabold">{brl(custoDose)}</div>
        </div>
        <div className={`rounded-xl p-2 ${precoDose > 0 && lucro < 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
          <div className="text-xs text-stone-600">Lucro por dose</div>
          <div className="text-lg font-extrabold">{precoDose > 0 ? brl(lucro) : '—'}</div>
        </div>
      </div>
      {custoGarrafa <= 0 && <p className="mt-2 text-xs text-amber-700">Preencha o valor pago na compra para ver o custo da dose.</p>}
      {garrafas > 0 && (
        <p className="mt-3 text-sm">
          Nesta compra: {garrafas} garrafa{garrafas === 1 ? '' : 's'} × {mlGarrafa} ml = <b>{litros.toLocaleString('pt-BR')} L</b> no estoque.
        </p>
      )}
      {jaTinha > 0 && (
        <p className="mt-2 text-sm">
          Já no estoque: {jaTinha} garrafa{jaTinha === 1 ? '' : 's'} = <b>{litrosJaTinha.toLocaleString('pt-BR')} L</b> ({Math.floor((jaTinha * mlGarrafa) / mlDose)} doses).
        </p>
      )}
      <label className="mt-2 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" className="h-4 w-4" checked={manterGarrafa} onChange={(e) => setManterGarrafa(e.target.checked)} />
        Também vendo a garrafa fechada (mantém “{produto.nome}” na venda)
      </label>
      <button className={`${btn.primario} mt-4 w-full`} disabled={!nome.trim() || mlGarrafa <= 0 || mlDose <= 0} onClick={confirmar}>
        {garrafas > 0 ? 'Criar dose e lançar em litros' : 'Criar dose'}
      </button>
    </Modal>
  )
}
