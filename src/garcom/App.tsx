import { useEffect, useMemo, useState } from 'react'
import { CartaoProduto, Folha, ProdutoSheet, Stepper } from '../cardapio/componentes'
import {
  contasAtivas,
  criarConta,
  entrar,
  entrarComGoogle,
  enviarVerificacao,
  mensagemDeErro,
  recarregarUsuario,
  recuperarSenha,
  sair,
  useConta,
} from '../nuvem/conta'
import { brl } from '../pdv/dados'
import { gravarLocal, lerLocal } from '../hooks/armazenamento'
import {
  enviarPedidoMesa,
  lerEquipe,
  ouvirLoja,
  ouvirMeusPedidosMesa,
  type EquipeGarcons,
  type ItemOnline,
  type LojaOnline,
  type PedidoMesa,
  type ProdutoOnline,
} from '../pdv/online'

/**
 * App do garçom (bardopeixe.github.io/garcom/): escolhe a mesa, monta o pedido (com adicionais e observações)
 * e manda para o PDV, que lança na comanda da mesa e imprime a comanda da cozinha.
 * O garçom só lança pedidos: receber e fechar a conta é no caixa.
 */

interface ItemCarrinho extends ItemOnline {
  chave: string
}

const CHAVE = 'garcom:carrinho'
const MESAS = Array.from({ length: 30 }, (_, i) => String(i + 1))


const chaveItem = (i: ItemOnline) =>
  `${i.produtoId}|${(i.escolhas ?? []).map((e) => `${e.produtoId}:${e.qtd}`).join(',')}|${(i.adicionais ?? []).map((a) => a.id).sort().join(',')}|${i.obs}`

export default function App() {
  const conta = useConta()
  const usuario = conta.usuario
  const [equipe, setEquipe] = useState<EquipeGarcons | null | 'negado' | undefined>(undefined)

  // depois de entrar (e com e-mail confirmado), confere se está liberado como garçom
  const verificado = !!usuario?.verificado
  useEffect(() => {
    if (!usuario || !verificado) {
      setEquipe(undefined)
      return
    }
    let vivo = true
    lerEquipe()
      .then((e) => vivo && setEquipe(e && e.emails.includes(usuario.email.toLowerCase()) ? e : 'negado'))
      .catch(() => vivo && setEquipe('negado'))
    return () => {
      vivo = false
    }
  }, [usuario, verificado])

  if (!contasAtivas)
    return (
      <Centro>
        <Logo />
        <h1 className="text-2xl font-black">App do garçom</h1>
        <p className="text-stone-600">O Firebase do restaurante ainda não foi ligado. Avise o responsável pelo sistema.</p>
      </Centro>
    )
  if (!conta.pronto) return <Carregando texto="Carregando…" />
  if (!usuario) return <Login />
  if (!verificado) return <ConfirmarEmail email={usuario.email} />
  if (equipe === undefined) return <Carregando texto="Conferindo acesso…" />
  if (equipe === null || equipe === 'negado')
    return (
      <Centro>
        <Logo />
        <h1 className="text-2xl font-black">Acesso ainda não liberado</h1>
        <p className="text-stone-600">
          O e-mail <b>{usuario.email}</b> não está na lista de garçons. Peça ao caixa para cadastrar em <b>PDV → Config. → Garçons no celular</b> e toque em
          “Tentar de novo”.
        </p>
        <button className="w-full rounded-2xl bg-orange-700 py-3.5 font-extrabold text-white" onClick={() => location.reload()}>
          Tentar de novo
        </button>
        <button className="text-sm font-semibold text-stone-500 underline" onClick={() => void sair()}>
          Sair desta conta
        </button>
      </Centro>
    )
  const nome = equipe.nomes[usuario.email.toLowerCase()] || usuario.nome
  return <Garcom uid={usuario.uid} nome={nome} email={usuario.email} />
}

// =====================================================================================
// Tela principal
// =====================================================================================

function Garcom({ uid, nome, email }: { uid: string; nome: string; email: string }) {
  const [loja, setLoja] = useState<LojaOnline | null | undefined>(undefined)
  const [mesa, setMesaEstado] = useState<string>(() => lerLocal('garcom:mesa', ''))
  const [escolhendoMesa, setEscolhendoMesa] = useState(() => !lerLocal('garcom:mesa', ''))
  const [itens, setItens] = useState<ItemCarrinho[]>(() => lerLocal(CHAVE, []))
  const [aberto, setAberto] = useState<ProdutoOnline | null>(null)
  const [revisando, setRevisando] = useState(false)
  const [vendoPedidos, setVendoPedidos] = useState(false)
  const [busca, setBusca] = useState('')
  const [secao, setSecao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [meus, setMeus] = useState<PedidoMesa[]>([])

  const setMesa = (m: string) => {
    setMesaEstado(m)
    gravarLocal('garcom:mesa', m)
  }
  useEffect(() => gravarLocal(CHAVE, itens), [itens])

  useEffect(() => {
    let parar: (() => void) | undefined
    let vivo = true
    ouvirLoja(
      (l) => setLoja(l),
      () => setLoja((x) => (x === undefined ? null : x)),
    )
      .then((f) => (vivo ? (parar = f) : f()))
      .catch(() => setLoja(null))
    return () => {
      vivo = false
      parar?.()
    }
  }, [])

  useEffect(() => {
    let parar: (() => void) | undefined
    let vivo = true
    ouvirMeusPedidosMesa(uid, setMeus, () => {})
      .then((f) => (vivo ? (parar = f) : f()))
      .catch(() => {})
    return () => {
      vivo = false
      parar?.()
    }
  }, [uid])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 5000)
    return () => clearTimeout(t)
  }, [aviso])

  const termo = busca
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
  const produtos = useMemo(() => loja?.produtos ?? [], [loja])
  const visiveis = termo
    ? produtos.filter((p) =>
        `${p.nome} ${p.descricao}`
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .includes(termo),
      )
    : secao
      ? produtos.filter((p) => p.secao === secao)
      : produtos
  const secoes = loja?.secoes ?? []
  const qtd = itens.reduce((s, i) => s + i.qtd, 0)
  const total = Math.round(itens.reduce((s, i) => s + i.preco * i.qtd, 0) * 100) / 100
  const noCarrinho = (id: string) => itens.filter((i) => i.produtoId === id).reduce((s, i) => s + i.qtd, 0)
  const aguardando = meus.filter((p) => p.status === 'novo').length

  function adicionar(i: ItemOnline) {
    const chave = chaveItem(i)
    setItens((xs) => (xs.some((x) => x.chave === chave) ? xs.map((x) => (x.chave === chave ? { ...x, qtd: x.qtd + i.qtd } : x)) : [...xs, { ...i, chave }]))
    try {
      navigator.vibrate?.(15)
    } catch {
      // ignora
    }
  }

  function mais(p: ProdutoOnline) {
    if (p.esgotado) return
    if (p.componentes?.length || p.adicionais?.length) return setAberto(p)
    adicionar({ produtoId: p.id, nome: p.nome, emoji: p.emoji, preco: p.preco, qtd: 1, obs: '' })
  }

  async function enviar() {
    if (!mesa || !itens.length) return
    setEnviando(true)
    try {
      await enviarPedidoMesa({
        uid,
        garcom: { nome, email },
        mesa,
        itens: itens.map(({ chave: _c, ...i }) => {
          void _c
          return i
        }),
        total,
        status: 'novo',
        criadoEm: new Date().toISOString(),
      })
      setItens([])
      setRevisando(false)
      setAviso(`✅ Pedido da mesa ${mesa} enviado para a cozinha`)
    } catch (e) {
      alert((e as { code?: string })?.code === 'permission-denied' ? 'Sem permissão para lançar. Peça ao caixa para conferir seu cadastro de garçom.' : mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  if (loja === undefined) return <Carregando texto="Carregando cardápio…" />
  if (loja === null)
    return (
      <Centro>
        <Logo />
        <h1 className="text-2xl font-black">Cardápio indisponível</h1>
        <p className="text-stone-600">O PDV ainda não publicou o cardápio, ou o celular está sem internet.</p>
        <button className="w-full rounded-2xl bg-orange-700 py-3.5 font-extrabold text-white" onClick={() => location.reload()}>
          Tentar de novo
        </button>
      </Centro>
    )

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <div className="mx-auto max-w-2xl bg-white pb-28 shadow-xl sm:min-h-screen">
        <header className="sticky top-0 z-20 overflow-hidden bg-orange-600 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] text-white shadow">
          <div className="faixas pointer-events-none absolute inset-y-0 -right-10 w-40" />
          <div className="relative flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-11 w-11 shrink-0 rounded-full border-2 border-black bg-white shadow-lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">Garçom · {nome}</div>
              <button className="font-marca text-3xl leading-none" onClick={() => setEscolhendoMesa(true)}>
                {mesa ? `Mesa ${mesa}` : 'Escolher mesa'} <span className="font-sans text-sm font-bold">trocar ▾</span>
              </button>
            </div>
            <button className="relative rounded-full bg-black/70 px-3.5 py-1.5 text-sm font-bold uppercase backdrop-blur hover:bg-black" onClick={() => setVendoPedidos(true)}>
              Enviados
              {aguardando > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1.5 text-xs font-black text-stone-900">{aguardando}</span>}
            </button>
          </div>
          <input
            className="relative mt-3 w-full rounded-2xl bg-white px-4 py-2.5 text-stone-900 shadow-cartao outline-none"
            placeholder="Buscar prato ou bebida…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {!termo && (
            <div className="relative -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
              {['', ...secoes].map((s) => (
                <button
                  key={s || 'todos'}
                  className={`shrink-0 rounded-full px-4 py-1.5 font-marca text-xl leading-none ${secao === s ? 'bg-black text-white shadow-md' : 'bg-white/90 text-black hover:bg-white'}`}
                  onClick={() => setSecao(s)}
                >
                  {s || 'Tudo'}
                </button>
              ))}
            </div>
          )}
        </header>

        <ul className="entrar divide-y divide-stone-100 px-4">
          {visiveis.length === 0 && <li className="py-10 text-center text-stone-500">Nada encontrado.</li>}
          {visiveis.map((p) => (
            <CartaoProduto key={p.id} p={p} qtd={noCarrinho(p.id)} aoAbrir={() => setAberto(p)} aoMais={() => mais(p)} />
          ))}
        </ul>
      </div>

      {qtd > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <button
            className="mx-auto flex w-full max-w-2xl animate-subir items-center gap-3 rounded-2xl bg-black/90 px-5 py-3.5 font-marca text-2xl leading-none text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md"
            onClick={() => (mesa ? setRevisando(true) : setEscolhendoMesa(true))}
          >
            <span className="flex-1 text-left">{mesa ? `Revisar · Mesa ${mesa} · ${qtd}` : 'Escolher a mesa'}</span>
            <span key={qtd} className="animate-pulo rounded-xl bg-orange-600 px-3 py-1.5 shadow-flutuante">{brl(total)}</span>
          </button>
        </div>
      )}

      {aberto && <ProdutoSheet p={aberto} obsRapidas={loja.obsRapidas} aoFechar={() => setAberto(null)} aoAdicionar={(i) => (adicionar(i), setAberto(null))} />}

      {escolhendoMesa && (
        <EscolherMesa
          atual={mesa}
          aoFechar={mesa ? () => setEscolhendoMesa(false) : undefined}
          aoEscolher={(m) => {
            setMesa(m)
            setEscolhendoMesa(false)
          }}
        />
      )}

      {revisando && (
        <Folha
          titulo={`Pedido da mesa ${mesa}`}
          aoFechar={() => setRevisando(false)}
          rodape={
            <button
              className="flex w-full items-center justify-between rounded-2xl bg-emerald-600 px-5 py-4 text-lg font-extrabold text-white disabled:bg-stone-300"
              disabled={enviando || !itens.length}
              onClick={() => void enviar()}
            >
              <span>{enviando ? 'Enviando…' : '🍳 Enviar para a cozinha'}</span>
              <span>{brl(total)}</span>
            </button>
          }
        >
          <ul className="divide-y divide-stone-100 px-5">
            {itens.map((i) => (
              <li key={i.chave} className="flex items-center gap-3 py-3">
                <span className="text-2xl">{i.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold leading-snug">{i.nome}</div>
                  {i.escolhas?.length ? <div className="text-xs text-stone-500">{i.escolhas.map((e) => `${e.qtd}× ${e.nome}`).join(', ')}</div> : null}
                  {i.adicionais?.length ? <div className="text-xs font-semibold text-emerald-700">{i.adicionais.map((a) => `+ ${a.nome}`).join(' ')}</div> : null}
                  {i.obs && <div className="text-xs italic text-orange-800">“{i.obs}”</div>}
                  <div className="text-sm font-semibold text-stone-600">{brl(i.preco * i.qtd)}</div>
                </div>
                <Stepper
                  valor={i.qtd}
                  aoMudar={(v) => setItens((xs) => xs.map((x) => (x.chave === i.chave ? { ...x, qtd: v } : x)).filter((x) => x.qtd > 0))}
                />
              </li>
            ))}
          </ul>
          <p className="px-5 pb-4 text-xs text-stone-500">O pedido entra na comanda da mesa {mesa} e a cozinha recebe a comanda impressa. A conta é fechada no caixa.</p>
        </Folha>
      )}

      {vendoPedidos && (
        <Folha titulo="Pedidos enviados" aoFechar={() => setVendoPedidos(false)}>
          <ul className="divide-y divide-stone-100 px-5">
            {meus.length === 0 && <li className="py-8 text-center text-stone-500">Nenhum pedido enviado ainda.</li>}
            {meus.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black">Mesa {p.mesa}</span>
                  <span className="text-sm text-stone-500">{new Date(p.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="text-sm text-stone-600">{p.itens.map((i) => `${i.qtd}× ${i.nome}`).join(', ')}</div>
                <div
                  className={`mt-1 text-sm font-bold ${p.status === 'lancado' ? 'text-emerald-700' : p.status === 'recusado' ? 'text-red-600' : 'text-amber-700'}`}
                >
                  {p.status === 'lancado'
                    ? `✅ Lançado na comanda ${p.comanda ?? ''} — cozinha avisada`
                    : p.status === 'recusado'
                      ? `✖ Não lançado${p.motivo ? `: ${p.motivo}` : ''}`
                      : '⏳ Aguardando o PDV do caixa (ele precisa estar aberto)'}
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-stone-100 p-5 text-center">
            <div className="text-sm text-stone-500">{email}</div>
            <button className="mt-1 text-sm font-semibold text-red-600 underline" onClick={() => void sair()}>
              Sair
            </button>
          </div>
        </Folha>
      )}

      {aviso && (
        <div className="fixed inset-x-0 top-3 z-[70] flex justify-center px-3">
          <button className="max-w-md rounded-2xl bg-stone-900 px-5 py-3 font-bold text-white shadow-2xl" onClick={() => setAviso(null)}>
            {aviso}
          </button>
        </div>
      )}
    </div>
  )
}

function EscolherMesa({ atual, aoEscolher, aoFechar }: { atual: string; aoEscolher: (m: string) => void; aoFechar?: () => void }) {
  const [outra, setOutra] = useState(MESAS.includes(atual) ? '' : atual)
  return (
    <Folha titulo="Qual mesa?" aoFechar={aoFechar ?? (() => {})}>
      <div className="grid grid-cols-5 gap-2 p-5">
        {MESAS.map((m) => (
          <button
            key={m}
            className={`rounded-xl py-3.5 text-xl font-black ${atual === m ? 'bg-orange-700 text-white' : 'bg-stone-100 text-stone-800 active:bg-stone-200'}`}
            onClick={() => aoEscolher(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="flex gap-2 px-5 pb-5">
        <input
          className="min-w-0 flex-1 rounded-xl border-2 border-stone-200 px-3 py-2.5 outline-none focus:border-orange-500"
          placeholder="Outra (ex.: Varanda, Balcão 2)"
          value={outra}
          onChange={(e) => setOutra(e.target.value)}
        />
        <button className="rounded-xl bg-orange-700 px-4 font-bold text-white disabled:bg-stone-300" disabled={!outra.trim()} onClick={() => aoEscolher(outra.trim())}>
          OK
        </button>
      </div>
    </Folha>
  )
}

// =====================================================================================
// Login
// =====================================================================================

function Login() {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function tentar(f: () => Promise<unknown>) {
    setErro('')
    setOcupado(true)
    try {
      await f()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Centro>
      <Logo />
      <div>
        <h1 className="text-2xl font-black">App do garçom</h1>
        <p className="text-sm text-stone-600">Entre com o e-mail que o caixa cadastrou para você.</p>
      </div>
      <button
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-stone-200 bg-white py-3.5 font-extrabold"
        disabled={ocupado}
        onClick={() => void tentar(entrarComGoogle)}
      >
        <span className="text-lg font-black text-blue-600">G</span> Entrar com Google
      </button>
      <div className="flex w-full items-center gap-3 text-xs font-semibold text-stone-400">
        <span className="h-px flex-1 bg-stone-200" /> ou com e-mail <span className="h-px flex-1 bg-stone-200" />
      </div>
      <form
        className="w-full space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          void tentar(() => (modo === 'criar' ? criarConta(nome, email, senha).then(() => enviarVerificacao()) : entrar(email, senha)))
        }}
      >
        {modo === 'criar' && (
          <input className="w-full rounded-xl border-2 border-stone-200 px-4 py-3 outline-none focus:border-orange-500" placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        )}
        <input
          className="w-full rounded-xl border-2 border-stone-200 px-4 py-3 outline-none focus:border-orange-500"
          type="email"
          autoComplete="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded-xl border-2 border-stone-200 px-4 py-3 outline-none focus:border-orange-500"
          type="password"
          autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
          placeholder={modo === 'criar' ? 'Crie uma senha (mín. 6)' : 'Senha'}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <button className="w-full rounded-2xl bg-orange-700 py-3.5 font-extrabold text-white disabled:bg-stone-300" disabled={ocupado || !email || !senha || (modo === 'criar' && !nome.trim())}>
          {modo === 'criar' ? 'Criar conta' : 'Entrar'}
        </button>
      </form>
      {erro && <p className="font-semibold text-red-600">{erro}</p>}
      <div className="flex w-full justify-between text-sm">
        <button className="font-semibold text-orange-800 underline" onClick={() => setModo(modo === 'criar' ? 'entrar' : 'criar')}>
          {modo === 'criar' ? 'Já tenho conta' : 'Primeira vez? Criar conta'}
        </button>
        {modo === 'entrar' && (
          <button
            className="text-stone-500 underline"
            onClick={() => (email ? void tentar(() => recuperarSenha(email)).then(() => alert('Se o e-mail tiver conta, chegou um link para criar nova senha.')) : setErro('Digite o e-mail primeiro.'))}
          >
            Esqueci a senha
          </button>
        )}
      </div>
    </Centro>
  )
}

function ConfirmarEmail({ email }: { email: string }) {
  const [msg, setMsg] = useState('')
  return (
    <Centro>
      <Logo />
      <h1 className="text-2xl font-black">Confirme seu e-mail</h1>
      <p className="text-stone-600">
        Mandamos um link para <b>{email}</b>. Abra o e-mail (veja também o spam), toque no link e volte aqui.
      </p>
      <button
        className="w-full rounded-2xl bg-orange-700 py-3.5 font-extrabold text-white"
        onClick={() => void recarregarUsuario().then((ok) => !ok && setMsg('Ainda não confirmado. Toque no link do e-mail e tente de novo.'))}
      >
        Já confirmei
      </button>
      <button className="text-sm font-semibold text-orange-800 underline" onClick={() => void enviarVerificacao().then(() => setMsg('Link enviado de novo.'), (e) => setMsg(mensagemDeErro(e)))}>
        Mandar o link de novo
      </button>
      {msg && <p className="text-sm font-semibold text-stone-700">{msg}</p>}
      <button className="text-sm text-stone-500 underline" onClick={() => void sair()}>
        Sair
      </button>
    </Centro>
  )
}

// =====================================================================================
// Peças
// =====================================================================================

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 p-5">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl bg-white p-6 text-center shadow-xl">{children}</div>
    </div>
  )
}

function Logo() {
  return <img src="/logo.png" alt="Bar do Peixe" className="h-24 w-24" />
}

function Carregando({ texto }: { texto: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-stone-100">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-200 border-t-orange-700" />
      <p className="font-semibold text-stone-500">{texto}</p>
    </div>
  )
}
