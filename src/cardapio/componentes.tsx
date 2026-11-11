import { useEffect, useState, type ReactNode } from 'react'
import { brl } from '../pdv/dados'
import type { ItemOnline, ProdutoOnline } from '../pdv/online'

// Peças do cardápio usadas também no app do garçom.

export function Foto({ p, className = '' }: { p: Pick<ProdutoOnline, 'imagem' | 'emoji' | 'nome'>; className?: string }) {
  return p.imagem ? (
    <img src={p.imagem} alt={p.nome} className={`object-cover ${className}`} loading="lazy" />
  ) : (
    <div className={`flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100 ${className}`}>
      <span className="text-4xl">{p.emoji}</span>
    </div>
  )
}

export function CartaoProduto({ p, qtd, aoAbrir, aoMais }: { p: ProdutoOnline; qtd: number; aoAbrir: () => void; aoMais: () => void }) {
  return (
    <li className={`flex gap-3 py-4 ${p.esgotado ? 'opacity-50' : ''}`}>
      <button className="min-w-0 flex-1 text-left" onClick={aoAbrir} disabled={p.esgotado}>
        <div className="font-bold leading-snug">{p.nome}</div>
        {p.descricao && <div className="mt-0.5 line-clamp-2 text-sm text-stone-500">{p.descricao}</div>}
        {p.componentes?.length ? <div className="mt-0.5 text-xs font-semibold text-orange-700">Escolha os itens ›</div> : null}
        <div className="mt-1.5 font-extrabold text-stone-900">
          {p.esgotado ? <span className="rounded bg-stone-200 px-2 py-0.5 text-xs font-black text-stone-600">ESGOTADO</span> : brl(p.preco)}
        </div>
      </button>
      <div className="relative shrink-0">
        <button onClick={aoAbrir} disabled={p.esgotado} className="block overflow-hidden rounded-2xl">
          <Foto p={p} className={`h-24 w-24 ${p.esgotado ? 'grayscale' : ''}`} />
        </button>
        {!p.esgotado && (
          <button
            className={`absolute -bottom-2 -right-2 flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-lg font-black shadow-lg ${qtd ? 'bg-orange-600 text-white' : 'bg-white text-orange-600 ring-1 ring-stone-200'}`}
            onClick={aoMais}
            aria-label={`Adicionar ${p.nome}`}
          >
            {qtd ? qtd : '+'}
          </button>
        )}
      </div>
    </li>
  )
}

// =====================================================================================
// Folhas (bottom sheets)
// =====================================================================================

export function Folha({ titulo, aoFechar, children, rodape }: { titulo?: string; aoFechar: () => void; children: ReactNode; rodape?: ReactNode }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', t)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', t)
      document.body.style.overflow = antes
    }
  }, [aoFechar])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={aoFechar}>
      <div role="dialog" aria-label={titulo} className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {titulo && (
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
            <h2 className="text-lg font-black">{titulo}</h2>
            <button className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-xl" onClick={aoFechar} aria-label="Fechar">
              ×
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {rodape && <div className="border-t border-stone-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{rodape}</div>}
      </div>
    </div>
  )
}

export function Stepper({ valor, aoMudar, min = 0, max = 99 }: { valor: number; aoMudar: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center rounded-full bg-stone-100">
      <button className="h-10 w-10 rounded-full text-xl font-black text-orange-600 disabled:text-stone-300" disabled={valor <= min} onClick={() => aoMudar(valor - 1)} aria-label="Menos">
        −
      </button>
      <span className="w-7 text-center font-black">{valor}</span>
      <button className="h-10 w-10 rounded-full text-xl font-black text-orange-600 disabled:text-stone-300" disabled={valor >= max} onClick={() => aoMudar(valor + 1)} aria-label="Mais">
        +
      </button>
    </div>
  )
}

export function ProdutoSheet({
  p,
  aoFechar,
  aoAdicionar,
  obsRapidas,
  rotulo = 'Adicionar',
}: {
  p: ProdutoOnline
  aoFechar: () => void
  aoAdicionar: (i: ItemOnline) => void
  /** Observações de um toque (app do garçom). */
  obsRapidas?: string[]
  rotulo?: string
}) {
  const [qtd, setQtd] = useState(1)
  const [obs, setObs] = useState('')
  const [ads, setAds] = useState<string[]>([])
  const adicionais = (p.adicionais ?? []).filter((a) => ads.includes(a.id))
  const [sel, setSel] = useState<Record<string, Record<string, number>>>({})
  const comps = p.componentes ?? []
  const total = (cid: string) => Object.values(sel[cid] ?? {}).reduce((s, q) => s + q, 0)
  const completo = comps.every((c) => total(c.id) === c.qtd)
  const acrescimo = comps.reduce((s, c) => s + c.opcoes.reduce((t, o) => t + (sel[c.id]?.[o.id] ?? 0) * o.acrescimo, 0), 0)
  const unit = Math.round((p.preco + acrescimo + adicionais.reduce((s, a) => s + a.preco, 0)) * 100) / 100

  function adicionar() {
    const escolhas: NonNullable<ItemOnline['escolhas']> = []
    for (const c of comps)
      for (const o of c.opcoes) {
        const q = sel[c.id]?.[o.id] ?? 0
        if (!q) continue
        const ja = escolhas.find((e) => e.produtoId === o.id)
        if (ja) ja.qtd += q
        else escolhas.push({ produtoId: o.id, nome: o.nome, qtd: q })
      }
    aoAdicionar({
      produtoId: p.id,
      nome: p.nome,
      emoji: p.emoji,
      preco: unit,
      qtd,
      obs: obs.trim(),
      ...(escolhas.length ? { escolhas } : {}),
      ...(adicionais.length ? { adicionais } : {}),
    })
  }

  return (
    <Folha
      aoFechar={aoFechar}
      rodape={
        <div className="flex items-center gap-3">
          <Stepper valor={qtd} aoMudar={setQtd} min={1} />
          <button className="flex flex-1 items-center justify-between rounded-2xl bg-orange-600 px-5 py-3.5 font-extrabold text-white disabled:bg-stone-300" disabled={!completo} onClick={adicionar}>
            <span>{completo ? rotulo : 'Escolha os itens'}</span>
            <span>{brl(unit * qtd)}</span>
          </button>
        </div>
      }
    >
      <div className="relative">
        <Foto p={p} className="h-52 w-full" />
        <button className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-2xl shadow" onClick={aoFechar} aria-label="Fechar">
          ×
        </button>
      </div>
      <div className="p-5">
        <h2 className="text-2xl font-black">{p.nome}</h2>
        {p.descricao && <p className="mt-1 text-stone-600">{p.descricao}</p>}
        <div className="mt-2 text-xl font-black text-orange-700">{brl(p.preco)}</div>
        {comps.map((c) => (
          <div key={c.id} className="mt-5">
            <div className="flex items-center justify-between rounded-xl bg-stone-100 px-4 py-2.5">
              <div>
                <div className="font-extrabold">{c.nome}</div>
                <div className="text-xs text-stone-500">Escolha {c.qtd}</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${total(c.id) === c.qtd ? 'bg-emerald-600 text-white' : 'bg-stone-800 text-white'}`}>
                {total(c.id)}/{c.qtd}
              </span>
            </div>
            <ul className="divide-y divide-stone-100">
              {c.opcoes.map((o) => {
                const q = sel[c.id]?.[o.id] ?? 0
                const set = (v: number) => setSel((s) => ({ ...s, [c.id]: { ...(s[c.id] ?? {}), [o.id]: v } }))
                return (
                  <li key={o.id} className={`flex items-center gap-3 py-3 ${o.esgotado ? 'opacity-40' : ''}`}>
                    <span className="text-2xl">{o.emoji}</span>
                    <span className="flex-1">
                      <span className="block font-semibold">{o.nome}</span>
                      {o.acrescimo > 0 && <span className="text-sm text-stone-500">+ {brl(o.acrescimo)}</span>}
                      {o.esgotado && <span className="text-xs font-bold">esgotado</span>}
                    </span>
                    {!o.esgotado &&
                      (c.qtd === 1 ? (
                        <input
                          type="radio"
                          className="h-6 w-6 accent-orange-600"
                          checked={q === 1}
                          onChange={() => setSel((s) => ({ ...s, [c.id]: { [o.id]: 1 } }))}
                          aria-label={o.nome}
                        />
                      ) : (
                        <Stepper valor={q} aoMudar={set} max={q + (c.qtd - total(c.id))} />
                      ))}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        {p.adicionais?.length ? (
          <div className="mt-5">
            <div className="rounded-xl bg-stone-100 px-4 py-2.5">
              <div className="font-extrabold">Adicionais</div>
              <div className="text-xs text-stone-500">Opcional</div>
            </div>
            <ul className="divide-y divide-stone-100">
              {p.adicionais.map((a) => (
                <li key={a.id}>
                  <label className="flex cursor-pointer items-center gap-3 py-3">
                    <span className="flex-1 font-semibold">{a.nome}</span>
                    <span className="text-sm text-stone-500">+ {brl(a.preco)}</span>
                    <input
                      type="checkbox"
                      className="h-6 w-6 accent-orange-700"
                      checked={ads.includes(a.id)}
                      onChange={(e) => setAds((x) => (e.target.checked ? [...x, a.id] : x.filter((y) => y !== a.id)))}
                    />
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {obsRapidas?.length ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {obsRapidas.map((o) => {
              const partes = obs ? obs.split(', ').filter(Boolean) : []
              const tem = partes.includes(o)
              return (
                <button
                  key={o}
                  type="button"
                  className={`rounded-full px-3.5 py-2 text-sm font-bold ${tem ? 'bg-orange-700 text-white' : 'bg-stone-100 text-stone-700'}`}
                  onClick={() => setObs((tem ? partes.filter((x) => x !== o) : [...partes, o]).join(', '))}
                >
                  {o}
                </button>
              )
            })}
          </div>
        ) : null}
        <label className="mt-5 block">
          <span className="font-extrabold">Alguma observação?</span>
          <textarea
            className="mt-2 w-full rounded-xl border-2 border-stone-200 p-3 outline-none focus:border-orange-400"
            rows={2}
            maxLength={140}
            placeholder="Ex.: sem salada, sem cebola, bem passado…"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </label>
      </div>
    </Folha>
  )
}

