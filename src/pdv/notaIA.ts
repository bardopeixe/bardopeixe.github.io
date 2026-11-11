import { z } from 'zod'
import { limparCodigo } from './dados'
import type { Produto } from './tipos'

/**
 * Leitura de nota fiscal por foto com o Claude (API da Anthropic), direto do navegador.
 * A chave fica só neste aparelho (localStorage separado — não vai para backup, planilha nem pasta).
 */

const CHAVE_STORAGE = 'espeto:chave-ia'
export const MODELO = 'claude-opus-5-5'

export function lerChaveIA() {
  try {
    return localStorage.getItem(CHAVE_STORAGE) ?? ''
  } catch {
    return ''
  }
}
export function salvarChaveIA(chave: string) {
  try {
    if (chave.trim()) localStorage.setItem(CHAVE_STORAGE, chave.trim())
    else localStorage.removeItem(CHAVE_STORAGE)
  } catch {
    // sem localStorage (modo privado): a leitura por foto fica indisponível
  }
}

export const NotaLidaSchema = z.object({
  fornecedor: z.string().nullable(),
  numeroNota: z.string().nullable(),
  data: z.string().nullable(),
  itens: z.array(
    z.object({
      descricao: z.string(),
      codigoBarras: z.string().nullable(),
      quantidade: z.number(),
      embalagem: z.enum(['caixa', 'fardo', 'pacote', 'unidade', 'outro']),
      unidadesPorEmbalagem: z.number().nullable(),
      valorUnitario: z.number().nullable(),
      desconto: z.number().nullable(),
      valorTotal: z.number(),
      duvida: z.boolean(),
    }),
  ),
  totalNota: z.number().nullable(),
  observacao: z.string().nullable(),
})
export type NotaLida = z.infer<typeof NotaLidaSchema>
export type ItemLido = NotaLida['itens'][number]

const INSTRUCOES = `Você lê notas de compra de uma adega/bar no Brasil (NF-e/DANFE, cupom NFC-e, pedido de distribuidora, nota de atacado ou anotação à mão) e devolve os itens para lançar no estoque.

Para cada linha de produto da nota:
- descricao: o texto do produto como está na nota (ex.: "CERV SKOL LT 350ML C/12").
- codigoBarras: só se a nota mostrar um código EAN/GTIN (8 a 14 dígitos, às vezes chamado cEAN ou "cód. barras"). Código interno do fornecedor não é código de barras: nesse caso use null.
- quantidade: a quantidade comprada na unidade comercial da nota (ex.: 5 caixas → 5).
- embalagem: "caixa", "fardo", "pacote", "unidade" ou "outro", conforme a unidade da linha (CX, FD, PCT, UN, GF…).
- unidadesPorEmbalagem: quantas unidades vêm em cada caixa/fardo/pacote quando a nota indica (ex.: "C/12", "12X350ML", "FD 6UN"). Se a embalagem é unidade, use 1. Se não dá para saber, use null.
- valorUnitario: preço de cada embalagem na nota, ou null se não aparece.
- desconto: o desconto deste item, se a nota mostrar (ex.: linha "DESCONTO -2,50" ou "DESC. ITEM" logo abaixo do produto, ou coluna de desconto). Positivo, em reais. null se não houver.
- valorTotal: quanto foi pago de verdade por esta linha: valor do item MENOS o desconto do item. Ex.: item 38,89 com desconto 3,00 → 35,89.
- duvida: true se alguma parte da linha estava difícil de ler ou você precisou deduzir.

Também: fornecedor (razão social ou nome fantasia do emitente), numeroNota, data (como aparece) e totalNota (valor total a pagar). Use null no que não aparecer.
Não invente itens. Linhas de desconto de um item não são itens: some no "desconto" do produto de cima. Não inclua frete, desconto geral, impostos ou troco como itens — se houver desconto geral ou frete, conte em "observacao".
Valores em reais como número (ex.: 4,59 → 4.59).`

export interface Anexo {
  nome: string
  tipo: 'imagem' | 'pdf'
  base64: string
  /** Para mostrar a miniatura. */
  previa?: string
}

/** Reduz a foto (celular tira fotos enormes) mantendo o texto legível. */
export async function prepararArquivo(f: File): Promise<Anexo> {
  const dataUrl = await new Promise<string>((ok, erro) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = () => erro(new Error('Não consegui abrir o arquivo.'))
    r.readAsDataURL(f)
  })
  if (f.type === 'application/pdf') return { nome: f.name, tipo: 'pdf', base64: dataUrl.split(',')[1] }
  if (!f.type.startsWith('image/')) throw new Error(`${f.name} não é foto nem PDF.`)
  const img = await new Promise<HTMLImageElement>((ok, erro) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => erro(new Error(`Não consegui abrir a foto ${f.name}.`))
    i.src = dataUrl
  })
  const max = 2000
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const cv = document.createElement('canvas')
  cv.width = Math.round(img.width * k)
  cv.height = Math.round(img.height * k)
  cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height)
  const jpg = cv.toDataURL('image/jpeg', 0.88)
  return { nome: f.name, tipo: 'imagem', base64: jpg.split(',')[1], previa: jpg }
}

export class ErroLeitura extends Error {}

export async function lerNotaPorFoto(anexos: Anexo[], chave: string): Promise<NotaLida> {
  const [{ default: Anthropic }, { betaZodOutputFormat }] = await Promise.all([import('@anthropic-ai/sdk'), import('@anthropic-ai/sdk/helpers/beta/zod')])
  // a chave é do próprio dono do PDV, usada só no aparelho dele
  const client = new Anthropic({ apiKey: chave, dangerouslyAllowBrowser: true })
  try {
    const resposta = await client.beta.messages.parse({
      model: MODELO,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: INSTRUCOES,
      messages: [
        {
          role: 'user',
          content: [
            ...anexos.map((a) =>
              a.tipo === 'pdf'
                ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 } } as const)
                : ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: a.base64 } } as const),
            ),
            {
              type: 'text',
              text: anexos.length > 1 ? `São ${anexos.length} fotos/páginas da mesma nota, em ordem. Leia todos os itens.` : 'Leia os itens desta nota.',
            },
          ],
        },
      ],
      output_config: { format: betaZodOutputFormat(NotaLidaSchema) },
    })
    if (resposta.stop_reason === 'refusal') throw new ErroLeitura('A IA não quis ler esta imagem. Tente outra foto.')
    if (resposta.stop_reason === 'max_tokens') throw new ErroLeitura('A nota é grande demais para uma leitura só. Mande em partes (algumas fotos por vez).')
    if (!resposta.parsed_output) throw new ErroLeitura('Não consegui entender a resposta. Tente de novo.')
    return resposta.parsed_output
  } catch (e) {
    if (e instanceof ErroLeitura) throw e
    if (e instanceof Anthropic.AuthenticationError) throw new ErroLeitura('A chave da IA não foi aceita. Confira em Configurações → 🤖 Ler nota por foto.')
    if (e instanceof Anthropic.PermissionDeniedError) throw new ErroLeitura('A chave não tem permissão para este modelo. Confira a conta na Anthropic.')
    if (e instanceof Anthropic.RateLimitError) throw new ErroLeitura('Muitas leituras seguidas (ou sem crédito). Espere um pouco e tente de novo.')
    if (e instanceof Anthropic.BadRequestError) throw new ErroLeitura(`A IA recusou o envio: ${e.message}`)
    if (e instanceof Anthropic.APIConnectionError) throw new ErroLeitura('Sem conexão com a internet (ou a conexão caiu). Tente de novo.')
    if (e instanceof Anthropic.APIError) throw new ErroLeitura(`Erro da IA (${e.status ?? '?'}). Tente de novo em instantes.`)
    throw e
  }
}

/** Confere a chave sem gastar nada (só consulta o modelo). */
export async function testarChave(chave: string) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: chave, dangerouslyAllowBrowser: true })
  await client.models.retrieve(MODELO)
}

// ---------------- casar itens da nota com os produtos ----------------

const norm = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const ABREV: [RegExp, string][] = [
  [/\bcerv\b|\bcer\b|\bcerveja\b/g, ''],
  [/\blt\b|\blata\b/g, ' lata '],
  [/\bltao\b|\blatao\b/g, ' latao '],
  [/\bln\b|\blong ?neck\b/g, ' longneck '],
  [/\bgf\b|\bgarrafa\b|\bgfa\b/g, ' garrafa '],
  [/\bref\b|\brefri\b|\brefrig\b|\brefrigerante\b/g, ''],
  [/\bpet\b/g, ''],
  [/\bh2oh\b/g, ' h2oh '],
  [/(\d+(?:[.,]\d+)?)\s*(ml|l|lt|lts|kg|g)\b/g, ' $1$2 '],
]

function tokens(t: string) {
  let s = ` ${norm(t)} `.replace(/[^a-z0-9.,]+/g, ' ')
  for (const [re, sub] of ABREV) s = s.replace(re, sub)
  s = s.replace(/(\d)[.,](\d)/g, '$1.$2').replace(/(\d+)lt?s?\b/g, '$1l')
  // "1l" e "1000ml" são a mesma coisa; "2l" = "2000ml"
  s = s.replace(/\b(\d+(?:\.\d+)?)l\b/g, (_, n) => `${Math.round(Number(n) * 1000)}ml`)
  return [...new Set(s.split(/\s+/).filter((x) => x.length > 1 || /\d/.test(x)))]
}

/** Palavras que não identificam o produto sozinhas (tipo, embalagem). */
const GENERICOS = new Set(
  'cerveja lata latao latinha longneck garrafa garrafinha barrigudinha litrao pet vidro retornavel pilsen puro malte vodka whisky gin cachaca conhaque vinho tinto suave seco refrigerante agua mineral com sem gas suco energetico gelo saco carvao pacote fardo caixa cx un und unid pack de do da'.split(' '),
)

/** Qualquer coisa que pode casar com uma linha da nota (produto ou insumo). */
export interface Candidato {
  id: string
  nome: string
  codigos?: string[]
  nomesNota?: string[]
}

export interface Casamento<T extends Candidato = Produto> {
  produto: T | null
  certeza: 'codigo' | 'nome-salvo' | 'parecido' | 'nenhum'
}

export function casarItem<T extends Candidato>(item: ItemLido, produtos: T[]): Casamento<T> {
  const cod = item.codigoBarras ? limparCodigo(item.codigoBarras) : ''
  if (cod.length >= 8) {
    const p = produtos.find((x) => x.codigos?.some((c) => limparCodigo(c) === cod))
    if (p) return { produto: p, certeza: 'codigo' }
  }
  const desc = norm(item.descricao).trim()
  const salvo = produtos.find((p) => p.nomesNota?.some((n) => norm(n).trim() === desc))
  if (salvo) return { produto: salvo, certeza: 'nome-salvo' }

  const tn = tokens(item.descricao)
  let melhor: T | null = null
  let nota = 0
  for (const p of produtos) {
    const tp = tokens(p.nome)
    // só a marca/sabor decide: "lata", "vodka", "garrafa" sozinhos não bastam
    const marcas = tp.filter((x) => !/\d/.test(x) && !GENERICOS.has(x))
    const bate = (x: string) => tn.some((y) => y === x || (x.length >= 4 && y.length >= 4 && (y.startsWith(x) || x.startsWith(y))))
    if (!marcas.length) {
      // produto sem marca (ex.: "Gelo saco 5 kg", "Água 500 ml"): tudo precisa bater, inclusive o tamanho
      const tudo = tp.filter((x) => !['saco', 'pacote', 'de', 'do', 'da'].includes(x))
      if (tudo.length && tudo.every((x) => (/\d/.test(x) ? tn.includes(x) : bate(x))) && 0.7 > nota) {
        nota = 0.7
        melhor = p
      }
      continue
    }
    const acertoMarca = marcas.filter(bate).length
    if (!acertoMarca) continue
    const outros = tp.filter((x) => !marcas.includes(x))
    const numeros = outros.filter((x) => /\d/.test(x))
    const acertoOutros = outros.filter((x) => (/\d/.test(x) ? tn.includes(x) : bate(x))).length
    // tamanho diferente (350 vs 269) derruba o casamento
    const numeroErrado = numeros.length > 0 && tn.some((y) => /^\d+ml$/.test(y)) && !numeros.some((x) => tn.includes(x))
    let s = (acertoMarca / marcas.length) * 0.7 + (outros.length ? (acertoOutros / outros.length) * 0.3 : 0.3)
    if (numeroErrado) s *= 0.3
    if (s > nota) {
      nota = s
      melhor = p
    }
  }
  return nota >= 0.6 ? { produto: melhor, certeza: 'parecido' } : { produto: null, certeza: 'nenhum' }
}

/** Nome limpo para cadastrar um produto que veio da nota (ex.: "CERV SKOL LT 350ML" → "Cerv Skol Lt 350ml"). */
export function nomeDoItem(descricao: string) {
  return descricao
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
}
