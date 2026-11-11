import { useCallback, useEffect, useRef, useState } from 'react'
import { aplicarBackup, montarBackup, type Dados } from './dados'
import { aparelho, aparelhoVazio, silenciado, silenciarMudanca } from './sincronia'
import { montarTabelas } from './planilha'

/**
 * Salvamento automático numa pasta do computador (ex.: a pasta do Google Drive para computador,
 * que sobe sozinha para a nuvem). Usa a API de acesso a arquivos do Chrome/Edge: o usuário escolhe a
 * pasta uma vez e o sistema regrava os arquivos a cada mudança.
 */

// tipos da File System Access API que ainda não estão no TypeScript padrão
type Permissao = 'granted' | 'denied' | 'prompt'
interface PastaHandle extends FileSystemDirectoryHandle {
  queryPermission(o: { mode: 'readwrite' }): Promise<Permissao>
  requestPermission(o: { mode: 'readwrite' }): Promise<Permissao>
}
type JanelaComPasta = Window & { showDirectoryPicker?: (o?: object) => Promise<PastaHandle> }

export const pastaSuportada = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

// ---- guarda a pasta escolhida (IndexedDB aceita guardar o "handle") ----
const BANCO = 'espeto-pasta'
function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(BANCO, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function kv<T>(modo: 'get' | 'put' | 'delete', valor?: T): Promise<T | undefined> {
  const db = await abrirBanco()
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', modo === 'get' ? 'readonly' : 'readwrite')
    const st = tx.objectStore('kv')
    const r = modo === 'get' ? st.get('pasta') : modo === 'put' ? st.put(valor, 'pasta') : st.delete('pasta')
    r.onsuccess = () => res(r.result as T)
    r.onerror = () => rej(r.error)
  })
}

// ---- arquivos ----
async function gravar(pasta: FileSystemDirectoryHandle, nome: string, conteudo: string) {
  const arq = await pasta.getFileHandle(nome, { create: true })
  const w = await arq.createWritable()
  await w.write(conteudo)
  await w.close()
}

/** CSV no padrão brasileiro (ponto e vírgula, vírgula decimal, BOM) para abrir certinho no Excel e no Google Planilhas. */
function csv(cabecalho: string[], linhas: (string | number | boolean)[][]) {
  const cel = (v: string | number | boolean) => {
    const t = typeof v === 'number' ? String(v).replace('.', ',') : String(v).replace(/^'/, '')
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(cel).join(';')).join('\r\n')
}

// controle de versão da pasta neste aparelho
const CHAVE_META = 'espeto:pasta-sync'
interface MetaPasta {
  /** geradoEm do último backup gravado ou carregado por este aparelho. */
  versao?: string
  /** Mudanças deste aparelho ainda não gravadas na pasta. */
  pendente?: boolean
  /** lastModified do arquivo na última leitura (evita ler o arquivo à toa). */
  modificado?: number
}
function lerMeta(): MetaPasta {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_META) || '{}')
  } catch {
    return {}
  }
}
function gravarMeta(m: MetaPasta) {
  try {
    localStorage.setItem(CHAVE_META, JSON.stringify(m))
  } catch {
    // ignora
  }
}

async function salvarTudo(pasta: FileSystemDirectoryHandle, d: Dados) {
  const obj = { ...montarBackup(d), aparelho: aparelho() }
  const backup = JSON.stringify(obj)
  await gravar(pasta, 'pdv-espetinho-backup.json', backup)
  // uma cópia por dia, para voltar no tempo se precisar
  const dia = new Date().toLocaleDateString('sv-SE') // AAAA-MM-DD no fuso local
  const hist = await pasta.getDirectoryHandle('backups-diarios', { create: true })
  await gravar(hist, `backup-${dia}.json`, backup)
  for (const t of montarTabelas(d)) await gravar(pasta, `${t.nome}.csv`, csv(t.cabecalho, t.linhas))
  return obj.geradoEm
}

export type EstadoPasta =
  | { tipo: 'nenhuma' }
  | { tipo: 'precisaPermissao'; nome: string }
  | { tipo: 'pendente' | 'salvando'; nome: string }
  | { tipo: 'ok'; nome: string; em: string }
  | { tipo: 'erro'; nome: string; msg: string }

export function usePasta(dados: Dados) {
  const [pasta, setPasta] = useState<PastaHandle | null>(null)
  const [estado, setEstado] = useState<EstadoPasta>({ tipo: 'nenhuma' })
  /** Backup mais novo na pasta que não foi carregado sozinho (há mudanças locais não gravadas). */
  const [remotoNovo, setRemotoNovo] = useState<{ geradoEm: string } | null>(null)
  const [atualizadoAuto, setAtualizadoAuto] = useState<string | null>(null)
  const dadosRef = useRef(dados)
  dadosRef.current = dados
  const ocupado = useRef(false)

  const salvar = useCallback(async (p: PastaHandle | null = pasta) => {
    if (!p) return
    setEstado({ tipo: 'salvando', nome: p.name })
    try {
      if ((await p.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        setEstado({ tipo: 'precisaPermissao', nome: p.name })
        return
      }
      ocupado.current = true
      const versao = await salvarTudo(p, dadosRef.current)
      const arq = await (await p.getFileHandle('pdv-espetinho-backup.json')).getFile()
      gravarMeta({ versao, pendente: false, modificado: arq.lastModified })
      setEstado({ tipo: 'ok', nome: p.name, em: new Date().toISOString() })
    } catch (e) {
      setEstado({ tipo: 'erro', nome: p.name, msg: e instanceof Error ? e.message : String(e) })
    } finally {
      ocupado.current = false
    }
  }, [pasta])

  /**
   * Lê o backup da pasta. Se outro computador gravou algo mais novo (o Google Drive sincroniza o arquivo):
   * sem mudanças locais pendentes, carrega sozinho; senão, pergunta.
   */
  const conferir = useCallback(async () => {
    const p = pasta
    if (!p || ocupado.current) return
    if ((await p.queryPermission({ mode: 'readwrite' })) !== 'granted') return
    let arq: File
    try {
      arq = await (await p.getFileHandle('pdv-espetinho-backup.json')).getFile()
    } catch {
      return // ainda não tem backup na pasta
    }
    const meta = lerMeta()
    if (meta.modificado === arq.lastModified) return
    const b = JSON.parse(await arq.text()) as Partial<ReturnType<typeof montarBackup>> & { aparelho?: string }
    // backup antigo, sem marca de aparelho: foi gravado por este sistema antes desta versão — vira a referência
    if (!b.aparelho && !meta.versao) {
      gravarMeta({ ...meta, versao: b.geradoEm, modificado: arq.lastModified })
      return
    }
    const novo = !!b.geradoEm && (!meta.versao || b.geradoEm > meta.versao) && b.aparelho !== aparelho()
    if (!novo) {
      gravarMeta({ ...meta, modificado: arq.lastModified })
      return
    }
    const podeSozinho = !meta.pendente && (!!meta.versao || aparelhoVazio(dadosRef.current))
    if (podeSozinho) {
      silenciarMudanca()
      aplicarBackup(dadosRef.current, b)
      gravarMeta({ versao: b.geradoEm, pendente: false, modificado: arq.lastModified })
      setAtualizadoAuto(b.geradoEm!)
      setRemotoNovo(null)
    } else setRemotoNovo({ geradoEm: b.geradoEm! })
  }, [pasta])
  const conferirRef = useRef(conferir)
  conferirRef.current = conferir

  // confere ao abrir, a cada 30 s e quando a tela volta a ficar visível
  useEffect(() => {
    if (!pasta) return
    const checar = () => {
      if (document.visibilityState === 'visible') void conferirRef.current().catch(() => {})
    }
    checar()
    const t = setInterval(checar, 30000)
    document.addEventListener('visibilitychange', checar)
    window.addEventListener('focus', checar)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', checar)
      window.removeEventListener('focus', checar)
    }
  }, [pasta])

  // ao abrir: recupera a pasta escolhida antes
  useEffect(() => {
    if (!pastaSuportada()) return
    kv<PastaHandle>('get')
      .then(async (p) => {
        if (!p) return
        setPasta(p)
        const perm = await p.queryPermission({ mode: 'readwrite' })
        setEstado(perm === 'granted' ? { tipo: 'ok', nome: p.name, em: '' } : { tipo: 'precisaPermissao', nome: p.name })
      })
      .catch(() => {})
  }, [])

  // salva alguns segundos depois de cada mudança
  const { insumos, produtos, pedidos, caixas, movEstoque, comandas, config } = dados
  const configTxt = JSON.stringify(config)
  const primeira = useRef(true)
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false
      return
    }
    // dados que chegaram de fora não são mudança local
    if (silenciado()) return
    if (!pasta) return
    gravarMeta({ ...lerMeta(), pendente: true })
    if (remotoNovo) return
    setEstado((e) => (e.tipo === 'precisaPermissao' ? e : { tipo: 'pendente', nome: pasta.name }))
    const t = setTimeout(() => void salvar(), 3000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insumos, produtos, pedidos, caixas, movEstoque, comandas, configTxt])

  /** Precisa ser chamado num clique (o navegador exige). */
  const escolher = useCallback(async () => {
    const w = window as JanelaComPasta
    if (!w.showDirectoryPicker) return
    try {
      const p = await w.showDirectoryPicker({ id: 'pdv-espetinho', mode: 'readwrite', startIn: 'documents' })
      // a pasta já tem dados (de outro computador)? pergunta antes de sobrescrever
      let existente: Partial<ReturnType<typeof montarBackup>> | null = null
      try {
        const arq = await p.getFileHandle('pdv-espetinho-backup.json')
        existente = JSON.parse(await (await arq.getFile()).text())
      } catch {
        existente = null
      }
      if (existente?.pedidos) {
        const quando = existente.geradoEm ? new Date(existente.geradoEm).toLocaleString('pt-BR') : '?'
        const carregar = confirm(
          `Essa pasta já tem dados do sistema (${existente.pedidos.length} pedidos, salvos em ${quando}).\n\n` +
            'OK = usar os dados DA PASTA neste computador\nCancelar = outras opções',
        )
        if (carregar) {
          silenciarMudanca()
          aplicarBackup(dadosRef.current, existente)
          gravarMeta({ versao: existente.geradoEm, pendente: false })
        } else if (!confirm('Substituir os dados da pasta pelos DESTE computador? (os da pasta continuam em backups-diarios)')) {
          return
        }
      }
      await kv('put', p)
      setPasta(p)
      await salvar(p)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      throw e
    }
  }, [salvar])

  /** Depois de reabrir o navegador o Chrome pede para confirmar o acesso — também num clique. */
  const reautorizar = useCallback(async () => {
    if (!pasta) return
    if ((await pasta.requestPermission({ mode: 'readwrite' })) === 'granted') await salvar(pasta)
  }, [pasta, salvar])

  const esquecer = useCallback(async () => {
    await kv('delete')
    setPasta(null)
    setEstado({ tipo: 'nenhuma' })
  }, [])

  /** Lê o backup que está na pasta (para levar os dados a outro computador). */
  const lerBackup = useCallback(async () => {
    if (!pasta) throw new Error('Escolha a pasta primeiro.')
    if ((await pasta.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Sem permissão para ler a pasta.')
    const arq = await pasta.getFileHandle('pdv-espetinho-backup.json')
    return JSON.parse(await (await arq.getFile()).text())
  }, [pasta])

  /** Conflito: usar o que está na pasta (descarta as mudanças locais não gravadas). */
  const usarRemoto = useCallback(async () => {
    if (!pasta) return
    const arq = await (await pasta.getFileHandle('pdv-espetinho-backup.json')).getFile()
    const b = JSON.parse(await arq.text())
    silenciarMudanca()
    aplicarBackup(dadosRef.current, b)
    gravarMeta({ versao: b.geradoEm, pendente: false, modificado: arq.lastModified })
    setRemotoNovo(null)
  }, [pasta])
  /** Conflito: manter os deste computador e gravar por cima. */
  const manterLocal = useCallback(async () => {
    setRemotoNovo(null)
    await salvar()
  }, [salvar])

  return {
    suportado: pastaSuportada(),
    estado,
    escolher,
    reautorizar,
    salvar: () => salvar(),
    esquecer,
    lerBackup,
    remotoNovo,
    usarRemoto,
    manterLocal,
    atualizadoAuto,
    fecharAviso: () => setAtualizadoAuto(null),
  }
}
export type Pasta = ReturnType<typeof usePasta>
