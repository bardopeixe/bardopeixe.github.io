/**
 * Conectar outro aparelho (celular) à mesma planilha com um QR code/link:
 * o link leva o endereço do Apps Script e a chave; ao abrir, o PDV pergunta e configura sozinho.
 */

/** Endereço público do PDV (usado quando o sistema está aberto como arquivo no computador). */
export const SITE_PDV = 'https://plisselab.github.io/pdv/'

export function linkConectar(url: string, chave: string) {
  const base = location.protocol.startsWith('http') ? `${location.origin}${location.pathname}` : SITE_PDV
  const dados = btoa(JSON.stringify({ u: url, k: chave }))
  return `${base}?conectar=${encodeURIComponent(dados)}`
}

export function lerConexaoDaUrl(): { url: string; chave: string } | null {
  try {
    const v = new URLSearchParams(location.search).get('conectar')
    if (!v) return null
    const o = JSON.parse(atob(v))
    return typeof o.u === 'string' && typeof o.k === 'string' ? { url: o.u, chave: o.k } : null
  } catch {
    return null
  }
}

/** Tira o ?conectar= do endereço (para não ficar no histórico nem ser compartilhado sem querer). */
export function limparUrl() {
  try {
    history.replaceState(null, '', location.pathname + location.hash)
  } catch {
    // ignora
  }
}

// ---- instalar como aplicativo (Android/Chrome oferecem o evento; no iPhone é pelo menu Compartilhar) ----
type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let eventoInstalar: EventoInstalar | null = null
const ouvintes = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    eventoInstalar = e as EventoInstalar
    ouvintes.forEach((f) => f())
  })
  window.addEventListener('appinstalled', () => {
    eventoInstalar = null
    ouvintes.forEach((f) => f())
  })
}
export function assinarInstalar(f: () => void) {
  ouvintes.add(f)
  return () => {
    ouvintes.delete(f)
  }
}
export const podeInstalar = () => !!eventoInstalar
export async function instalarApp() {
  if (!eventoInstalar) return
  await eventoInstalar.prompt()
  eventoInstalar = null
  ouvintes.forEach((f) => f())
}
/** Já está aberto como aplicativo instalado (tela cheia)? */
export const rodandoComoApp = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
