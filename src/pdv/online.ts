import { conexaoFirebase } from '../nuvem/conta'
import { secaoDe, SECOES, esgotado } from './catalogo'
import type { ConfigOnline, Produto, TipoChavePix } from './tipos'

/**
 * Cardápio digital: o PDV publica o cardápio no Firebase (doc espetinho/loja) e os clientes
 * mandam pedidos para a coleção espetinho_pedidos. O PDV escuta os pedidos e avisa com som.
 */

export const URL_CARDAPIO = 'https://plisselab.github.io/cardapio/'

// ---------------- tipos guardados na nuvem ----------------

export interface OpcaoOnline {
  id: string
  nome: string
  emoji: string
  acrescimo: number
  esgotado: boolean
}

export interface ComponenteOnline {
  id: string
  nome: string
  qtd: number
  opcoes: OpcaoOnline[]
}

export interface ProdutoOnline {
  id: string
  nome: string
  descricao: string
  preco: number
  emoji: string
  imagem?: string
  secao: string
  alcool: boolean
  esgotado: boolean
  componentes?: ComponenteOnline[]
}

export interface LojaOnline {
  nome: string
  endereco: string
  telefone: string
  whatsapp: string
  aberto: boolean
  aviso: string
  entrega: boolean
  retirada: boolean
  bairros: { nome: string; taxa: number }[]
  tempoEntrega: string
  tempoRetirada: string
  pedidoMinimo: number
  pix: { chave: string; nome: string; cidade: string } | null
  secoes: string[]
  produtos: ProdutoOnline[]
  atualizadoEm: string
}

export type StatusOnline = 'novo' | 'aceito' | 'saiu' | 'pronto' | 'entregue' | 'recusado' | 'cancelado'

export type FormaOnline = 'pix' | 'pix_entrega' | 'credito' | 'debito' | 'dinheiro'

export const NOMES_FORMA_ONLINE: Record<FormaOnline, string> = {
  pix: 'Pix (pago pelo app)',
  pix_entrega: 'Pix na entrega',
  credito: 'Cartão de crédito na entrega',
  debito: 'Cartão de débito na entrega',
  dinheiro: 'Dinheiro',
}

export interface ItemOnline {
  produtoId: string
  nome: string
  emoji: string
  qtd: number
  preco: number
  obs: string
  escolhas?: { produtoId: string; nome: string; qtd: number }[]
}

export interface PedidoOnline {
  id: string
  uid: string
  cliente: { nome: string; email: string; telefone: string }
  tipo: 'entrega' | 'retirada'
  endereco?: { bairro: string; rua: string; numero: string; complemento: string; referencia: string }
  itens: ItemOnline[]
  subtotal: number
  taxaEntrega: number
  total: number
  pagamento: { forma: FormaOnline; trocoPara?: number }
  obs: string
  status: StatusOnline
  criadoEm: string
  atualizadoEm?: string
  /** Número do pedido no PDV (quando aceito). */
  numero?: number
  motivo?: string
}

export const ROTULO_STATUS: Record<StatusOnline, string> = {
  novo: 'Aguardando a loja aceitar',
  aceito: 'Pedido aceito — em preparo',
  saiu: 'Saiu para entrega',
  pronto: 'Pronto para retirar',
  entregue: 'Entregue',
  recusado: 'Recusado pela loja',
  cancelado: 'Cancelado',
}

export const statusAberto = (s: StatusOnline) => s === 'novo' || s === 'aceito' || s === 'saiu' || s === 'pronto'

export const CONFIG_ONLINE_INICIAL: ConfigOnline = {
  aceitando: false,
  bairros: [],
  retirada: true,
  entrega: true,
  tempoEntrega: '40 a 60 min',
  tempoRetirada: '20 a 30 min',
  pedidoMinimo: 0,
  pixTipo: 'telefone',
  pixChave: '',
  pixNome: '',
  pixCidade: '',
  pixAntecipado: true,
  aviso: '',
  whatsapp: '',
  som: true,
}

export const enderecoTexto = (p: Pick<PedidoOnline, 'endereco'>) =>
  p.endereco
    ? `${p.endereco.rua}, ${p.endereco.numero}${p.endereco.complemento ? ` — ${p.endereco.complemento}` : ''} · ${p.endereco.bairro}`
    : ''

// ---------------- montar o cardápio publicado ----------------

const ALCOOL = new Set(['Cervejas', 'Fardos', 'Doses e drinks', 'Destilados e vinhos'])
/** Limite seguro de tamanho do documento (o Firestore aceita até 1 MB). */
const LIMITE_FOTOS = 700_000

export function montarLojaOnline(args: {
  produtos: Produto[]
  nomeLoja: string
  endereco: string
  telefone: string
  espetoHoje: boolean
  online: ConfigOnline
}): LojaOnline {
  const { produtos, online } = args
  const porId = new Map(produtos.map((p) => [p.id, p]))
  let fotos = 0
  const lista: ProdutoOnline[] = []
  for (const p of produtos) {
    if (!p.ativo || p.preco <= 0 || p.foraDoCardapio || p.foraDoDelivery) continue
    if (!args.espetoHoje && (p.categoria === 'espeto' || p.categoria === 'combo')) continue
    const secao = secaoDe(p)
    const item: ProdutoOnline = {
      id: p.id,
      nome: p.nome,
      descricao: [p.tamanho, p.descricao].filter(Boolean).join(' · '),
      preco: p.preco,
      emoji: p.emoji || '🍽️',
      secao,
      alcool: ALCOOL.has(secao),
      esgotado: esgotado(p, produtos),
    }
    if (p.imagem && fotos + p.imagem.length < LIMITE_FOTOS) {
      item.imagem = p.imagem
      fotos += p.imagem.length
    }
    // combo/jantinha com escolha: as opções vão junto; fardo (opção única) não precisa de escolha
    if (p.componentes?.length && p.componentes.some((c) => c.opcoes.length > 1)) {
      item.componentes = p.componentes.map((c) => ({
        id: c.id,
        nome: c.nome,
        qtd: c.qtd,
        opcoes: c.opcoes
          .map((id) => porId.get(id))
          .filter((o): o is Produto => !!o && o.ativo)
          .map((o) => ({
            id: o.id,
            nome: o.nome,
            emoji: o.emoji,
            acrescimo: c.acrescimos?.[o.id] ?? 0,
            esgotado: o.estoque !== undefined && o.estoque <= 0,
          })),
      }))
    }
    lista.push(item)
  }
  const usadas = new Set(lista.map((p) => p.secao))
  const ordem = [...(SECOES as readonly string[]).filter((s) => usadas.has(s)), ...[...usadas].filter((s) => !(SECOES as readonly string[]).includes(s))]
  const chave = chavePix(online.pixTipo, online.pixChave)
  return {
    nome: args.nomeLoja,
    endereco: args.endereco,
    telefone: args.telefone,
    whatsapp: online.whatsapp.replace(/\D/g, ''),
    aberto: online.aceitando,
    aviso: online.aviso,
    entrega: online.entrega && online.bairros.length > 0,
    retirada: online.retirada,
    bairros: online.bairros.filter((b) => b.nome.trim()),
    tempoEntrega: online.tempoEntrega,
    tempoRetirada: online.tempoRetirada,
    pedidoMinimo: online.pedidoMinimo,
    pix: online.pixAntecipado && chave && online.pixNome.trim() ? { chave, nome: online.pixNome.trim(), cidade: online.pixCidade.trim() || 'BRASIL' } : null,
    secoes: ordem,
    produtos: lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })),
    atualizadoEm: new Date().toISOString(),
  }
}

// ---------------- Pix (QR Code "copia e cola") ----------------

/** Chave no formato que o Pix espera (telefone com +55, CPF/CNPJ só números). */
export function chavePix(tipo: TipoChavePix, chave: string) {
  const c = chave.trim()
  if (!c) return ''
  if (tipo === 'cpf' || tipo === 'cnpj') return c.replace(/\D/g, '')
  if (tipo === 'telefone') {
    const d = c.replace(/\D/g, '')
    return d.startsWith('55') && d.length >= 12 ? `+${d}` : `+55${d}`
  }
  if (tipo === 'email') return c.toLowerCase()
  return c
}

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase()

function campo(id: string, valor: string) {
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`
}

function crc16(t: string) {
  let crc = 0xffff
  for (let i = 0; i < t.length; i++) {
    crc ^= t.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Código Pix "copia e cola" (BR Code estático com valor). */
export function codigoPix(pix: { chave: string; nome: string; cidade: string }, valor: number, txid: string) {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', pix.chave)
  const id = semAcento(txid).replace(/ /g, '').slice(0, 25) || '***'
  const corpo =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    (valor > 0 ? campo('54', valor.toFixed(2)) : '') +
    campo('58', 'BR') +
    campo('59', semAcento(pix.nome).slice(0, 25) || 'LOJA') +
    campo('60', semAcento(pix.cidade).slice(0, 15) || 'BRASIL') +
    campo('62', campo('05', id)) +
    '6304'
  return corpo + crc16(corpo)
}

// ---------------- nuvem ----------------

export async function firebase() {
  const { db, auth } = await conexaoFirebase()
  const fs = await import('firebase/firestore')
  return { db, auth, fs }
}

export async function publicarLoja(loja: LojaOnline) {
  const { db, fs } = await firebase()
  await fs.setDoc(fs.doc(db, 'espetinho', 'loja'), loja)
}

export async function ouvirLoja(aoMudar: (l: LojaOnline | null) => void, aoErro: (e: unknown) => void) {
  const { db, fs } = await firebase()
  return fs.onSnapshot(
    fs.doc(db, 'espetinho', 'loja'),
    (d) => aoMudar(d.exists() ? (d.data() as LojaOnline) : null),
    aoErro,
  )
}

/** PDV: os 80 pedidos mais recentes, em tempo real. */
export async function ouvirPedidosDaLoja(aoMudar: (ps: PedidoOnline[]) => void, aoErro: (e: unknown) => void) {
  const { db, fs } = await firebase()
  return fs.onSnapshot(
    fs.query(fs.collection(db, 'espetinho_pedidos'), fs.orderBy('criadoEm', 'desc'), fs.limit(80)),
    (snap) => aoMudar(snap.docs.map((d) => ({ ...(d.data() as PedidoOnline), id: d.id }))),
    aoErro,
  )
}

/** Cliente: os próprios pedidos, em tempo real. */
export async function ouvirMeusPedidos(uid: string, aoMudar: (ps: PedidoOnline[]) => void, aoErro: (e: unknown) => void) {
  const { db, fs } = await firebase()
  return fs.onSnapshot(
    fs.query(fs.collection(db, 'espetinho_pedidos'), fs.where('uid', '==', uid)),
    (snap) => aoMudar(snap.docs.map((d) => ({ ...(d.data() as PedidoOnline), id: d.id })).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))),
    aoErro,
  )
}

export async function enviarPedido(p: Omit<PedidoOnline, 'id'>) {
  const { db, fs } = await firebase()
  const ref = await fs.addDoc(fs.collection(db, 'espetinho_pedidos'), p)
  return ref.id
}

export async function mudarStatus(id: string, status: StatusOnline, extra: Partial<PedidoOnline> = {}) {
  const { db, fs } = await firebase()
  const limpo = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined))
  await fs.updateDoc(fs.doc(db, 'espetinho_pedidos', id), { ...limpo, status, atualizadoEm: new Date().toISOString() })
}

export interface PerfilCliente {
  nome: string
  telefone: string
  endereco?: { bairro: string; rua: string; numero: string; complemento: string; referencia: string }
}

export async function lerPerfil(uid: string): Promise<PerfilCliente | null> {
  const { db, fs } = await firebase()
  const d = await fs.getDoc(fs.doc(db, 'espetinho_clientes', uid))
  return d.exists() ? (d.data() as PerfilCliente) : null
}

export async function salvarPerfil(uid: string, p: PerfilCliente) {
  const { db, fs } = await firebase()
  await fs.setDoc(fs.doc(db, 'espetinho_clientes', uid), p, { merge: true })
}

/** Regras de segurança do Firestore (o dono cola no console do Firebase). */
export function regrasFirestore(uidDono: string) {
  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function dono() {
      return request.auth != null && request.auth.uid in ['${uidDono}'];
    }
    function logado() {
      return request.auth != null;
    }

    // Loja (plissê lab): histórico de pedidos de cada cliente
    match /usuarios/{uid}/{doc=**} {
      allow read, write: if logado() && request.auth.uid == uid;
    }

    // Espetinho: cardápio publicado pelo PDV (todo mundo vê, só o dono muda)
    match /espetinho/{doc} {
      allow read: if true;
      allow write: if dono();
    }

    // Espetinho: pedidos do cardápio digital
    match /espetinho_pedidos/{id} {
      allow create: if logado()
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.status == 'novo'
        && request.resource.data.total is number
        && request.resource.data.itens.size() > 0
        && request.resource.data.itens.size() <= 60;
      allow read: if dono() || (logado() && resource.data.uid == request.auth.uid);
      // o cliente só pode cancelar enquanto a loja não aceitou
      allow update: if dono() || (logado()
        && resource.data.uid == request.auth.uid
        && resource.data.status == 'novo'
        && request.resource.data.status == 'cancelado'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'atualizadoEm', 'motivo']));
      allow delete: if dono();
    }

    // Espetinho: dados de entrega salvos do cliente
    match /espetinho_clientes/{uid} {
      allow read, write: if logado() && (request.auth.uid == uid || dono());
    }
  }
}`
}

// ---------------- som do alarme ----------------

let ctx: AudioContext | null = null

/** Libera o som (o navegador só deixa tocar depois de um clique na página). */
export function liberarSom() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    // sem áudio
  }
}

/** "Plim-plom" alto, como campainha de pedido. */
export function tocarCampainha() {
  liberarSom()
  if (!ctx) return
  const agora = ctx.currentTime
  const notas = [
    [1318.5, 0],
    [987.8, 0.18],
    [1318.5, 0.5],
    [987.8, 0.68],
  ] as const
  for (const [freq, t] of notas) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    g.gain.setValueAtTime(0.0001, agora + t)
    g.gain.exponentialRampToValueAtTime(0.9, agora + t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, agora + t + 0.45)
    osc.connect(g).connect(ctx.destination)
    osc.start(agora + t)
    osc.stop(agora + t + 0.5)
  }
}
