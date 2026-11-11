import { arred, novoId, taxaDaForma } from './dados'
import type { Caixa, Comanda, Config, ItemComanda, ItemPedido, Pagamento, Pedido } from './tipos'

/**
 * Regras da comanda (mesa que vai pedindo aos poucos):
 * - os itens saem do estoque quando são lançados (vão para a brasa);
 * - cada pagamento vira um pedido no caixa aberto, com os itens (ou frações deles) que quitou;
 * - quanto falta de cada item é calculado pelos pagamentos não cancelados — cancelar um pagamento reabre a conta.
 */

const EPS = 0.0005

/** Quanto de cada item da comanda já foi pago. */
export function pagoPorItem(c: Comanda, pedidos: Pedido[]) {
  const m: Record<string, number> = {}
  for (const p of pedidos) {
    if (p.comandaId !== c.id || p.cancelado) continue
    for (const i of p.itens) if (i.comandaItemId) m[i.comandaItemId] = (m[i.comandaItemId] ?? 0) + i.qtd
  }
  return m
}

export function restantes(c: Comanda, pedidos: Pedido[]) {
  const pago = pagoPorItem(c, pedidos)
  return c.itens.map((i) => ({ item: i, pago: pago[i.id] ?? 0, falta: Math.max(0, i.qtd - (pago[i.id] ?? 0)) }))
}

export function totalComanda(c: Comanda) {
  return arred(c.itens.reduce((s, i) => s + i.preco * i.qtd, 0))
}

/**
 * Quanto falta pagar, em dinheiro: consumo total − o que já foi cobrado (antes de desconto).
 * Calculado pelo dinheiro e não pelas frações dos itens, para a conta dividida fechar no centavo (50 ÷ 3 = 16,67 + 16,67 + 16,66).
 */
export function saldoComanda(c: Comanda, pedidos: Pedido[]) {
  // cortesia: os itens ficam quitados pelo valor que teriam (sem entrar dinheiro)
  const cobrado = pedidos.filter((p) => p.comandaId === c.id && !p.cancelado).reduce((s, p) => s + (p.cortesia ? p.cortesia.valor : p.subtotal), 0)
  return Math.max(0, arred(totalComanda(c) - cobrado))
}

export function pagamentosDaComanda(c: Comanda, pedidos: Pedido[]) {
  return pedidos.filter((p) => p.comandaId === c.id && !p.cancelado)
}

export type StatusComanda = 'aberta' | 'paga' | 'cancelada'
export function statusComanda(c: Comanda, pedidos: Pedido[]): StatusComanda {
  if (c.canceladaEm) return 'cancelada'
  if (c.itens.length === 0) return 'aberta'
  return saldoComanda(c, pedidos) > 0.004 ? 'aberta' : 'paga'
}

export const rotuloComanda = (c: Pick<Comanda, 'mesa' | 'nome'>) =>
  [c.mesa ? (/^\d+$/.test(c.mesa.trim()) ? `Mesa ${c.mesa.trim()}` : c.mesa.trim()) : '', c.nome.trim()].filter(Boolean).join(' · ') || 'Sem nome'

/** Partes já pagas da divisão atual. */
export function partesPagas(c: Comanda, pedidos: Pedido[]) {
  if (!c.divisao) return 0
  return pedidos.filter((p) => p.comandaId === c.id && !p.cancelado && p.divisaoId === c.divisao!.id).length
}

/**
 * Próxima parte da conta dividida: cada pessoa que falta paga uma fração igual do que falta de cada item.
 * A última parte leva o resto exato (os centavos fecham certinho).
 */
export function proximaParte(c: Comanda, pedidos: Pedido[]) {
  if (!c.divisao) return null
  const pagas = partesPagas(c, pedidos)
  const faltam = c.divisao.pessoas - pagas
  if (faltam <= 0) return null
  const ultima = faltam === 1
  const alocacao = restantes(c, pedidos)
    .filter((r) => r.falta > EPS)
    .map((r) => ({ item: r.item, qtd: ultima ? r.falta : Math.round((r.falta / faltam) * 10000) / 10000 }))
  const valor = ultima ? saldoComanda(c, pedidos) : arred(saldoComanda(c, pedidos) / faltam)
  // número da pessoa: o primeiro que ainda não pagou (se um pagamento foi estornado, ele volta a valer)
  const usados = new Set(
    pedidos.filter((p) => p.comandaId === c.id && !p.cancelado && p.divisaoId === c.divisao!.id).map((p) => Number(p.parte?.split('/')[0])),
  )
  let numero = 1
  while (usados.has(numero)) numero++
  return { alocacao, valor, numero, de: c.divisao.pessoas }
}

export function criarPedidoDaComanda(args: {
  comanda: Comanda
  alocacao: { item: ItemComanda; qtd: number }[]
  /** Valor a cobrar (ao dividir pode diferir centavos da soma dos itens). */
  valor: number
  desconto: number
  pagamentos: Pagamento[]
  recebidoDinheiro: number
  caixa: Caixa
  pedidos: Pedido[]
  config: Config
  parte?: { divisaoId: string; texto: string }
}): Pedido {
  const { comanda, alocacao, valor, desconto, pagamentos, recebidoDinheiro, caixa, pedidos, config, parte } = args
  const itens: ItemPedido[] = alocacao
    .filter((a) => a.qtd > EPS)
    .map((a) => ({
      produtoId: a.item.produtoId,
      nome: a.item.nome,
      categoria: a.item.categoria,
      emoji: a.item.emoji,
      preco: a.item.preco,
      custo: a.item.custo,
      qtd: a.qtd,
      obs: a.item.obs,
      ...(a.item.escolhas?.length ? { escolhas: a.item.escolhas } : {}),
      comandaItemId: a.item.id,
    }))
  const subtotal = arred(valor)
  const total = arred(subtotal - desconto)
  const emDinheiro = pagamentos.filter((p) => p.forma === 'dinheiro').reduce((s, p) => s + p.valor, 0)
  return {
    id: novoId(),
    numero: pedidos.filter((p) => p.caixaId === caixa.id).reduce((m, p) => Math.max(m, p.numero), 0) + 1,
    caixaId: caixa.id,
    criadoEm: new Date().toISOString(),
    cliente: `${rotuloComanda(comanda)} (comanda ${comanda.numero})`,
    viagem: false,
    itens,
    subtotal,
    desconto,
    total,
    pagamentos: pagamentos.filter((p) => p.valor > 0),
    recebidoDinheiro: recebidoDinheiro > 0 ? recebidoDinheiro : 0,
    troco: recebidoDinheiro > emDinheiro ? arred(recebidoDinheiro - emDinheiro) : 0,
    taxas: arred(pagamentos.reduce((s, p) => s + (p.valor * taxaDaForma(p.forma, config)) / 100, 0)),
    custoTotal: arred(itens.reduce((s, i) => s + i.custo * i.qtd, 0)),
    cancelado: false,
    // já foi servido quando foi lançado na comanda
    entregue: true,
    comandaId: comanda.id,
    ...(parte ? { divisaoId: parte.divisaoId, parte: parte.texto } : {}),
  }
}

/** Mostra quantidades com fração de forma curta: 2, 0,5, 0,33. */
export const fmtQtd = (q: number) => (Math.abs(q - Math.round(q)) < EPS ? String(Math.round(q)) : (Math.round(q * 100) / 100).toLocaleString('pt-BR'))
