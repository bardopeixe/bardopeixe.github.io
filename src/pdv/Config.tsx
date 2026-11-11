import qrcode from 'qrcode-generator'
import { useRef, useState, useSyncExternalStore } from 'react'
import { assinarInstalar, instalarApp, linkConectar, podeInstalar, rodandoComoApp } from './conectar'
import { codigoAppsScript } from './appsScript'
import { aplicarBackup, montarBackup, novoId, type Dados } from './dados'
import type { Pasta } from './pasta'
import { urlValida, type Planilha } from './planilha'
import { imprimirTeste } from './impressao'
import { lerChaveIA, salvarChaveIA, testarChave } from './notaIA'
import type { Config } from './tipos'
import { CampoNumero, CampoTexto, Modal, btn } from './ui'

export default function ConfigTela({ dados, planilha, pasta }: { dados: Dados; planilha: Planilha; pasta: Pasta }) {
  const { config, setConfig } = dados
  const set = (m: Partial<Config>) => setConfig((c) => ({ ...c, ...m }))
  const [novaObs, setNovaObs] = useState('')
  const arquivo = useRef<HTMLInputElement>(null)

  function exportar() {
    const backup = montarBackup(dados)
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `backup-espetinho-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  async function importar(f: File) {
    try {
      const b = JSON.parse(await f.text())
      if (!Array.isArray(b.produtos) || !Array.isArray(b.pedidos) || !Array.isArray(b.caixas)) throw new Error()
      if (!confirm('Isso substitui TODOS os dados deste aparelho pelos do backup. Continuar?')) return
      aplicarBackup(dados, b)
      alert('Backup restaurado!')
    } catch {
      alert('Arquivo de backup inválido.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
        <h2 className="text-lg font-extrabold">Dados do cupom</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <CampoTexto rotulo="Nome do estabelecimento" valor={config.nomeLoja} aoMudar={(v) => set({ nomeLoja: v })} />
          <CampoTexto rotulo="Telefone / WhatsApp" valor={config.telefone} aoMudar={(v) => set({ telefone: v })} />
          <CampoTexto className="sm:col-span-2" rotulo="Endereço" valor={config.endereco} aoMudar={(v) => set({ endereco: v })} />
          <CampoTexto className="sm:col-span-2" rotulo="Mensagem no rodapé" valor={config.rodape} aoMudar={(v) => set({ rodape: v })} />
        </div>
      </section>

      <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
        <h2 className="text-lg font-extrabold">Impressora térmica</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-semibold">Largura do papel:</span>
          {([58, 80] as const).map((l) => (
            <button
              key={l}
              onClick={() => set({ larguraPapel: l })}
              className={`rounded-xl px-4 py-2 font-bold ${config.larguraPapel === l ? 'bg-stone-900 text-white' : 'bg-stone-100'}`}
            >
              {l} mm
            </button>
          ))}
          <button className={btn.secundario} onClick={() => imprimirTeste(config)}>
            🖨️ Imprimir teste
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {(
            [
              ['imprimirAoFinalizar', 'Imprimir automaticamente ao finalizar o pedido'],
              ['viaChurrasqueira', 'Imprimir via da churrasqueira (letra grande, sem preços)'],
              ['viaCliente', 'Imprimir via do cliente (com preços e troco)'],
            ] as const
          ).map(([k, rotulo]) => (
            <label key={k} className="flex items-center gap-2 font-semibold">
              <input type="checkbox" className="h-5 w-5 accent-orange-600" checked={config[k]} onChange={(e) => set({ [k]: e.target.checked })} />
              {rotulo}
            </label>
          ))}
        </div>
        <details className="mt-4 rounded-xl bg-orange-50 p-3 text-sm">
          <summary className="cursor-pointer font-bold">Como configurar a Waytech para imprimir sem perguntar</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Instale o driver da Waytech no Windows e deixe ela como <b>impressora padrão</b>.</li>
            <li>
              Nas preferências da impressora (Painel de Controle → Impressoras → Waytech → Preferências de impressão → Avançado/Configurações do papel), escolha
              o papel <b>80 mm</b> e deixe o <b>corte automático “ao fim de cada página”</b> (às vezes aparece como “Cut per page” / “Corte por página”). O sistema
              manda cada via como uma página do tamanho exato do conteúdo — a via da churrasqueira sai cortada separada da via do cliente.
            </li>
            <li>
              Na primeira impressão pelo Chrome: destino <b>Waytech</b>, margens <b>Nenhuma</b>, escala <b>100%</b>, e desmarque “Cabeçalhos e rodapés”. O
              Chrome lembra.
            </li>
            <li>
              Para não aparecer a janela de impressão: crie um atalho do Chrome com <code className="rounded bg-white px-1">--kiosk-printing</code> no final do
              campo “Destino” e abra o sistema por ele. Aí cada pedido sai direto na impressora.
            </li>
          </ol>
        </details>
      </section>

      <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
        <h2 className="text-lg font-extrabold">Embalagem para viagem</h2>
        <p className="text-sm text-stone-600">
          Entra sozinha em todo pedido marcado “Para viagem” (dá para ajustar no pedido com + e −). O custo sai do lucro e, se o insumo tiver estoque
          controlado, baixa do estoque.
        </p>
        <ul className="mt-3 space-y-2">
          {config.regrasViagem.map((r, idx) => {
            const mudar = (m: Partial<(typeof config.regrasViagem)[number]>) =>
              set({ regrasViagem: config.regrasViagem.map((x, i) => (i === idx ? { ...x, ...m } : x)) })
            return (
              <li key={idx} className="grid grid-cols-2 items-end gap-2 rounded-xl border-2 border-stone-100 p-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <label className="col-span-2 block sm:col-span-1">
                  <span className="mb-1 block text-sm font-semibold text-stone-600">Insumo</span>
                  <select
                    className="w-full rounded-xl border-2 border-stone-200 bg-white px-2 py-2"
                    value={r.insumoId}
                    onChange={(e) => mudar({ insumoId: e.target.value })}
                  >
                    {!dados.insumos.some((i) => i.id === r.insumoId) && <option value={r.insumoId}>(insumo excluído)</option>}
                    {dados.insumos.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <CampoNumero rotulo="Por pedido" valor={r.porPedido} aoMudar={(v) => mudar({ porPedido: Math.round(v) })} />
                <CampoNumero rotulo="+1 a cada N espetos" valor={r.aCadaEspetos} aoMudar={(v) => mudar({ aCadaEspetos: Math.round(v) })} />
                <button
                  className="pb-2 text-2xl text-stone-400 hover:text-red-600"
                  onClick={() => set({ regrasViagem: config.regrasViagem.filter((_, i) => i !== idx) })}
                  aria-label="Remover"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-xs text-stone-500">
          Ex.: 1 por pedido e +1 a cada 10 espetos → até 10 espetos = 1 saquinho; 11 a 20 = 2 saquinhos. Use 0 em “a cada N” para não aumentar.
        </p>
        {dados.insumos.length > 0 && (
          <button
            className={btn.secundario + ' mt-2'}
            onClick={() =>
              set({
                regrasViagem: [
                  ...config.regrasViagem,
                  { insumoId: (dados.insumos.find((i) => i.grupo === 'Embalagens') ?? dados.insumos[0]).id, porPedido: 1, aCadaEspetos: 0 },
                ],
              })
            }
          >
            + Adicionar embalagem
          </button>
        )}
      </section>

      <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
        <h2 className="text-lg font-extrabold">Taxas da maquininha</h2>
        <p className="text-sm text-stone-600">Descontadas do valor “em conta” e do lucro.</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <CampoNumero rotulo="Débito" sufixo="%" valor={config.taxaDebito} aoMudar={(v) => set({ taxaDebito: v })} />
          <CampoNumero rotulo="Crédito" sufixo="%" valor={config.taxaCredito} aoMudar={(v) => set({ taxaCredito: v })} />
          <CampoNumero rotulo="Pix" sufixo="%" valor={config.taxaPix} aoMudar={(v) => set({ taxaPix: v })} />
        </div>
      </section>

      <SecaoIA />

      <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
        <h2 className="text-lg font-extrabold">🛵 iFood e 99Food</h2>
        <p className="text-sm text-stone-600">
          Comissão total cobrada pelo app (plano + pagamento online) — sai do lucro dos pedidos marcados como iFood/99Food. O acréscimo deixa o preço no app mais alto
          que no balcão para cobrir a comissão (o cardápio e a venda usam esse preço).
        </p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <CampoNumero rotulo="Comissão iFood" sufixo="%" valor={config.taxaIfood} aoMudar={(v) => set({ taxaIfood: v })} />
          <CampoNumero rotulo="Comissão 99Food" sufixo="%" valor={config.taxa99} aoMudar={(v) => set({ taxa99: v })} />
          <CampoNumero rotulo="Acréscimo no app" sufixo="%" valor={config.acrescimoDelivery} aoMudar={(v) => set({ acrescimoDelivery: v })} />
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Para não perder dinheiro, o acréscimo precisa ser de pelo menos {Math.ceil((100 / (1 - Math.max(config.taxaIfood, config.taxa99) / 100) - 100) * 10) / 10}% (cobre a maior comissão).
        </p>
      </section>

      <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
        <h2 className="text-lg font-extrabold">Observações rápidas</h2>
        <p className="text-sm text-stone-600">Botões que aparecem ao tocar em “+ observação” num item do pedido.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {config.obsRapidas.map((o) => (
            <span key={o} className="flex items-center gap-1 rounded-full bg-stone-100 py-1 pl-3 pr-1 font-semibold">
              {o}
              <button className="rounded-full px-2 text-stone-500 hover:text-red-600" onClick={() => set({ obsRapidas: config.obsRapidas.filter((x) => x !== o) })}>
                ×
              </button>
            </span>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const v = novaObs.trim()
            if (v && !config.obsRapidas.includes(v)) set({ obsRapidas: [...config.obsRapidas, v] })
            setNovaObs('')
          }}
        >
          <CampoTexto className="flex-1" valor={novaObs} aoMudar={setNovaObs} placeholder="Ex.: Sem cebola" />
          <button className={btn.secundario}>Adicionar</button>
        </form>
        <CampoNumero
          className="mt-4 w-64"
          rotulo="Avisar estoque baixo quando restar"
          sufixo="un"
          valor={config.alertaEstoque}
          aoMudar={(v) => set({ alertaEstoque: Math.round(v) })}
        />
      </section>

      <SecaoCelular planilha={planilha} config={config} />

      <SecaoPasta dados={dados} pasta={pasta} />

      <details className="rounded-2xl border-2 border-stone-200 bg-white p-4" open={planilha.ligado}>
        <summary className="cursor-pointer font-extrabold">Avançado: Google Planilhas com abas atualizadas</summary>
        <div className="mt-3">
          <SecaoPlanilha dados={dados} planilha={planilha} />
        </div>
      </details>

      <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
        <h2 className="text-lg font-extrabold">Backup</h2>
        <p className="text-sm text-stone-600">
          Os dados ficam salvos <b>neste navegador, neste aparelho</b>. Faça backup toda semana (ou ao trocar de computador) e guarde o arquivo no
          WhatsApp/Drive.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btn.primario} onClick={exportar}>
            ⬇️ Baixar backup
          </button>
          <button className={btn.secundario} onClick={() => arquivo.current?.click()}>
            ⬆️ Restaurar backup
          </button>
          <input
            ref={arquivo}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importar(f)
              e.target.value = ''
            }}
          />
        </div>
      </section>

      <ZerarMovimento dados={dados} baixarBackup={exportar} />
    </div>
  )
}

function SecaoPlanilha({ dados, planilha }: { dados: Dados; planilha: Planilha }) {
  const { config, setConfig } = dados
  const set = (m: Partial<Config>) => setConfig((c) => ({ ...c, ...m }))
  const [copiado, setCopiado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const chave = config.planilhaChave
  const est = planilha.estado

  async function copiar() {
    let k = chave
    if (!k) {
      k = novoId().replace(/-/g, '')
      set({ planilhaChave: k })
    }
    try {
      await navigator.clipboard.writeText(codigoAppsScript(k))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 3000)
    } catch {
      alert('Não consegui copiar sozinho. Abra “ver o código” e copie à mão.')
    }
  }

  async function rodar(f: () => Promise<void>) {
    setOcupado(true)
    try {
      await f()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="rounded-2xl border-2 border-emerald-200 bg-white p-4">
      <h2 className="text-lg font-extrabold">☁ Google Planilhas</h2>
      <p className="text-sm text-stone-600">
        Guarda uma cópia de tudo numa planilha sua (Caixas, Pedidos, Itens vendidos, Estoque, Despesas), atualizada sozinha a cada venda. Serve para
        acompanhar pelo celular e para recuperar os dados em outro computador. O sistema continua funcionando se a internet cair — envia quando voltar.
      </p>

      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
        <li>
          Abra <b>script.google.com</b> com a conta Google onde quer guardar as vendas (confira a foto no canto de cima) e clique em{' '}
          <b>Novo projeto</b>. Não precisa criar a planilha: ela é criada sozinha no seu Drive.
        </li>
        <li>
          Apague o que estiver lá e cole o código:{' '}
          <button className={btn.secundario + ' !px-3 !py-1 text-sm'} onClick={copiar}>
            {copiado ? '✔ Copiado!' : '📋 Copiar código'}
          </button>
          {chave && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-stone-500">ver o código</summary>
              <textarea readOnly className="mt-1 h-40 w-full rounded-lg border-2 border-stone-200 p-2 font-mono text-xs" value={codigoAppsScript(chave)} />
            </details>
          )}
        </li>
        <li>
          Clique em <b>Salvar</b> (💾) e depois <b>Implantar → Nova implantação</b> → engrenagem → <b>App da Web</b>. Em “Executar como” deixe{' '}
          <b>Eu</b> e em “Quem pode acessar” escolha <b>Qualquer pessoa</b>. Clique em Implantar e autorize com sua conta Google (se aparecer “app não
          verificado”, clique em Avançado → Acessar).
        </li>
        <li>Copie o “URL do app da Web” (termina em /exec) e cole aqui:</li>
      </ol>
      <input
        className="mt-2 w-full rounded-xl border-2 border-stone-200 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500"
        placeholder="https://script.google.com/macros/s/.../exec"
        value={config.planilhaUrl}
        onChange={(e) => set({ planilhaUrl: e.target.value.trim() })}
      />
      {config.planilhaUrl && !urlValida(config.planilhaUrl) && <p className="mt-1 text-sm font-semibold text-red-600">Esse não parece o endereço do app da Web.</p>}
      {config.planilhaUrl && !chave && (
        <div className="mt-2 rounded-xl bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-900">
            Planilha nova? Clique em “Copiar código” (passo 2) para gerar a chave. Já ligou a planilha em outro computador? Cole a chave de lá:
          </p>
          <input
            className="mt-2 w-full rounded-lg border-2 border-stone-200 px-2 py-1 font-mono"
            placeholder="chave da planilha"
            onBlur={(e) => e.target.value.trim() && set({ planilhaChave: e.target.value.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>
      )}

      <p className="mt-2 text-xs text-stone-500">
        Apareceu “Não foi possível abrir o arquivo” no Google? Isso acontece com várias contas Google abertas no Chrome. Faça os passos numa janela anônima
        (Ctrl+Shift+N) entrando só na conta certa.
      </p>
      {planilha.ligado && (
        <div className="mt-3 space-y-3">
          {planilha.linkPlanilha && (
            <a
              href={planilha.linkPlanilha}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700"
            >
              📊 Abrir a planilha de vendas
            </a>
          )}
          <div
            className={`rounded-xl p-3 text-sm font-semibold ${est.tipo === 'erro' ? 'bg-red-50 text-red-800' : est.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}
          >
            {est.tipo === 'erro'
              ? `Erro: ${est.msg}`
              : est.tipo === 'ok'
                ? est.em
                  ? `Conectado. Última gravação na planilha: ${new Date(est.em).toLocaleString('pt-BR')}`
                  : 'Conectado. A planilha ainda está vazia — clique em “Enviar agora”.'
                : est.tipo === 'enviando'
                  ? 'Enviando…'
                  : 'Mudanças esperando para enviar…'}
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={config.planilhaAuto} onChange={(e) => set({ planilhaAuto: e.target.checked })} />
            Enviar sozinho a cada mudança
          </label>
          <div className="flex flex-wrap gap-2">
            <button className={btn.verde + ' !py-2'} disabled={ocupado} onClick={() => rodar(planilha.enviar)}>
              ⬆ Enviar agora
            </button>
            <button
              className={btn.secundario}
              disabled={ocupado}
              onClick={() =>
                confirm('Trocar TODOS os dados deste aparelho pelos que estão na planilha?') &&
                rodar(async () => {
                  await planilha.carregar()
                  alert('Dados carregados da planilha.')
                })
              }
            >
              ⬇ Carregar da planilha
            </button>
          </div>
          <p className="text-xs text-stone-500">
            Use “Carregar da planilha” para levar os dados para outro computador: configure o mesmo endereço e a mesma chave lá. Use um aparelho de cada
            vez para vender — se dois venderem ao mesmo tempo, o último a salvar vence.
          </p>
          <details className="text-xs text-stone-500">
            <summary className="cursor-pointer">Chave da planilha</summary>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="rounded bg-stone-100 px-2 py-1">{chave}</code>
              <span>Em outro computador, cole o mesmo endereço e esta chave:</span>
              <input
                className="rounded border-2 border-stone-200 px-2 py-1 font-mono"
                value={chave}
                onChange={(e) => set({ planilhaChave: e.target.value.trim() })}
              />
            </div>
          </details>
        </div>
      )}
    </section>
  )
}

function SecaoPasta({ dados, pasta }: { dados: Dados; pasta: Pasta }) {
  const est = pasta.estado
  const [ocupado, setOcupado] = useState(false)
  async function rodar(f: () => Promise<void>) {
    setOcupado(true)
    try {
      await f()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="rounded-2xl border-2 border-emerald-300 bg-white p-4">
      <h2 className="text-lg font-extrabold">📁 Salvar as vendas no Google Drive (recomendado)</h2>
      {!pasta.suportado ? (
        <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Este navegador não deixa salvar direto numa pasta (celulares não permitem). No computador, use o <b>Google Chrome</b> ou o <b>Microsoft Edge</b>. No
          celular, os dados chegam pela planilha — veja “📱 Usar no celular” acima.
        </p>
      ) : (
        <>
          <p className="text-sm text-stone-600">
            O sistema grava sozinho, a cada venda, uma cópia de tudo numa pasta do computador. Se for a pasta do Google Drive, ela vai para a nuvem
            automaticamente — e você vê as vendas pelo celular no app do Drive.
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
            <li>
              Instale o <b>Google Drive para computador</b> (procure “Google Drive para computador” no Google, baixe, instale e entre com sua conta). Vai
              aparecer o disco/pasta <b>“Google Drive”</b> no computador.
            </li>
            <li>
              Dentro de <b>Google Drive → Meu Drive</b>, crie uma pasta chamada <b>PDV Espetinho</b>.
            </li>
            <li>
              Clique abaixo, escolha essa pasta e confirme “Permitir” / “Salvar alterações”. Se o Chrome oferecer <b>“Permitir em todas as visitas”</b>,
              escolha essa opção.
            </li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={btn.verde + ' !py-2'} disabled={ocupado} onClick={() => rodar(pasta.escolher)}>
              {est.tipo === 'nenhuma' ? '📁 Escolher pasta' : '📁 Trocar pasta'}
            </button>
            {est.tipo !== 'nenhuma' && (
              <>
                <button className={btn.secundario} disabled={ocupado} onClick={() => rodar(pasta.salvar)}>
                  Salvar agora
                </button>
                <button
                  className={btn.secundario}
                  disabled={ocupado}
                  onClick={() =>
                    rodar(async () => {
                      const b = await pasta.lerBackup()
                      const quando = b.geradoEm ? new Date(b.geradoEm).toLocaleString('pt-BR') : '?'
                      if (!confirm(`Trocar os dados deste computador pelos da pasta (salvos em ${quando})?`)) return
                      aplicarBackup(dados, b)
                      alert('Dados carregados da pasta.')
                    })
                  }
                >
                  ⬇ Carregar da pasta
                </button>
                <button className="text-sm text-stone-500 underline" onClick={() => confirm('Parar de salvar nesta pasta? (os arquivos continuam lá)') && void pasta.esquecer()}>
                  parar de salvar
                </button>
              </>
            )}
          </div>
          {est.tipo !== 'nenhuma' && (
            <div
              className={`mt-3 rounded-xl p-3 text-sm font-semibold ${
                est.tipo === 'erro' || est.tipo === 'precisaPermissao' ? 'bg-red-50 text-red-800' : est.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
              }`}
            >
              {est.tipo === 'ok' && `✔ Salvando na pasta “${est.nome}”.${est.em ? ` Última gravação: ${new Date(est.em).toLocaleTimeString('pt-BR')}.` : ''}`}
              {est.tipo === 'precisaPermissao' && (
                <>
                  O Chrome precisa que você confirme o acesso à pasta “{est.nome}”.{' '}
                  <button className="underline" onClick={() => void pasta.reautorizar()}>
                    Confirmar agora
                  </button>
                </>
              )}
              {(est.tipo === 'pendente' || est.tipo === 'salvando') && `Salvando na pasta “${est.nome}”…`}
              {est.tipo === 'erro' && `Erro ao salvar na pasta “${est.nome}”: ${est.msg}`}
            </div>
          )}
          <p className="mt-2 text-xs text-stone-500">
            Arquivos gravados: <b>pdv-espetinho-backup.json</b> (tudo, para restaurar), <b>Caixas.csv</b>, <b>Pedidos.csv</b>, <b>Itens vendidos.csv</b>,{' '}
            <b>Estoque.csv</b>, <b>Despesas.csv</b> (abrem no Excel e no Google Planilhas) e uma cópia por dia em <b>backups-diarios</b>. Em outro
            computador: escolha a mesma pasta do Drive e o sistema pergunta se quer usar os dados de lá.
          </p>
        </>
      )}
    </section>
  )
}

/** Celular: conectar pela planilha com QR code e instalar como aplicativo. */
function SecaoCelular({ planilha, config }: { planilha: Planilha; config: Config }) {
  const [qrAberto, setQrAberto] = useState(false)
  const instalavel = useSyncExternalStore(assinarInstalar, podeInstalar, () => false)
  const app = rodandoComoApp()
  const link = planilha.ligado ? linkConectar(config.planilhaUrl.trim(), config.planilhaChave) : ''
  const svg = (() => {
    if (!link) return ''
    const qr = qrcode(0, 'M')
    qr.addData(link)
    qr.make()
    return qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true })
  })()

  return (
    <section className="rounded-2xl border-2 border-sky-300 bg-white p-4">
      <h2 className="text-lg font-extrabold">📱 Usar no celular</h2>
      <p className="text-sm text-stone-600">
        O celular recebe os mesmos dados do caixa (vendas, comandas, estoque) e se atualiza sozinho — pela planilha do Google. Dá para acompanhar o
        movimento de casa ou usar o celular para anotar comandas.
      </p>

      {planilha.ligado ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btn.primario} onClick={() => setQrAberto(true)}>
            📱 Conectar celular (QR code)
          </button>
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Primeiro ligue a planilha neste computador (em <b>Avançado: Google Planilhas</b>, mais abaixo). Depois volte aqui para gerar o QR code do celular.
        </p>
      )}

      <div className="mt-4 rounded-xl bg-stone-50 p-3 text-sm">
        <div className="font-bold">Instalar como aplicativo</div>
        {app ? (
          <p className="text-emerald-700">✔ Já está aberto como aplicativo.</p>
        ) : instalavel ? (
          <button className={`${btn.verde} mt-2 !py-2`} onClick={() => void instalarApp()}>
            📲 Instalar o PDV neste aparelho
          </button>
        ) : (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-stone-700">
            <li>
              <b>Android (Chrome):</b> menu ⋮ → <b>Instalar app</b> (ou “Adicionar à tela inicial”).
            </li>
            <li>
              <b>iPhone (Safari):</b> botão Compartilhar ⬆️ → <b>Adicionar à Tela de Início</b>.
            </li>
            <li>Vira um ícone 🔥 PDV que abre em tela cheia, sem a barra do navegador.</li>
          </ul>
        )}
      </div>

      {qrAberto && (
        <Modal titulo="📱 Conectar celular" aberto aoFechar={() => setQrAberto(false)}>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>No celular, abra a <b>câmera</b> e aponte para o código.</li>
            <li>Toque no link que aparecer e confirme “Conectar”.</li>
            <li>Pronto: os dados chegam em alguns segundos e passam a se atualizar sozinhos.</li>
          </ol>
          <div className="mx-auto mt-3 w-64 rounded-xl border-2 border-stone-200 bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button
              className={btn.secundario}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link)
                  alert('Link copiado.')
                } catch {
                  prompt('Copie o link:', link)
                }
              }}
            >
              🔗 Copiar link
            </button>
            <a className={btn.secundario} href={`https://wa.me/?text=${encodeURIComponent(`Abrir o PDV conectado: ${link}`)}`} target="_blank" rel="noreferrer">
              💬 Mandar no WhatsApp
            </a>
          </div>
          <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-800">
            ⚠ Quem tiver este código ou link consegue ver e alterar as vendas. Mande só para você ou para quem trabalha no caixa.
          </p>
        </Modal>
      )}
    </section>
  )
}

/** Chave da IA que lê as notas por foto (fica só neste aparelho). */
function SecaoIA() {
  const [chave, setChave] = useState(lerChaveIA())
  const [nova, setNova] = useState('')
  const [estado, setEstado] = useState('')
  async function testar(k: string) {
    setEstado('Testando…')
    try {
      await testarChave(k)
      setEstado('✔ Chave funcionando.')
    } catch (e) {
      setEstado(`✗ Não funcionou: ${e instanceof Error ? e.message : 'erro'}`)
    }
  }
  return (
    <section className="rounded-2xl border-2 border-stone-200 bg-white p-4">
      <h2 className="text-lg font-extrabold">🤖 Ler nota por foto (IA)</h2>
      <p className="text-sm text-stone-600">
        Em Compras → Nova compra → 📸, a IA Claude lê a foto da nota e preenche os itens para você conferir. Precisa de uma chave da API da Anthropic (crie em{' '}
        <a className="font-semibold text-orange-700 underline" href="https://platform.claude.com" target="_blank" rel="noreferrer">
          platform.claude.com
        </a>
        , com alguns dólares de crédito e um limite de gasto). A chave fica só neste aparelho.
      </p>
      {chave ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-stone-100 px-3 py-2 font-mono text-sm">
            {chave.slice(0, 10)}…{chave.slice(-4)}
          </span>
          <button className={btn.secundario} onClick={() => testar(chave)}>
            Testar
          </button>
          <button
            className="px-2 text-sm font-semibold text-red-600"
            onClick={() => {
              if (!confirm('Apagar a chave deste aparelho?')) return
              salvarChaveIA('')
              setChave('')
              setEstado('')
            }}
          >
            Apagar chave
          </button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <CampoTexto className="flex-1" valor={nova} aoMudar={setNova} placeholder="sk-ant-…" />
          <button
            className={btn.primario}
            disabled={!nova.trim().startsWith('sk-')}
            onClick={() => {
              salvarChaveIA(nova)
              setChave(nova.trim())
              setNova('')
              testar(nova.trim())
            }}
          >
            Salvar
          </button>
        </div>
      )}
      {estado && <p className="mt-2 text-sm font-semibold">{estado}</p>}
    </section>
  )
}

/** Apaga vendas, caixas, comandas, compras e o histórico de estoque (ex.: depois dos testes), mantendo os cadastros. */
function ZerarMovimento({ dados, baixarBackup }: { dados: Dados; baixarBackup: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [vendas, setVendas] = useState(true)
  const [comandas, setComandas] = useState(true)
  const [compras, setCompras] = useState(true)
  const [estoque, setEstoque] = useState(true)
  const [texto, setTexto] = useState('')
  const [feito, setFeito] = useState('')
  const abertas = dados.comandas.filter((c) => !c.canceladaEm && !c.juntadaNa).length
  const compraMovs = dados.movEstoque.length

  function zerar() {
    baixarBackup() // cópia de segurança antes de apagar
    if (vendas) {
      dados.setPedidos([])
      dados.setCaixas([])
    }
    if (comandas) dados.setComandas([])
    if (compras) {
      dados.setMovEstoque([])
      try {
        localStorage.removeItem('espeto:compra-rascunho')
      } catch {
        // sem localStorage: nada a apagar
      }
    }
    if (estoque) {
      dados.setProdutos((ps) => ps.map((p) => (p.estoque !== undefined ? { ...p, estoque: 0 } : p)))
      dados.setInsumos((is) => is.map((i) => (i.estoque !== undefined ? { ...i, estoque: 0 } : i)))
    }
    setFeito('Pronto! Movimento zerado. Um backup de antes foi baixado, por segurança. Abra o caixa para começar de verdade.')
    setAberto(false)
    setTexto('')
  }

  return (
    <section className="rounded-2xl border-2 border-red-200 bg-white p-4">
      <h2 className="text-lg font-extrabold">🧹 Zerar movimento (começar de verdade)</h2>
      <p className="text-sm text-stone-600">
        Apaga os testes: vendas, caixas, comandas, compras e o estoque. <b>Produtos, insumos, preços, fotos, códigos de barras e configurações continuam.</b>
      </p>
      {feito && <p className="mt-2 rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-800">✔ {feito}</p>}
      <button className={`${btn.secundario} mt-3 !border-red-300 !text-red-700`} onClick={() => setAberto(true)}>
        🧹 Zerar movimento…
      </button>
      {aberto && (
        <Modal titulo="🧹 Zerar movimento" aberto aoFechar={() => setAberto(false)}>
          <p className="text-sm text-stone-600">Marque o que apagar:</p>
          <div className="mt-2 space-y-2">
            {(
              [
                [vendas, setVendas, `Vendas e caixas (${dados.pedidos.length} vendas, ${dados.caixas.length} caixas)`],
                [comandas, setComandas, `Comandas (${dados.comandas.length}${abertas ? `, ${abertas} abertas` : ''})`],
                [compras, setCompras, `Compras e histórico de estoque (${compraMovs} registros)`],
                [estoque, setEstoque, 'Quantidades em estoque → 0 (produtos e insumos)'],
              ] as const
            ).map(([v, setV, rotulo]) => (
              <label key={rotulo} className="flex items-center gap-2 rounded-xl border-2 border-stone-200 p-3 font-semibold">
                <input type="checkbox" className="h-5 w-5 accent-red-600" checked={v} onChange={(e) => setV(e.target.checked)} />
                {rotulo}
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-stone-500">
            Custos e preços que mudaram nos testes ficam como estão — confira em Cadastros. Se o celular ou outro computador estiver conectado (pasta/planilha), ele
            também recebe o zerado.
          </p>
          <CampoTexto className="mt-3" rotulo='Para confirmar, escreva ZERAR' valor={texto} aoMudar={setTexto} placeholder="ZERAR" />
          <button
            className={`${btn.primario} mt-3 w-full !bg-red-600 hover:!bg-red-700`}
            disabled={texto.trim().toUpperCase() !== 'ZERAR' || !(vendas || comandas || compras || estoque)}
            onClick={zerar}
          >
            Baixar backup e zerar
          </button>
        </Modal>
      )}
    </section>
  )
}
