/** Lê um valor salvo no navegador (sem armazenamento ou valor corrompido, volta o padrão). */
export function lerLocal<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(chave)
    return v ? (JSON.parse(v) as T) : padrao
  } catch {
    return padrao
  }
}

/** Salva um valor no navegador. Sem armazenamento (aba anônima, cota cheia), só não fica salvo. */
export function gravarLocal(chave: string, v: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(v))
  } catch {
    // ignora
  }
}
