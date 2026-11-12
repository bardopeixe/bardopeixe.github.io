import qrcode from 'qrcode-generator'
import { useEffect, useMemo, useRef, useState } from 'react'
import { statusComanda } from './comanda'
import { brl, novoId, type Dados, moverEstoque } from './dados'
import { imprimirLancamento } from './impressao'
import { URL_GARCOM, ouvirPedidosMesa, pegarPedidoMesa, publicarGarcons, tocarCampainha, type PedidoMesa } from './online'
import { itensDoOnline, textoErroNuvem, type Online } from './PedidosOnline'
import type { Comanda, Garcom, ItemComanda } from './tipos'
import { CampoTexto, btn } from './ui'

/**
 * Garçom no celular — lado do PDV.
 * Cada pedido que um garçom manda (Firestore: pedidos_mesa) entra sozinho na comanda aberta da mesa
 * (ou abre uma nova), baixa o estoque e imprime a comanda da cozinha. Só um PDV "pega" cada pedido.
 */
export function useGarcomPdv(dados: Dados, online: Online) {
  const [avisos, setAvisos] = useState<{ id: string; texto: string }[]>([])
  const [erro, setErro] = useState('')
  const [aguardando, setAguardando] = useState(0)
  const dadosRef = useRef(dados)
  dadosRef.current = dados
  const vistos = useRef(new Set<string>())
  const fila = useRef(Promise.resolve())
  /** Comandas abertas agora há pouco (ainda podem não ter chegado no estado). */
  const recentes = useRef(new Map<string, Comanda>())
  const ligado = !!online.usuario
  const garcons = dados.config.garcons ?? []
  const assinaturaGarcons = JSON.stringify(garcons)

  // a lista de garçons liberados vai para a nuvem (as regras de segurança usam ela)
  useEffect(() => {
    if (!ligado) return
    const t = setTimeout(() => {
      publicarGarcons(garcons).catch((e) => setErro(textoErroNuvem(e)))
    }, 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligado, assinaturaGarcons, online.usuario?.uid])

  useEffect(() => {
    if (!ligado) return
    let parar: (() => void) | undefined
    let vivo = true
    ouvirPedidosMesa(
      (ps) => {
        setErro('')
        setAguardando(ps.length)
        for (const p of ps) {
          if (vistos.current.has(p.id)) continue
          vistos.current.add(p.id)
          fila.current = fila.current.then(() => lancar(p)).catch(() => {})
        }
      },
      (e) => setErro(textoErroNuvem(e)),
    )
      .then((f) => (vivo ? (parar = f) : f()))
      .catch((e) => setErro(textoErroNuvem(e)))
    return () => {
      vivo = false
      parar?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligado, online.usuario?.uid])

  function comandaDaMesa(mesa: string) {
    const d = dadosRef.current
    const chave = mesa.trim().toLowerCase()
    const abertas = d.comandas
      .filter((c) => statusComanda(c, d.pedidos) === 'aberta' && c.mesa.trim().toLowerCase() === chave)
      .sort((a, b) => b.abertaEm.localeCompare(a.abertaEm))
    if (abertas[0]) return abertas[0]
    const r = recentes.current.get(chave)
    return r && !d.comandas.some((c) => c.id === r.id && statusComanda(c, d.pedidos) !== 'aberta') ? r : undefined
  }

  async function lancar(pm: PedidoMesa) {
    const antes = comandaDaMesa(pm.mesa)
    const d0 = dadosRef.current
    const proximoNumero = Math.max(d0.comandas.reduce((m, x) => Math.max(m, x.numero), 0), ...[...recentes.current.values()].map((c) => c.numero)) + 1
    let ok = false
    try {
      ok = await pegarPedidoMesa(pm.id, antes?.numero ?? proximoNumero)
    } catch (e) {
      vistos.current.delete(pm.id)
      setErro(textoErroNuvem(e))
      return
    }
    if (!ok) return // outro PDV já lançou

    const d = dadosRef.current
    const agora = new Date().toISOString()
    const itens: ItemComanda[] = itensDoOnline(pm, d).map((i) => ({ ...i, id: novoId(), lancadoEm: agora, garcom: pm.garcom.nome }))
    const existente = comandaDaMesa(pm.mesa)
    let comanda: Comanda
    if (existente) {
      comanda = existente
      d.setComandas((cs) => (cs.some((c) => c.id === existente.id) ? cs.map((c) => (c.id === existente.id ? { ...c, itens: [...c.itens, ...itens] } : c)) : [...cs, { ...existente, itens: [...existente.itens, ...itens] }]))
      recentes.current.set(pm.mesa.trim().toLowerCase(), { ...existente, itens: [...existente.itens, ...itens] })
    } else {
      comanda = { id: novoId(), numero: proximoNumero, mesa: pm.mesa.trim(), nome: '', abertaEm: agora, itens }
      d.setComandas((cs) => [...cs, comanda])
      recentes.current.set(pm.mesa.trim().toLowerCase(), comanda)
    }
    moverEstoque(d, itens, -1)
    if (d.config.imprimirAoFinalizar && d.config.viaChurrasqueira) imprimirLancamento(comanda, itens, d.config, !existente || existente.itens.length === 0)
    if (d.config.online?.som !== false) tocarCampainha()
    const qtd = itens.reduce((s, i) => s + i.qtd, 0)
    const total = itens.reduce((s, i) => s + i.preco * i.qtd, 0)
    const aviso = { id: pm.id, texto: `📱 ${pm.garcom.nome}: Mesa ${pm.mesa} · ${qtd} ${qtd === 1 ? 'item' : 'itens'} · ${brl(total)} → comanda ${comanda.numero}` }
    setAvisos((a) => [...a.slice(-3), aviso])
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== aviso.id)), 12000)
  }

  return { ligado, avisos, erro, aguardando, fechar: (id: string) => setAvisos((a) => a.filter((x) => x.id !== id)) }
}

export type GarcomPdv = ReturnType<typeof useGarcomPdv>

/** Avisos discretos no canto da tela: pedido do garçom lançado na mesa. */
export function AvisosGarcom({ garcom }: { garcom: GarcomPdv }) {
  if (!garcom.avisos.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
      {garcom.avisos.map((a) => (
        <div key={a.id} className="flex items-start gap-3 rounded-2xl bg-emerald-700 p-3 text-sm font-semibold text-white shadow-2xl">
          <span className="flex-1">{a.texto}</span>
          <button className="text-lg leading-none" onClick={() => garcom.fechar(a.id)} aria-label="Fechar">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/** Configurações → Garçons no celular. */
export function ConfigGarcons({ dados, garcom, irParaOnline }: { dados: Dados; garcom: GarcomPdv; irParaOnline: () => void }) {
  const lista = dados.config.garcons ?? []
  const set = (g: Garcom[]) => dados.setConfig((c) => ({ ...c, garcons: g }))
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const qr = useMemo(() => {
    const q = qrcode(0, 'M')
    q.addData(URL_GARCOM)
    q.make()
    return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
  }, [])

  return (
    <section className="rounded-2xl border-2 border-orange-300 bg-white p-4">
      <h2 className="text-lg font-extrabold">🧑‍🍳 Garçons no celular</h2>
      <p className="text-sm text-stone-600">
        Cada garçom abre <b>{URL_GARCOM.replace('https://', '')}</b> no celular, entra com a conta dele (Google ou e-mail) e lança os pedidos das mesas. O
        pedido entra sozinho na comanda da mesa e sai a comanda da cozinha na impressora deste computador. O garçom só lança — receber e fechar a conta é
        aqui no caixa.
      </p>
      {!garcom.ligado ? (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Para receber os pedidos dos garçons, este PDV precisa estar conectado ao Firebase com a conta do dono.{' '}
          <button className="font-bold underline" onClick={irParaOnline}>
            Conectar em “Pedidos online”
          </button>
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
          ● Recebendo pedidos dos garçons{garcom.aguardando ? ` · ${garcom.aguardando} chegando agora` : ''}. Deixe este PDV aberto durante o expediente.
          {garcom.erro && <div className="mt-1 font-semibold text-red-700">⚠ {garcom.erro}</div>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-start gap-4">
        <div className="h-36 w-36 shrink-0 rounded-xl border-2 border-stone-200 p-1" dangerouslySetInnerHTML={{ __html: qr }} />
        <ol className="min-w-0 flex-1 list-decimal space-y-1 pl-5 text-sm text-stone-700">
          <li>Cadastre abaixo o nome e o e-mail de cada garçom.</li>
          <li>O garçom aponta a câmera para o QR Code (ou abre o link) e entra com esse mesmo e-mail. Se usar e-mail e senha, ele confirma o e-mail pelo link que chega.</li>
          <li>No celular dele, “Adicionar à tela inicial” deixa o app como um ícone.</li>
          <li>Para tirar o acesso de alguém, desmarque ou apague aqui.</li>
        </ol>
      </div>

      <ul className="mt-4 divide-y divide-stone-100">
        {lista.length === 0 && <li className="py-3 text-sm text-stone-500">Nenhum garçom cadastrado ainda.</li>}
        {lista.map((g, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 py-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-5 w-5 accent-orange-700" checked={g.ativo} onChange={(e) => set(lista.map((x, j) => (j === i ? { ...x, ativo: e.target.checked } : x)))} />
            </label>
            <span className={`min-w-0 flex-1 ${g.ativo ? '' : 'text-stone-400 line-through'}`}>
              <b>{g.nome || 'Sem nome'}</b> <span className="text-sm text-stone-500">{g.email}</span>
            </span>
            <button className="px-2 text-xl text-stone-400 hover:text-red-600" onClick={() => confirm(`Tirar ${g.nome || g.email} da lista?`) && set(lista.filter((_, j) => j !== i))} aria-label="Apagar">
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
        <CampoTexto valor={nome} aoMudar={setNome} placeholder="Nome (ex.: João)" />
        <CampoTexto valor={email} aoMudar={setEmail} placeholder="E-mail da conta do garçom" />
        <button
          className={btn.primario}
          disabled={!nome.trim() || !emailOk || lista.some((g) => g.email.toLowerCase() === email.trim().toLowerCase())}
          onClick={() => {
            set([...lista, { nome: nome.trim(), email: email.trim().toLowerCase(), ativo: true }])
            setNome('')
            setEmail('')
          }}
        >
          + Garçom
        </button>
      </div>
    </section>
  )
}
