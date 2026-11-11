import qrcode from 'qrcode-generator'
import { useEffect, useMemo, useRef, useState } from 'react'
import { contasAtivas, entrar, entrarComGoogle, mensagemDeErro, recuperarSenha, sair, useConta } from '../nuvem/conta'
import { FIREBASE } from '../nuvem/firebaseConfig'
import {
  arred,
  brl,
  comEmbalagens,
  consumoDosItens,
  consumoInsumosDosItens,
  custoCompleto,
  embalagensSugeridas,
  hora,
  montarEmbalagens,
  moverEstoqueInsumos,
  moverEstoqueProdutos,
  novoId,
  precoComEscolhas,
  custoAdicionais,
  paraItem,
  somaAdicionais,
  taxaDaForma,
  type Dados,
} from './dados'
import { imprimirMotoboy, imprimirPedido } from './impressao'
import {
  CONFIG_ONLINE_INICIAL,
  NOMES_FORMA_ONLINE,
  ROTULO_STATUS,
  URL_CARDAPIO,
  enderecoTexto,
  liberarSom,
  montarLojaOnline,
  mudarStatus,
  ouvirPedidosDaLoja,
  publicarLoja,
  regrasFirestore,
  tocarCampainha,
  type PedidoOnline,
  type StatusOnline,
} from './online'
import type { ConfigOnline, FormaPagamento, ItemPedido, Pedido, TipoChavePix } from './tipos'
import { CampoNumero, CampoTexto, Modal, btn } from './ui'

// =====================================================================================
// Hook global: escuta os pedidos, toca o alarme e publica o cardápio sozinho
// =====================================================================================

export type Online = ReturnType<typeof useOnline>

const CHAVE_PUBLICADO = 'espeto:online-publicado'

export { textoErroNuvem }

export function useOnline(dados: Dados) {
  const { usuario, pronto } = useConta()
  const cfg: ConfigOnline = { ...CONFIG_ONLINE_INICIAL, ...(dados.config.online ?? {}) }
  // conectado com a conta do dono: publica o cardápio (também usado pelo app do garçom) e escuta os pedidos
  const ativo = !!usuario
  const [pedidos, setPedidos] = useState<PedidoOnline[]>([])
  const [erro, setErro] = useState('')
  const [publicacao, setPublicacao] = useState<{ tipo: 'ok' | 'enviando' | 'erro'; msg?: string; em?: string } | null>(null)
  const [silencioAte, setSilencioAte] = useState(0)
  const vistos = useRef<Set<string> | null>(null)

  // pedidos em tempo real
  useEffect(() => {
    if (!ativo) {
      setPedidos([])
      return
    }
    let parar: (() => void) | undefined
    let vivo = true
    ouvirPedidosDaLoja(
      (ps) => {
        setErro('')
        setPedidos(ps)
        // notificação do sistema para cada pedido novo que ainda não tinha visto
        const novos = ps.filter((p) => p.status === 'novo')
        if (vistos.current) {
          for (const p of novos) {
            if (vistos.current.has(p.id)) continue
            try {
              if ('Notification' in window && Notification.permission === 'granted')
                new Notification('🔔 Novo pedido no cardápio digital', { body: `${p.cliente.nome} · ${brl(p.total)} · ${p.tipo === 'entrega' ? 'Entrega' : 'Retirada'}`, tag: p.id })
            } catch {
              // sem notificação do sistema
            }
          }
        }
        vistos.current = new Set(ps.map((p) => p.id))
      },
      (e) => setErro(textoErroNuvem(e)),
    )
      .then((f) => (vivo ? (parar = f) : f()))
      .catch((e) => setErro(textoErroNuvem(e)))
    return () => {
      vivo = false
      parar?.()
    }
  }, [ativo, usuario?.uid])

  const novos = pedidos.filter((p) => p.status === 'novo')

  // alarme: toca até aceitar ou recusar
  useEffect(() => {
    if (!novos.length || !cfg.som || Date.now() < silencioAte) return
    tocarCampainha()
    const t = setInterval(() => Date.now() >= silencioAte && tocarCampainha(), 3500)
    return () => clearInterval(t)
  }, [novos.length, cfg.som, silencioAte])

  // fim do "silenciar": volta a tocar
  useEffect(() => {
    if (!silencioAte) return
    const t = setTimeout(() => setSilencioAte(0), Math.max(0, silencioAte - Date.now()))
    return () => clearTimeout(t)
  }, [silencioAte])

  // título da aba pisca enquanto tem pedido esperando
  useEffect(() => {
    if (!novos.length) return
    const original = document.title
    let alterna = false
    const t = setInterval(() => {
      alterna = !alterna
      document.title = alterna ? `🔔 (${novos.length}) NOVO PEDIDO!` : original
    }, 1000)
    return () => {
      clearInterval(t)
      document.title = original
    }
  }, [novos.length])

  // o navegador só deixa tocar som depois de um clique na página
  useEffect(() => {
    const f = () => liberarSom()
    window.addEventListener('pointerdown', f)
    window.addEventListener('keydown', f)
    return () => {
      window.removeEventListener('pointerdown', f)
      window.removeEventListener('keydown', f)
    }
  }, [])

  // publica o cardápio (preços, esgotados, aberto/fechado) sempre que algo muda
  const loja = useMemo(
    () =>
      ativo
        ? montarLojaOnline({
            produtos: dados.produtos,
            nomeLoja: dados.config.nomeLoja,
            endereco: dados.config.endereco,
            telefone: dados.config.telefone,
            espetoHoje: dados.config.espetoHoje,
            online: cfg,
            adicionais: dados.config.adicionais,
            obsRapidas: dados.config.obsRapidas,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados.produtos, dados.config, ativo],
  )
  const assinatura = loja ? JSON.stringify({ ...loja, atualizadoEm: '' }) : ''
  useEffect(() => {
    if (!ativo || !loja) return
    let anterior = ''
    try {
      anterior = localStorage.getItem(CHAVE_PUBLICADO) ?? ''
    } catch {
      // ignora
    }
    const marca = `${usuario!.uid}:${hashTexto(assinatura)}`
    if (anterior === marca) return
    const t = setTimeout(async () => {
      setPublicacao({ tipo: 'enviando' })
      try {
        await publicarLoja(loja)
        try {
          localStorage.setItem(CHAVE_PUBLICADO, marca)
        } catch {
          // ignora
        }
        setPublicacao({ tipo: 'ok', em: new Date().toISOString() })
      } catch (e) {
        setPublicacao({ tipo: 'erro', msg: textoErroNuvem(e) })
      }
    }, 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, assinatura])

  function republicar() {
    try {
      localStorage.removeItem(CHAVE_PUBLICADO)
    } catch {
      // ignora
    }
    if (!loja) return
    setPublicacao({ tipo: 'enviando' })
    publicarLoja(loja)
      .then(() => setPublicacao({ tipo: 'ok', em: new Date().toISOString() }))
      .catch((e) => setPublicacao({ tipo: 'erro', msg: textoErroNuvem(e) }))
  }

  return {
    usuario,
    pronto,
    ativo,
    cfg,
    pedidos,
    novos,
    erro,
    publicacao,
    republicar,
    silenciado: Date.now() < silencioAte,
    silenciar: (min: number) => setSilencioAte(Date.now() + min * 60_000),
  }
}

function hashTexto(t: string) {
  let h = 0
  for (let i = 0; i < t.length; i++) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0
  return `${t.length}-${h}`
}

function textoErroNuvem(e: unknown) {
  const c = (e as { code?: string })?.code ?? ''
  if (c === 'permission-denied' || c === 'firestore/permission-denied')
    return 'Sem permissão no Firebase. Cole as regras de segurança (passo 2 em “Configurar”) e confira se entrou com a conta do dono.'
  if (c === 'unavailable') return 'Sem internet agora. Tentando de novo…'
  return e instanceof Error ? e.message : String(e)
}

// =====================================================================================
// Pedido online → venda do PDV
// =====================================================================================

const FORMA_PDV: Record<PedidoOnline['pagamento']['forma'], FormaPagamento> = {
  pix: 'pix',
  pix_entrega: 'pix',
  credito: 'credito',
  debito: 'debito',
  dinheiro: 'dinheiro',
}

/** Monta os itens com os preços e custos do PDV (o que vale é o cadastro, não o que veio do celular). */
export function itensDoOnline(po: Pick<PedidoOnline, 'itens'>, dados: Dados): ItemPedido[] {
  const { produtos, insumos } = dados
  return po.itens.map((io) => {
    const p = produtos.find((x) => x.id === io.produtoId)
    const escolhas = io.escolhas?.map((e) => {
      const x = produtos.find((y) => y.id === e.produtoId)
      return { produtoId: e.produtoId, nome: x?.nome ?? e.nome, categoria: x?.categoria ?? 'outro', qtd: e.qtd }
    })
    // fardo/caixa (opção única): as unidades saem do estoque como no balcão
    const auto =
      !escolhas && p?.componentes?.length && p.componentes.every((c) => c.opcoes.length === 1)
        ? p.componentes.map((c) => {
            const x = produtos.find((y) => y.id === c.opcoes[0])
            return { produtoId: c.opcoes[0], nome: x?.nome ?? '?', categoria: x?.categoria ?? 'outro', qtd: c.qtd }
          })
        : undefined
    const esc = escolhas ?? auto
    if (!p) return { produtoId: io.produtoId, nome: io.nome, categoria: 'outro', emoji: io.emoji, preco: io.preco, custo: 0, qtd: io.qtd, obs: io.obs }
    // adicionais: valem o preço e o custo cadastrados no PDV
    const adicionais = (io.adicionais ?? [])
      .map((a) => dados.config.adicionais?.find((x) => x.id === a.id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map(paraItem)
    return {
      produtoId: p.id,
      nome: p.nome,
      categoria: p.categoria,
      emoji: p.emoji,
      preco: arred(precoComEscolhas(p, esc, p.preco) + somaAdicionais(adicionais)),
      custo: arred(custoCompleto(p, insumos, produtos, esc) + custoAdicionais(adicionais)),
      qtd: io.qtd,
      obs: io.obs,
      ...(esc?.length ? { escolhas: esc } : {}),
      ...(adicionais.length ? { adicionais } : {}),
    }
  })
}

export function totalNoPdv(po: PedidoOnline, dados: Dados) {
  const itens = itensDoOnline(po, dados)
  return arred(itens.reduce((s, i) => s + i.preco * i.qtd, 0) + po.taxaEntrega)
}

/** Lança o pedido online como venda do caixa aberto (baixa estoque, entra no faturamento). */
function lancarNoPdv(po: PedidoOnline, dados: Dados): Pedido | null {
  const { caixaAberto, config, insumos, produtos } = dados
  if (!caixaAberto) return null
  const itens = itensDoOnline(po, dados)
  const subtotal = arred(itens.reduce((s, i) => s + i.preco * i.qtd, 0))
  const total = arred(subtotal + po.taxaEntrega)
  const forma = FORMA_PDV[po.pagamento.forma]
  const recebido = forma === 'dinheiro' && po.pagamento.trocoPara && po.pagamento.trocoPara > total ? po.pagamento.trocoPara : 0
  const embalagens = montarEmbalagens(embalagensSugeridas(itens, config, insumos), insumos)
  const numero = dados.pedidos.filter((p) => p.caixaId === caixaAberto.id).reduce((m, p) => Math.max(m, p.numero), 0) + 1
  const pedido: Pedido = {
    id: novoId(),
    numero,
    caixaId: caixaAberto.id,
    criadoEm: new Date().toISOString(),
    cliente: po.cliente.nome,
    viagem: true,
    itens,
    subtotal,
    desconto: 0,
    total,
    pagamentos: [{ forma, valor: total }],
    recebidoDinheiro: recebido,
    troco: recebido ? arred(recebido - total) : 0,
    taxas: arred((total * taxaDaForma(forma, config)) / 100),
    canal: 'site',
    taxaEntrega: po.taxaEntrega,
    online: {
      id: po.id,
      tipo: po.tipo,
      telefone: po.cliente.telefone,
      ...(po.endereco ? { endereco: enderecoTexto(po), bairro: po.endereco.bairro, referencia: po.endereco.referencia } : {}),
      pagamento: NOMES_FORMA_ONLINE[po.pagamento.forma] + (po.pagamento.trocoPara ? ` (troco p/ ${brl(po.pagamento.trocoPara)})` : ''),
      ...(po.obs ? { obs: po.obs } : {}),
      ...(po.pagamento.forma === 'pix' ? { pagoAntecipado: true } : {}),
      ...(po.pagamento.trocoPara ? { trocoPara: po.pagamento.trocoPara } : {}),
    },
    custoTotal: arred(itens.reduce((s, i) => s + i.custo * i.qtd, 0) + embalagens.reduce((s, e) => s + e.qtd * e.custo, 0)),
    ...(embalagens.length ? { embalagens } : {}),
    cancelado: false,
    entregue: false,
  }
  dados.setPedidos((ps) => [...ps, pedido])
  dados.setInsumos((is) => moverEstoqueInsumos(is, comEmbalagens(consumoInsumosDosItens(itens, produtos, insumos), embalagens), -1))
  dados.setProdutos((ps) => moverEstoqueProdutos(ps, consumoDosItens(itens), -1))
  if (config.imprimirAoFinalizar) imprimirPedido(pedido, config)
  return pedido
}

function estornarNoPdv(pedido: Pedido, dados: Dados) {
  const { produtos, insumos } = dados
  dados.setPedidos((ps) => ps.map((p) => (p.id === pedido.id ? { ...p, cancelado: true } : p)))
  dados.setInsumos((is) => moverEstoqueInsumos(is, comEmbalagens(consumoInsumosDosItens(pedido.itens, produtos, insumos), pedido.embalagens), 1))
  dados.setProdutos((ps) => moverEstoqueProdutos(ps, consumoDosItens(pedido.itens), 1))
}

// =====================================================================================
// Aviso em qualquer aba
// =====================================================================================

export function AlertaPedidoOnline({ online, aoVer }: { online: Online; aoVer: () => void }) {
  if (!online.novos.length) return null
  const p = online.novos[online.novos.length - 1]
  return (
    <div className="fixed inset-x-0 top-0 z-[60] animate-pulse bg-red-600 text-white shadow-2xl">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3">
        <span className="text-3xl">🔔</span>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-black">
            {online.novos.length > 1 ? `${online.novos.length} PEDIDOS NOVOS` : 'NOVO PEDIDO'} NO CARDÁPIO DIGITAL!
          </div>
          <div className="truncate text-sm font-semibold">
            {p.cliente.nome} · {p.tipo === 'entrega' ? `🛵 Entrega (${p.endereco?.bairro})` : '🛍️ Retirada'} · {brl(p.total)}
          </div>
        </div>
        <button className="rounded-xl bg-white px-5 py-2.5 text-lg font-black text-red-700" onClick={aoVer}>
          Ver pedido
        </button>
        {!online.silenciado && (
          <button className="rounded-xl px-3 py-2 text-sm font-bold underline" onClick={() => online.silenciar(2)}>
            🔕 silenciar 2 min
          </button>
        )}
      </div>
    </div>
  )
}

// =====================================================================================
// Aba "Pedidos online"
// =====================================================================================

const COLUNAS: { titulo: string; status: StatusOnline[]; cor: string }[] = [
  { titulo: '🔔 Novos', status: ['novo'], cor: 'border-red-400 bg-red-50' },
  { titulo: '🔥 Em preparo', status: ['aceito'], cor: 'border-amber-300 bg-amber-50' },
  { titulo: '🛵 Saiu / pronto p/ retirar', status: ['saiu', 'pronto'], cor: 'border-sky-300 bg-sky-50' },
]

export default function PedidosOnline({ dados, online, irPara }: { dados: Dados; online: Online; irPara: (a: 'caixa') => void }) {
  const [configurando, setConfigurando] = useState(!dados.config.online || !online.usuario)
  const [recusando, setRecusando] = useState<PedidoOnline | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const setCfg = (m: Partial<ConfigOnline>) => dados.setConfig((c) => ({ ...c, online: { ...CONFIG_ONLINE_INICIAL, ...(c.online ?? {}), ...m } }))

  const hoje = new Date().toDateString()
  const finalizados = online.pedidos.filter((p) => !['novo', 'aceito', 'saiu', 'pronto'].includes(p.status) && new Date(p.criadoEm).toDateString() === hoje)
  const lancado = (po: PedidoOnline) => dados.pedidos.find((p) => p.online?.id === po.id)

  async function agir(po: PedidoOnline, f: () => Promise<void>) {
    setOcupado(po.id)
    try {
      await f()
    } catch (e) {
      alert(textoErroNuvem(e))
    } finally {
      setOcupado(null)
    }
  }

  function aceitar(po: PedidoOnline) {
    if (!dados.caixaAberto) {
      if (confirm('O caixa está fechado. Abra o caixa para aceitar o pedido (ele entra nas vendas do dia).\n\nIr para o Caixa agora?')) irPara('caixa')
      return
    }
    const noPdv = totalNoPdv(po, dados)
    if (Math.abs(noPdv - po.total) > 0.009 && !confirm(`Atenção: o cliente viu ${brl(po.total)}, mas com os preços de agora do PDV o pedido dá ${brl(noPdv)}.\n\nAceitar e cobrar ${brl(noPdv)}?`)) return
    void agir(po, async () => {
      const ja = lancado(po)
      const ped = ja ?? lancarNoPdv(po, dados)
      await mudarStatus(po.id, 'aceito', { numero: ped?.numero, total: ped?.total ?? po.total })
    })
  }

  function recusar(po: PedidoOnline, motivo: string) {
    void agir(po, async () => {
      const ped = lancado(po)
      if (ped && !ped.cancelado) estornarNoPdv(ped, dados)
      await mudarStatus(po.id, po.status === 'novo' ? 'recusado' : 'cancelado', { motivo })
    })
    setRecusando(null)
  }

  if (configurando || !online.usuario || !dados.config.online)
    return <Configurar dados={dados} online={online} setCfg={setCfg} podeFechar={!!online.usuario && !!dados.config.online} aoFechar={() => setConfigurando(false)} />

  return (
    <div className="space-y-4">
      <Cabecalho dados={dados} online={online} setCfg={setCfg} aoConfigurar={() => setConfigurando(true)} />

      {online.erro && <div className="rounded-xl bg-red-100 p-3 font-semibold text-red-800">⚠ {online.erro}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUNAS.map((col) => {
          const lista = online.pedidos.filter((p) => col.status.includes(p.status)).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
          return (
            <section key={col.titulo} className={`rounded-2xl border-2 p-3 ${col.cor}`}>
              <h3 className="mb-3 flex items-center justify-between text-lg font-extrabold">
                {col.titulo}
                <span className="rounded-full bg-white px-2.5 text-base">{lista.length}</span>
              </h3>
              {lista.length === 0 && <p className="py-6 text-center text-sm text-stone-500">Nenhum pedido aqui.</p>}
              <div className="space-y-3">
                {lista.map((po) => (
                  <CartaoPedido
                    key={po.id}
                    po={po}
                    dados={dados}
                    ocupado={ocupado === po.id}
                    aoAceitar={() => aceitar(po)}
                    aoRecusar={() => setRecusando(po)}
                    aoStatus={(s) => void agir(po, () => mudarStatus(po.id, s))}
                    aoImprimir={() => {
                      const ped = lancado(po)
                      if (ped) imprimirPedido(ped, dados.config)
                    }}
                    aoMotoboy={() => {
                      const ped = lancado(po)
                      if (ped) imprimirMotoboy(ped, dados.config)
                    }}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {finalizados.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-extrabold">Finalizados hoje ({finalizados.length})</h3>
          <ul className="divide-y divide-stone-100 text-sm">
            {finalizados.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="w-12 text-stone-500">{hora(p.criadoEm)}</span>
                <span className="flex-1 font-semibold">
                  {p.numero ? `Nº ${p.numero} · ` : ''}
                  {p.cliente.nome}
                </span>
                <span className={p.status === 'entregue' ? 'font-bold text-emerald-700' : 'font-bold text-red-600'}>
                  {ROTULO_STATUS[p.status]}
                  {p.motivo ? ` (${p.motivo})` : ''}
                </span>
                <span className="w-24 text-right font-bold">{brl(p.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recusando && <ModalRecusar po={recusando} aoFechar={() => setRecusando(null)} aoConfirmar={(m) => recusar(recusando, m)} />}
    </div>
  )
}

function Cabecalho({ dados, online, setCfg, aoConfigurar }: { dados: Dados; online: Online; setCfg: (m: Partial<ConfigOnline>) => void; aoConfigurar: () => void }) {
  const cfg = online.cfg
  const [qrAberto, setQrAberto] = useState(false)
  const pub = online.publicacao
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <button
        className={`flex items-center gap-3 rounded-2xl px-5 py-3 text-lg font-black text-white shadow ${cfg.aceitando ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-stone-500 hover:bg-stone-600'}`}
        onClick={() => setCfg({ aceitando: !cfg.aceitando })}
        title="Abre/fecha a loja no cardápio digital"
      >
        <span className={`inline-block h-4 w-8 rounded-full ${cfg.aceitando ? 'bg-white' : 'bg-stone-300'} relative`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full transition-all ${cfg.aceitando ? 'right-0.5 bg-emerald-600' : 'left-0.5 bg-stone-500'}`} />
        </span>
        {cfg.aceitando ? 'ABERTO — recebendo pedidos' : 'FECHADO no cardápio digital'}
      </button>
      {!dados.caixaAberto && cfg.aceitando && <span className="rounded-lg bg-amber-100 px-2 py-1 text-sm font-bold text-amber-800">⚠ Caixa fechado: abra o caixa para aceitar pedidos</span>}
      <div className="min-w-0 flex-1 text-sm text-stone-600">
        <div>
          Link para os clientes:{' '}
          <a className="break-all font-bold text-orange-700 underline" href={URL_CARDAPIO} target="_blank" rel="noreferrer">
            {URL_CARDAPIO.replace('https://', '')}
          </a>
        </div>
        <div className="text-xs">
          {pub?.tipo === 'enviando'
            ? '☁ Atualizando cardápio…'
            : pub?.tipo === 'erro'
              ? <span className="font-bold text-red-600">☁ Erro ao publicar: {pub.msg}</span>
              : pub?.tipo === 'ok'
                ? `☁ Cardápio atualizado às ${hora(pub.em!)} (preços e esgotados vão sozinhos)`
                : '☁ Cardápio publicado'}
        </div>
      </div>
      <button className={btn.secundario} onClick={() => setQrAberto(true)}>
        📱 QR Code
      </button>
      <button className={btn.secundario} onClick={() => void navigator.clipboard?.writeText(URL_CARDAPIO).then(() => alert('Link copiado!'))}>
        🔗 Copiar link
      </button>
      {online.novos.length > 0 && !online.silenciado && (
        <button className={btn.secundario} onClick={() => online.silenciar(2)}>
          🔕 Silenciar 2 min
        </button>
      )}
      <button className={btn.secundario} onClick={aoConfigurar}>
        ⚙️ Configurar
      </button>
      {qrAberto && <ModalQr aoFechar={() => setQrAberto(false)} nome={dados.config.nomeLoja} />}
    </div>
  )
}

function ModalQr({ aoFechar, nome }: { aoFechar: () => void; nome: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(URL_CARDAPIO)
    qr.make()
    return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true })
  }, [])
  function imprimir() {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(
      `<html><head><title>QR Code — Cardápio</title><style>body{font-family:sans-serif;text-align:center;padding:40px}svg{width:320px;height:320px}h1{font-size:32px;margin:0}p{font-size:20px}</style></head><body><h1>${nome}</h1><p>📱 Peça pelo celular!<br>Aponte a câmera para o código</p>${svg}<p><b>${URL_CARDAPIO.replace('https://', '')}</b></p><script>setTimeout(()=>print(),300)</script></body></html>`,
    )
    w.document.close()
  }
  return (
    <Modal titulo="QR Code do cardápio" aberto aoFechar={aoFechar}>
      <div className="mx-auto w-64" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-2 text-center text-sm text-stone-600">Imprima e cole nas mesas, no balcão e na embalagem do delivery.</p>
      <button className={`${btn.primario} mt-3 w-full`} onClick={imprimir}>
        🖨️ Imprimir cartaz
      </button>
    </Modal>
  )
}

function tempoDesde(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return min < 1 ? 'agora' : min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

function CartaoPedido({
  po,
  dados,
  ocupado,
  aoAceitar,
  aoRecusar,
  aoStatus,
  aoImprimir,
  aoMotoboy,
}: {
  po: PedidoOnline
  dados: Dados
  ocupado: boolean
  aoAceitar: () => void
  aoRecusar: () => void
  aoStatus: (s: StatusOnline) => void
  aoImprimir: () => void
  aoMotoboy: () => void
}) {
  const [, tique] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tique((x) => x + 1), 30000)
    return () => clearInterval(t)
  }, [])
  const tel = po.cliente.telefone.replace(/\D/g, '')
  const noPdv = po.status === 'novo' ? totalNoPdv(po, dados) : po.total
  const pixOnline = po.pagamento.forma === 'pix'
  return (
    <article className={`rounded-xl bg-white p-3 shadow ${po.status === 'novo' ? 'ring-4 ring-red-400' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-black leading-tight">
            {po.numero ? `Nº ${po.numero} · ` : ''}
            {po.cliente.nome}
          </div>
          <div className="text-xs text-stone-500">
            {hora(po.criadoEm)} · {tempoDesde(po.criadoEm)}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-black ${po.tipo === 'entrega' ? 'bg-sky-600 text-white' : 'bg-violet-600 text-white'}`}>
          {po.tipo === 'entrega' ? '🛵 ENTREGA' : '🛍️ RETIRADA'}
        </span>
      </div>
      {po.tipo === 'entrega' && po.endereco && (
        <div className="mt-2 rounded-lg bg-stone-50 p-2 text-sm">
          <div className="font-semibold">📍 {enderecoTexto(po)}</div>
          {po.endereco.referencia && <div className="text-stone-600">Ref.: {po.endereco.referencia}</div>}
        </div>
      )}
      <a className="mt-1 inline-block text-sm font-semibold text-emerald-700 underline" href={`https://wa.me/55${tel.replace(/^55/, '')}`} target="_blank" rel="noreferrer">
        💬 {po.cliente.telefone}
      </a>
      <ul className="mt-2 space-y-0.5 border-t border-stone-100 pt-2 text-sm">
        {po.itens.map((i, k) => (
          <li key={k}>
            <b>{i.qtd}x</b> {i.nome}
            {i.escolhas?.length ? <span className="text-stone-500"> ({i.escolhas.map((e) => `${e.qtd} ${e.nome}`).join(', ')})</span> : null}
            {i.obs && <div className="pl-5 text-xs font-semibold text-orange-700">› {i.obs}</div>}
          </li>
        ))}
      </ul>
      {po.obs && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-sm font-semibold text-amber-900">📝 {po.obs}</div>}
      <div className="mt-2 border-t border-stone-100 pt-2 text-sm">
        {po.taxaEntrega > 0 && (
          <div className="flex justify-between text-stone-600">
            <span>Entrega</span>
            <span>{brl(po.taxaEntrega)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-black">
          <span>Total</span>
          <span>{brl(po.total)}</span>
        </div>
        <div className={`font-semibold ${pixOnline ? 'text-violet-700' : 'text-stone-700'}`}>
          {pixOnline ? '💠' : po.pagamento.forma === 'dinheiro' ? '💵' : '💳'} {NOMES_FORMA_ONLINE[po.pagamento.forma]}
          {po.pagamento.trocoPara ? ` · troco para ${brl(po.pagamento.trocoPara)} (levar ${brl(po.pagamento.trocoPara - po.total)})` : ''}
        </div>
        {pixOnline && po.status === 'novo' && <div className="text-xs font-bold text-violet-700">Confira no app do banco se o Pix de {brl(po.total)} caiu antes de aceitar.</div>}
        {po.status === 'novo' && Math.abs(noPdv - po.total) > 0.009 && (
          <div className="mt-1 rounded bg-amber-100 p-1 text-xs font-bold text-amber-900">⚠ Com os preços de agora do PDV daria {brl(noPdv)}.</div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {po.status === 'novo' && (
          <>
            <button className={`${btn.verde} flex-1 !py-3 text-lg`} disabled={ocupado} onClick={aoAceitar}>
              ✅ Aceitar
            </button>
            <button className={`${btn.perigo}`} disabled={ocupado} onClick={aoRecusar}>
              Recusar
            </button>
          </>
        )}
        {po.status === 'aceito' && (
          <>
            <button className={`${btn.primario} flex-1`} disabled={ocupado} onClick={() => aoStatus(po.tipo === 'entrega' ? 'saiu' : 'pronto')}>
              {po.tipo === 'entrega' ? '🛵 Saiu para entrega' : '🛍️ Pronto para retirar'}
            </button>
            <button className={btn.secundario} onClick={aoImprimir} title="Imprimir de novo">
              🖨️
            </button>
            {po.tipo === 'entrega' && (
              <button className={btn.secundario} onClick={aoMotoboy} title="Imprimir a via do motoboy">
                🛵🖨️
              </button>
            )}
            <button className="px-2 text-sm text-red-600 underline" disabled={ocupado} onClick={aoRecusar}>
              cancelar
            </button>
          </>
        )}
        {(po.status === 'saiu' || po.status === 'pronto') && (
          <>
            <button className={`${btn.verde} flex-1`} disabled={ocupado} onClick={() => aoStatus('entregue')}>
              ✔ Entregue
            </button>
            <button className={btn.secundario} onClick={aoImprimir} title="Imprimir de novo">
              🖨️
            </button>
            {po.tipo === 'entrega' && (
              <button className={btn.secundario} onClick={aoMotoboy} title="Imprimir a via do motoboy">
                🛵🖨️
              </button>
            )}
          </>
        )}
      </div>
    </article>
  )
}

function ModalRecusar({ po, aoFechar, aoConfirmar }: { po: PedidoOnline; aoFechar: () => void; aoConfirmar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState('')
  const sugestoes = ['Acabou um item do pedido', 'Fora da área de entrega', 'Muito movimento agora', 'Loja fechando', 'Pix não caiu']
  return (
    <Modal titulo={po.status === 'novo' ? 'Recusar pedido' : 'Cancelar pedido'} aberto aoFechar={aoFechar}>
      <p className="text-sm text-stone-600">
        O cliente vê o motivo na hora no celular.{po.status !== 'novo' && ' A venda sai do caixa e os itens voltam para o estoque.'}
        {po.pagamento.forma === 'pix' && <b className="block text-violet-700">Se o cliente já pagou o Pix, lembre de devolver o valor.</b>}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {sugestoes.map((s) => (
          <button key={s} className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${motivo === s ? 'border-red-500 bg-red-50' : 'border-stone-200'}`} onClick={() => setMotivo(s)}>
            {s}
          </button>
        ))}
      </div>
      <CampoTexto className="mt-3" rotulo="Motivo" valor={motivo} aoMudar={setMotivo} placeholder="Escreva o motivo" />
      <button className={`${btn.primario} mt-4 w-full !bg-red-600`} disabled={!motivo.trim()} onClick={() => aoConfirmar(motivo.trim())}>
        {po.status === 'novo' ? 'Recusar pedido' : 'Cancelar pedido'}
      </button>
    </Modal>
  )
}

// =====================================================================================
// Configuração (passo a passo)
// =====================================================================================

const TIPOS_PIX: { id: TipoChavePix; nome: string }[] = [
  { id: 'telefone', nome: 'Celular' },
  { id: 'cpf', nome: 'CPF' },
  { id: 'cnpj', nome: 'CNPJ' },
  { id: 'email', nome: 'E-mail' },
  { id: 'aleatoria', nome: 'Aleatória' },
]

function Passo({ n, titulo, feito, children }: { n: number; titulo: string; feito?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-white ${feito ? 'bg-emerald-600' : 'bg-orange-600'}`}>{feito ? '✓' : n}</span>
        {titulo}
      </h3>
      {children}
    </section>
  )
}

function Configurar({
  dados,
  online,
  setCfg,
  podeFechar,
  aoFechar,
}: {
  dados: Dados
  online: Online
  setCfg: (m: Partial<ConfigOnline>) => void
  podeFechar: boolean
  aoFechar: () => void
}) {
  const cfg = online.cfg
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [notif, setNotif] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')

  async function tentar(f: () => Promise<void>) {
    setErro('')
    setEntrando(true)
    try {
      await f()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEntrando(false)
    }
  }

  const bairros = cfg.bairros
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-2xl font-extrabold">📱 Cardápio digital — configurar</h2>
        {podeFechar && (
          <button className={btn.primario} onClick={aoFechar}>
            Ver pedidos →
          </button>
        )}
      </div>
      <p className="text-stone-600">
        O cliente abre <b>{URL_CARDAPIO.replace('https://', '')}</b> no celular, entra com e-mail ou Google, monta o pedido (entrega ou retirada) e ele cai aqui com
        alarme. Os produtos, preços, adicionais e o que está esgotado vão sozinhos do PDV. Esta mesma conexão recebe os pedidos dos garçons.
      </p>

      {!contasAtivas && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-900">
          <b>Falta ligar o Firebase do restaurante.</b> Cole o <code>firebaseConfig</code> do projeto em <code>src/nuvem/firebaseConfig.ts</code> e publique o site de novo.
          Enquanto isso, o cardápio digital e o garçom no celular ficam desligados (o resto do PDV funciona normalmente).
        </div>
      )}
      <Passo n={1} titulo="Entrar com a conta do dono" feito={!!online.usuario}>
        {online.usuario ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex-1">
              Conectado como <b>{online.usuario.nome}</b> <span className="text-stone-500">({online.usuario.email})</span>
            </span>
            <button className={btn.secundario} onClick={() => void sair()}>
              Sair
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-stone-600">Use sempre a mesma conta nos computadores/celulares do caixa. É ela que tem permissão para ver os pedidos.</p>
            <button className={`${btn.secundario} w-full`} disabled={entrando} onClick={() => void tentar(entrarComGoogle)}>
              <span className="font-bold text-blue-600">G</span> Entrar com Google
            </button>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <CampoTexto valor={email} aoMudar={setEmail} placeholder="E-mail" />
              <input className="rounded-xl border-2 border-stone-200 px-3 py-2" type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} />
              <button className={btn.primario} disabled={entrando || !email || !senha} onClick={() => void tentar(() => entrar(email, senha))}>
                Entrar
              </button>
            </div>
            <button className="text-sm text-stone-500 underline" onClick={() => void tentar(() => recuperarSenha(email)).then(() => email && alert('Se o e-mail tiver conta, chegou um link para criar nova senha.'))}>
              Esqueci a senha
            </button>
            {erro && <p className="font-semibold text-red-600">{erro}</p>}
          </div>
        )}
      </Passo>

      {online.usuario && (
        <Passo n={2} titulo="Liberar o banco de dados (uma vez só)" feito={!online.erro && online.publicacao?.tipo !== 'erro' && online.publicacao !== null}>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
            <li>
              Abra o{' '}
              <a className="font-bold text-orange-700 underline" href={FIREBASE.projectId ? `https://console.firebase.google.com/project/${FIREBASE.projectId}/firestore/rules` : 'https://console.firebase.google.com/'} target="_blank" rel="noreferrer">
                Firebase → Firestore → Regras
              </a>{' '}
              (entre com a conta Google do Firebase).
            </li>
            <li>Apague o que está lá, cole o texto abaixo e clique em <b>Publicar</b>.</li>
            <li>Volte aqui: em alguns segundos o cardápio é publicado.</li>
          </ol>
          <button
            className={`${btn.primario} mt-3`}
            onClick={() => {
              void navigator.clipboard?.writeText(regrasFirestore(online.usuario!.uid))
              setCopiado(true)
            }}
          >
            {copiado ? '✓ Regras copiadas' : '📋 Copiar regras'}
          </button>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-stone-500">ver o texto</summary>
            <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-stone-900 p-3 text-stone-100">{regrasFirestore(online.usuario.uid)}</pre>
          </details>
          {online.erro && <p className="mt-2 font-semibold text-red-600">{online.erro}</p>}
          {online.publicacao?.tipo === 'erro' && <p className="mt-2 font-semibold text-red-600">{online.publicacao.msg}</p>}
          <button className="mt-2 text-sm text-orange-700 underline" onClick={online.republicar}>
            Já colei — tentar publicar de novo
          </button>
        </Passo>
      )}

      <Passo n={online.usuario ? 3 : 2} titulo="Entrega e retirada" feito={bairros.length > 0 || cfg.retirada}>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" className="h-5 w-5" checked={cfg.entrega} onChange={(e) => setCfg({ entrega: e.target.checked })} /> 🛵 Fazemos entrega
          </label>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" className="h-5 w-5" checked={cfg.retirada} onChange={(e) => setCfg({ retirada: e.target.checked })} /> 🛍️ Cliente pode retirar no balcão
          </label>
        </div>
        {cfg.entrega && (
          <div className="mt-3">
            <div className="mb-1 text-sm font-semibold text-stone-600">Bairros atendidos e taxa de entrega</div>
            <div className="space-y-2">
              {bairros.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-xl border-2 border-stone-200 px-3 py-2"
                    placeholder="Bairro"
                    value={b.nome}
                    onChange={(e) => setCfg({ bairros: bairros.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })}
                  />
                  <CampoNumero className="w-36" prefixo="R$" valor={b.taxa} aoMudar={(v) => setCfg({ bairros: bairros.map((x, j) => (j === i ? { ...x, taxa: v } : x)) })} />
                  <button className="px-2 text-xl text-stone-400 hover:text-red-600" onClick={() => setCfg({ bairros: bairros.filter((_, j) => j !== i) })} aria-label="Tirar bairro">
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button className={`${btn.secundario} mt-2`} onClick={() => setCfg({ bairros: [...bairros, { nome: '', taxa: bairros[bairros.length - 1]?.taxa ?? 5 }] })}>
              + Bairro
            </button>
          </div>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <CampoTexto rotulo="Tempo de entrega" valor={cfg.tempoEntrega} aoMudar={(v) => setCfg({ tempoEntrega: v })} />
          <CampoTexto rotulo="Tempo p/ retirar" valor={cfg.tempoRetirada} aoMudar={(v) => setCfg({ tempoRetirada: v })} />
          <CampoNumero rotulo="Pedido mínimo" prefixo="R$" valor={cfg.pedidoMinimo} aoMudar={(v) => setCfg({ pedidoMinimo: v })} />
        </div>
        <CampoTexto className="mt-2" rotulo="WhatsApp da loja (para o cliente falar com vocês)" valor={cfg.whatsapp} aoMudar={(v) => setCfg({ whatsapp: v })} placeholder="(11) 99999-9999" />
        <CampoTexto className="mt-2" rotulo="Aviso no topo do cardápio (opcional)" valor={cfg.aviso} aoMudar={(v) => setCfg({ aviso: v })} placeholder="Ex.: Hoje tem promoção de Skol 269 ml!" />
      </Passo>

      <Passo n={online.usuario ? 4 : 3} titulo="Pagamento" feito={!!cfg.pixChave}>
        <p className="text-sm text-stone-600">Na entrega o cliente pode pagar com Pix, cartão (maquininha) ou dinheiro com troco. Com a chave Pix, ele também pode pagar na hora pelo app (QR Code).</p>
        <label className="mt-2 flex items-center gap-2 font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={cfg.pixAntecipado} onChange={(e) => setCfg({ pixAntecipado: e.target.checked })} /> 💠 Aceitar Pix pago na hora pelo celular
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {TIPOS_PIX.map((t) => (
            <button key={t.id} className={`rounded-full border-2 px-3 py-1 text-sm font-bold ${cfg.pixTipo === t.id ? 'border-orange-500 bg-orange-50' : 'border-stone-200'}`} onClick={() => setCfg({ pixTipo: t.id })}>
              {t.nome}
            </button>
          ))}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <CampoTexto rotulo="Chave Pix" valor={cfg.pixChave} aoMudar={(v) => setCfg({ pixChave: v })} />
          <CampoTexto rotulo="Nome do recebedor" valor={cfg.pixNome} aoMudar={(v) => setCfg({ pixNome: v })} placeholder="Como aparece no banco" />
          <CampoTexto rotulo="Cidade" valor={cfg.pixCidade} aoMudar={(v) => setCfg({ pixCidade: v })} />
        </div>
      </Passo>

      <Passo n={online.usuario ? 5 : 4} titulo="Alarme de pedido novo" feito={cfg.som}>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={cfg.som} onChange={(e) => setCfg({ som: e.target.checked })} /> 🔔 Tocar campainha até aceitar o pedido
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={btn.secundario} onClick={() => tocarCampainha()}>
            ▶ Testar som
          </button>
          {notif !== 'granted' ? (
            <button
              className={btn.secundario}
              onClick={() => typeof Notification !== 'undefined' && void Notification.requestPermission().then(setNotif)}
            >
              🔔 Permitir notificação do sistema
            </button>
          ) : (
            <span className="self-center text-sm font-semibold text-emerald-700">✓ Notificações do sistema ligadas</span>
          )}
        </div>
        <p className="mt-2 text-xs text-stone-500">Deixe o PDV aberto (pode ser em outra aba) com o volume ligado. O aviso aparece em qualquer tela do PDV.</p>
      </Passo>

      {online.usuario && (
        <button
          className={`${btn.verde} w-full py-4 text-lg`}
          onClick={() => {
            if (!dados.config.online) setCfg({})
            aoFechar()
          }}
        >
          {dados.config.online ? 'Pronto — ver pedidos' : 'Ativar cardápio digital'}
        </button>
      )}
    </div>
  )
}
