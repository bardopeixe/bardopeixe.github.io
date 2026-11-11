import { useEffect, useState, type ReactNode } from 'react'

export function Modal({
  titulo,
  aberto,
  aoFechar,
  children,
  largo,
}: {
  titulo: string
  aberto: boolean
  aoFechar: () => void
  children: ReactNode
  largo?: boolean
}) {
  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aberto, aoFechar])
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={aoFechar}>
      <div
        role="dialog"
        aria-label={titulo}
        className={`max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-6 ${largo ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-extrabold text-stone-900">{titulo}</h2>
          <button onClick={aoFechar} className="rounded-full p-2 text-2xl leading-none text-stone-500 hover:bg-stone-100" aria-label="Fechar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function lerNumero(t: string) {
  const n = parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? n : 0
}

/** Campo numérico que aceita vírgula (padrão brasileiro). */
export function CampoNumero({
  valor,
  aoMudar,
  rotulo,
  prefixo,
  sufixo,
  className = '',
  grande,
  autoFocus,
  min = 0,
}: {
  valor: number
  aoMudar: (v: number) => void
  rotulo?: string
  prefixo?: string
  sufixo?: string
  className?: string
  grande?: boolean
  autoFocus?: boolean
  min?: number
}) {
  const formatar = (v: number) => (v === 0 ? '' : String(v).replace('.', ','))
  const [texto, setTexto] = useState(formatar(valor))
  useEffect(() => {
    const atual = lerNumero(texto)
    if (atual !== valor) setTexto(formatar(valor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])
  return (
    <label className={`block ${className}`}>
      {rotulo && <span className="mb-1 block text-sm font-semibold text-stone-600">{rotulo}</span>}
      <span className="flex items-center rounded-xl border-2 border-stone-200 bg-white focus-within:border-orange-500">
        {prefixo && <span className="pl-3 font-semibold text-stone-500">{prefixo}</span>}
        <input
          inputMode="decimal"
          autoFocus={autoFocus}
          className={`w-full min-w-0 rounded-xl bg-transparent px-3 outline-none ${grande ? 'py-3 text-2xl font-bold' : 'py-2 text-base'}`}
          value={texto}
          placeholder="0"
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d.,]/g, '')
            setTexto(t)
            aoMudar(Math.max(min, lerNumero(t)))
          }}
        />
        {sufixo && <span className="pr-3 font-semibold text-stone-500">{sufixo}</span>}
      </span>
    </label>
  )
}

export function CampoTexto({
  valor,
  aoMudar,
  rotulo,
  placeholder,
  className = '',
}: {
  valor: string
  aoMudar: (v: string) => void
  rotulo?: string
  placeholder?: string
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      {rotulo && <span className="mb-1 block text-sm font-semibold text-stone-600">{rotulo}</span>}
      <input
        className="w-full rounded-xl border-2 border-stone-200 bg-white px-3 py-2 outline-none focus:border-orange-500"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => aoMudar(e.target.value)}
      />
    </label>
  )
}

export function Cartao({ titulo, valor, detalhe, cor = 'stone' }: { titulo: string; valor: ReactNode; detalhe?: ReactNode; cor?: 'stone' | 'verde' | 'vermelho' | 'laranja' | 'azul' }) {
  const cores = {
    stone: 'bg-white border-stone-200',
    verde: 'bg-emerald-50 border-emerald-200',
    vermelho: 'bg-red-50 border-red-200',
    laranja: 'bg-orange-50 border-orange-200',
    azul: 'bg-sky-50 border-sky-200',
  }
  return (
    <div className={`rounded-2xl border-2 p-4 ${cores[cor]}`}>
      <div className="text-sm font-semibold text-stone-600">{titulo}</div>
      <div className="mt-1 text-2xl font-extrabold text-stone-900">{valor}</div>
      {detalhe && <div className="mt-1 text-sm text-stone-600">{detalhe}</div>}
    </div>
  )
}

export function Imagem({ emoji, imagem, className = '' }: { emoji: string; imagem?: string; className?: string }) {
  return imagem ? (
    <img src={imagem} alt="" className={`object-cover ${className}`} />
  ) : (
    <span className={`flex items-center justify-center ${className}`} aria-hidden>
      {emoji || '🍢'}
    </span>
  )
}

export const btn = {
  primario:
    'rounded-xl bg-orange-600 px-4 py-3 font-bold text-white shadow hover:bg-orange-700 active:scale-[.98] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none',
  secundario:
    'rounded-xl border-2 border-stone-200 bg-white px-4 py-2 font-semibold text-stone-700 hover:bg-stone-50 active:scale-[.98] disabled:opacity-50',
  perigo: 'rounded-xl border-2 border-red-200 bg-white px-4 py-2 font-semibold text-red-700 hover:bg-red-50 active:scale-[.98]',
  verde:
    'rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white shadow hover:bg-emerald-700 active:scale-[.98] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none',
}
