import { conexaoFirebase } from '../nuvem/conta'
import { secaoDe, SECOES, esgotado } from './catalogo'
import { SITE } from '../nuvem/site'
import type { Adicional, ConfigOnline, Produto, TipoChavePix } from './tipos'

/**
 * Cardápio digital e garçom no celular (Firebase do Bar do Peixe):
 * - o PDV publica o cardápio em restaurante/loja (preços, esgotados, adicionais, aberto/fechado);
 * - os clientes mandam pedidos de entrega/retirada para a coleção `pedidos`;
 * - os garçons mandam os pedidos das mesas para `pedidos_mesa`; o PDV lança na comanda da mesa
 *   e imprime a comanda da cozinha;
 * - a lista de garçons autorizados fica em equipe/garcons (só o dono muda).
 */

export const URL_CARDAPIO = `${SITE}/`
export const URL_GARCOM = `${SITE}/garcom/`

const COL_LOJA = 'restaurante'
const COL_PEDIDOS = 'pedidos'
const COL_CLIENTES = 'clientes'
const COL_MESA = 'pedidos_mesa'

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

export interface AdicionalOnline {
  id: string
  nome: string
  preco: number
}

export interface ProdutoOnline {
  id: string
  nome: string
  categoria?: string
  /** Adicionais que o cliente/garçom pode escolher (ovo frito…). */
  adicionais?: AdicionalOnline[]
  /** Só aparece para o garçom (fora do delivery/cardápio digital). */
  soMesa?: boolean
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
  /** Observações de um toque (sem salada, sem cebola…), para o garçom. */
  obsRapidas?: string[]
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
  adicionais?: AdicionalOnline[]
}

// ---------------- garçom ----------------

export type StatusMesa = 'novo' | 'lancado' | 'recusado'

/** Pedido que o garçom lança pelo celular para uma mesa. */
export interface PedidoMesa {
  id: string
  uid: string
  garcom: { nome: string; email: string }
  mesa: string
  itens: ItemOnline[]
  total: number
  status: StatusMesa
  criadoEm: string
  atualizadoEm?: string
  /** Comanda em que o PDV lançou. */
  comanda?: number
  motivo?: string
}

export interface EquipeGarcons {
  emails: string[]
  nomes: Record<string, string>
  atualizadoEm: string
}

export interface PedidoOnline {
  id: string
  uid: string
  cliente: { nome: string; email: string; telefone: string }
  tipo: 'entrega' | 'retirada'
  endereco?: { bairro: string; rua: string; numero: string; complemento: string; referencia: string; cep?: string }
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
    ? `${p.endereco.rua}, ${p.endereco.numero}${p.endereco.complemento ? ` — ${p.endereco.complemento}` : ''} · ${p.endereco.bairro}${p.endereco.cep ? ` · CEP ${p.endereco.cep}` : ''}`
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
  adicionais?: Adicional[]
  obsRapidas?: string[]
}): LojaOnline {
  const { produtos, online } = args
  const adicionaisAtivos = (args.adicionais ?? []).filter((a) => a.ativo && a.nome.trim())
  const porId = new Map(produtos.map((p) => [p.id, p]))
  let fotos = 0
  const lista: ProdutoOnline[] = []
  for (const p of produtos) {
    if (!p.ativo || p.preco <= 0) continue
    const soMesa = Boolean(p.foraDoCardapio || p.foraDoDelivery)
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
      categoria: p.categoria,
    }
    if (soMesa) item.soMesa = true
    const ads = adicionaisAtivos.filter((a) => a.categorias.includes(p.categoria))
    if (ads.length) item.adicionais = ads.map((a) => ({ id: a.id, nome: a.nome.trim(), preco: a.preco }))
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
    obsRapidas: args.obsRapidas ?? [],
    produtos: lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })),
    atualizadoEm: new Date().toISOString(),
  }
}

// ---------------- CEP (ViaCEP, grátis e sem cadastro) ----------------

export interface EnderecoCep {
  rua: string
  bairro: string
  cidade: string
  uf: string
}

/** Busca rua, bairro e cidade pelo CEP. Devolve null se o CEP não existe. */
export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const n = cep.replace(/\D/g, '')
  if (n.length !== 8) return null
  const r = await fetch(`https://viacep.com.br/ws/${n}/json/`)
  if (!r.ok) throw new Error('CEP indisponível')
  const d = (await r.json()) as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
  if (d.erro) return null
  return { rua: d.logradouro ?? '', bairro: d.bairro ?? '', cidade: d.localidade ?? '', uf: d.uf ?? '' }
}

/** Compara nomes de bairro sem acento, maiúsculas e espaços extras. */
export const mesmoBairro = (a: string, b: string) => {
  const n = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  return n(a) === n(b)
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
  await fs.setDoc(fs.doc(db, COL_LOJA, 'loja'), loja)
}

export async function ouvirLoja(aoMudar: (l: LojaOnline | null) => void, aoErro: (e: unknown) => void) {
  const { db, fs } = await firebase()
  return fs.onSnapshot(
    fs.doc(db, COL_LOJA, 'loja'),
    (d) => aoMudar(d.exists() ? (d.data() as LojaOnline) : null),
    aoErro,
  )
}

/** PDV: os 80 pedidos mais recentes, em tempo real. */
export async function ouvirPedidosDaLoja(aoMudar: (ps: PedidoOnline[]) => void, aoErro: (e: unknown) => void) {
  const { db, fs } = await firebase()
  return fs.onSnapshot(
    fs.query(fs.collection(db, COL_PEDIDOS), fs.orderBy('criadoEm', 'desc'), fs.limit(80)),
    (snap) => aoMudar(snap.docs.map((d) => ({ ...(d.data() as PedidoOnline), id: d.id }))),
    aoErro,
  )
}

/** Cliente: os próprios pedidos, em tempo real. */
export async function ouvirMeusPedidos(uid: string, aoMudar: (ps: PedidoOnline[]) => void, aoErro: (e: unknown) => void) {
  const { db, fs } = await firebase()
  return fs.onSnapshot(
    fs.query(fs.collection(db, COL_PEDIDOS), fs.where('uid', '==', uid)),
    (snap) => aoMudar(snap.docs.map((d) => ({ ...(d.data() as PedidoOnline), id: d.id })).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))),
    aoErro,
  )
}

export async function enviarPedido(p: Omit<PedidoOnline, 'id'>) {
  const { db, fs } = await firebase()
  const ref = await fs.addDoc(fs.collection(db, COL_PEDIDOS), p)
  return ref.id
}

export async function mudarStatus(id: string, status: StatusOnline, extra: Partial<PedidoOnline> = {}) {
  const { db, fs } = await firebase()
  const limpo = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined))
  await fs.updateDoc(fs.doc(db, COL_PEDIDOS, id), { ...limpo, status, atualizadoEm: new Date().toISOString() })
}

export interface PerfilCliente {
  nome: string
  telefone: string
  endereco?: { bairro: string; rua: string; numero: string; complemento: string; referencia: string; cep?: string }
}

export async function lerPerfil(uid: string): Promise<PerfilCliente | null> {
  const { db, fs } = await firebase()
  const d = await fs.getDoc(fs.doc(db, COL_CLIENTES, uid))
  return d.exists() ? (d.data() as PerfilCliente) : null
}

export async function salvarPerfil(uid: string, p: PerfilCliente) {
  const { db, fs } = await firebase()
  await fs.setDoc(fs.doc(db, COL_CLIENTES, uid), p, { merge: true })
}

// ---------------- garçom: nuvem ----------------

/** PDV: grava quem pode lançar pedidos pelo celular. */
export async function publicarGarcons(lista: { email: string; nome: string; ativo: boolean }[]) {
  const { db, fs } = await firebase()
  const ativos = lista.filter((g) => g.ativo && g.email.trim())
  const equipe: EquipeGarcons = {
    emails: ativos.map((g) => g.email.trim().toLowerCase()),
    nomes: Object.fromEntries(ativos.map((g) => [g.email.trim().toLowerCase(), g.nome.trim()])),
    atualizadoEm: new Date().toISOString(),
  }
  await fs.setDoc(fs.doc(db, 'equipe', 'garcons'), equipe)
}

/** Garçom: confere se o e-mail dele está liberado (as regras só deixam ler quem está na lista). */
export async function lerEquipe(): Promise<EquipeGarcons | null> {
  const { db, fs } = await firebase()
  const d = await fs.getDoc(fs.doc(db, 'equipe', 'garcons'))
  return d.exists() ? (d.data() as EquipeGarcons) : null
}

export async function enviarPedidoMesa(p: Omit<PedidoMesa, 'id'>) {
  const { db, fs } = await firebase()
  const ref = await fs.addDoc(fs.collection(db, COL_MESA), p)
  return ref.id
}

/** PDV: pedidos dos garçons ainda não lançados, em tempo real. */
export async function ouvirPedidosMesa(aoMudar: (ps: PedidoMesa[]) => void, aoErro: (e: unknown) => void) {
  const { db, fs } = await firebase()
  return fs.onSnapshot(
    fs.query(fs.collection(db, COL_MESA), fs.where('status', '==', 'novo')),
    (snap) => aoMudar(snap.docs.map((d) => ({ ...(d.data() as PedidoMesa), id: d.id })).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))),
    aoErro,
  )
}

/** Garçom: os próprios pedidos (para ver se o PDV lançou). */
export async function ouvirMeusPedidosMesa(uid: string, aoMudar: (ps: PedidoMesa[]) => void, aoErro: (e: unknown) => void) {
  const { db, fs } = await firebase()
  return fs.onSnapshot(
    fs.query(fs.collection(db, COL_MESA), fs.where('uid', '==', uid)),
    (snap) => aoMudar(snap.docs.map((d) => ({ ...(d.data() as PedidoMesa), id: d.id })).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 30)),
    aoErro,
  )
}

/**
 * PDV: "pega" o pedido do garçom para lançar. Só um computador consegue (transação):
 * se dois PDVs estiverem abertos, o pedido não entra duas vezes.
 */
export async function pegarPedidoMesa(id: string, comanda: number) {
  const { db, fs } = await firebase()
  const ref = fs.doc(db, COL_MESA, id)
  return fs.runTransaction(db, async (t) => {
    const d = await t.get(ref)
    if (!d.exists() || (d.data() as PedidoMesa).status !== 'novo') return false
    t.update(ref, { status: 'lancado', comanda, atualizadoEm: new Date().toISOString() })
    return true
  })
}

export async function recusarPedidoMesa(id: string, motivo: string) {
  const { db, fs } = await firebase()
  await fs.updateDoc(fs.doc(db, COL_MESA, id), { status: 'recusado', motivo, atualizadoEm: new Date().toISOString() })
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
    function texto(v, max) {
      return v is string && v.size() <= max;
    }
    // o cardápio só aceita pedido com o restaurante ABERTO no PDV (evita pedido fora de hora e spam)
    function lojaAberta() {
      return get(/databases/$(database)/documents/${COL_LOJA}/loja).data.aberto == true;
    }
    // garçom: e-mail confirmado e liberado no PDV (Configurações → Garçons)
    function garcom() {
      return logado()
        && request.auth.token.email_verified == true
        && request.auth.token.email.lower() in get(/databases/$(database)/documents/equipe/garcons).data.emails;
    }

    // Cardápio publicado pelo PDV (todo mundo vê, só o dono muda)
    match /${COL_LOJA}/{doc} {
      allow read: if true;
      allow write: if dono();
    }

    // Lista de garçons liberados (o garçom só lê se o e-mail dele estiver nela)
    match /equipe/garcons {
      allow read: if dono() || (logado() && request.auth.token.email.lower() in resource.data.emails);
      allow write: if dono();
    }

    // Pedidos de entrega/retirada do cardápio digital
    match /${COL_PEDIDOS}/{id} {
      allow create: if logado()
        && lojaAberta()
        && request.resource.data.keys().hasOnly(['uid', 'cliente', 'tipo', 'endereco', 'itens', 'subtotal', 'taxaEntrega', 'total', 'pagamento', 'obs', 'status', 'criadoEm'])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.status == 'novo'
        && request.resource.data.tipo in ['entrega', 'retirada']
        && request.resource.data.total is number
        && request.resource.data.total > 0
        && request.resource.data.total < 5000
        && request.resource.data.itens is list
        && request.resource.data.itens.size() > 0
        && request.resource.data.itens.size() <= 60
        && texto(request.resource.data.obs, 300)
        && texto(request.resource.data.cliente.nome, 80)
        && texto(request.resource.data.cliente.telefone, 20);
      allow read: if dono() || (logado() && resource.data.uid == request.auth.uid);
      // o cliente só pode cancelar enquanto o restaurante não aceitou
      allow update: if dono() || (logado()
        && resource.data.uid == request.auth.uid
        && resource.data.status == 'novo'
        && request.resource.data.status == 'cancelado'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'atualizadoEm', 'motivo']));
      allow delete: if dono();
    }

    // Pedidos das mesas lançados pelos garçons
    match /${COL_MESA}/{id} {
      allow create: if garcom()
        && request.resource.data.keys().hasOnly(['uid', 'garcom', 'mesa', 'itens', 'total', 'status', 'criadoEm'])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.status == 'novo'
        && request.resource.data.garcom.email.lower() == request.auth.token.email.lower()
        && texto(request.resource.data.mesa, 30)
        && request.resource.data.itens is list
        && request.resource.data.itens.size() > 0
        && request.resource.data.itens.size() <= 60;
      allow read: if dono() || (logado() && resource.data.uid == request.auth.uid);
      allow update, delete: if dono();
    }

    // Dados de entrega salvos do cliente
    match /${COL_CLIENTES}/{uid} {
      allow read: if logado() && (request.auth.uid == uid || dono());
      allow create, update: if logado() && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['nome', 'telefone', 'endereco'])
        && texto(request.resource.data.nome, 80)
        && texto(request.resource.data.telefone, 20);
      // LGPD: o cliente pode apagar os próprios dados
      allow delete: if logado() && (request.auth.uid == uid || dono());
    }

    // qualquer outro caminho: fechado
    match /{caminho=**} {
      allow read, write: if false;
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
