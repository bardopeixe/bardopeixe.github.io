import { useEffect, useState } from 'react'
import Cadastros from './Cadastros'
import { ICONE_ESPETO } from './icone'
import CaixaTela from './Caixa'
import ConfigTela from './Config'
import { brl, resumirCaixa, useEspetoDados } from './dados'
import Estoque from './Estoque'
import Comandas from './Comandas'
import Compras from './Compras'
import Reposicao from './Reposicao'
import { statusComanda } from './comanda'
import Painel from './Painel'
import { usePasta } from './pasta'
import { urlValida, usePlanilha } from './planilha'
import { lerConexaoDaUrl, limparUrl } from './conectar'
import Relatorios from './Relatorios'
import Cardapio from './Cardapio'
import Venda from './Venda'
import PedidosOnline, { AlertaPedidoOnline, useOnline } from './PedidosOnline'
import { AvisosGarcom, useGarcomPdv } from './Garcons'

type Aba = 'venda' | 'comandas' | 'online' | 'compras' | 'reposicao' | 'cardapio' | 'painel' | 'estoque' | 'caixa' | 'relatorios' | 'cadastros' | 'config'

const ABAS: { id: Aba; nome: string; icone: string }[] = [
  { id: 'venda', nome: 'Vender', icone: '🛒' },
  { id: 'comandas', nome: 'Mesas', icone: '🍽️' },
  { id: 'online', nome: 'Pedidos online', icone: '📲' },
  { id: 'compras', nome: 'Compras', icone: '🧾' },
  { id: 'reposicao', nome: 'Reposição', icone: '🔁' },
  { id: 'cardapio', nome: 'Cardápio', icone: '📋' },
  { id: 'painel', nome: 'Painel', icone: '📊' },
  { id: 'estoque', nome: 'Estoque', icone: '📦' },
  { id: 'caixa', nome: 'Caixa', icone: '💰' },
  { id: 'relatorios', nome: 'Relatórios', icone: '📈' },
  { id: 'cadastros', nome: 'Cadastros', icone: '🐟' },
  { id: 'config', nome: 'Config.', icone: '⚙️' },
]

/** PDV do Bar do Peixe: vendas, mesas (com garçom no celular), cozinha, estoque, caixa e relatórios. Dados no localStorage. */
export default function Espetinho() {
  const dados = useEspetoDados()
  const planilha = usePlanilha(dados)
  const pasta = usePasta(dados)
  const online = useOnline(dados)
  const garcom = useGarcomPdv(dados, online)
  const [carregando, setCarregando] = useState(false)
  const [aba, setAba] = useState<Aba>('venda')
  const [gaveta, setGaveta] = useState(false)
  const [recolhido, setRecolhidoEstado] = useState(() => {
    try {
      return localStorage.getItem('espeto:menu-recolhido') === '1'
    } catch {
      return false
    }
  })
  const setRecolhido = (f: (v: boolean) => boolean) =>
    setRecolhidoEstado((v) => {
      const novo = f(v)
      try {
        localStorage.setItem('espeto:menu-recolhido', novo ? '1' : '0')
      } catch {
        // sem armazenamento, só não lembra a escolha
      }
      return novo
    })
  const irPara = (a: Aba) => {
    setAba(a)
    setGaveta(false)
  }

  // aberto pelo QR code/link "Conectar celular": liga este aparelho à mesma planilha
  // ícone do Bar do Peixe na aba
  useEffect(() => {
    const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
    const antes = links.map((l) => [l.href, l.type] as const)
    if (!links.length) {
      const l = document.createElement('link')
      l.rel = 'icon'
      document.head.appendChild(l)
      links.push(l)
    }
    links.forEach((l) => {
      l.type = 'image/png'
      l.href = ICONE_ESPETO
    })
    return () => {
      links.forEach((l, k) => {
        if (antes[k]) {
          l.href = antes[k][0]
          l.type = antes[k][1]
        }
      })
    }
  }, [])

  useEffect(() => {
    const c = lerConexaoDaUrl()
    if (!c) return
    limparUrl()
    if (!urlValida(c.url)) return
    if (dados.config.planilhaUrl === c.url && dados.config.planilhaChave === c.chave) return
    if (!confirm('Conectar este aparelho à planilha de vendas?\n\nEle vai receber os dados do caixa (produtos, vendas, comandas, estoque) e se atualizar sozinho.')) return
    dados.setConfig((cfg) => ({ ...cfg, planilhaUrl: c.url, planilhaChave: c.chave, planilhaAuto: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const titulo = document.title
    document.title = `PDV — ${dados.config.nomeLoja}`
    document.documentElement.classList.remove('dark')
    return () => {
      document.title = titulo
    }
  }, [dados.config.nomeLoja])

  const comandasAbertas = dados.comandas.filter((c) => statusComanda(c, dados.pedidos) === 'aberta').length
  const r = dados.caixaAberto ? resumirCaixa(dados.caixaAberto, dados.pedidos, dados.produtos, dados.movEstoque) : null

  const statusPasta =
    pasta.estado.tipo === 'nenhuma'
      ? null
      : {
          texto:
            pasta.estado.tipo === 'ok'
              ? 'Drive: salvo'
              : pasta.estado.tipo === 'precisaPermissao'
                ? 'Drive: clique p/ salvar'
                : pasta.estado.tipo === 'erro'
                  ? 'Drive: erro'
                  : 'Drive: salvando…',
          cor:
            pasta.estado.tipo === 'erro' || pasta.estado.tipo === 'precisaPermissao'
              ? 'text-red-400'
              : pasta.estado.tipo === 'ok'
                ? 'text-emerald-400'
                : 'text-amber-300',
          titulo: pasta.estado.tipo === 'erro' ? pasta.estado.msg : `Salvando na pasta ${pasta.estado.nome}`,
          clique: () => (pasta.estado.tipo === 'precisaPermissao' ? void pasta.reautorizar() : irPara('config')),
        }
  const statusPlanilha = !planilha.ligado
    ? null
    : {
        texto:
          planilha.estado.tipo === 'erro'
            ? 'Planilha: erro'
            : planilha.estado.tipo === 'ok'
              ? 'Planilha: salvo'
              : planilha.estado.tipo === 'enviando'
                ? 'Planilha: salvando…'
                : 'Planilha: …',
        cor: planilha.estado.tipo === 'erro' ? 'text-red-400' : planilha.estado.tipo === 'ok' ? 'text-emerald-400' : 'text-amber-300',
        titulo: planilha.estado.tipo === 'erro' ? planilha.estado.msg : 'Sincronização com o Google Planilhas',
        clique: () => irPara('config'),
      }

  /** Conteúdo do menu (o mesmo na lateral do computador e na gaveta do celular). */
  const menu = (curto: boolean) => (
    <div className="flex h-full flex-col">
      <div className={`flex items-center gap-2 px-3 py-4 ${curto ? 'justify-center' : ''}`}>
        <img src={ICONE_ESPETO} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white" />
        {!curto && <span className="min-w-0 flex-1 truncate font-marca text-2xl leading-none">{dados.config.nomeLoja}</span>}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => irPara(a.id)}
            title={curto ? a.nome : undefined}
            className={`relative flex w-full items-center gap-3 rounded-xl py-2.5 font-bold transition ${curto ? 'justify-center px-0' : 'px-3'} ${
              aba === a.id ? 'bg-orange-600 text-white' : 'text-stone-300 hover:bg-white/10'
            }`}
          >
            <span className="text-xl">{a.icone}</span>
            {!curto && <span className="flex-1 text-left">{a.nome}</span>}
            {a.id === 'online' && online.novos.length > 0 && (
              <span className={`animate-pulse rounded-full bg-red-500 px-1.5 text-xs font-black text-white ${curto ? 'absolute right-1 top-1' : ''}`}>
                {online.novos.length}
              </span>
            )}
            {a.id === 'comandas' && comandasAbertas > 0 && (
              <span
                className={`rounded-full bg-white px-1.5 text-xs font-black text-orange-700 ${curto ? 'absolute right-1 top-1' : ''}`}
              >
                {comandasAbertas}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className={`space-y-1 border-t border-white/10 px-3 py-3 text-xs ${curto ? 'text-center' : ''}`}>
        <button onClick={() => irPara('caixa')} title={r ? `Caixa ${dados.caixaAberto!.numero} aberto` : 'Caixa fechado'} className="block w-full text-left">
          {r ? (
            curto ? (
              <span className="block text-center text-emerald-400">● {r.qtdPedidos}</span>
            ) : (
              <>
                <div className="font-bold text-emerald-400">● Caixa {dados.caixaAberto!.numero} aberto</div>
                <div className="text-stone-400">
                  {r.qtdPedidos} pedidos · {brl(r.faturamento)}
                </div>
              </>
            )
          ) : (
            <span className={`block font-bold text-red-400 ${curto ? 'text-center' : ''}`}>{curto ? '●' : '● Caixa fechado'}</span>
          )}
        </button>
        {[statusPasta, statusPlanilha].map(
          (st, k) =>
            st && (
              <button key={k} onClick={st.clique} title={st.titulo} className={`block w-full font-bold ${st.cor} ${curto ? 'text-center' : 'text-left'}`}>
                {curto ? (k === 0 ? '📁' : '☁') : st.texto}
              </button>
            ),
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 lg:flex">
      {/* Menu lateral (computador): recolhe para só os ícones */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-stone-900 text-white shadow-xl transition-[width] duration-200 lg:flex ${recolhido ? 'w-[76px]' : 'w-60'}`}
      >
        <div className="min-h-0 flex-1">{menu(recolhido)}</div>
        <button
          onClick={() => setRecolhido((v) => !v)}
          className="border-t border-white/10 py-3 text-sm font-bold text-stone-400 hover:bg-white/5 hover:text-white"
          title={recolhido ? 'Abrir menu' : 'Recolher menu'}
        >
          {recolhido ? '»' : '« recolher'}
        </button>
      </aside>

      {/* Celular/tablet em pé: barra fina com botão de menu */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-stone-900 px-3 py-2 text-white shadow lg:hidden">
        <button className="rounded-lg px-2 py-1 text-2xl" onClick={() => setGaveta(true)} aria-label="Abrir menu">
          ☰
        </button>
        <span className="text-lg">{ABAS.find((a) => a.id === aba)?.icone}</span>
        <span className="flex-1 truncate font-extrabold">{ABAS.find((a) => a.id === aba)?.nome}</span>
        {comandasAbertas > 0 && aba !== 'comandas' && (
          <button className="rounded-full bg-orange-600 px-2 text-xs font-bold" onClick={() => irPara('comandas')}>
            📝 {comandasAbertas}
          </button>
        )}
        <span className={`text-xs font-bold ${r ? 'text-emerald-400' : 'text-red-400'}`}>{r ? '● aberto' : '● fechado'}</span>
      </header>
      {gaveta && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setGaveta(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-stone-900 text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {menu(false)}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
      {pasta.remotoNovo && (
        <div className="bg-sky-600 text-white">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-3 py-2">
            <span className="flex-1 font-semibold">
              ⚠ A pasta do Drive tem dados mais novos, salvos em {new Date(pasta.remotoNovo.geradoEm).toLocaleString('pt-BR')} por outro computador, e este tem
              mudanças ainda não gravadas. Qual vale?
            </span>
            <button className="rounded-lg bg-white px-3 py-1.5 font-bold text-sky-800" onClick={() => void pasta.usarRemoto()}>
              Usar os da pasta
            </button>
            <button
              className="rounded-lg px-3 py-1.5 font-semibold text-white underline"
              onClick={() => confirm('Manter os dados DESTE computador e gravar por cima da pasta?') && void pasta.manterLocal()}
            >
              Manter os deste computador
            </button>
          </div>
        </div>
      )}
      {(planilha.atualizadoAuto || pasta.atualizadoAuto) && (
        <AvisoAtualizado
          em={(planilha.atualizadoAuto ?? pasta.atualizadoAuto)!}
          origem={planilha.atualizadoAuto ? 'planilha' : 'pasta do Drive'}
          aoFechar={() => {
            planilha.fecharAviso()
            pasta.fecharAviso()
          }}
        />
      )}
      {pasta.estado.tipo === 'precisaPermissao' && (
        <div className="bg-amber-500 text-stone-950">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-3 py-2">
            <span className="flex-1 font-semibold">📁 O Chrome pede para confirmar: continuar salvando as vendas na pasta “{pasta.estado.nome}”?</span>
            <button className="rounded-lg bg-stone-900 px-4 py-1.5 font-bold text-white" onClick={() => void pasta.reautorizar()}>
              Sim, continuar salvando
            </button>
          </div>
        </div>
      )}
      {planilha.remotoMaisNovo && (
        <div className="bg-sky-600 text-white">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-3 py-2">
            <span className="flex-1 font-semibold">
              ⚠ A planilha tem dados mais novos, salvos em {new Date(planilha.remotoMaisNovo.atualizadoEm).toLocaleString('pt-BR')} por outro aparelho, e este
              computador tem mudanças que ainda não foram enviadas. Qual vale?
            </span>
            <button
              className="rounded-lg bg-white px-3 py-1.5 font-bold text-sky-800 disabled:opacity-60"
              disabled={carregando}
              onClick={async () => {
                setCarregando(true)
                try {
                  await planilha.carregar()
                } catch (e) {
                  alert(e instanceof Error ? e.message : String(e))
                } finally {
                  setCarregando(false)
                }
              }}
            >
              {carregando ? 'Carregando…' : 'Usar os dados da planilha'}
            </button>
            <button
              className="rounded-lg px-3 py-1.5 font-semibold text-white underline"
              onClick={() => confirm('Manter os dados DESTE aparelho e sobrescrever a planilha?') && planilha.ignorarRemoto()}
            >
              Manter os deste aparelho
            </button>
          </div>
        </div>
      )}
      {aba !== 'online' && <AlertaPedidoOnline online={online} aoVer={() => irPara('online')} />}
      <AvisosGarcom garcom={garcom} />
      <main className="mx-auto max-w-[1500px] p-3 sm:p-4">
        {aba === 'venda' && <Venda dados={dados} irPara={irPara} />}
        {aba === 'comandas' && <Comandas dados={dados} irPara={irPara} />}
        {aba === 'online' && <PedidosOnline dados={dados} online={online} irPara={irPara} />}
        {aba === 'compras' && <Compras dados={dados} />}
        {aba === 'reposicao' && <Reposicao dados={dados} />}
        {aba === 'cardapio' && <Cardapio dados={dados} />}
        {aba === 'painel' && <Painel dados={dados} irPara={irPara} />}
        {aba === 'estoque' && <Estoque dados={dados} />}
        {aba === 'caixa' && <CaixaTela dados={dados} irPara={irPara} />}
        {aba === 'relatorios' && <Relatorios dados={dados} />}
        {aba === 'cadastros' && <Cadastros dados={dados} />}
        {aba === 'config' && <ConfigTela dados={dados} planilha={planilha} pasta={pasta} garcom={garcom} irParaOnline={() => irPara('online')} />}
      </main>
      </div>
    </div>
  )
}

/** Aviso discreto de que os dados foram atualizados sozinhos com os de outro aparelho. */
function AvisoAtualizado({ em, origem, aoFechar }: { em: string; origem: string; aoFechar: () => void }) {
  useEffect(() => {
    const t = setTimeout(aoFechar, 8000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [em])
  return (
    <div className="fixed right-4 top-4 z-50 flex max-w-sm items-start gap-3 rounded-2xl bg-sky-700 p-4 text-white shadow-2xl">
      <span className="text-2xl">🔄</span>
      <div className="flex-1 text-sm">
        <div className="font-extrabold">Dados atualizados</div>
        <div>
          Chegaram as mudanças feitas em outro aparelho ({origem}, {new Date(em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}).
        </div>
      </div>
      <button className="text-xl leading-none" onClick={aoFechar} aria-label="Fechar">
        ×
      </button>
    </div>
  )
}
