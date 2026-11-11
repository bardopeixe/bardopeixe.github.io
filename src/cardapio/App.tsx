import qrcode from 'qrcode-generator'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { criarConta, entrar, entrarComGoogle, mensagemDeErro, prepararLogin, recuperarSenha, sair, useConta } from '../nuvem/conta'
import { brl } from '../pdv/dados'
import { CartaoProduto, Folha, ProdutoSheet, Stepper } from './componentes'
import {
  NOMES_FORMA_ONLINE,
  ROTULO_STATUS,
  codigoPix,
  enderecoTexto,
  enviarPedido,
  firebase,
  lerPerfil,
  ouvirLoja,
  ouvirMeusPedidos,
  salvarPerfil,
  statusAberto,
  tocarCampainha,
  type FormaOnline,
  type ItemOnline,
  type LojaOnline,
  type PedidoOnline,
  type ProdutoOnline,
} from '../pdv/online'

// =====================================================================================
// Sacola (fica salva no celular)
// =====================================================================================

interface ItemSacola extends ItemOnline {
  chave: string
}

const CHAVE_SACOLA = 'cardapio:sacola'

function lerLocal<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(chave)
    return v ? (JSON.parse(v) as T) : padrao
  } catch {
    return padrao
  }
}
function gravarLocal(chave: string, v: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(v))
  } catch {
    // sem armazenamento: a sacola só não sobrevive a recarregar a página
  }
}

function useSacola() {
  const [itens, setItens] = useState<ItemSacola[]>(() => lerLocal(CHAVE_SACOLA, []))
  useEffect(() => gravarLocal(CHAVE_SACOLA, itens), [itens])
  const qtd = itens.reduce((s, i) => s + i.qtd, 0)
  const subtotal = Math.round(itens.reduce((s, i) => s + i.preco * i.qtd, 0) * 100) / 100
  return {
    itens,
    qtd,
    subtotal,
    adicionar(i: Omit<ItemSacola, 'chave'>) {
      const chave = `${i.produtoId}|${(i.escolhas ?? []).map((e) => `${e.produtoId}:${e.qtd}`).join(',')}|${(i.adicionais ?? []).map((a) => a.id).sort().join(',')}|${i.obs}`
      setItens((xs) => (xs.some((x) => x.chave === chave) ? xs.map((x) => (x.chave === chave ? { ...x, qtd: x.qtd + i.qtd } : x)) : [...xs, { ...i, chave }]))
    },
    mudar(chave: string, delta: number) {
      setItens((xs) => xs.map((x) => (x.chave === chave ? { ...x, qtd: x.qtd + delta } : x)).filter((x) => x.qtd > 0))
    },
    limpar: () => setItens([]),
    /** Atualiza preços/nome com o cardápio de agora e tira o que saiu do cardápio. */
    sincronizar(loja: LojaOnline) {
      setItens((xs) => {
        const novo = xs.flatMap((x) => {
          const p = loja.produtos.find((y) => y.id === x.produtoId)
          if (!p) return []
          const acr = (x.escolhas ?? []).reduce((s, e) => s + (p.componentes?.flatMap((c) => c.opcoes).find((o) => o.id === e.produtoId)?.acrescimo ?? 0) * e.qtd, 0)
          // adicionais com o preço de agora (o que saiu do cardápio cai fora)
          const adicionais = (x.adicionais ?? []).flatMap((a) => p.adicionais?.filter((y) => y.id === a.id) ?? [])
          const somaAds = adicionais.reduce((s, a) => s + a.preco, 0)
          const { adicionais: _a, ...resto } = x
          void _a
          return [{ ...resto, nome: p.nome, emoji: p.emoji, preco: Math.round((p.preco + acr + somaAds) * 100) / 100, ...(adicionais.length ? { adicionais } : {}) }]
        })
        return JSON.stringify(novo) === JSON.stringify(xs) ? xs : novo
      })
    },
  }
}
type Sacola = ReturnType<typeof useSacola>

// =====================================================================================
// App
// =====================================================================================

type Tela = { tipo: 'menu' } | { tipo: 'checkout' } | { tipo: 'pedido'; id: string } | { tipo: 'pedidos' } | { tipo: 'conta' }

export default function App() {
  const conta = useConta()
  const usuario = conta.usuario
  const [loja, setLoja] = useState<LojaOnline | null | undefined>(undefined)
  const [erroLoja, setErroLoja] = useState('')
  const sacola = useSacola()
  const [tela, setTelaEstado] = useState<Tela>({ tipo: 'menu' })
  const [sacolaAberta, setSacolaAberta] = useState(false)
  const [login, setLogin] = useState<null | { depois?: Tela }>(null)
  const [meus, setMeus] = useState<PedidoOnline[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const statusAnt = useRef<Map<string, string> | null>(null)

  const setTela = (t: Tela) => {
    setTelaEstado(t)
    window.scrollTo({ top: 0 })
  }

  // cardápio em tempo real (preços, esgotados, aberto/fechado)
  useEffect(() => {
    let parar: (() => void) | undefined
    let vivo = true
    ouvirLoja(
      (l) => {
        setErroLoja('')
        // itens só de mesa (fora do delivery) não aparecem para o cliente
        setLoja(l ? { ...l, produtos: l.produtos.filter((p) => !p.soMesa) } : l)
      },
      (e) => {
        setErroLoja(e instanceof Error ? e.message : String(e))
        setLoja((x) => (x === undefined ? null : x))
      },
    )
      .then((f) => (vivo ? (parar = f) : f()))
      .catch((e) => {
        setErroLoja(e instanceof Error ? e.message : String(e))
        setLoja(null)
      })
    return () => {
      vivo = false
      parar?.()
    }
  }, [])

  useEffect(() => {
    if (loja) {
      sacola.sincronizar(loja)
      document.title = `${loja.nome} — Cardápio`
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loja])

  // pedidos do cliente em tempo real (avisa quando muda o status)
  useEffect(() => {
    if (!usuario) {
      setMeus([])
      statusAnt.current = null
      return
    }
    let parar: (() => void) | undefined
    let vivo = true
    ouvirMeusPedidos(
      usuario.uid,
      (ps) => {
        setMeus(ps)
        const ant = statusAnt.current
        if (ant) {
          for (const p of ps) {
            const antes = ant.get(p.id)
            if (antes && antes !== p.status) {
              setAviso(`${ROTULO_STATUS[p.status]}${p.motivo ? ` — ${p.motivo}` : ''}`)
              tocarCampainha()
              try {
                navigator.vibrate?.([200, 100, 200])
              } catch {
                // sem vibração
              }
            }
          }
        }
        statusAnt.current = new Map(ps.map((p) => [p.id, p.status]))
      },
      () => {},
    )
      .then((f) => (vivo ? (parar = f) : f()))
      .catch(() => {})
    return () => {
      vivo = false
      parar?.()
    }
  }, [usuario?.uid])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  // depois de entrar, segue para onde o cliente ia
  useEffect(() => {
    if (usuario && login) {
      const depois = login.depois
      setLogin(null)
      if (depois) setTela(depois)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario])

  const ativo = meus.find((p) => statusAberto(p.status))

  function irParaCheckout() {
    setSacolaAberta(false)
    if (!usuario) setLogin({ depois: { tipo: 'checkout' } })
    else setTela({ tipo: 'checkout' })
  }

  if (loja === undefined) return <Carregando />
  if (loja === null)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <img src="/logo.png" alt="Bar do Peixe" className="h-28 w-28" />
        <h1 className="text-2xl font-black">Cardápio indisponível</h1>
        <p className="text-stone-600">{erroLoja ? 'Não conseguimos carregar o cardápio. Confira a internet e tente de novo.' : 'O cardápio ainda não foi publicado pela loja.'}</p>
        <button className="rounded-full bg-orange-600 px-6 py-3 font-bold text-white" onClick={() => location.reload()}>
          Tentar de novo
        </button>
      </div>
    )

  return (
    <div className="min-h-screen bg-orange-50/60 text-stone-900">
      <div className="mx-auto max-w-2xl bg-white pb-28 shadow-xl shadow-orange-900/5 sm:min-h-screen">
        {tela.tipo === 'menu' && (
          <Menu
            loja={loja}
            sacola={sacola}
            ativo={ativo}
            usuario={usuario}
            aoConta={() => (usuario ? setTela({ tipo: 'conta' }) : setLogin({}))}
            aoPedidos={() => (usuario ? setTela({ tipo: 'pedidos' }) : setLogin({ depois: { tipo: 'pedidos' } }))}
            aoVerAtivo={() => ativo && setTela({ tipo: 'pedido', id: ativo.id })}
          />
        )}
        {tela.tipo === 'checkout' && usuario && (
          <Checkout
            loja={loja}
            sacola={sacola}
            usuario={usuario}
            aoVoltar={() => setTela({ tipo: 'menu' })}
            aoEnviado={(id) => {
              sacola.limpar()
              setTela({ tipo: 'pedido', id })
            }}
          />
        )}
        {tela.tipo === 'pedido' && (
          <Acompanhar loja={loja} pedido={meus.find((p) => p.id === tela.id)} aoVoltar={() => setTela({ tipo: 'menu' })} aoPedidos={() => setTela({ tipo: 'pedidos' })} />
        )}
        {tela.tipo === 'pedidos' && <MeusPedidos pedidos={meus} aoAbrir={(id) => setTela({ tipo: 'pedido', id })} aoVoltar={() => setTela({ tipo: 'menu' })} />}
        {tela.tipo === 'conta' && usuario && (
          <Conta
            usuario={usuario}
            aoVoltar={() => setTela({ tipo: 'menu' })}
            aoPedidos={() => setTela({ tipo: 'pedidos' })}
            aoSair={async () => {
              await sair()
              setTela({ tipo: 'menu' })
            }}
          />
        )}
        {tela.tipo === 'checkout' && !usuario && conta.pronto && <EntrarParaContinuar aoEntrar={() => setLogin({ depois: { tipo: 'checkout' } })} />}
      </div>

      {tela.tipo === 'menu' && sacola.qtd > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <button
            className="mx-auto flex w-full max-w-2xl items-center gap-3 rounded-2xl bg-orange-600 px-5 py-4 text-white shadow-2xl shadow-orange-900/30 active:scale-[.99]"
            onClick={() => setSacolaAberta(true)}
          >
            <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-white/20 px-2 font-black">{sacola.qtd}</span>
            <span className="flex-1 text-left text-lg font-extrabold">Ver sacola</span>
            <span className="text-lg font-black">{brl(sacola.subtotal)}</span>
          </button>
        </div>
      )}

      {sacolaAberta && <SacolaSheet loja={loja} sacola={sacola} aoFechar={() => setSacolaAberta(false)} aoContinuar={irParaCheckout} />}
      {login && <LoginSheet aoFechar={() => setLogin(null)} />}
      {aviso && (
        <div className="fixed inset-x-0 top-3 z-[70] flex justify-center px-3">
          <button className="max-w-md rounded-2xl bg-stone-900 px-5 py-3 font-bold text-white shadow-2xl" onClick={() => setAviso(null)}>
            🔔 {aviso}
          </button>
        </div>
      )}
    </div>
  )
}

function Carregando() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-200 border-t-orange-600" />
      <p className="font-semibold text-stone-500">Carregando cardápio…</p>
    </div>
  )
}

// =====================================================================================
// Cardápio
// =====================================================================================

function Menu({
  loja,
  sacola,
  ativo,
  usuario,
  aoConta,
  aoPedidos,
  aoVerAtivo,
}: {
  loja: LojaOnline
  sacola: Sacola
  ativo?: PedidoOnline
  usuario: { nome: string } | null
  aoConta: () => void
  aoPedidos: () => void
  aoVerAtivo: () => void
}) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<ProdutoOnline | null>(null)
  const [secaoAtiva, setSecaoAtiva] = useState(loja.secoes[0] ?? '')
  const chipsRef = useRef<HTMLDivElement>(null)

  const termo = busca
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
  const filtrados = termo
    ? loja.produtos.filter((p) =>
        `${p.nome} ${p.descricao} ${p.secao}`
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .includes(termo),
      )
    : loja.produtos
  const secoes = loja.secoes
    .map((s) => ({
      nome: s,
      itens: filtrados.filter((p) => p.secao === s).sort((a, b) => Number(a.esgotado) - Number(b.esgotado)),
    }))
    .filter((s) => s.itens.length)
    // seção toda esgotada (ex.: espetos num dia sem espeto) vai para o fim
    .sort((a, b) => Number(a.itens.every((p) => p.esgotado)) - Number(b.itens.every((p) => p.esgotado)))

  // destaca a seção que está na tela
  useEffect(() => {
    const obs = new IntersectionObserver(
      (es) => {
        const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (vis) setSecaoAtiva((vis.target as HTMLElement).dataset.secao ?? '')
      },
      { rootMargin: '-140px 0px -60% 0px' },
    )
    document.querySelectorAll('[data-secao]').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [secoes.length, termo])

  useEffect(() => {
    chipsRef.current?.querySelector(`[data-chip="${CSS.escape(secaoAtiva)}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [secaoAtiva])

  const qtdNaSacola = (id: string) => sacola.itens.filter((i) => i.produtoId === id).reduce((s, i) => s + i.qtd, 0)
  const menorTaxa = loja.bairros.length ? Math.min(...loja.bairros.map((b) => b.taxa)) : 0

  function adicionarRapido(p: ProdutoOnline) {
    if (p.esgotado) return
    if (p.componentes?.length || p.adicionais?.length) return setAberto(p)
    sacola.adicionar({ produtoId: p.id, nome: p.nome, emoji: p.emoji, preco: p.preco, qtd: 1, obs: '' })
    try {
      navigator.vibrate?.(15)
    } catch {
      // ignora
    }
  }

  return (
    <>
      <header className="relative overflow-hidden bg-gradient-to-br from-orange-700 via-orange-800 to-stone-950 px-5 pb-6 pt-5 text-white">
        <img src="/logo.png" alt="" className="pointer-events-none absolute -right-12 -top-6 h-52 w-52 opacity-15" />
        <div className="relative flex items-center justify-between gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-black ${loja.aberto ? 'bg-emerald-400 text-emerald-950' : 'bg-stone-900/60 text-white'}`}>
            {loja.aberto ? '● ABERTO AGORA' : '● FECHADO'}
          </span>
          <div className="flex gap-2">
            {usuario && (
              <button className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold backdrop-blur" onClick={aoPedidos}>
                🧾 Pedidos
              </button>
            )}
            <button className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold backdrop-blur" onClick={aoConta}>
              {usuario ? `👤 ${usuario.nome.split(' ')[0]}` : '👤 Entrar'}
            </button>
          </div>
        </div>
        <div className="relative mt-4 flex items-center gap-3">
          <img src="/logo.png" alt="Logo do Bar do Peixe" className="h-16 w-16 shrink-0 rounded-full bg-white shadow-lg" />
          <h1 className="font-marca text-3xl leading-tight tracking-tight">{loja.nome}</h1>
        </div>
        {loja.endereco && <p className="relative mt-1 text-sm text-orange-100">📍 {loja.endereco}</p>}
        <div className="relative mt-4 flex flex-wrap gap-2 text-xs font-bold">
          {loja.entrega && <span className="rounded-full bg-black/20 px-3 py-1.5">🛵 {loja.tempoEntrega} · entrega a partir de {menorTaxa ? brl(menorTaxa) : 'grátis'}</span>}
          {loja.retirada && <span className="rounded-full bg-black/20 px-3 py-1.5">🛍️ Retirada {loja.tempoRetirada}</span>}
          {loja.pedidoMinimo > 0 && <span className="rounded-full bg-black/20 px-3 py-1.5">Pedido mínimo {brl(loja.pedidoMinimo)}</span>}
        </div>
      </header>

      {ativo && (
        <button className="flex w-full items-center gap-3 bg-emerald-600 px-5 py-3 text-left text-white" onClick={aoVerAtivo}>
          <span className="text-2xl">{emojiStatus(ativo.status)}</span>
          <span className="flex-1">
            <span className="block text-xs font-semibold uppercase text-emerald-100">Seu pedido</span>
            <span className="font-extrabold">{ROTULO_STATUS[ativo.status]}</span>
          </span>
          <span className="font-bold">Acompanhar ›</span>
        </button>
      )}
      {!loja.aberto && (
        <div className="bg-stone-800 px-5 py-3 text-sm font-semibold text-white">😴 Estamos fechados agora. Dá para ver o cardápio, mas os pedidos abrem quando a loja abrir.</div>
      )}
      {loja.aviso && <div className="bg-amber-300 px-5 py-2.5 text-sm font-bold text-amber-950">📣 {loja.aviso}</div>}

      <div className="sticky top-0 z-20 border-b border-stone-100 bg-white/95 backdrop-blur">
        <div className="px-4 pt-3">
          <input
            type="search"
            className="w-full rounded-2xl bg-stone-100 px-4 py-3 text-base outline-none ring-orange-400 focus:ring-2"
            placeholder="🔎 Buscar no cardápio"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {!termo && (
          <div ref={chipsRef} className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
            {secoes.map((s) => (
              <button
                key={s.nome}
                data-chip={s.nome}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${secaoAtiva === s.nome ? 'bg-orange-600 text-white' : 'bg-stone-100 text-stone-700'}`}
                onClick={() => {
                  const el = document.querySelector(`[data-secao="${CSS.escape(s.nome)}"]`)
                  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 130, behavior: 'smooth' })
                }}
              >
                {s.nome}
              </button>
            ))}
          </div>
        )}
        {termo && <div className="h-3" />}
      </div>

      <main className="px-4">
        {secoes.length === 0 && <p className="py-16 text-center text-stone-500">{termo ? `Nada encontrado para “${busca}”.` : 'Cardápio vazio.'}</p>}
        {secoes.map((s) => (
          <section key={s.nome} data-secao={s.nome} className="pt-6">
            <h2 className="mb-1 text-xl font-black">{s.nome}</h2>
            <ul className="divide-y divide-stone-100">
              {s.itens.map((p) => (
                <CartaoProduto key={p.id} p={p} qtd={qtdNaSacola(p.id)} aoAbrir={() => !p.esgotado && setAberto(p)} aoMais={() => adicionarRapido(p)} />
              ))}
            </ul>
          </section>
        ))}
        {loja.produtos.some((p) => p.alcool) && (
          <p className="mt-10 rounded-xl bg-stone-100 p-4 text-center text-xs text-stone-500">
            🔞 Venda de bebidas alcoólicas proibida para menores de 18 anos. Se beber, não dirija.
          </p>
        )}
        {loja.whatsapp && (
          <a
            className="mt-4 block rounded-xl border-2 border-emerald-200 p-3 text-center text-sm font-bold text-emerald-700"
            href={`https://wa.me/55${loja.whatsapp.replace(/^55/, '')}`}
            target="_blank"
            rel="noreferrer"
          >
            💬 Falar com a loja no WhatsApp
          </a>
        )}
      </main>

      {aberto && <ProdutoSheet p={aberto} aoFechar={() => setAberto(null)} aoAdicionar={(i) => (sacola.adicionar(i), setAberto(null))} />}
    </>
  )
}

function emojiStatus(s: PedidoOnline['status']) {
  return s === 'novo' ? '⏳' : s === 'aceito' ? '🔥' : s === 'saiu' ? '🛵' : s === 'pronto' ? '🛍️' : s === 'entregue' ? '✅' : '✖️'
}

function SacolaSheet({ loja, sacola, aoFechar, aoContinuar }: { loja: LojaOnline; sacola: Sacola; aoFechar: () => void; aoContinuar: () => void }) {
  const falta = loja.pedidoMinimo - sacola.subtotal
  const pode = loja.aberto && sacola.qtd > 0 && falta <= 0
  return (
    <Folha
      titulo="Sua sacola"
      aoFechar={aoFechar}
      rodape={
        <>
          {!loja.aberto && <p className="mb-2 text-center text-sm font-bold text-red-600">A loja está fechada agora.</p>}
          {loja.aberto && falta > 0 && <p className="mb-2 text-center text-sm font-bold text-amber-700">Faltam {brl(falta)} para o pedido mínimo de {brl(loja.pedidoMinimo)}.</p>}
          <button className="flex w-full items-center justify-between rounded-2xl bg-orange-600 px-5 py-4 text-lg font-extrabold text-white disabled:bg-stone-300" disabled={!pode} onClick={aoContinuar}>
            <span>Continuar</span>
            <span>{brl(sacola.subtotal)}</span>
          </button>
        </>
      }
    >
      {sacola.itens.length === 0 ? (
        <p className="p-10 text-center text-stone-500">Sua sacola está vazia.</p>
      ) : (
        <ul className="divide-y divide-stone-100 px-5">
          {sacola.itens.map((i) => (
            <li key={i.chave} className="flex items-center gap-3 py-4">
              <span className="text-3xl">{i.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="font-bold leading-snug">{i.nome}</div>
                {i.escolhas?.length ? <div className="text-xs text-stone-500">{i.escolhas.map((e) => `${e.qtd}× ${e.nome}`).join(', ')}</div> : null}
                {i.adicionais?.length ? <div className="text-xs font-semibold text-emerald-700">{i.adicionais.map((a) => `+ ${a.nome}`).join(' ')}</div> : null}
                {i.obs && <div className="text-xs italic text-stone-500">“{i.obs}”</div>}
                <div className="mt-0.5 font-extrabold">{brl(i.preco * i.qtd)}</div>
              </div>
              <Stepper valor={i.qtd} aoMudar={(v) => sacola.mudar(i.chave, v - i.qtd)} />
            </li>
          ))}
        </ul>
      )}
      {sacola.itens.length > 0 && (
        <button className="mb-3 ml-5 text-sm font-semibold text-red-600" onClick={() => confirm('Esvaziar a sacola?') && sacola.limpar()}>
          Esvaziar sacola
        </button>
      )}
    </Folha>
  )
}

// =====================================================================================
// Login
// =====================================================================================

function LoginSheet({ aoFechar }: { aoFechar: () => void }) {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => prepararLogin(), [])

  async function tentar(f: () => Promise<void>) {
    setErro('')
    setMsg('')
    setOcupado(true)
    try {
      await f()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  const campo = 'w-full rounded-xl border-2 border-stone-200 px-4 py-3 text-base outline-none focus:border-orange-400'
  return (
    <Folha titulo={modo === 'entrar' ? 'Entrar' : 'Criar conta'} aoFechar={aoFechar}>
      <div className="space-y-3 p-5">
        <p className="text-sm text-stone-600">Entre para fazer o pedido e acompanhar a entrega em tempo real.</p>
        <button
          className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-stone-200 py-3 font-bold hover:bg-stone-50 disabled:opacity-50"
          disabled={ocupado}
          onClick={() => void tentar(entrarComGoogle)}
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continuar com Google
        </button>
        <div className="flex items-center gap-3 text-xs font-semibold text-stone-400">
          <span className="h-px flex-1 bg-stone-200" /> ou com e-mail <span className="h-px flex-1 bg-stone-200" />
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void tentar(() => (modo === 'entrar' ? entrar(email, senha) : criarConta(nome, email, senha)))
          }}
        >
          {modo === 'criar' && <input className={campo} placeholder="Seu nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} required />}
          <input className={campo} type="email" placeholder="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            className={campo}
            type="password"
            placeholder={modo === 'criar' ? 'Crie uma senha (6+ caracteres)' : 'Senha'}
            autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
          {erro && <p className="text-sm font-semibold text-red-600">{erro}</p>}
          {msg && <p className="text-sm font-semibold text-emerald-700">{msg}</p>}
          <button className="w-full rounded-xl bg-orange-600 py-3.5 text-lg font-extrabold text-white disabled:bg-stone-300" disabled={ocupado}>
            {ocupado ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
        {modo === 'entrar' && (
          <button
            className="w-full text-sm font-semibold text-stone-500"
            onClick={() => {
              if (!email.trim()) return setErro('Digite seu e-mail acima para receber o link.')
              void tentar(async () => {
                await recuperarSenha(email)
                setMsg('Enviamos um link para criar uma nova senha no seu e-mail.')
              })
            }}
          >
            Esqueci minha senha
          </button>
        )}
        <p className="pt-2 text-center text-sm">
          {modo === 'entrar' ? 'Primeira vez aqui?' : 'Já tem conta?'}{' '}
          <button className="font-extrabold text-orange-700" onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}>
            {modo === 'entrar' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>
      </div>
    </Folha>
  )
}

function EntrarParaContinuar({ aoEntrar }: { aoEntrar: () => void }) {
  return (
    <div className="p-10 text-center">
      <p className="mb-4">Entre para finalizar o pedido.</p>
      <button className="rounded-full bg-orange-600 px-6 py-3 font-bold text-white" onClick={aoEntrar}>
        Entrar
      </button>
    </div>
  )
}

// =====================================================================================
// Finalizar pedido
// =====================================================================================

function Topo({ titulo, aoVoltar }: { titulo: string; aoVoltar: () => void }) {
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-stone-100 bg-white/95 px-3 py-3 backdrop-blur">
      <button className="flex h-10 w-10 items-center justify-center rounded-full text-2xl hover:bg-stone-100" onClick={aoVoltar} aria-label="Voltar">
        ‹
      </button>
      <h1 className="text-lg font-black">{titulo}</h1>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-b-8 border-stone-50 px-5 py-5">
      <h2 className="mb-3 text-lg font-black">{titulo}</h2>
      {children}
    </section>
  )
}

const soDigitos = (t: string) => t.replace(/\D/g, '')
function mascaraTel(t: string) {
  const d = soDigitos(t).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function Checkout({
  loja,
  sacola,
  usuario,
  aoVoltar,
  aoEnviado,
}: {
  loja: LojaOnline
  sacola: Sacola
  usuario: { uid: string; nome: string; email: string }
  aoVoltar: () => void
  aoEnviado: (id: string) => void
}) {
  const [tipo, setTipo] = useState<'entrega' | 'retirada'>(loja.entrega ? 'entrega' : 'retirada')
  const [nome, setNome] = useState(usuario.nome === usuario.email ? '' : usuario.nome)
  const [telefone, setTelefone] = useState('')
  const [end, setEnd] = useState({ bairro: '', rua: '', numero: '', complemento: '', referencia: '' })
  const [forma, setForma] = useState<FormaOnline | ''>('')
  const [troco, setTroco] = useState('')
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  // dados salvos da última compra
  useEffect(() => {
    lerPerfil(usuario.uid)
      .then((p) => {
        if (!p) return
        if (p.nome) setNome((n) => n || p.nome)
        if (p.telefone) setTelefone((t) => t || mascaraTel(p.telefone))
        if (p.endereco) setEnd((e) => (e.rua ? e : { ...e, ...p.endereco!, bairro: loja.bairros.some((b) => b.nome === p.endereco!.bairro) ? p.endereco!.bairro : '' }))
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario.uid])

  const bairro = loja.bairros.find((b) => b.nome === end.bairro)
  const taxa = tipo === 'entrega' ? (bairro?.taxa ?? 0) : 0
  const total = Math.round((sacola.subtotal + taxa) * 100) / 100
  const trocoNum = parseFloat(troco.replace(/\./g, '').replace(',', '.')) || 0

  const formas: { id: FormaOnline; titulo: string; dica: string; icone: string }[] = [
    ...(loja.pix ? [{ id: 'pix' as const, titulo: 'Pix agora', dica: 'Pague pelo app do banco com QR Code ou copia e cola', icone: '💠' }] : []),
    { id: 'pix_entrega', titulo: 'Pix na entrega', dica: tipo === 'entrega' ? 'Paga ao receber' : 'Paga ao retirar', icone: '⚡' },
    { id: 'credito', titulo: 'Cartão de crédito', dica: 'Maquininha na entrega/retirada', icone: '💳' },
    { id: 'debito', titulo: 'Cartão de débito', dica: 'Maquininha na entrega/retirada', icone: '💳' },
    { id: 'dinheiro', titulo: 'Dinheiro', dica: 'Informe se precisa de troco', icone: '💵' },
  ]

  const problemas: string[] = []
  if (!loja.aberto) problemas.push('A loja está fechada agora.')
  if (!sacola.qtd) problemas.push('Sua sacola está vazia.')
  if (sacola.subtotal < loja.pedidoMinimo) problemas.push(`Pedido mínimo de ${brl(loja.pedidoMinimo)}.`)
  if (nome.trim().length < 2) problemas.push('Informe seu nome.')
  if (soDigitos(telefone).length < 10) problemas.push('Informe um celular com DDD.')
  if (tipo === 'entrega') {
    if (!bairro) problemas.push('Escolha o bairro.')
    if (!end.rua.trim() || !end.numero.trim()) problemas.push('Informe rua e número.')
  }
  if (!forma) problemas.push('Escolha a forma de pagamento.')
  if (forma === 'dinheiro' && troco.trim() && trocoNum < total) problemas.push('O troco precisa ser para um valor maior que o total.')

  async function enviar() {
    if (problemas.length || !forma) return
    setEnviando(true)
    setErro('')
    try {
      const endereco = tipo === 'entrega' ? { ...end, rua: end.rua.trim(), numero: end.numero.trim(), complemento: end.complemento.trim(), referencia: end.referencia.trim() } : undefined
      void salvarPerfil(usuario.uid, { nome: nome.trim(), telefone: soDigitos(telefone), ...(endereco ? { endereco } : {}) }).catch(() => {})
      const id = await enviarPedido({
        uid: usuario.uid,
        cliente: { nome: nome.trim(), email: usuario.email, telefone: mascaraTel(telefone) },
        tipo,
        ...(endereco ? { endereco } : {}),
        itens: sacola.itens.map((x) => {
          const i: ItemOnline = { produtoId: x.produtoId, nome: x.nome, emoji: x.emoji, qtd: x.qtd, preco: x.preco, obs: x.obs }
          return { ...i, ...(x.escolhas?.length ? { escolhas: x.escolhas } : {}), ...(x.adicionais?.length ? { adicionais: x.adicionais } : {}) }
        }),
        subtotal: sacola.subtotal,
        taxaEntrega: taxa,
        total,
        pagamento: { forma, ...(forma === 'dinheiro' && trocoNum > total ? { trocoPara: trocoNum } : {}) },
        obs: obs.trim(),
        status: 'novo',
        criadoEm: new Date().toISOString(),
      })
      aoEnviado(id)
    } catch (e) {
      setErro(mensagemDeErro(e) === 'Não deu certo agora. Tente de novo em instantes.' ? 'Não conseguimos enviar o pedido. Confira a internet e tente de novo.' : mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  const campo = 'w-full rounded-xl border-2 border-stone-200 px-4 py-3 text-base outline-none focus:border-orange-400'
  return (
    <>
      <Topo titulo="Finalizar pedido" aoVoltar={aoVoltar} />
      <Bloco titulo="Como você quer receber?">
        <div className="grid grid-cols-2 gap-3">
          {(['entrega', 'retirada'] as const).map((t) => {
            const ok = t === 'entrega' ? loja.entrega : loja.retirada
            return (
              <button
                key={t}
                disabled={!ok}
                className={`rounded-2xl border-2 p-4 text-left transition disabled:opacity-40 ${tipo === t ? 'border-orange-600 bg-orange-50 ring-2 ring-orange-200' : 'border-stone-200'}`}
                onClick={() => setTipo(t)}
              >
                <div className="text-2xl">{t === 'entrega' ? '🛵' : '🛍️'}</div>
                <div className="font-extrabold">{t === 'entrega' ? 'Entrega' : 'Retirar no local'}</div>
                <div className="text-xs text-stone-500">{!ok ? 'indisponível' : t === 'entrega' ? loja.tempoEntrega : `${loja.tempoRetirada} · grátis`}</div>
              </button>
            )
          })}
        </div>
        {tipo === 'entrega' ? (
          <div className="mt-4 space-y-3">
            <select className={`${campo} bg-white`} value={end.bairro} onChange={(e) => setEnd({ ...end, bairro: e.target.value })}>
              <option value="">Escolha o bairro…</option>
              {loja.bairros.map((b) => (
                <option key={b.nome} value={b.nome}>
                  {b.nome} — {b.taxa ? brl(b.taxa) : 'grátis'}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-[1fr_6.5rem] gap-3">
              <input className={campo} placeholder="Rua / avenida" autoComplete="address-line1" value={end.rua} onChange={(e) => setEnd({ ...end, rua: e.target.value })} />
              <input className={campo} placeholder="Nº" inputMode="numeric" value={end.numero} onChange={(e) => setEnd({ ...end, numero: e.target.value })} />
            </div>
            <input className={campo} placeholder="Complemento (apto, bloco, casa 2…)" value={end.complemento} onChange={(e) => setEnd({ ...end, complemento: e.target.value })} />
            <input className={campo} placeholder="Ponto de referência" value={end.referencia} onChange={(e) => setEnd({ ...end, referencia: e.target.value })} />
            <p className="text-xs text-stone-500">Seu bairro não está na lista? Ainda não entregamos aí — escolha “Retirar no local”.</p>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-stone-50 p-3 text-sm">
            📍 Retire em: <b>{loja.endereco || loja.nome}</b>
          </p>
        )}
      </Bloco>

      <Bloco titulo="Seus dados">
        <div className="space-y-3">
          <input className={campo} placeholder="Seu nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input className={campo} placeholder="Celular / WhatsApp com DDD" inputMode="tel" autoComplete="tel" value={telefone} onChange={(e) => setTelefone(mascaraTel(e.target.value))} />
        </div>
      </Bloco>

      <Bloco titulo="Pagamento">
        <div className="space-y-2">
          {formas.map((f) => (
            <label key={f.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 ${forma === f.id ? 'border-orange-600 bg-orange-50' : 'border-stone-200'}`}>
              <span className="text-2xl">{f.icone}</span>
              <span className="flex-1">
                <span className="block font-extrabold">{f.titulo}</span>
                <span className="text-xs text-stone-500">{f.dica}</span>
              </span>
              <input type="radio" name="forma" className="h-5 w-5 accent-orange-600" checked={forma === f.id} onChange={() => setForma(f.id)} />
            </label>
          ))}
        </div>
        {forma === 'dinheiro' && (
          <label className="mt-3 block">
            <span className="text-sm font-semibold">Troco para quanto? (deixe vazio se não precisar)</span>
            <div className="mt-1 flex items-center rounded-xl border-2 border-stone-200 px-4 focus-within:border-orange-400">
              <span className="text-stone-500">R$</span>
              <input className="w-full px-2 py-3 text-base outline-none" inputMode="decimal" placeholder="Ex.: 100" value={troco} onChange={(e) => setTroco(e.target.value)} />
            </div>
          </label>
        )}
      </Bloco>

      <Bloco titulo="Observações">
        <textarea className={campo} rows={2} maxLength={200} placeholder="Ex.: interfone quebrado, ligar quando chegar…" value={obs} onChange={(e) => setObs(e.target.value)} />
      </Bloco>

      <Bloco titulo="Resumo">
        <ul className="space-y-1.5 text-sm">
          {sacola.itens.map((i) => (
            <li key={i.chave} className="flex gap-2">
              <span className="font-bold">{i.qtd}×</span>
              <span className="flex-1">
                {i.nome}
                {i.escolhas?.length ? <span className="text-stone-500"> ({i.escolhas.map((e) => `${e.qtd} ${e.nome}`).join(', ')})</span> : null}
                {i.adicionais?.length ? <span className="text-emerald-700"> {i.adicionais.map((a) => `+ ${a.nome}`).join(' ')}</span> : null}
              </span>
              <span>{brl(i.preco * i.qtd)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-stone-100 pt-3">
          <div className="flex justify-between text-stone-600">
            <span>Subtotal</span>
            <span>{brl(sacola.subtotal)}</span>
          </div>
          <div className="flex justify-between text-stone-600">
            <span>Taxa de entrega</span>
            <span>{tipo === 'retirada' ? 'grátis' : bairro ? (taxa ? brl(taxa) : 'grátis') : '—'}</span>
          </div>
          <div className="flex justify-between text-xl font-black">
            <span>Total</span>
            <span>{brl(total)}</span>
          </div>
        </div>
      </Bloco>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-100 bg-white p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl">
          {erro && <p className="mb-2 text-center text-sm font-bold text-red-600">{erro}</p>}
          {problemas.length > 0 && <p className="mb-2 text-center text-xs font-semibold text-stone-500">{problemas[0]}</p>}
          <button
            className="flex w-full items-center justify-between rounded-2xl bg-orange-600 px-5 py-4 text-lg font-extrabold text-white shadow-lg disabled:bg-stone-300 disabled:shadow-none"
            disabled={problemas.length > 0 || enviando}
            onClick={() => void enviar()}
          >
            <span>{enviando ? 'Enviando…' : 'Fazer pedido'}</span>
            <span>{brl(total)}</span>
          </button>
        </div>
      </div>
    </>
  )
}

// =====================================================================================
// Acompanhar pedido
// =====================================================================================

const ETAPAS = (tipo: PedidoOnline['tipo']) =>
  [
    { s: 'novo', t: 'Pedido enviado' },
    { s: 'aceito', t: 'Aceito — em preparo' },
    tipo === 'entrega' ? { s: 'saiu', t: 'Saiu para entrega' } : { s: 'pronto', t: 'Pronto para retirar' },
    { s: 'entregue', t: tipo === 'entrega' ? 'Entregue' : 'Retirado' },
  ] as const

function Acompanhar({ loja, pedido, aoVoltar, aoPedidos }: { loja: LojaOnline; pedido?: PedidoOnline; aoVoltar: () => void; aoPedidos: () => void }) {
  const [cancelando, setCancelando] = useState(false)
  if (!pedido)
    return (
      <>
        <Topo titulo="Pedido" aoVoltar={aoVoltar} />
        <Carregando />
      </>
    )
  const etapas = ETAPAS(pedido.tipo)
  const idx = etapas.findIndex((e) => e.s === pedido.status)
  const falhou = pedido.status === 'recusado' || pedido.status === 'cancelado'

  async function cancelar() {
    if (!confirm('Cancelar este pedido?')) return
    setCancelando(true)
    try {
      const { db, fs } = await firebase()
      await fs.updateDoc(fs.doc(db, 'pedidos', pedido!.id), { status: 'cancelado', atualizadoEm: new Date().toISOString(), motivo: 'Cancelado pelo cliente' })
    } catch {
      alert('A loja já aceitou o pedido. Para cancelar, fale com a loja.')
    } finally {
      setCancelando(false)
    }
  }

  return (
    <>
      <Topo titulo={pedido.numero ? `Pedido nº ${pedido.numero}` : 'Seu pedido'} aoVoltar={aoVoltar} />
      <div className={`px-5 py-6 text-center ${falhou ? 'bg-red-50' : pedido.status === 'entregue' ? 'bg-emerald-50' : 'bg-orange-50'}`}>
        <div className={`text-6xl ${pedido.status === 'novo' ? 'animate-pulse' : ''}`}>{emojiStatus(pedido.status)}</div>
        <h2 className="mt-2 text-2xl font-black">{ROTULO_STATUS[pedido.status]}</h2>
        {pedido.motivo && falhou && <p className="mt-1 font-semibold text-red-700">{pedido.motivo}</p>}
        {pedido.status === 'novo' && <p className="mt-1 text-sm text-stone-600">Assim que a loja aceitar, você vê aqui (pode deixar esta tela aberta).</p>}
        {pedido.status === 'aceito' && <p className="mt-1 text-sm text-stone-600">Previsão: {pedido.tipo === 'entrega' ? loja.tempoEntrega : loja.tempoRetirada}</p>}
      </div>

      {!falhou && (
        <ol className="px-6 py-5">
          {etapas.map((e, k) => {
            const feito = k <= idx
            return (
              <li key={e.s} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-black ${feito ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-400'}`}>
                    {feito ? '✓' : k + 1}
                  </span>
                  {k < etapas.length - 1 && <span className={`h-7 w-0.5 ${k < idx ? 'bg-emerald-600' : 'bg-stone-200'}`} />}
                </div>
                <span className={`pt-0.5 font-bold ${feito ? 'text-stone-900' : 'text-stone-400'}`}>{e.t}</span>
              </li>
            )
          })}
        </ol>
      )}

      {pedido.pagamento.forma === 'pix' && loja.pix && pedido.status === 'novo' && <BlocoPix loja={loja} pedido={pedido} />}

      <Bloco titulo="Detalhes">
        <ul className="space-y-1.5 text-sm">
          {pedido.itens.map((i, k) => (
            <li key={k} className="flex gap-2">
              <span className="font-bold">{i.qtd}×</span>
              <span className="flex-1">
                {i.nome}
                {i.escolhas?.length ? <span className="text-stone-500"> ({i.escolhas.map((e) => `${e.qtd} ${e.nome}`).join(', ')})</span> : null}
                {i.adicionais?.length ? <span className="text-emerald-700"> {i.adicionais.map((a) => `+ ${a.nome}`).join(' ')}</span> : null}
                {i.obs && <span className="block text-xs italic text-stone-500">“{i.obs}”</span>}
              </span>
              <span>{brl(i.preco * i.qtd)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-sm">
          {pedido.taxaEntrega > 0 && (
            <div className="flex justify-between text-stone-600">
              <span>Entrega</span>
              <span>{brl(pedido.taxaEntrega)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-black">
            <span>Total</span>
            <span>{brl(pedido.total)}</span>
          </div>
          <div className="text-stone-600">
            {NOMES_FORMA_ONLINE[pedido.pagamento.forma]}
            {pedido.pagamento.trocoPara ? ` · troco para ${brl(pedido.pagamento.trocoPara)}` : ''}
          </div>
          <div className="pt-2 text-stone-600">{pedido.tipo === 'entrega' ? `🛵 ${enderecoTexto(pedido)}` : `🛍️ Retirada: ${loja.endereco || loja.nome}`}</div>
        </div>
      </Bloco>

      <div className="space-y-3 px-5 py-5">
        {loja.whatsapp && (
          <a
            className="block rounded-2xl border-2 border-emerald-200 py-3 text-center font-bold text-emerald-700"
            href={`https://wa.me/55${loja.whatsapp.replace(/^55/, '')}?text=${encodeURIComponent(`Olá! Sobre o meu pedido${pedido.numero ? ` nº ${pedido.numero}` : ''} (${pedido.cliente.nome})`)}`}
            target="_blank"
            rel="noreferrer"
          >
            💬 Falar com a loja
          </a>
        )}
        {pedido.status === 'novo' && (
          <button className="w-full py-2 font-semibold text-red-600" disabled={cancelando} onClick={() => void cancelar()}>
            Cancelar pedido
          </button>
        )}
        <button className="w-full py-2 font-semibold text-stone-500" onClick={aoPedidos}>
          Ver todos os meus pedidos
        </button>
      </div>
    </>
  )
}

function BlocoPix({ loja, pedido }: { loja: LojaOnline; pedido: PedidoOnline }) {
  const [copiado, setCopiado] = useState(false)
  const codigo = useMemo(() => codigoPix(loja.pix!, pedido.total, `PED${pedido.id.slice(0, 10)}`), [loja.pix, pedido.total, pedido.id])
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(codigo)
    qr.make()
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
  }, [codigo])
  return (
    <section className="mx-5 mb-5 rounded-3xl border-2 border-violet-200 bg-violet-50 p-5 text-center">
      <h3 className="text-lg font-black text-violet-900">💠 Pague com Pix: {brl(pedido.total)}</h3>
      <p className="text-sm text-violet-800">Abra o app do banco, escolha Pix e leia o QR Code ou use o copia e cola.</p>
      <div className="mx-auto mt-3 w-52 rounded-2xl bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} />
      <button
        className="mt-3 w-full rounded-2xl bg-violet-700 py-3.5 font-extrabold text-white"
        onClick={() => {
          void navigator.clipboard?.writeText(codigo)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 2500)
        }}
      >
        {copiado ? '✓ Código copiado!' : '📋 Copiar código Pix'}
      </button>
      <p className="mt-2 break-all text-[10px] text-violet-400">{codigo}</p>
      <p className="mt-2 text-xs text-violet-800">
        Recebedor: <b>{loja.pix!.nome}</b>. A loja confere o pagamento e aceita o pedido.
      </p>
    </section>
  )
}

// =====================================================================================
// Meus pedidos / conta
// =====================================================================================

function MeusPedidos({ pedidos, aoAbrir, aoVoltar }: { pedidos: PedidoOnline[]; aoAbrir: (id: string) => void; aoVoltar: () => void }) {
  return (
    <>
      <Topo titulo="Meus pedidos" aoVoltar={aoVoltar} />
      {pedidos.length === 0 && <p className="p-10 text-center text-stone-500">Você ainda não fez pedidos.</p>}
      <ul className="divide-y divide-stone-100">
        {pedidos.map((p) => (
          <li key={p.id}>
            <button className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-stone-50" onClick={() => aoAbrir(p.id)}>
              <span className="text-3xl">{emojiStatus(p.status)}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{ROTULO_STATUS[p.status]}</span>
                <span className="block truncate text-sm text-stone-500">
                  {new Date(p.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} ·{' '}
                  {p.itens.map((i) => `${i.qtd} ${i.nome}`).join(', ')}
                </span>
              </span>
              <span className="font-black">{brl(p.total)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function Conta({ usuario, aoVoltar, aoPedidos, aoSair }: { usuario: { nome: string; email: string; foto?: string }; aoVoltar: () => void; aoPedidos: () => void; aoSair: () => Promise<void> }) {
  return (
    <>
      <Topo titulo="Minha conta" aoVoltar={aoVoltar} />
      <div className="flex items-center gap-4 p-5">
        {usuario.foto ? (
          <img src={usuario.foto} alt="" className="h-16 w-16 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-2xl font-black text-orange-700">{usuario.nome.slice(0, 1).toUpperCase()}</span>
        )}
        <div>
          <div className="text-xl font-black">{usuario.nome}</div>
          <div className="text-stone-500">{usuario.email}</div>
        </div>
      </div>
      <div className="space-y-3 px-5">
        <button className="w-full rounded-2xl border-2 border-stone-200 py-3.5 font-bold" onClick={aoPedidos}>
          🧾 Meus pedidos
        </button>
        <button className="w-full rounded-2xl border-2 border-red-100 py-3.5 font-bold text-red-600" onClick={() => void aoSair()}>
          Sair da conta
        </button>
      </div>
    </>
  )
}
