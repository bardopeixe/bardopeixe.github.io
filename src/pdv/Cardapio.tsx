import { useEffect, useMemo, useState } from 'react'
import { AVISO_18, adicionarCardapioCompleto, gerarImagensCardapio, imprimirImagens, montarCardapio, textoCardapio, type ModoCardapio } from './catalogo'
import { brl, type Dados } from './dados'
import { CampoTexto, btn } from './ui'

/** Cardápio pronto: imagem para enviar ao iFood/99Food, para imprimir na parede ou mandar no WhatsApp. */
export default function Cardapio({ dados }: { dados: Dados }) {
  const { produtos, config, setProdutos, setConfig } = dados
  const [painel, setPainel] = useState<'imagem' | 'itens'>('imagem')
  const [busca, setBusca] = useState('')
  const [modo, setModo] = useState<ModoCardapio>('delivery')
  const [fora, setFora] = useState<string[]>(config.espetoHoje ? [] : ['Espetos', 'Combos e jantinhas'])
  const [titulo, setTitulo] = useState('Cardápio')
  const [comEmoji, setComEmoji] = useState(false)
  const [imagens, setImagens] = useState<string[]>([])
  const [copiado, setCopiado] = useState(false)

  // com os itens tirados/esgotados, para a lista de marcar
  const todas = useMemo(() => montarCardapio(produtos, config, modo, [], true), [produtos, config, modo])
  // só o que vai na imagem/texto
  const secoes = useMemo(() => montarCardapio(produtos, config, modo, fora), [produtos, config, modo, fora])
  const tirados = todas.reduce((s, x) => s + x.itens.filter((i) => i.oculto).length, 0)
  const esgotados = todas.reduce((s, x) => s + x.itens.filter((i) => i.esgotado && !i.oculto).length, 0)
  const sem = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const termos = sem(busca).split(/\s+/).filter(Boolean)

  function alternar(id: string) {
    setProdutos((ps) => ps.map((p) => (p.id === id ? { ...p, foraDoCardapio: p.foraDoCardapio ? undefined : true } : p)))
  }
  function voltarTodos() {
    setProdutos((ps) => ps.map((p) => (p.foraDoCardapio ? { ...p, foraDoCardapio: undefined } : p)))
  }
  const totalItens = secoes.reduce((s, x) => s + x.itens.length, 0)
  const semDetalhe = secoes.reduce((s, x) => s + x.itens.filter((i) => !i.detalhe).length, 0)

  useEffect(() => {
    const t = setTimeout(() => setImagens(secoes.length ? gerarImagensCardapio(secoes, config, titulo, comEmoji) : []), 150)
    return () => clearTimeout(t)
  }, [secoes, config, titulo, comEmoji])

  function baixar() {
    imagens.forEach((src, i) => {
      const a = document.createElement('a')
      a.href = src
      a.download = imagens.length > 1 ? `cardapio-${i + 1}.png` : 'cardapio.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
    })
  }

  async function copiar() {
    const txt = textoCardapio(secoes, config, titulo)
    try {
      await navigator.clipboard.writeText(txt)
    } catch {
      prompt('Copie o cardápio:', txt)
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">📋 Cardápio</h1>
          <p className="text-stone-600">Gerado dos seus produtos: imagem para o iFood/99Food, para imprimir ou mandar no WhatsApp.</p>
        </div>
        <button
          className={btn.secundario}
          onClick={() => {
            if (!confirm('Adicionar o cardápio completo de adega? (cervejas: latinha 269, lata 350, latão 473, barrigudinha 300, long neck, 600 ml e litrão; fardos, doses, destilados, refrigerantes, energéticos, gelo, carvão e petiscos)\n\nNão duplica o que você já tem e não muda seus preços. Os preços novos são uma base — ajuste para a sua região.')) return
            const n = adicionarCardapioCompleto(dados)
            alert(`Pronto! Catálogo com ${n} itens conferido. Ajuste preços e custos em Cadastros e desative o que você não vende.`)
          }}
        >
          🍻 Adicionar cardápio completo de adega
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 font-bold">
              {(['delivery', 'balcao'] as ModoCardapio[]).map((m) => (
                <button key={m} onClick={() => setModo(m)} className={`rounded-lg py-2 ${modo === m ? 'bg-white shadow' : 'text-stone-500'}`}>
                  {m === 'delivery' ? '🛵 iFood / 99Food' : '🏪 Balcão'}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-stone-500">
              {modo === 'delivery'
                ? `Preços do app: preço do balcão + ${config.acrescimoDelivery}% (ou o preço próprio do produto). Muda em Configurações.`
                : 'Preços de balcão (os mesmos da tela de venda).'}
            </p>
            <CampoTexto className="mt-3" rotulo="Título" valor={titulo} aoMudar={setTitulo} placeholder="Cardápio" />
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={comEmoji} onChange={(e) => setComEmoji(e.target.checked)} />
              Mostrar emojis nos itens
            </label>
          </section>

          <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
            <h2 className="font-extrabold">Seções</h2>
            <ul className="mt-2 space-y-1">
              {todas.map((s) => (
                <li key={s.nome}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!fora.includes(s.nome)}
                      onChange={(e) => setFora((f) => (e.target.checked ? f.filter((x) => x !== s.nome) : [...f, s.nome]))}
                    />
                    <span className="flex-1 font-semibold">{s.nome}</span>
                    <span className="text-sm text-stone-500">{s.itens.filter((i) => !i.oculto).length}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-stone-500">
              Acabou algo? Use “✅ Tirar / voltar itens”. Para tirar só do delivery, ou mudar a seção, descrição e tamanho: Cadastros → produto → “📋 Cardápio e delivery”.
            </p>
          </section>

          <section className="space-y-2 rounded-2xl border-2 border-stone-200 bg-white p-4">
            <button className={`${btn.primario} w-full`} disabled={!imagens.length} onClick={baixar}>
              ⬇️ Baixar {imagens.length > 1 ? `imagens (${imagens.length})` : 'imagem'}
            </button>
            <button className={`${btn.secundario} w-full`} disabled={!imagens.length} onClick={() => imprimirImagens(imagens, titulo)}>
              🖨️ Imprimir / salvar PDF
            </button>
            <button className={`${btn.secundario} w-full`} disabled={!secoes.length} onClick={copiar}>
              {copiado ? '✔ Copiado!' : '💬 Copiar texto (WhatsApp)'}
            </button>
            <p className="text-sm text-stone-600">
              {totalItens} itens em {secoes.length} seções.
              {semDetalhe > 0 && <span className="font-semibold text-amber-700"> {semDetalhe} sem tamanho/descrição — o iFood pede ml/litros e marca.</span>}
            </p>
          </section>

          <section className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <h2 className="font-extrabold">Como mandar para o iFood</h2>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>No modo 🛵, baixe a imagem do cardápio.</li>
              <li>No Portal do Parceiro, em “Escolha as imagens do cardápio”, envie a(s) imagem(ns) — é o cardápio inteiro, não fotos de produto.</li>
              <li>Confira o que a inteligência do iFood leu e cadastre as fotos dos produtos depois.</li>
              <li>Marque as bebidas alcoólicas como +18 no iFood. {AVISO_18}</li>
            </ol>
            <p className="mt-2">
              No 99Food o cardápio é cadastrado pelo app/portal deles — use a imagem ou o texto como base. Pedidos que chegarem pelos apps: lance na venda com o botão
              🛵 iFood/99Food para baixar o estoque e descontar a comissão do lucro.
            </p>
          </section>
        </div>

        <section className="min-w-0 rounded-2xl border-2 border-stone-200 bg-stone-100 p-3">
          <div className="mx-auto mb-3 grid max-w-xl grid-cols-2 gap-1 rounded-xl bg-white p-1 font-bold">
            <button onClick={() => setPainel('imagem')} className={`rounded-lg py-2 ${painel === 'imagem' ? 'bg-stone-900 text-white' : 'text-stone-500'}`}>
              🖼️ Como fica
            </button>
            <button onClick={() => setPainel('itens')} className={`rounded-lg py-2 ${painel === 'itens' ? 'bg-stone-900 text-white' : 'text-stone-500'}`}>
              ✅ Tirar / voltar itens{tirados > 0 ? ` (${tirados} fora)` : ''}
            </button>
          </div>

          {painel === 'itens' ? (
            <div className="mx-auto max-w-xl space-y-3">
              <div className="space-y-2 rounded-xl bg-white p-3">
                <input
                  className="w-full rounded-xl border-2 border-stone-200 px-3 py-2 outline-none focus:border-orange-500"
                  placeholder="🔎 Procurar (ex.: skol)"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={!!config.cardapioSemEsgotados} onChange={(e) => setConfig({ ...config, cardapioSemEsgotados: e.target.checked })} />
                  Tirar sozinho o que está sem estoque{esgotados > 0 ? ` (${esgotados} agora)` : ''}
                </label>
                {tirados > 0 && (
                  <button className="text-sm font-bold text-emerald-700" onClick={voltarTodos}>
                    ↩ Voltar todos os {tirados} itens tirados
                  </button>
                )}
                <p className="text-xs text-stone-500">Tirar do cardápio não tira da venda. No iFood/99Food, pause o item também no portal do app.</p>
              </div>
              {todas.map((s) => {
                const itens = s.itens.filter((i) => termos.every((t) => sem(i.nome).includes(t)))
                if (!itens.length) return null
                return (
                  <div key={s.nome} className={`rounded-xl bg-white p-3 ${fora.includes(s.nome) ? 'opacity-50' : ''}`}>
                    <div className="mb-1 font-extrabold text-orange-700">
                      {s.nome}
                      {fora.includes(s.nome) && <span className="ml-2 text-xs font-semibold text-stone-500">(seção desligada)</span>}
                    </div>
                    <ul>
                      {itens.map((it) => {
                        const somePorEstoque = !it.oculto && it.esgotado && !!config.cardapioSemEsgotados
                        const aparece = !it.oculto && !somePorEstoque
                        return (
                          <li key={it.id} className="flex items-center gap-2 border-b border-stone-100 py-1.5 last:border-0">
                            <span className="min-w-0 flex-1">
                              <span className={aparece ? '' : 'text-stone-400 line-through'}>
                                {it.emoji} {it.nome}
                              </span>
                              {it.esgotado && <span className="ml-1 rounded bg-red-100 px-1.5 text-xs font-bold text-red-700">sem estoque</span>}
                            </span>
                            <span className="text-sm font-semibold text-stone-600">{brl(it.preco)}</span>
                            <button
                              onClick={() => alternar(it.id)}
                              className={`w-24 shrink-0 rounded-lg py-1.5 text-sm font-bold ${it.oculto ? 'bg-red-600 text-white' : 'bg-emerald-100 text-emerald-800'}`}
                              title={it.oculto ? 'Voltar para o cardápio' : 'Tirar do cardápio'}
                            >
                              {it.oculto ? '✗ Fora' : '✓ No cardápio'}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          ) : !secoes.length ? (
            <p className="p-8 text-center text-stone-500">Nenhum produto ativo com preço nas seções escolhidas.</p>
          ) : (
            <div className="space-y-3">
              {imagens.map((src, i) => (
                <img key={i} src={src} alt={`Cardápio página ${i + 1}`} className="mx-auto w-full max-w-xl rounded-lg shadow" />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
