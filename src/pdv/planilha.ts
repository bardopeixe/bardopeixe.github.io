import { useCallback, useEffect, useRef, useState } from 'react'
import { aparelho, aparelhoVazio, silenciado, silenciarMudanca } from './sincronia'
import { NOMES_CANAL, NOMES_CATEGORIA, NOMES_FORMA, aplicarBackup, custoUnitarioInsumo, montarBackup, resumirCaixa, type Dados } from './dados'

/**
 * Sincronização com uma planilha do Google, via Apps Script implantado como app da Web.
 * O navegador continua sendo o lugar principal dos dados (funciona sem internet);
 * a planilha recebe uma cópia a cada mudança e serve para consultar e restaurar em outro aparelho.
 */

type Celula = string | number | boolean
interface Tabela {
  nome: string
  cabecalho: string[]
  linhas: Celula[][]
}

const CHAVE_META = 'espeto:sync'

interface Meta {
  /** Data (ISO) da última versão enviada ou carregada da planilha. */
  versao?: string
  /** Há mudanças deste aparelho que ainda não foram para a planilha (ex.: internet caiu). */
  pendente?: boolean
}

function lerMeta(): Meta {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_META) || '{}')
  } catch {
    return {}
  }
}
function gravarMeta(m: Meta) {
  try {
    localStorage.setItem(CHAVE_META, JSON.stringify(m))
  } catch {
    // ignora
  }
}

/** Texto que começa com = + - @ viraria fórmula na planilha. */
const txt = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s)
const dh = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const r2 = (v: number) => Math.round(v * 100) / 100

export function montarTabelas(d: Pick<Dados, 'insumos' | 'produtos' | 'pedidos' | 'caixas' | 'movEstoque'>): Tabela[] {
  const numCaixa = new Map(d.caixas.map((c) => [c.id, c.numero]))
  const caixasOrd = d.caixas.slice().sort((a, b) => a.abertoEm.localeCompare(b.abertoEm))

  const caixas: Tabela = {
    nome: 'Caixas',
    cabecalho: [
      'Caixa Nº', 'Abertura', 'Fechamento', 'Pedidos', 'Espetos vendidos', 'Faturamento', 'Dinheiro', 'Pix', 'Débito', 'Crédito', 'Apps delivery',
      'Taxas maquininha', 'Custo dos produtos', 'Despesas', 'Lucro', 'Dinheiro esperado', 'Dinheiro contado', 'Diferença', 'Em conta', 'Observação',
    ],
    linhas: caixasOrd.map((c) => {
      const r = resumirCaixa(c, d.pedidos, d.produtos, d.movEstoque)
      return [
        c.numero, dh(c.abertoEm), c.fechadoEm ? dh(c.fechadoEm) : 'ABERTO', r.qtdPedidos, r.espetosVendidos, r2(r.faturamento),
        r2(r.porForma.dinheiro), r2(r.porForma.pix), r2(r.porForma.debito), r2(r.porForma.credito), r2(r.porForma.app), r2(r.taxas), r2(r.cmv), r2(r.despesas),
        r2(r.lucroLiquido), r2(r.dinheiroEsperado), c.dinheiroContado ?? '', c.dinheiroContado !== undefined ? r2(c.dinheiroContado - r.dinheiroEsperado) : '',
        r2(r.emConta), txt(c.observacao ?? ''),
      ]
    }),
  }

  const pedidos: Tabela = {
    nome: 'Pedidos',
    cabecalho: ['Data', 'Caixa Nº', 'Pedido Nº', 'Cliente', 'Para viagem', 'Itens', 'Subtotal', 'Desconto', 'Total', 'Pagamento', 'Troco', 'Custo', 'Lucro bruto', 'Situação'],
    linhas: d.pedidos.map((p) => [
      dh(p.criadoEm), numCaixa.get(p.caixaId) ?? '', p.numero, txt(p.cliente), p.canal && p.canal !== 'balcao' ? NOMES_CANAL[p.canal] : p.viagem ? 'Sim' : 'Não',
      txt(p.itens.map((i) => `${i.qtd}x ${i.nome}${i.escolhas?.length ? ` (${i.escolhas.map((e) => `${e.qtd * i.qtd} ${e.nome}`).join(', ')})` : ''}`).join('; ')),
      r2(p.subtotal), r2(p.desconto), r2(p.total), p.pagamentos.map((pg) => `${NOMES_FORMA[pg.forma]} ${pg.valor.toFixed(2)}`).join(' + '),
      r2(p.troco), r2(p.custoTotal), r2(p.total - p.custoTotal - p.taxas), p.cancelado ? 'Cancelado' : p.cortesia ? `Cortesia: ${p.cortesia.motivo}` : p.entregue ? 'Entregue' : 'Aberto',
    ]),
  }

  const itens: Tabela = {
    nome: 'Itens vendidos',
    cabecalho: ['Data', 'Caixa Nº', 'Pedido Nº', 'Produto', 'Categoria', 'Qtd', 'Preço', 'Total', 'Custo unit.', 'Escolhas do combo', 'Observação'],
    linhas: d.pedidos
      .filter((p) => !p.cancelado)
      .flatMap((p) =>
        p.itens.map((i) => [
          dh(p.criadoEm), numCaixa.get(p.caixaId) ?? '', p.numero, txt(i.nome), NOMES_CATEGORIA[i.categoria], i.qtd, r2(i.preco), r2(i.preco * i.qtd),
          r2(i.custo), txt((i.escolhas ?? []).map((e) => `${e.qtd} ${e.nome}`).join(', ')), txt(i.obs),
        ]),
      ),
  }

  const estoque: Tabela = {
    nome: 'Estoque',
    cabecalho: ['Tipo', 'Nome', 'Grupo/Categoria', 'Quantidade', 'Unidade', 'Custo unitário', 'Preço de venda'],
    linhas: [
      ...d.insumos.map((i) => ['Insumo', txt(i.nome), txt(i.grupo || ''), i.estoque ?? 'não controla', i.unidade, r2(custoUnitarioInsumo(i)), '']),
      ...d.produtos.map((p) => ['Produto', txt(p.nome), NOMES_CATEGORIA[p.categoria], p.estoque ?? 'não controla', 'un', '', r2(p.preco)]),
    ],
  }

  const movimentos: Tabela = {
    nome: 'Mov. estoque',
    cabecalho: ['Data', 'Tipo', 'Item', 'Quantidade', 'Unidade', 'Valor pago', 'Usou', 'Obs.'],
    linhas: d.movEstoque.map((m) => [
      dh(m.criadoEm), m.tipo, txt(m.nome), m.qtd, m.unidade, m.valor ?? '', txt((m.consumo ?? []).map((c) => `${c.qtd} ${c.unidade} ${c.nome}`).join(', ')),
      txt(m.obs ?? ''),
    ]),
  }

  const despesas: Tabela = {
    nome: 'Despesas',
    cabecalho: ['Data', 'Caixa Nº', 'Tipo', 'Descrição', 'Valor', 'Pago com'],
    linhas: caixasOrd.flatMap((c) =>
      c.movimentos.map((m) => [dh(m.criadoEm), c.numero, m.tipo, txt(m.descricao), r2(m.valor), m.origem === 'dinheiro' ? 'Gaveta' : 'Conta']),
    ),
  }

  return [caixas, pedidos, itens, estoque, movimentos, despesas]
}

async function chamar(url: string, corpo: object) {
  // text/plain evita a checagem prévia (CORS) que o Apps Script não responde
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo), redirect: 'follow' })
  if (!resp.ok) throw new Error(`A planilha respondeu ${resp.status}`)
  const json = await resp.json().catch(() => {
    throw new Error('Resposta inesperada — confira se implantou como “App da Web” com acesso “Qualquer pessoa”.')
  })
  if (!json.ok) throw new Error(json.erro || 'Erro na planilha')
  return json
}

export const urlValida = (u: string) => /^https:\/\/script\.google(usercontent)?\.com\/.+/.test(u.trim())

export type Estado =
  | { tipo: 'desligado' }
  | { tipo: 'pendente' }
  | { tipo: 'enviando' }
  | { tipo: 'ok'; em: string }
  | { tipo: 'erro'; msg: string }

export interface Remoto {
  atualizadoEm: string
  aparelho: string | null
}

/** Mantém a planilha atualizada e avisa quando ela tem dados mais novos que este aparelho. */
export function usePlanilha(dados: Dados) {
  const { config } = dados
  const url = config.planilhaUrl.trim()
  const ligado = urlValida(url) && !!config.planilhaChave
  const [estado, setEstado] = useState<Estado>({ tipo: 'desligado' })
  /** Dados mais novos na planilha que NÃO foram carregados sozinhos (este aparelho tem mudanças não enviadas). */
  const [remotoMaisNovo, setRemotoMaisNovo] = useState<Remoto | null>(null)
  /** Aviso de que os dados foram atualizados sozinhos com os de outro aparelho. */
  const [atualizadoAuto, setAtualizadoAuto] = useState<string | null>(null)
  /** Endereço da planilha no Google Drive (para abrir e ver as vendas). */
  const [linkPlanilha, setLinkPlanilha] = useState<string | null>(null)
  const dadosRef = useRef(dados)
  dadosRef.current = dados
  /** Só envia depois de conferir a planilha — evita um aparelho vazio apagar os dados de lá. */
  const [verificado, setVerificado] = useState(false)
  const ocupado = useRef(false)

  const enviar = useCallback(async () => {
    if (!ligado || ocupado.current) return
    ocupado.current = true
    const d = dadosRef.current
    const versao = new Date().toISOString()
    setEstado({ tipo: 'enviando' })
    try {
      await chamar(url, {
        acao: 'salvar',
        chave: config.planilhaChave,
        atualizadoEm: versao,
        aparelho: aparelho(),
        tabelas: montarTabelas(d),
        dados: montarBackup(d),
      })
      gravarMeta({ versao, pendente: false })
      setEstado({ tipo: 'ok', em: versao })
    } catch (e) {
      setEstado({ tipo: 'erro', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      ocupado.current = false
    }
  }, [ligado, url, config.planilhaChave])

  const enviarRef = useRef(enviar)
  enviarRef.current = enviar

  /** Substitui os dados deste aparelho pelos da planilha (mantém endereço e chave da planilha). */
  const carregar = useCallback(async () => {
    ocupado.current = true
    try {
      const r = await chamar(url, { acao: 'carregar', chave: config.planilhaChave })
      const b = r.dados
      if (!b || !Array.isArray(b.produtos)) throw new Error('A planilha ainda não tem dados salvos.')
      silenciarMudanca()
      aplicarBackup(dadosRef.current, b)
      gravarMeta({ versao: r.atualizadoEm, pendente: false })
      setRemotoMaisNovo(null)
      setEstado({ tipo: 'ok', em: r.atualizadoEm })
      return r.atualizadoEm as string
    } finally {
      ocupado.current = false
    }
  }, [url, config.planilhaChave])
  const carregarRef = useRef(carregar)
  carregarRef.current = carregar

  /**
   * Confere a planilha. Se outro aparelho salvou algo mais novo:
   * - sem mudanças locais pendentes → carrega sozinho;
   * - com mudanças locais não enviadas → pergunta (para nenhuma venda se perder).
   */
  const conferir = useCallback(async () => {
    if (!ligado || ocupado.current) return
    const r: { atualizadoEm: string | null; aparelho: string | null; planilhaUrl?: string } = await chamar(url, {
      acao: 'info',
      chave: config.planilhaChave,
    })
    if (r.planilhaUrl) setLinkPlanilha(r.planilhaUrl)
    setVerificado(true)
    const meta = lerMeta()
    const novo = !!r.atualizadoEm && (!meta.versao || r.atualizadoEm > meta.versao) && r.aparelho !== aparelho()
    if (novo) {
      // aparelho nunca sincronizado mas com vendas: pergunta antes de trocar
      const podeSozinho = !meta.pendente && (!!meta.versao || aparelhoVazio(dadosRef.current))
      if (podeSozinho) {
        try {
          setAtualizadoAuto(await carregarRef.current())
        } catch {
          setRemotoMaisNovo({ atualizadoEm: r.atualizadoEm!, aparelho: r.aparelho })
        }
      } else setRemotoMaisNovo({ atualizadoEm: r.atualizadoEm!, aparelho: r.aparelho })
      return
    }
    setEstado((e) => (e.tipo === 'pendente' || e.tipo === 'enviando' ? e : { tipo: 'ok', em: r.atualizadoEm ?? '' }))
    // planilha vazia: manda o que este aparelho tem
    if (!r.atualizadoEm && config.planilhaAuto) void enviarRef.current()
  }, [ligado, url, config.planilhaChave, config.planilhaAuto])
  const conferirRef = useRef(conferir)
  conferirRef.current = conferir

  // ao abrir (e ao trocar endereço/chave): confere já; se falhar, tenta de novo em 30 s
  useEffect(() => {
    setVerificado(false)
    if (!ligado) {
      setEstado({ tipo: 'desligado' })
      return
    }
    let vivo = true
    let tentativa: ReturnType<typeof setTimeout> | undefined
    const tentar = () =>
      conferirRef.current().catch((e) => {
        if (!vivo) return
        setEstado({ tipo: 'erro', msg: e instanceof Error ? e.message : String(e) })
        tentativa = setTimeout(tentar, 30000)
      })
    void tentar()
    return () => {
      vivo = false
      clearTimeout(tentativa)
    }
  }, [ligado, url, config.planilhaChave])

  // depois: confere a cada minuto e sempre que a tela volta a ficar visível
  useEffect(() => {
    if (!ligado || !verificado) return
    const checar = () => {
      if (document.visibilityState === 'visible') void conferirRef.current().catch(() => {})
    }
    const t = setInterval(checar, 60000)
    document.addEventListener('visibilitychange', checar)
    window.addEventListener('focus', checar)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', checar)
      window.removeEventListener('focus', checar)
    }
  }, [ligado, verificado])

  // envia alguns segundos depois de cada mudança deste aparelho
  const { insumos, produtos, pedidos, caixas, movEstoque, comandas } = dados
  const configTxt = JSON.stringify({ ...config, planilhaUrl: '', planilhaChave: '', planilhaAuto: true })
  const primeira = useRef(true)
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false
      return
    }
    // dados que chegaram de fora não são mudança local
    if (silenciado()) return
    if (!ligado) return
    gravarMeta({ ...lerMeta(), pendente: true })
    if (!verificado || !config.planilhaAuto || remotoMaisNovo) return
    setEstado({ tipo: 'pendente' })
    const t = setTimeout(() => enviarRef.current(), 4000)
    return () => clearTimeout(t)
    // só mudanças nos dados disparam envio (não ligar/configurar a planilha)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insumos, produtos, pedidos, caixas, movEstoque, comandas, configTxt])

  // falhou (sem internet)? tenta de novo a cada minuto
  useEffect(() => {
    if (estado.tipo !== 'erro' || !verificado || !config.planilhaAuto || remotoMaisNovo || !lerMeta().pendente) return
    const t = setTimeout(() => enviarRef.current(), 60000)
    return () => clearTimeout(t)
  }, [estado, verificado, config.planilhaAuto, remotoMaisNovo])

  const ignorarRemoto = useCallback(() => {
    setRemotoMaisNovo(null)
    void enviar()
  }, [enviar])

  return {
    ligado,
    estado,
    enviar,
    carregar,
    remotoMaisNovo,
    ignorarRemoto,
    linkPlanilha,
    atualizadoAuto,
    fecharAviso: () => setAtualizadoAuto(null),
  }
}
export type Planilha = ReturnType<typeof usePlanilha>
