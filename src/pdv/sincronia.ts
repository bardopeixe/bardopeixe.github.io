import { novoId } from './dados'

/**
 * Peças comuns da sincronização (planilha e pasta do Drive).
 * - aparelho(): identifica este computador, para não "atualizar" com os próprios dados.
 * - silenciarMudanca(): quando os dados chegam de fora, nenhuma das sincronizações deve tratar
 *   isso como mudança local e reenviar — senão dois computadores ficariam se atualizando sem parar.
 */

const CHAVE_APARELHO = 'espeto:aparelho'

export function aparelho() {
  try {
    let id = localStorage.getItem(CHAVE_APARELHO)
    if (!id) {
      id = `${navigator.platform || 'aparelho'}-${novoId().slice(0, 6)}`
      localStorage.setItem(CHAVE_APARELHO, id)
    }
    return id
  } catch {
    return 'aparelho'
  }
}

let silencioAte = 0
export function silenciarMudanca() {
  silencioAte = Date.now() + 2000
}
export const silenciado = () => Date.now() < silencioAte

/** O aparelho ainda não tem nada de importante (sem vendas nem caixas) — pode receber dados de fora sem perguntar. */
export const aparelhoVazio = (d: { pedidos: unknown[]; caixas: unknown[]; comandas: unknown[] }) =>
  d.pedidos.length === 0 && d.caixas.length === 0 && d.comandas.length === 0
