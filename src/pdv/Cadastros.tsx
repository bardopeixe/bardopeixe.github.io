import { useEffect, useState } from 'react'
import {
  CATEGORIAS,
  NOMES_CATEGORIA,
  NOMES_UNIDADE,
  arred,
  buscarProdutos,
  brl,
  custoCompleto,
  custoItemFicha,
  custoProduto,
  custoUnitarioInsumo,
  novoId,
  pct,
  reduzirImagem,
  unidadeFicha,
  type Dados,
} from './dados'
import type { Insumo, Produto, Unidade } from './tipos'
import { CampoNumero, CampoTexto, Imagem, Modal, btn } from './ui'
import { ModalVenderEmDoses } from './Compras'

const EMOJIS = ['🍛', '🍱', '🍢', '🥩', '🍗', '🌭', '🧀', '❤️', '🧅', '🫑', '🍖', '🥓', '🍤', '🧄', '🍞', '🥣', '🍚', '🥗', '🥤', '🍺', '💧', '🧃', '🍹', '🍫', '🍬', '⭐']

export default function Cadastros({ dados }: { dados: Dados }) {
  const [aba, setAba] = useState<'produtos' | 'insumos'>('produtos')
  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(['produtos', 'insumos'] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`rounded-full px-5 py-2 font-bold ${aba === a ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 ring-2 ring-stone-200'}`}
          >
            {a === 'produtos' ? 'Produtos (espetos e bebidas)' : 'Insumos (gastos)'}
          </button>
        ))}
      </div>
      {aba === 'produtos' ? <Produtos dados={dados} /> : <Insumos dados={dados} />}
    </div>
  )
}

const GRUPOS_SUGERIDOS = ['Carnes', 'Acompanhamentos', 'Temperos', 'Embalagens', 'Espeto', 'Bebidas', 'Limpeza', 'Outros']

function Insumos({ dados }: { dados: Dados }) {
  const { insumos, setInsumos, produtos, config } = dados
  const [novo, setNovo] = useState<Insumo | null>(null)
  const atualizar = (id: string, m: Partial<Insumo>) => setInsumos((is) => is.map((i) => (i.id === id ? { ...i, ...m } : i)))
  const usadoEm = (id: string) => [
    ...produtos.filter((p) => p.ficha.some((f) => f.insumoId === id)).map((p) => p.nome),
    ...(config.regrasViagem.some((r) => r.insumoId === id) ? ['pedidos para viagem'] : []),
  ]
  const grupos = [...new Set([...insumos.map((i) => i.grupo?.trim() || 'Outros')])].sort((a, b) => {
    const ia = GRUPOS_SUGERIDOS.indexOf(a)
    const ib = GRUPOS_SUGERIDOS.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })
  const todosGrupos = [...new Set([...GRUPOS_SUGERIDOS, ...grupos])]

  function salvarNovo(i: Insumo) {
    setInsumos((is) => [...is, { ...i, nome: i.nome.trim(), grupo: i.grupo?.trim() || undefined }])
    setNovo(null)
  }

  return (
    <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
      <datalist id="grupos-insumo">
        {todosGrupos.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold">Insumos</h2>
          <p className="text-sm text-stone-600">
            Tudo que você compra: carnes, temperos, palitos, saquinho térmico, marmitex, carvão… Ex.: paguei <b>R$ 30</b> em <b>100</b> saquinhos → custa{' '}
            <b>R$ 0,30</b> cada. Mudou o preço? Edite aqui e o custo dos produtos é recalculado.
          </p>
        </div>
        <button
          className={btn.primario}
          onClick={() => setNovo({ id: novoId(), nome: '', unidade: 'un', precoCompra: 0, qtdCompra: 1, grupo: '' })}
        >
          + Novo insumo
        </button>
      </div>

      {grupos.map((g) => (
        <div key={g} className="mt-5">
          <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-stone-500">{g}</h3>
          <div className="space-y-3">
            {insumos
              .filter((i) => (i.grupo?.trim() || 'Outros') === g)
              .map((i) => {
                const usos = usadoEm(i.id)
                return (
                  <div key={i.id} className="grid grid-cols-2 items-end gap-2 rounded-xl border-2 border-stone-100 p-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto]">
                    <CampoTexto className="col-span-2 md:col-span-1" rotulo="Insumo" valor={i.nome} aoMudar={(v) => atualizar(i.id, { nome: v })} />
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-stone-600">Grupo</span>
                      <input
                        list="grupos-insumo"
                        className="w-full rounded-xl border-2 border-stone-200 bg-white px-2 py-2 outline-none focus:border-orange-500"
                        value={i.grupo ?? ''}
                        placeholder="Outros"
                        onChange={(e) => atualizar(i.id, { grupo: e.target.value })}
                      />
                    </label>
                    <SeletorUnidade valor={i.unidade} aoMudar={(u) => atualizar(i.id, { unidade: u })} />
                    <CampoNumero rotulo="Paguei" prefixo="R$" valor={i.precoCompra} aoMudar={(v) => atualizar(i.id, { precoCompra: v })} />
                    <CampoNumero rotulo="Na compra veio" sufixo={i.unidade} valor={i.qtdCompra} aoMudar={(v) => atualizar(i.id, { qtdCompra: v })} />
                    <div className="pb-2">
                      <div className="text-sm font-semibold text-stone-600">Custo</div>
                      <div className="font-extrabold">
                        {brl(custoUnitarioInsumo(i))}/{i.unidade}
                      </div>
                    </div>
                    <button
                      className="pb-2 text-2xl text-stone-400 hover:text-red-600"
                      title="Excluir"
                      onClick={() => {
                        if (usos.length && !confirm(`"${i.nome}" é usado em: ${usos.join(', ')}. Excluir mesmo assim?`)) return
                        if (!usos.length && !confirm(`Excluir "${i.nome}"?`)) return
                        setInsumos((is) => is.filter((x) => x.id !== i.id))
                        if (config.regrasViagem.some((r) => r.insumoId === i.id))
                          dados.setConfig((c) => ({ ...c, regrasViagem: c.regrasViagem.filter((r) => r.insumoId !== i.id) }))
                      }}
                    >
                      ×
                    </button>
                    <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                      <label className="flex items-center gap-1.5 font-semibold text-stone-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-orange-600"
                          checked={i.estoque !== undefined}
                          onChange={(e) => atualizar(i.id, { estoque: e.target.checked ? 0 : undefined })}
                        />
                        Controlar estoque
                        {i.estoque !== undefined && (
                          <span className="font-normal text-stone-500">
                            {' '}
                            (tem {i.estoque.toLocaleString('pt-BR')} {i.unidade} — lance entradas na aba Estoque)
                          </span>
                        )}
                      </label>
                      {usos.length > 0 && <span>Usado em: {usos.join(', ')}</span>}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      ))}

      {novo && (
        <Modal titulo="Novo insumo" aberto aoFechar={() => setNovo(null)}>
          <div className="space-y-3">
            <CampoTexto rotulo="Nome" valor={novo.nome} aoMudar={(v) => setNovo({ ...novo, nome: v })} placeholder="Ex.: Saquinho térmico grande, Carvão, Pimenta…" />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-stone-600">Grupo</span>
                <input
                  list="grupos-insumo"
                  className="w-full rounded-xl border-2 border-stone-200 bg-white px-3 py-2 outline-none focus:border-orange-500"
                  value={novo.grupo ?? ''}
                  placeholder="Ex.: Embalagens"
                  onChange={(e) => setNovo({ ...novo, grupo: e.target.value })}
                />
              </label>
              <SeletorUnidade valor={novo.unidade} aoMudar={(u) => setNovo({ ...novo, unidade: u })} />
              <CampoNumero rotulo="Quanto pagou" prefixo="R$" valor={novo.precoCompra} aoMudar={(v) => setNovo({ ...novo, precoCompra: v })} />
              <CampoNumero rotulo="Quanto veio" sufixo={novo.unidade} valor={novo.qtdCompra} aoMudar={(v) => setNovo({ ...novo, qtdCompra: v })} />
            </div>
            <p className="rounded-xl bg-stone-100 p-2 text-center">
              Custo: <b>{brl(custoUnitarioInsumo(novo))}</b> por {novo.unidade}
            </p>
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="h-5 w-5 accent-orange-600"
                checked={novo.estoque !== undefined}
                onChange={(e) => setNovo({ ...novo, estoque: e.target.checked ? 0 : undefined })}
              />
              Controlar estoque
            </label>
            {novo.estoque !== undefined && (
              <CampoNumero rotulo="Quanto tem agora" sufixo={novo.unidade} valor={novo.estoque} aoMudar={(v) => setNovo({ ...novo, estoque: v })} />
            )}
            <p className="text-xs text-stone-500">
              Depois de salvar, use o insumo na ficha de um produto (Cadastros → Produtos → Editar) ou como embalagem para viagem (Config).
            </p>
          </div>
          <button className={`${btn.primario} mt-4 w-full`} disabled={!novo.nome.trim()} onClick={() => salvarNovo(novo)}>
            Salvar insumo
          </button>
        </Modal>
      )}
    </section>
  )
}

function SeletorUnidade({ valor, aoMudar }: { valor: Unidade; aoMudar: (u: Unidade) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-stone-600">Unidade</span>
      <select className="w-full rounded-xl border-2 border-stone-200 bg-white px-2 py-2" value={valor} onChange={(e) => aoMudar(e.target.value as Unidade)}>
        {(Object.keys(NOMES_UNIDADE) as Unidade[]).map((u) => (
          <option key={u} value={u}>
            {NOMES_UNIDADE[u]}
          </option>
        ))}
      </select>
    </label>
  )
}

function Produtos({ dados }: { dados: Dados }) {
  const { produtos, setProdutos, insumos } = dados
  const [editando, setEditando] = useState<Produto | null>(null)
  const [emDoses, setEmDoses] = useState<Produto | null>(null)
  const [novaDose, setNovaDose] = useState(false)
  const [copao, setCopao] = useState(false)
  const [fardo, setFardo] = useState(false)
  const [busca, setBusca] = useState('')
  const listados = new Set(buscarProdutos(produtos, busca).map((p) => p.id))
  const temAdega = produtos.some((p) => p.id.startsWith('adega-'))
  const temBar = produtos.some((p) => p.id.startsWith('bar-'))

  const mover = (idx: number, d: number) =>
    setProdutos((ps) => {
      const n = ps.slice()
      const j = idx + d
      if (j < 0 || j >= n.length) return ps
      ;[n[idx], n[j]] = [n[j], n[idx]]
      return n
    })

  function salvar(p: Produto) {
    setProdutos((ps) => (ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? p : x)) : [...ps, p]))
    setEditando(null)
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <input
            className="w-64 max-w-full rounded-xl border-2 border-stone-200 bg-white px-3 py-2"
            placeholder="🔎 Buscar produto ou código…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <p className="text-sm text-stone-600">A ordem aqui é a ordem dos botões na tela de venda.</p>
        </div>
        <div className="flex flex-wrap gap-2">
        {!temAdega && (
          <button
            className={btn.secundario}
            onClick={() => {
              if (!confirm('Adicionar exemplos de adega? (cervejas, refrigerantes, energético, água, gelo e carvão, com fardos — dá para editar ou excluir depois)'))
                return
              adicionarExemplosAdega(dados)
            }}
          >
            🍺 Exemplos de adega
          </button>
        )}
        <button className={btn.secundario} onClick={() => setFardo(true)}>
          📦 Criar fardo
        </button>
        <button className={btn.secundario} onClick={() => setEditando(espetoNoPao(dados))}>
          🥖 Espeto no pão
        </button>
        {!temBar && (
          <button
            className={btn.secundario}
            onClick={() => {
              if (!confirm('Adicionar exemplos de bar? (cachaça, vodka, whisky, chopp, caipirinha… — dá para editar ou excluir depois)')) return
              adicionarExemplosBar(dados)
            }}
          >
            🍹 Exemplos de bar
          </button>
        )}
        <button className={btn.secundario} onClick={() => setNovaDose(true)}>
          🥃 Nova dose / drink
        </button>
        <button className={btn.secundario} onClick={() => setCopao(true)}>
          🥤 Montar copões
        </button>
        <button
          className={btn.primario}
          onClick={() =>
            setEditando({ id: novoId(), nome: '', categoria: 'espeto', preco: 0, emoji: '🍢', ficha: [], custoDireto: 0, ativo: true, estoque: 0 })
          }
        >
          + Novo produto
        </button>
        </div>
      </div>
      {novaDose && <ModalDose dados={dados} aoFechar={() => setNovaDose(false)} />}
      {copao && <ModalCopao dados={dados} aoFechar={() => setCopao(false)} />}
      {fardo && <ModalFardo dados={dados} aoFechar={() => setFardo(false)} />}
      <div className="overflow-x-auto rounded-2xl border-2 border-stone-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b-2 border-stone-200 text-left text-stone-600">
              <th className="p-3">Produto</th>
              <th className="p-3 text-right">Venda</th>
              <th className="p-3 text-right">Custo</th>
              <th className="p-3 text-right">Lucro/un</th>
              <th className="p-3 text-right">Margem</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {produtos.map((p, idx) => {
              if (!listados.has(p.id)) return null
              const custo = custoCompleto(p, insumos, produtos)
              const lucro = p.preco - custo
              const margem = p.preco > 0 ? (lucro / p.preco) * 100 : 0
              return (
                <tr key={p.id} className={`border-b border-stone-100 ${p.ativo ? '' : 'opacity-50'}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <Imagem emoji={p.emoji} imagem={p.imagem} className="h-11 w-11 shrink-0 rounded-lg text-2xl" />
                      <div>
                        <div className="font-bold">{p.nome}</div>
                        <div className="text-xs text-stone-500">
                          {NOMES_CATEGORIA[p.categoria]}
                          {p.estoque !== undefined && ` · estoque ${p.estoque}`}
                          {p.componentes?.length ? ` · ${p.componentes.map((c) => `${c.qtd} ${c.nome.toLowerCase()}`).join(' + ')}` : ''}
                          {!p.ativo && ' · inativo'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-right font-bold">{brl(p.preco)}</td>
                  <td className="p-3 text-right">{brl(custo)}</td>
                  <td className={`p-3 text-right font-semibold ${lucro < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{brl(lucro)}</td>
                  <td className={`p-3 text-right ${margem < 30 ? 'font-bold text-red-600' : ''}`}>{pct(margem)}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <button className="rounded px-2 text-stone-500 hover:bg-stone-100" onClick={() => mover(idx, -1)} aria-label="Subir">
                        ↑
                      </button>
                      <button className="rounded px-2 text-stone-500 hover:bg-stone-100" onClick={() => mover(idx, 1)} aria-label="Descer">
                        ↓
                      </button>
                      {(p.categoria === 'bebida' || p.categoria === 'outro') && !p.ficha.length && !p.componentes?.length && (
                        <button className={btn.secundario + ' !py-1'} title="Vender esta garrafa em doses" onClick={() => setEmDoses(p)}>
                          🥃 Doses
                        </button>
                      )}
                      <button className={btn.secundario + ' !py-1'} onClick={() => setEditando(p)}>
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {emDoses && (
        <ModalVenderEmDoses dados={dados} produto={emDoses} garrafas={0} totalPago={0} aoFechar={() => setEmDoses(null)} aoConfirmar={() => setEmDoses(null)} />
      )}
      {editando && (
        <EditorProduto
          inicial={editando}
          insumos={insumos}
          produtos={produtos}
          novo={!produtos.some((p) => p.id === editando.id)}
          aoFechar={() => setEditando(null)}
          aoSalvar={salvar}
          aoExcluir={() => {
            setProdutos((ps) => ps.filter((p) => p.id !== editando.id))
            setEditando(null)
          }}
        />
      )}
    </section>
  )
}

function EditorProduto({
  inicial,
  insumos,
  produtos,
  novo,
  aoFechar,
  aoSalvar,
  aoExcluir,
}: {
  inicial: Produto
  insumos: Insumo[]
  produtos: Produto[]
  novo: boolean
  aoFechar: () => void
  aoSalvar: (p: Produto) => void
  aoExcluir: () => void
}) {
  const [p, setP] = useState<Produto>(inicial)
  const [margemAlvo, setMargemAlvo] = useState(60)
  const [erroFoto, setErroFoto] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const set = (m: Partial<Produto>) => setP((x) => ({ ...x, ...m }))

  async function usarFoto(f: Blob | null | undefined) {
    if (!f || !f.type.startsWith('image/')) {
      setErroFoto('Isso não é uma imagem.')
      return
    }
    try {
      const imagem = await reduzirImagem(f)
      setP((x) => ({ ...x, imagem }))
      setErroFoto('')
    } catch {
      setErroFoto('Não consegui abrir essa imagem.')
    }
  }

  // Ctrl+V com uma imagem copiada (ex.: botão direito → Copiar imagem no Gemini) vira a foto do produto
  useEffect(() => {
    const colar = (e: ClipboardEvent) => {
      const alvo = e.target as HTMLElement | null
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA')) {
        // num campo de texto, só pega se tiver imagem
        if (![...(e.clipboardData?.items ?? [])].some((i) => i.type.startsWith('image/'))) return
      }
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      if (!item) return
      e.preventDefault()
      void usarFoto(item.getAsFile())
    }
    window.addEventListener('paste', colar)
    return () => window.removeEventListener('paste', colar)
  }, [])
  const custo = custoCompleto(p, insumos, produtos)
  const custoProprio = custoProduto(p, insumos)
  const opcoesCombo = produtos.filter((x) => x.id !== p.id && x.categoria !== 'combo')
  const comps = p.componentes ?? []
  const setComps = (c: NonNullable<Produto['componentes']>) => set({ componentes: c })
  const lucro = p.preco - custo
  const margem = p.preco > 0 ? (lucro / p.preco) * 100 : 0
  const sugerido = margemAlvo < 100 ? Math.ceil((custo / (1 - margemAlvo / 100)) * 2) / 2 : 0

  return (
    <Modal titulo={novo ? 'Novo produto' : `Editar ${inicial.nome}`} aberto aoFechar={aoFechar} largo>
      <div className="grid gap-4 md:grid-cols-[180px_1fr]">
        <div>
          <div
            className={`relative overflow-hidden rounded-2xl border-2 ${arrastando ? 'border-dashed border-orange-500 bg-orange-50' : 'border-stone-200'}`}
            onDragOver={(e) => {
              e.preventDefault()
              setArrastando(true)
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault()
              setArrastando(false)
              void usarFoto(e.dataTransfer.files?.[0])
            }}
          >
            <Imagem emoji={p.emoji} imagem={p.imagem} className="h-36 w-full text-7xl" />
            {arrastando && <div className="absolute inset-0 flex items-center justify-center bg-orange-100/80 font-bold text-orange-800">Solte a foto aqui</div>}
          </div>
          <label className={`${btn.secundario} mt-2 block cursor-pointer text-center text-sm`}>
            📷 {p.imagem ? 'Trocar foto' : 'Escolher foto'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void usarFoto(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          <p className="mt-1 text-center text-xs text-stone-500">ou arraste a foto, ou copie e aperte <b>Ctrl+V</b></p>
          {p.imagem && (
            <button className="mt-1 w-full text-sm text-red-600" onClick={() => set({ imagem: undefined })}>
              Remover foto
            </button>
          )}
          {erroFoto && <p className="text-sm text-red-600">{erroFoto}</p>}
          <div className="mt-2 flex flex-wrap gap-1">
            {EMOJIS.map((e) => (
              <button key={e} className={`rounded p-1 text-xl ${p.emoji === e ? 'bg-orange-200' : 'hover:bg-stone-100'}`} onClick={() => set({ emoji: e })}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <CampoTexto rotulo="Nome no botão" valor={p.nome} aoMudar={(v) => set({ nome: v })} placeholder="Ex.: Carne" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CATEGORIAS.map((c) => (
              <button
                key={c}
                onClick={() =>
                  set(
                    c === 'combo'
                      ? { categoria: c, estoque: undefined, componentes: p.componentes?.length ? p.componentes : [{ id: novoId(), nome: 'Espeto', qtd: 1, opcoes: [] }] }
                      : { categoria: c, componentes: undefined },
                  )
                }
                className={`rounded-xl px-1 py-2 text-sm font-bold ${p.categoria === c ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`}
              >
                {NOMES_CATEGORIA[c]}
              </button>
            ))}
          </div>
          <CampoNumero rotulo="Preço de venda" prefixo="R$" grande valor={p.preco} aoMudar={(v) => set({ preco: v })} />
          <CodigosBarras codigos={p.codigos ?? []} aoMudar={(codigos) => set({ codigos })} />
          <details className="rounded-xl border-2 border-stone-200 p-3" open={!!(p.descricao || p.tamanho || p.precoDelivery)}>
            <summary className="cursor-pointer font-extrabold">📋 Cardápio e delivery (iFood / 99Food)</summary>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-[1fr_9rem] gap-2">
                <CampoTexto rotulo="Descrição" valor={p.descricao ?? ''} aoMudar={(v) => set({ descricao: v || undefined })} placeholder="Ex.: Puro malte, bem gelada" />
                <CampoTexto rotulo="Tamanho" valor={p.tamanho ?? ''} aoMudar={(v) => set({ tamanho: v || undefined })} placeholder="350 ml, 1 kg…" />
              </div>
              <CampoTexto rotulo="Seção no cardápio (vazio = automático)" valor={p.secao ?? ''} aoMudar={(v) => set({ secao: v || undefined })} placeholder="Ex.: Cervejas, Petiscos…" />
              <CampoNumero
                rotulo="Preço no app (vazio = preço + acréscimo das Configurações)"
                prefixo="R$"
                valor={p.precoDelivery ?? 0}
                aoMudar={(v) => set({ precoDelivery: v > 0 ? v : undefined })}
              />
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={!p.foraDoDelivery} onChange={(e) => set({ foraDoDelivery: e.target.checked ? undefined : true })} />
                Vender no iFood / 99Food
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={!p.foraDoCardapio} onChange={(e) => set({ foraDoCardapio: e.target.checked ? undefined : true })} />
                Aparece no cardápio (desmarque quando acabar)
              </label>
            </div>
          </details>

          {p.categoria === 'combo' && (
            <div className="rounded-xl border-2 border-rose-200 bg-rose-50/40 p-3">
              <div className="font-extrabold">O que vem no combo/jantinha</div>
              <p className="text-xs text-stone-500">
                Marque as opções que o cliente pode escolher. Com uma opção só, entra direto. Os espetos escolhidos saem do estoque de espetos prontos.
              </p>
              <ul className="mt-2 space-y-3">
                {comps.map((c, idx) => (
                  <li key={c.id} className="rounded-lg bg-white p-2">
                    <div className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
                      <CampoTexto
                        rotulo="Item"
                        valor={c.nome}
                        aoMudar={(v) => setComps(comps.map((x, i) => (i === idx ? { ...x, nome: v } : x)))}
                        placeholder="Espeto, Refri…"
                      />
                      <CampoNumero rotulo="Qtd" valor={c.qtd} aoMudar={(v) => setComps(comps.map((x, i) => (i === idx ? { ...x, qtd: Math.max(1, Math.round(v)) } : x)))} />
                      <button className="pb-2 text-xl text-stone-400 hover:text-red-600" onClick={() => setComps(comps.filter((_, i) => i !== idx))}>
                        ×
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {opcoesCombo.map((o) => {
                        const marcado = c.opcoes.includes(o.id)
                        return (
                          <button
                            key={o.id}
                            onClick={() =>
                              setComps(comps.map((x, i) => (i === idx ? { ...x, opcoes: marcado ? x.opcoes.filter((y) => y !== o.id) : [...x.opcoes, o.id] } : x)))
                            }
                            className={`rounded-full px-2.5 py-1 text-sm font-semibold ${marcado ? 'bg-rose-600 text-white' : 'bg-stone-100 text-stone-700'}`}
                          >
                            {o.emoji} {o.nome}
                          </button>
                        )
                      })}
                    </div>
                    {c.opcoes.length === 0 && <p className="mt-1 text-xs font-semibold text-red-600">Marque pelo menos uma opção.</p>}
                    {c.opcoes.length > 1 && (
                      <details className="mt-2" open={Object.values(c.acrescimos ?? {}).some((v) => v > 0)}>
                        <summary className="cursor-pointer text-xs font-semibold text-stone-600">+R$ a mais por opção (ex.: carne mais cara)</summary>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {c.opcoes.map((id) => {
                            const o = produtos.find((x) => x.id === id)
                            if (!o) return null
                            return (
                              <label key={id} className="flex items-center gap-1 rounded-lg bg-stone-50 px-2 py-1 text-xs">
                                <span className="font-semibold">{o.nome}</span>
                                <CampoNumero
                                  className="w-20"
                                  prefixo="+"
                                  valor={c.acrescimos?.[id] ?? 0}
                                  aoMudar={(v) =>
                                    setComps(
                                      comps.map((x, j) => {
                                        if (j !== idx) return x
                                        const a = { ...(x.acrescimos ?? {}) }
                                        if (v > 0) a[id] = v
                                        else delete a[id]
                                        return { ...x, acrescimos: Object.keys(a).length ? a : undefined }
                                      }),
                                    )
                                  }
                                />
                              </label>
                            )
                          })}
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
              <button className="mt-2 text-sm font-bold text-rose-700" onClick={() => setComps([...comps, { id: novoId(), nome: 'Refri', qtd: 1, opcoes: [] }])}>
                + adicionar item ao combo
              </button>
            </div>
          )}

          <div className="rounded-xl border-2 border-stone-200 p-3">
            <div className="font-extrabold">{p.categoria === 'combo' ? 'Acompanhamentos (baião, vinagrete…) — por unidade' : 'Ficha técnica — o que vai em 1 unidade'}</div>
            <p className="text-xs text-stone-500">Ex.: 1 espeto de carne = 100 g de carne + 1 palito + 3 g de tempero.</p>
            <ul className="mt-2 space-y-2">
              {p.ficha.map((f, idx) => {
                const ins = insumos.find((i) => i.id === f.insumoId)
                return (
                  <li key={idx} className="grid grid-cols-[1fr_7rem_5rem_auto] items-center gap-2">
                    <select
                      className="min-w-0 rounded-xl border-2 border-stone-200 bg-white px-2 py-2"
                      value={f.insumoId}
                      onChange={(e) => set({ ficha: p.ficha.map((x, i) => (i === idx ? { ...x, insumoId: e.target.value } : x)) })}
                    >
                      {!ins && <option value={f.insumoId}>(insumo excluído)</option>}
                      {insumos.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nome}
                        </option>
                      ))}
                    </select>
                    <CampoNumero
                      sufixo={ins ? unidadeFicha(ins.unidade) : ''}
                      valor={f.qtd}
                      aoMudar={(v) => set({ ficha: p.ficha.map((x, i) => (i === idx ? { ...x, qtd: v } : x)) })}
                    />
                    <span className="text-right text-sm font-semibold">{brl(custoItemFicha(f, insumos))}</span>
                    <button className="px-1 text-xl text-stone-400 hover:text-red-600" onClick={() => set({ ficha: p.ficha.filter((_, i) => i !== idx) })}>
                      ×
                    </button>
                  </li>
                )
              })}
            </ul>
            {insumos.length > 0 ? (
              <button
                className="mt-2 text-sm font-bold text-orange-700"
                onClick={() => set({ ficha: [...p.ficha, { insumoId: insumos[0].id, qtd: 0 }] })}
              >
                + adicionar insumo
              </button>
            ) : (
              <p className="mt-2 text-sm text-stone-500">Cadastre insumos na aba “Insumos”.</p>
            )}
            <CampoNumero
              className="mt-3"
              rotulo={p.categoria === 'bebida' ? 'Custo da unidade (quanto pagou na lata/garrafa)' : 'Outros custos por unidade (embalagem, guardanapo…)'}
              prefixo="R$"
              valor={p.custoDireto}
              aoMudar={(v) => set({ custoDireto: v })}
            />
          </div>

          {p.categoria === 'combo' && (
            <p className="text-xs text-stone-500">
              Custo = acompanhamentos {brl(custoProprio)} + itens do combo (pela opção mais cara: {brl(custo - custoProprio)}). Na venda é usado o custo real da escolha.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-stone-100 p-2">
              <div className="text-xs text-stone-600">Custo</div>
              <div className="text-lg font-extrabold">{brl(custo)}</div>
            </div>
            <div className={`rounded-xl p-2 ${lucro < 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
              <div className="text-xs text-stone-600">Lucro por unidade</div>
              <div className="text-lg font-extrabold">{brl(lucro)}</div>
            </div>
            <div className="rounded-xl bg-stone-100 p-2">
              <div className="text-xs text-stone-600">Margem</div>
              <div className="text-lg font-extrabold">{pct(margem)}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2 rounded-xl bg-orange-50 p-3 text-sm">
            <CampoNumero className="w-28" rotulo="Margem desejada" sufixo="%" valor={margemAlvo} aoMudar={(v) => setMargemAlvo(Math.min(95, v))} />
            <div className="flex-1 pb-2">
              Preço sugerido: <b className="text-base">{brl(sugerido)}</b>
            </div>
            <button className={btn.secundario} onClick={() => set({ preco: arred(sugerido) })}>
              Usar
            </button>
          </div>

          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" className="h-5 w-5 accent-orange-600" checked={p.ativo} onChange={(e) => set({ ativo: e.target.checked })} />
            Aparece na tela de venda
          </label>
          {p.categoria !== 'combo' && (
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="h-5 w-5 accent-orange-600"
                checked={p.estoque !== undefined}
                onChange={(e) => set({ estoque: e.target.checked ? (inicial.estoque ?? 0) : undefined })}
              />
              Controlar estoque (contar unidades prontas e bloquear quando acabar)
            </label>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap justify-between gap-2">
        {!novo ? (
          <button className={btn.perigo} onClick={() => confirm(`Excluir "${inicial.nome}"? As vendas antigas continuam nos relatórios.`) && aoExcluir()}>
            Excluir
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button className={btn.secundario} onClick={aoFechar}>
            Cancelar
          </button>
          <button
            className={btn.primario}
            disabled={!p.nome.trim() || (p.categoria === 'combo' && (!comps.length || comps.some((c) => !c.opcoes.length)))}
            onClick={() => aoSalvar({ ...p, nome: p.nome.trim() })}
          >
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------- bar ----------------

const ML_DOSE = [30, 50, 100, 200, 300, 500]

/**
 * Cria uma dose/drink a partir de uma bebida comprada em litros (garrafa, barril).
 * O estoque fica na bebida (em litros); cada dose vendida desconta os ml da ficha.
 */
function ModalDose({ dados, aoFechar }: { dados: Dados; aoFechar: () => void }) {
  const bebidas = dados.insumos.filter((i) => i.unidade === 'L')
  const [insumoId, setInsumoId] = useState(bebidas[0]?.id ?? 'nova')
  const [novaNome, setNovaNome] = useState('')
  const [novaPreco, setNovaPreco] = useState(0)
  const [novaMl, setNovaMl] = useState(1000)
  const [ml, setMl] = useState(50)
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState(0)
  const [emoji, setEmoji] = useState('🥃')

  const ins = bebidas.find((i) => i.id === insumoId)
  const custoLitro = insumoId === 'nova' ? (novaMl > 0 ? novaPreco / (novaMl / 1000) : 0) : ins ? custoUnitarioInsumo(ins) : 0
  const custo = (custoLitro * ml) / 1000
  const lucro = preco - custo
  const doses = insumoId === 'nova' ? Math.floor(novaMl / ml) : ins ? Math.floor((ins.qtdCompra * 1000) / ml) : 0
  const nomeBebida = insumoId === 'nova' ? novaNome.trim() : (ins?.nome ?? '')
  const nomeFinal = nome.trim() || (nomeBebida ? `${ml >= 200 ? nomeBebida : `Dose de ${nomeBebida.toLowerCase()}`} ${ml} ml` : '')

  function salvar() {
    let idIns = insumoId
    if (insumoId === 'nova') {
      idIns = novoId()
      dados.setInsumos((is) => [
        ...is,
        { id: idIns, nome: novaNome.trim(), unidade: 'L', precoCompra: novaPreco, qtdCompra: novaMl / 1000, estoque: 0, grupo: 'Bebidas' },
      ])
    }
    dados.setProdutos((ps) => [
      ...ps,
      { id: novoId(), nome: nomeFinal, categoria: 'drink', preco, emoji, ficha: [{ insumoId: idIns, qtd: ml }], custoDireto: 0, ativo: true },
    ])
    aoFechar()
  }

  return (
    <Modal titulo="Nova dose / drink" aberto aoFechar={aoFechar}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-stone-600">Bebida (comprada em garrafa ou barril)</span>
          <select className="w-full rounded-xl border-2 border-stone-200 bg-white px-2 py-2" value={insumoId} onChange={(e) => setInsumoId(e.target.value)}>
            {bebidas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome} — {brl(custoUnitarioInsumo(b))}/L
              </option>
            ))}
            <option value="nova">+ Outra bebida…</option>
          </select>
        </label>
        {insumoId === 'nova' && (
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-violet-50 p-3">
            <CampoTexto className="col-span-3" rotulo="Nome da bebida" valor={novaNome} aoMudar={setNovaNome} placeholder="Ex.: Cachaça 51, Gin, Chopp" />
            <CampoNumero rotulo="Paguei na garrafa" prefixo="R$" valor={novaPreco} aoMudar={setNovaPreco} />
            <CampoNumero className="col-span-2" rotulo="A garrafa tem" sufixo="ml" valor={novaMl} aoMudar={setNovaMl} />
          </div>
        )}
        <div>
          <span className="mb-1 block text-sm font-semibold text-stone-600">Tamanho da dose</span>
          <div className="flex flex-wrap gap-1.5">
            {ML_DOSE.map((m) => (
              <button key={m} onClick={() => setMl(m)} className={`rounded-full px-3 py-1.5 font-bold ${ml === m ? 'bg-violet-600 text-white' : 'bg-stone-100'}`}>
                {m} ml
              </button>
            ))}
            <CampoNumero className="w-28" sufixo="ml" valor={ml} aoMudar={(v) => setMl(Math.max(1, Math.round(v)))} />
          </div>
          <p className="mt-1 text-xs text-stone-500">Dose de destilado no Brasil: 50 ml. Chopp: 300 ou 500 ml.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CampoTexto rotulo="Nome no botão" valor={nome} aoMudar={setNome} placeholder={nomeFinal || 'Ex.: Dose de cachaça'} />
          <CampoNumero rotulo="Preço de venda" prefixo="R$" valor={preco} aoMudar={setPreco} />
        </div>
        <div className="flex gap-1">
          {['🥃', '🍺', '🍻', '🍹', '🍸', '🍷', '🥂', '🍾'].map((e) => (
            <button key={e} className={`rounded p-1 text-2xl ${emoji === e ? 'bg-violet-200' : 'hover:bg-stone-100'}`} onClick={() => setEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
        {custoLitro > 0 && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-stone-100 p-2">
              <div className="text-xs text-stone-600">Custo da dose</div>
              <div className="font-extrabold">{brl(custo)}</div>
            </div>
            <div className={`rounded-xl p-2 ${lucro < 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
              <div className="text-xs text-stone-600">Lucro por dose</div>
              <div className="font-extrabold">
                {brl(lucro)} {preco > 0 && <span className="text-xs">({pct((lucro / preco) * 100)})</span>}
              </div>
            </div>
            <div className="rounded-xl bg-stone-100 p-2">
              <div className="text-xs text-stone-600">Doses por garrafa</div>
              <div className="font-extrabold">{doses}</div>
            </div>
          </div>
        )}
        <p className="text-xs text-stone-500">
          O estoque fica na bebida, em litros: lance as garrafas em Estoque → “Chegou compra”. Cada dose vendida desconta {ml} ml e o botão mostra quantas ainda dá.
        </p>
      </div>
      <button
        className={`${btn.primario} mt-4 w-full`}
        disabled={!nomeFinal || preco <= 0 || (insumoId === 'nova' && (!novaNome.trim() || novaMl <= 0))}
        onClick={salvar}
      >
        Criar {nomeFinal || 'dose'}
      </button>
    </Modal>
  )
}

/** Pacote de exemplo para bar: bebidas em litros (com estoque) e doses/drinks que descontam delas. */
function adicionarExemplosBar(dados: Dados) {
  const ins = (id: string, nome: string, unidade: Unidade, precoCompra: number, qtdCompra: number, grupo: string, estoque?: number): Insumo => ({
    id,
    nome,
    unidade,
    precoCompra,
    qtdCompra,
    grupo,
    ...(estoque !== undefined ? { estoque } : {}),
  })
  const novosInsumos: Insumo[] = [
    ins('bar-cachaca', 'Cachaça', 'L', 25, 0.965, 'Bebidas', 0),
    ins('bar-vodka', 'Vodka', 'L', 35, 1, 'Bebidas', 0),
    ins('bar-whisky', 'Whisky', 'L', 90, 1, 'Bebidas', 0),
    ins('bar-chopp', 'Chopp (barril)', 'L', 600, 50, 'Bebidas', 0),
    ins('bar-limao', 'Limão', 'un', 6, 20, 'Bar'),
    ins('bar-acucar', 'Açúcar', 'kg', 5, 1, 'Bar'),
    ins('bar-gelo', 'Gelo', 'kg', 12, 5, 'Bar'),
  ]
  const drink = (id: string, nome: string, emoji: string, preco: number, ficha: { insumoId: string; qtd: number }[]): Produto => ({
    id,
    nome,
    categoria: 'drink',
    preco,
    emoji,
    ficha,
    custoDireto: 0,
    ativo: true,
  })
  const caipi = (base: string) => [
    { insumoId: base, qtd: 60 },
    { insumoId: 'bar-limao', qtd: 1 },
    { insumoId: 'bar-acucar', qtd: 20 },
    { insumoId: 'bar-gelo', qtd: 150 },
  ]
  const novosProdutos: Produto[] = [
    drink('bar-p-cachaca', 'Dose de cachaça', '🥃', 6, [{ insumoId: 'bar-cachaca', qtd: 50 }]),
    drink('bar-p-vodka', 'Dose de vodka', '🥃', 8, [{ insumoId: 'bar-vodka', qtd: 50 }]),
    drink('bar-p-whisky', 'Dose de whisky', '🥃', 15, [{ insumoId: 'bar-whisky', qtd: 50 }]),
    drink('bar-p-caipirinha', 'Caipirinha', '🍹', 15, caipi('bar-cachaca')),
    drink('bar-p-caipiroska', 'Caipiroska', '🍸', 18, caipi('bar-vodka')),
    drink('bar-p-chopp300', 'Chopp 300 ml', '🍺', 9, [{ insumoId: 'bar-chopp', qtd: 300 }]),
    drink('bar-p-chopp500', 'Chopp 500 ml', '🍻', 14, [{ insumoId: 'bar-chopp', qtd: 500 }]),
  ]
  dados.setInsumos((is) => [...is, ...novosInsumos.filter((n) => !is.some((i) => i.id === n.id))])
  dados.setProdutos((ps) => [...ps, ...novosProdutos.filter((n) => !ps.some((p) => p.id === n.id))])
}

// ---------------- copão ----------------

const slug = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const SABORES_GELO = ['Coco', 'Morango', 'Maracujá', 'Melancia', 'Menta', 'Frutas vermelhas', 'Maçã verde', 'Limão']

interface LinhaCopao {
  insumoId: string
  ml: number
  preco: number
  usar: boolean
}
interface ItemSimples {
  id: string
  nome: string
  custo: number
  precoAvulso: number
  venderSeparado: boolean
  acrescimo: number
  /** Mistura servida de uma garrafa grande, por ml (ex.: energético 2 L, 250 ml por copão). */
  porMl?: { precoGarrafa: number; mlGarrafa: number; ml: number }
}

/** Custo da mistura/gelo em 1 copão. */
const custoDe = (x: ItemSimples) => (x.porMl ? (x.porMl.mlGarrafa > 0 ? (x.porMl.precoGarrafa / x.porMl.mlGarrafa) * x.porMl.ml : 0) : x.custo)
const insumoDaMistura = (idMistura: string) => `copao-mixins-${idMistura.replace(/^copao-mix-/, '')}`

/**
 * Copão = dose de destilado + gelo de sabor + mistura (energético ou suco).
 * Cria um produto “Copão de X” por destilado; na venda o caixa escolhe o gelo e a mistura,
 * o preço soma o acréscimo da mistura e o estoque desconta os ml do destilado.
 */
function ModalCopao({ dados, aoFechar }: { dados: Dados; aoFechar: () => void }) {
  const destilados = dados.insumos.filter((i) => i.unidade === 'L')
  const existente = (id: string) => dados.produtos.find((p) => p.id === id)

  const [linhas, setLinhas] = useState<LinhaCopao[]>(() =>
    destilados.map((d) => {
      const ja = existente(`copao-${d.id}`)
      return { insumoId: d.id, ml: ja?.ficha.find((f) => f.insumoId === d.id)?.qtd ?? 100, preco: ja?.preco ?? 0, usar: !!ja }
    }),
  )
  const doTipo = (prefixo: string, padrao: ItemSimples[]): ItemSimples[] => {
    const ja = dados.produtos.filter((p) => p.id.startsWith(prefixo))
    if (!ja.length) return padrao
    const ref = dados.produtos.find((p) => p.id.startsWith('copao-') && p.componentes?.length)
    return ja.map((p) => {
      const f = p.ficha.find((x) => x.insumoId.startsWith('copao-mixins-'))
      const ins = f && dados.insumos.find((i) => i.id === f.insumoId)
      return {
        id: p.id,
        nome: p.nome,
        custo: p.custoDireto,
        precoAvulso: p.preco,
        venderSeparado: p.ativo,
        acrescimo: ref?.componentes?.find((c) => c.acrescimos?.[p.id] !== undefined)?.acrescimos?.[p.id] ?? 0,
        ...(f && ins ? { porMl: { precoGarrafa: ins.precoCompra, mlGarrafa: ins.qtdCompra * 1000, ml: f.qtd } } : {}),
      }
    })
  }
  const [gelos, setGelos] = useState<ItemSimples[]>(() =>
    doTipo('copao-gelo-', [
      { id: 'copao-gelo-coco', nome: 'Gelo de coco', custo: 2, precoAvulso: 5, venderSeparado: false, acrescimo: 0 },
      { id: 'copao-gelo-morango', nome: 'Gelo de morango', custo: 2, precoAvulso: 5, venderSeparado: false, acrescimo: 0 },
      { id: 'copao-gelo-maracuja', nome: 'Gelo de maracujá', custo: 2, precoAvulso: 5, venderSeparado: false, acrescimo: 0 },
    ]),
  )
  const [misturas, setMisturas] = useState<ItemSimples[]>(() =>
    doTipo('copao-mix-', [
      {
        id: 'copao-mix-energetico-2l',
        nome: 'Energético (garrafa 2 L)',
        custo: 0,
        precoAvulso: 8,
        venderSeparado: false,
        acrescimo: 0,
        porMl: { precoGarrafa: 12, mlGarrafa: 2000, ml: 250 },
      },
      { id: 'copao-mix-energetico', nome: 'Energético (lata)', custo: 6, precoAvulso: 12, venderSeparado: true, acrescimo: 3 },
      { id: 'copao-mix-suco', nome: 'Suco', custo: 0, precoAvulso: 6, venderSeparado: false, acrescimo: 0, porMl: { precoGarrafa: 7, mlGarrafa: 1000, ml: 250 } },
    ]),
  )
  const [custoCopo, setCustoCopo] = useState(() => {
    const c = dados.insumos.find((i) => i.id === 'copao-copo')
    return c ? custoUnitarioInsumo(c) : 0.6
  })
  const [novoSabor, setNovoSabor] = useState('')
  const [novaMistura, setNovaMistura] = useState('')

  const custoDestilado = (l: LinhaCopao) => {
    const ins = destilados.find((d) => d.id === l.insumoId)
    return ins ? (custoUnitarioInsumo(ins) * l.ml) / 1000 : 0
  }
  const faixa = (lista: ItemSimples[], f: (x: ItemSimples) => number) => (lista.length ? [Math.min(...lista.map(f)), Math.max(...lista.map(f))] : [0, 0])
  const [gMin, gMax] = faixa(gelos, (g) => g.custo)
  const [mMin, mMax] = faixa(misturas, custoDe)
  const usadas = linhas.filter((l) => l.usar)

  function addSabor(nome: string) {
    const n = nome.trim()
    if (!n) return
    const id = `copao-gelo-${slug(n)}`
    if (gelos.some((g) => g.id === id)) return
    setGelos((gs) => [...gs, { id, nome: `Gelo de ${n.toLowerCase()}`, custo: gs[0]?.custo ?? 2, precoAvulso: gs[0]?.precoAvulso ?? 5, venderSeparado: false, acrescimo: 0 }])
    setNovoSabor('')
  }

  function salvar() {
    const copoId = 'copao-copo'
    dados.setInsumos((is) => {
      let lista = is.filter((i) => i.id !== copoId)
      if (custoCopo > 0) lista.push({ id: copoId, nome: 'Copo de copão (descartável)', unidade: 'un', precoCompra: custoCopo, qtdCompra: 1, grupo: 'Bar' })
      // misturas por ml viram bebidas em litros (estoque em L, como os destilados)
      for (const m of misturas) {
        if (!m.porMl) continue
        const id = insumoDaMistura(m.id)
        const atual = lista.find((i) => i.id === id)
        const novo = {
          id,
          nome: m.nome,
          unidade: 'L' as const,
          precoCompra: m.porMl.precoGarrafa,
          qtdCompra: m.porMl.mlGarrafa / 1000,
          grupo: 'Bebidas',
          estoque: atual?.estoque ?? 0,
        }
        lista = atual ? lista.map((i) => (i.id === id ? novo : i)) : [...lista, novo]
      }
      return lista
    })
    dados.setProdutos((ps) => {
      const lista = [...ps]
      const upsert = (p: Produto) => {
        const i = lista.findIndex((x) => x.id === p.id)
        if (i >= 0) lista[i] = { ...lista[i], ...p, imagem: lista[i].imagem }
        else lista.push(p)
      }
      for (const g of gelos)
        upsert({ id: g.id, nome: g.nome, categoria: 'outro', preco: g.precoAvulso, emoji: '🧊', ficha: [], custoDireto: g.custo, ativo: g.venderSeparado })
      for (const m of misturas)
        upsert({
          id: m.id,
          nome: m.nome,
          categoria: 'bebida',
          preco: m.precoAvulso,
          emoji: /energ/i.test(m.nome) ? '⚡' : '🧃',
          ficha: m.porMl ? [{ insumoId: insumoDaMistura(m.id), qtd: m.porMl.ml }] : [],
          custoDireto: m.porMl ? 0 : m.custo,
          ativo: m.venderSeparado,
        })
      const acrescimos = Object.fromEntries(misturas.filter((m) => m.acrescimo > 0).map((m) => [m.id, m.acrescimo]))
      for (const l of usadas) {
        const ins = destilados.find((d) => d.id === l.insumoId)!
        upsert({
          id: `copao-${l.insumoId}`,
          nome: `Copão de ${ins.nome.replace(/\s*\(.*\)\s*/, '').toLowerCase()}`,
          categoria: 'drink',
          preco: l.preco,
          emoji: '🥤',
          ficha: [{ insumoId: l.insumoId, qtd: l.ml }, ...(custoCopo > 0 ? [{ insumoId: copoId, qtd: 1 }] : [])],
          custoDireto: 0,
          ativo: true,
          componentes: [
            { id: 'c-gelo', nome: 'Gelo de sabor', qtd: 1, opcoes: gelos.map((g) => g.id) },
            { id: 'c-mistura', nome: 'Mistura', qtd: 1, opcoes: misturas.map((m) => m.id), ...(Object.keys(acrescimos).length ? { acrescimos } : {}) },
          ],
        })
      }
      return lista
    })
    aoFechar()
  }

  const tabelaItens = (titulo: string, lista: ItemSimples[], set: (f: (l: ItemSimples[]) => ItemSimples[]) => void, comAcrescimo: boolean) => (
    <div className="rounded-xl border-2 border-stone-200 p-3">
      <div className="font-extrabold">{titulo}</div>
      <ul className="mt-2 space-y-2">
        {lista.map((x, i) => {
          const muda = (m: Partial<ItemSimples>) => set((l) => l.map((y, j) => (j === i ? { ...y, ...m } : y)))
          return (
            <li key={x.id} className="rounded-lg bg-stone-50 p-2">
              <div className="flex items-center gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border-2 border-stone-200 bg-white px-2 py-1 font-semibold"
                  value={x.nome}
                  onChange={(e) => muda({ nome: e.target.value })}
                />
                <button className="px-1 text-xl text-stone-400 hover:text-red-600" onClick={() => set((l) => l.filter((_, j) => j !== i))} aria-label="Remover">
                  ×
                </button>
              </div>
              {comAcrescimo && (
                <div className="mt-1.5 flex gap-1 text-xs font-bold">
                  {[
                    [false, 'Por unidade (lata)'],
                    [true, 'Por ml (garrafa grande)'],
                  ].map(([ml, r]) => (
                    <button
                      key={String(ml)}
                      className={`rounded-full px-2.5 py-1 ${!!x.porMl === ml ? 'bg-violet-600 text-white' : 'bg-white text-stone-700'}`}
                      onClick={() => muda({ porMl: ml ? (x.porMl ?? { precoGarrafa: 12, mlGarrafa: 2000, ml: 250 }) : undefined })}
                    >
                      {r as string}
                    </button>
                  ))}
                </div>
              )}
              {x.porMl && (
                <div className="mt-1.5 flex flex-wrap items-end gap-2">
                  <CampoNumero
                    className="w-28"
                    rotulo="Garrafa custa"
                    prefixo="R$"
                    valor={x.porMl.precoGarrafa}
                    aoMudar={(v) => muda({ porMl: { ...x.porMl!, precoGarrafa: v } })}
                  />
                  <CampoNumero
                    className="w-28"
                    rotulo="Garrafa tem"
                    sufixo="ml"
                    valor={x.porMl.mlGarrafa}
                    aoMudar={(v) => muda({ porMl: { ...x.porMl!, mlGarrafa: v } })}
                  />
                  <CampoNumero
                    className="w-28"
                    rotulo="Vai no copão"
                    sufixo="ml"
                    valor={x.porMl.ml}
                    aoMudar={(v) => muda({ porMl: { ...x.porMl!, ml: Math.round(v) } })}
                  />
                  <div className="flex flex-wrap gap-1 pb-2">
                    {[200, 250, 300].map((ml) => (
                      <button
                        key={ml}
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${x.porMl!.ml === ml ? 'bg-violet-600 text-white' : 'bg-white'}`}
                        onClick={() => muda({ porMl: { ...x.porMl!, ml } })}
                      >
                        {ml} ml
                      </button>
                    ))}
                  </div>
                  <div className="w-full text-xs text-violet-900">
                    = <b>{brl(custoDe(x))}</b> por copão · a garrafa dá {x.porMl.ml > 0 ? Math.floor(x.porMl.mlGarrafa / x.porMl.ml) : 0} copões
                  </div>
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap items-end gap-2">
                {!x.porMl && <CampoNumero className="w-28" rotulo="Custo" prefixo="R$" valor={x.custo} aoMudar={(v) => muda({ custo: v })} />}
                {comAcrescimo && (
                  <CampoNumero className="w-32" rotulo="+ no copão" prefixo="R$" valor={x.acrescimo} aoMudar={(v) => muda({ acrescimo: v })} />
                )}
                <label className="flex items-center gap-1.5 pb-2 text-sm text-stone-700">
                  <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={x.venderSeparado} onChange={(e) => muda({ venderSeparado: e.target.checked })} />
                  vender separado
                </label>
                {x.venderSeparado && (
                  <CampoNumero className="w-28" rotulo="Preço avulso" prefixo="R$" valor={x.precoAvulso} aoMudar={(v) => muda({ precoAvulso: v })} />
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )

  return (
    <Modal titulo="🥤 Montar copões" aberto aoFechar={aoFechar} largo>
      <p className="text-sm text-stone-600">
        Copão = <b>dose</b> + <b>gelo de sabor</b> + <b>energético ou suco</b>. Cria um botão por destilado; na venda você escolhe o gelo e a mistura e o
        sistema calcula preço, custo e estoque.
      </p>

      <div className="mt-3 rounded-xl border-2 border-violet-200 bg-violet-50/50 p-3">
        <div className="font-extrabold">1. Destilados</div>
        {destilados.length === 0 && (
          <p className="text-sm text-amber-800">Cadastre os destilados primeiro (botão “🥃 Nova dose / drink” ou “🍹 Exemplos de bar”).</p>
        )}
        <ul className="mt-2 space-y-2">
          {linhas.map((l, i) => {
            const ins = destilados.find((d) => d.id === l.insumoId)!
            const muda = (m: Partial<LinhaCopao>) => setLinhas((ls) => ls.map((y, j) => (j === i ? { ...y, ...m } : y)))
            const base = custoDestilado(l) + custoCopo
            const cMin = base + gMin + mMin
            const cMax = base + gMax + mMax
            // lucro de cada mistura com o preço dela (preço + acréscimo), no gelo mais caro e no mais barato
            const lucros = misturas.flatMap((m) => [l.preco + m.acrescimo - (base + gMax + custoDe(m)), l.preco + m.acrescimo - (base + gMin + custoDe(m))])
            const lMin = lucros.length ? Math.min(...lucros) : l.preco - cMax
            const lMax = lucros.length ? Math.max(...lucros) : l.preco - cMin
            const lucroMin = lMin
            return (
              <li key={l.insumoId} className={`rounded-lg p-2 ${l.usar ? 'bg-white' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex min-w-[9rem] flex-1 items-center gap-2 font-bold">
                    <input type="checkbox" className="h-5 w-5 accent-violet-600" checked={l.usar} onChange={(e) => muda({ usar: e.target.checked })} />
                    {ins.nome}
                  </label>
                  {l.usar && (
                    <>
                      <CampoNumero className="w-24" sufixo="ml" valor={l.ml} aoMudar={(v) => muda({ ml: Math.round(v) })} />
                      <CampoNumero className="w-28" prefixo="R$" valor={l.preco} aoMudar={(v) => muda({ preco: v })} />
                    </>
                  )}
                </div>
                {l.usar && (
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-stone-600">
                    <span>
                      custo {brl(cMin)}
                      {cMax - cMin > 0.004 && ` a ${brl(cMax)}`}
                    </span>
                    {l.preco > 0 && (
                      <span className={lucroMin < 0 ? 'font-bold text-red-700' : 'font-bold text-emerald-700'}>
                        lucro {brl(lMin)}
                        {lMax - lMin > 0.004 && ` a ${brl(lMax)}`} por copão
                      </span>
                    )}
                    {l.preco <= 0 && <span className="font-semibold text-amber-700">sugestão a 65% de margem: {brl(Math.ceil(cMax / 0.35))}</span>}
                    <span className="text-stone-400">
                      ({l.ml} ml = {brl(custoDestilado(l))}; copo, gelo e mistura somados)
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-600">
          <span>Atalhos de ml:</span>
          {[50, 80, 100, 150, 200].map((m) => (
            <button key={m} className="rounded-full bg-white px-2 py-0.5 font-bold" onClick={() => setLinhas((ls) => ls.map((l) => ({ ...l, ml: m })))}>
              todos {m} ml
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        <div>
          {tabelaItens('2. Gelos de sabor', gelos, setGelos, false)}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {SABORES_GELO.filter((n) => !gelos.some((g) => g.id === `copao-gelo-${slug(n)}`)).map((n) => (
              <button key={n} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold" onClick={() => addSabor(n)}>
                + {n}
              </button>
            ))}
            <input
              className="w-28 rounded-lg border-2 border-stone-200 px-2 py-1 text-xs"
              placeholder="outro sabor"
              value={novoSabor}
              onChange={(e) => setNovoSabor(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSabor(novoSabor)}
            />
          </div>
        </div>
        <div>
          {tabelaItens('3. Misturas (energético, suco…)', misturas, setMisturas, true)}
          <div className="mt-2 flex items-center gap-1.5">
            <input
              className="flex-1 rounded-lg border-2 border-stone-200 px-2 py-1 text-xs"
              placeholder="Outra mistura (ex.: Energético 473 ml, Tônica, Água de coco)"
              value={novaMistura}
              onChange={(e) => setNovaMistura(e.target.value)}
            />
            <button
              className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold"
              onClick={() => {
                const n = novaMistura.trim()
                if (!n) return
                setMisturas((ms) => [...ms, { id: `copao-mix-${slug(n)}`, nome: n, custo: 0, precoAvulso: 0, venderSeparado: false, acrescimo: 0 }])
                setNovaMistura('')
              }}
            >
              + adicionar
            </button>
          </div>
          <p className="mt-1 text-xs text-stone-500">Acréscimo: quanto o copão fica mais caro com essa mistura (ex.: energético +R$ 3 em vez de suco).</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <CampoNumero className="w-48" rotulo="Copo descartável (custo)" prefixo="R$" valor={custoCopo} aoMudar={setCustoCopo} />
        <p className="flex-1 pb-2 text-xs text-stone-500">
          O destilado sai do estoque em ml. Gelo e mistura entram no custo; para controlar o estoque deles, ative em Cadastros → editar o produto.
        </p>
      </div>

      <button
        className={`${btn.primario} mt-4 w-full py-3 text-lg`}
        disabled={!usadas.length || usadas.some((l) => l.preco <= 0 || l.ml <= 0) || !gelos.length || !misturas.length}
        onClick={salvar}
      >
        Criar {usadas.length} copão(ões)
      </button>
    </Modal>
  )
}

// ---------------- adega ----------------

/** Códigos de barras do produto: bipe com o leitor no campo (ou digite) e aperte Enter. */
function CodigosBarras({ codigos, aoMudar }: { codigos: string[]; aoMudar: (c: string[]) => void }) {
  const [novo, setNovo] = useState('')
  const add = () => {
    const c = novo.replace(/\s+/g, '')
    if (c && !codigos.includes(c)) aoMudar([...codigos, c])
    setNovo('')
  }
  return (
    <div>
      <span className="mb-1 block text-sm font-semibold text-stone-600">Código de barras</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {codigos.map((c) => (
          <span key={c} className="flex items-center gap-1 rounded-full bg-stone-100 py-1 pl-3 pr-1 font-mono text-sm">
            {c}
            <button className="rounded-full px-1.5 text-stone-500 hover:text-red-600" onClick={() => aoMudar(codigos.filter((x) => x !== c))}>
              ×
            </button>
          </span>
        ))}
        <input
          className="w-48 rounded-xl border-2 border-stone-200 px-3 py-1.5 font-mono text-sm outline-none focus:border-orange-500"
          placeholder="bipe aqui ou digite + Enter"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
        />
      </div>
    </div>
  )
}

/**
 * Fardo/caixa fechada: um botão com preço próprio que, vendido, tira N unidades do estoque da bebida.
 * (Usa o mesmo mecanismo dos combos, com uma opção só.)
 */
function ModalFardo({ dados, aoFechar }: { dados: Dados; aoFechar: () => void }) {
  const unidades = dados.produtos.filter((p) => !p.ficha.length && !p.componentes?.length && (p.categoria === 'bebida' || p.categoria === 'outro'))
  const [base, setBase] = useState(unidades[0]?.id ?? '')
  const [qtd, setQtd] = useState(12)
  const [preco, setPreco] = useState(0)
  const [codigo, setCodigo] = useState('')
  const p = unidades.find((x) => x.id === base)
  const custo = p ? p.custoDireto * qtd : 0
  const avulso = p ? p.preco * qtd : 0

  function salvar() {
    if (!p) return
    const novo: Produto = {
        id: novoId(),
        nome: `Fardo ${qtd} ${p.nome}`,
        categoria: 'bebida',
        preco,
        emoji: '📦',
        ficha: [],
        custoDireto: 0,
        ativo: true,
        componentes: [{ id: 'c-unidade', nome: p.nome, qtd, opcoes: [p.id] }],
        ...(codigo.trim() ? { codigos: [codigo.replace(/\s+/g, '')] } : {}),
    }
    // a bebida passa a ter estoque controlado (o fardo tira dela)
    dados.setProdutos((ps) => [...ps.map((x) => (x.id === p.id && x.estoque === undefined ? { ...x, estoque: 0 } : x)), novo])
    aoFechar()
  }

  return (
    <Modal titulo="📦 Criar fardo / caixa" aberto aoFechar={aoFechar}>
      {unidades.length === 0 ? (
        <p>Cadastre primeiro a bebida por unidade (ex.: Heineken lata).</p>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-stone-600">Bebida (unidade)</span>
            <select className="w-full rounded-xl border-2 border-stone-200 bg-white px-2 py-2" value={base} onChange={(e) => setBase(e.target.value)}>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} — {brl(u.preco)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            {[6, 8, 12, 15, 18, 24].map((n) => (
              <button key={n} className={`rounded-full px-3 py-1.5 font-bold ${qtd === n ? 'bg-stone-900 text-white' : 'bg-stone-100'}`} onClick={() => setQtd(n)}>
                {n} un
              </button>
            ))}
            <CampoNumero className="w-24" sufixo="un" valor={qtd} aoMudar={(v) => setQtd(Math.max(2, Math.round(v)))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CampoNumero rotulo="Preço do fardo" prefixo="R$" grande valor={preco} aoMudar={setPreco} />
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-stone-600">Código do fardo (opcional)</span>
              <input
                className="w-full rounded-xl border-2 border-stone-200 px-3 py-3 font-mono"
                placeholder="bipe aqui"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
            </label>
          </div>
          {p && (
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-stone-100 p-2">
                <div className="text-xs text-stone-600">Avulso sairia</div>
                <div className="font-extrabold">{brl(avulso)}</div>
              </div>
              <div className="rounded-xl bg-stone-100 p-2">
                <div className="text-xs text-stone-600">Custo do fardo</div>
                <div className="font-extrabold">{brl(custo)}</div>
              </div>
              <div className={`rounded-xl p-2 ${preco - custo < 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
                <div className="text-xs text-stone-600">Lucro do fardo</div>
                <div className="font-extrabold">
                  {brl(preco - custo)} {preco > 0 && <span className="text-xs">({pct(((preco - custo) / preco) * 100)})</span>}
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-stone-500">Vendeu 1 fardo → saem {qtd} unidades do estoque de {p?.nome}. O botão mostra quantos fardos ainda dá.</p>
          <button className={`${btn.primario} w-full`} disabled={!p || preco <= 0} onClick={salvar}>
            Criar Fardo {qtd} {p?.nome}
          </button>
        </div>
      )}
    </Modal>
  )
}

/** Pacote de exemplo para adega: bebidas por unidade (com estoque) e fardos. */
function adicionarExemplosAdega(dados: Dados) {
  const b = (id: string, nome: string, emoji: string, preco: number, custo: number, caixa: number): Produto => ({
    id,
    nome,
    categoria: 'bebida',
    preco,
    emoji,
    ficha: [],
    custoDireto: custo,
    ativo: true,
    estoque: 0,
    unidadesCaixa: caixa,
  })
  const fardo = (id: string, base: string, nomeBase: string, qtd: number, preco: number): Produto => ({
    id,
    nome: `Fardo ${qtd} ${nomeBase}`,
    categoria: 'bebida',
    preco,
    emoji: '📦',
    ficha: [],
    custoDireto: 0,
    ativo: true,
    componentes: [{ id: 'c-unidade', nome: nomeBase, qtd, opcoes: [base] }],
  })
  const novos: Produto[] = [
    b('adega-heineken', 'Heineken lata 350 ml', '🍺', 6.5, 4.2, 12),
    b('adega-brahma', 'Brahma lata 350 ml', '🍺', 4.5, 2.9, 12),
    b('adega-skol', 'Skol lata 350 ml', '🍺', 4.5, 2.8, 12),
    b('adega-corona', 'Corona long neck 330 ml', '🍺', 9, 5.9, 24),
    b('adega-heineken-ln', 'Heineken long neck 330 ml', '🍺', 8, 5.2, 24),
    b('adega-coca2l', 'Coca-Cola 2 L', '🥤', 14, 9.5, 6),
    b('adega-guarana2l', 'Guaraná 2 L', '🥤', 10, 6.5, 6),
    b('adega-redbull', 'Red Bull lata 250 ml', '⚡', 12, 7.5, 24),
    b('adega-agua', 'Água 500 ml', '💧', 3, 1.2, 12),
    b('adega-gelo', 'Gelo saco 5 kg', '🧊', 12, 6, 1),
    b('adega-carvao', 'Carvão 4 kg', '🔥', 25, 16, 1),
    fardo('adega-f-heineken', 'adega-heineken', 'Heineken lata', 12, 72),
    fardo('adega-f-brahma', 'adega-brahma', 'Brahma lata', 12, 48),
    fardo('adega-f-skol', 'adega-skol', 'Skol lata', 12, 48),
  ]
  dados.setProdutos((ps) => [...ps, ...novos.filter((n) => !ps.some((p) => p.id === n.id))])
}

/**
 * Combo "Espeto no pão": o cliente escolhe o espeto; vai 1 pão + vinagrete.
 * Preço base = espeto mais barato + R$ 4; espetos mais caros pagam a diferença (+R$).
 * Abre no editor para conferir antes de salvar.
 */
function espetoNoPao(dados: Dados): Produto {
  const existente = dados.produtos.find((p) => p.categoria === 'combo' && /espeto no p[aã]o/i.test(p.nome))
  if (existente) return existente
  if (!dados.insumos.some((i) => i.id === 'ins-pao')) {
    dados.setInsumos((is) =>
      is.some((i) => i.id === 'ins-pao') ? is : [...is, { id: 'ins-pao', nome: 'Pão francês', unidade: 'un', precoCompra: 9, qtdCompra: 12, grupo: 'Pães' }],
    )
  }
  const espetos = dados.produtos.filter((p) => p.categoria === 'espeto' && p.ativo && p.preco > 0)
  const menor = espetos.length ? Math.min(...espetos.map((p) => p.preco)) : 8
  const acrescimos = Object.fromEntries(espetos.filter((p) => p.preco > menor).map((p) => [p.id, Math.round((p.preco - menor) * 100) / 100]))
  const temVinagrete = dados.insumos.some((i) => i.id === 'ins-vinagrete')
  return {
    id: novoId(),
    nome: 'Espeto no pão',
    categoria: 'combo',
    preco: menor + 4,
    emoji: '🥖',
    ficha: [{ insumoId: 'ins-pao', qtd: 1 }, ...(temVinagrete ? [{ insumoId: 'ins-vinagrete', qtd: 30 }] : [])],
    custoDireto: 0,
    ativo: true,
    descricao: 'Espeto à escolha no pão francês com vinagrete',
    tamanho: '1 pão + 1 espeto',
    componentes: [
      {
        id: 'c-espeto',
        nome: 'Espeto',
        qtd: 1,
        opcoes: espetos.map((p) => p.id),
        ...(Object.keys(acrescimos).length ? { acrescimos } : {}),
      },
    ],
  }
}
