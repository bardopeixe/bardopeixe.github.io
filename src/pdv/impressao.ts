import { NOMES_FORMA, brl, data, espetosParaBrasa, hora, type Resumo } from './dados'
import { fmtQtd, rotuloComanda } from './comanda'
import type { Caixa, Comanda, Config, ItemComanda, Pedido } from './tipos'

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const numPedido = (n: number) => String(n).padStart(3, '0')

/**
 * Estilo pensado para impressora térmica (Waytech 58/80 mm):
 * só preto puro, letra grossa e grande, sem cinza (a térmica não imprime tons).
 */
function estilo(config: Config) {
  const largura = config.larguraPapel === 58 ? 48 : 72
  const base = config.larguraPapel === 58 ? 12 : 14
  return `
  * { box-sizing: border-box; color: #000 !important; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: ${largura}mm; margin: 0 auto; padding: 0; font-family: Arial, Helvetica, sans-serif;
         font-size: ${base}px; line-height: 1.25; font-weight: 600; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .via { page-break-after: always; break-after: page; padding: 2mm 0 5mm; overflow: hidden; }
  .via:last-child { page-break-after: auto; break-after: auto; }
  .c { text-align: center; }
  .loja { font-size: ${base + 4}px; font-weight: 900; text-align: center; text-transform: uppercase; }
  .peq { font-size: ${base - 2}px; font-weight: 600; }
  .tag { font-size: ${base - 1}px; font-weight: 900; text-align: center; letter-spacing: 1px; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 1mm 0; margin: 1.5mm 0; }
  .num { font-size: ${base * 2.4}px; font-weight: 900; text-align: center; line-height: 1.05; margin: 1mm 0; }
  .num small { display: block; font-size: ${base}px; font-weight: 700; }
  .viagem { background: #000; color: #fff !important; text-align: center; font-size: ${base + 8}px; font-weight: 900; padding: 2mm 0; margin: 2mm 0; }
  .viagem * { color: #fff !important; }
  .local { border: 3px solid #000; text-align: center; font-size: ${base + 6}px; font-weight: 900; padding: 1.5mm 0; margin: 2mm 0; }
  .cliente { font-size: ${base + 4}px; font-weight: 900; text-align: center; margin: 1mm 0; text-transform: uppercase; }
  hr { border: 0; border-top: 2px dashed #000; margin: 2mm 0; }
  hr.forte { border-top: 3px solid #000; }
  .sec { font-size: ${base}px; font-weight: 900; text-transform: uppercase; margin: 1mm 0; text-decoration: underline; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 0.6mm 0; }
  .item td { font-size: ${base + 8}px; font-weight: 900; line-height: 1.15; padding-top: 1.2mm; }
  .item .q { width: 1%; white-space: nowrap; padding-right: 2mm; }
  .obs td { font-size: ${base + 2}px; font-weight: 800; padding-left: 0; }
  .obs .seta { padding-right: 2mm; }
  .r { text-align: right; white-space: nowrap; }
  .tot td { font-size: ${base + 6}px; font-weight: 900; padding-top: 1mm; }
  .linha td { font-size: ${base}px; }
  .grande { font-size: ${base + 4}px; font-weight: 900; }
  .rodape { text-align: center; font-size: ${base - 1}px; margin-top: 2mm; }
  .sub td { font-size: ${base + 4}px; font-weight: 900; padding-left: 0; }
  .brasa { border: 3px solid #000; padding: 1.5mm 2mm; margin-top: 2mm; }
  .brasa .t { font-size: ${base + 2}px; font-weight: 900; text-align: center; letter-spacing: 1px; }
  .brasa td { font-size: ${base + 6}px; font-weight: 900; }
  `
}

function cabecalhoLoja(config: Config) {
  return `<div class="loja">${esc(config.nomeLoja)}</div>
  ${config.endereco ? `<div class="c peq">${esc(config.endereco)}</div>` : ''}
  ${config.telefone ? `<div class="c peq">${esc(config.telefone)}</div>` : ''}`
}

const rotuloViagem = (p: Pedido) =>
  p.online
    ? p.online.tipo === 'entrega'
      ? 'DELIVERY — CARDÁPIO DIGITAL'
      : 'RETIRADA — CARDÁPIO DIGITAL'
    : p.canal === 'ifood'
      ? 'iFOOD — VIAGEM'
      : p.canal === '99food'
        ? '99FOOD — VIAGEM'
        : 'PARA VIAGEM'

/** Endereço e contato do pedido do cardápio digital. */
const blocoEntrega = (p: Pedido) =>
  p.online
    ? `<hr><div class="peq">${p.online.endereco ? `<b>ENDEREÇO:</b> ${esc(p.online.endereco)}<br>` : ''}${p.online.referencia ? `<b>REF.:</b> ${esc(p.online.referencia)}<br>` : ''}<b>TEL.:</b> ${esc(p.online.telefone)}<br><b>PAGAMENTO:</b> ${esc(p.online.pagamento)}${p.online.obs ? `<br><b>OBS.:</b> ${esc(p.online.obs)}` : ''}</div>`
    : ''
const blocoViagem = (p: Pedido) =>
  p.viagem ? `<div class="viagem">${rotuloViagem(p)}</div>` : `<div class="local">COMER AQUI</div>`

/** Via da churrasqueira: sem preço, letra enorme, só o que precisa ir pra brasa. */
function viaChurrasqueira(p: Pedido, cab?: { rotulo: string; numero: number; aviso?: string }) {
  const grupos: { titulo: string; itens: Pedido['itens'] }[] = [
    { titulo: 'Espetos', itens: p.itens.filter((i) => i.categoria === 'espeto') },
    { titulo: 'Combos e jantinhas', itens: p.itens.filter((i) => i.categoria === 'combo') },
    { titulo: 'Acompanhamentos', itens: p.itens.filter((i) => i.categoria === 'outro') },
    { titulo: 'Bebidas', itens: p.itens.filter((i) => i.categoria === 'bebida') },
    { titulo: 'Bar — doses e drinks', itens: p.itens.filter((i) => i.categoria === 'drink') },
  ].filter((g) => g.itens.length)
  const brasa = espetosParaBrasa(p.itens)
  const totalEspetos = brasa.reduce((s, e) => s + e.qtd, 0)
  const temCombo = p.itens.some((i) => i.escolhas?.length)

  return `<div class="via">
    <div class="tag">VIA DA CHURRASQUEIRA</div>
    <div class="num"><small>${cab?.rotulo ?? 'PEDIDO'}</small>Nº ${numPedido(cab?.numero ?? p.numero)}</div>
    ${cab?.aviso ? `<div class="local">${cab.aviso}</div>` : ''}
    <div class="c">${hora(p.criadoEm)} · ${data(p.criadoEm)}</div>
    ${cab ? "" : blocoViagem(p)}
    ${p.cliente ? `<div class="cliente">${esc(p.cliente)}</div>` : ''}
    ${p.online?.obs ? `<div class="c grande">OBS.: ${esc(p.online.obs.toUpperCase())}</div>` : ''}
    ${p.viagem && p.embalagens?.length ? `<div class="c grande">EMBALAR: ${p.embalagens.map((e) => `${e.qtd} ${esc(e.nome.toUpperCase())}`).join(' + ')}</div>` : ''}
    ${grupos
      .map(
        (g) => `<hr class="forte"><div class="sec">${g.titulo}</div>
      <table>${g.itens
        .map(
          (i) => `<tr class="item"><td class="q">${i.qtd}x</td><td>${esc(i.nome.toUpperCase())}</td></tr>
          ${(i.escolhas ?? [])
            .map((e) => `<tr class="sub"><td></td><td>+ ${e.qtd * i.qtd} ${esc(e.nome.toUpperCase())}</td></tr>`)
            .join('')}
          ${i.obs ? `<tr class="obs"><td class="seta r">&gt;&gt;</td><td>${esc(i.obs.toUpperCase())}</td></tr>` : ''}`,
        )
        .join('')}</table>`,
      )
      .join('')}
    ${
      totalEspetos && (temCombo || brasa.length > 1)
        ? `<div class="brasa"><div class="t">PRA BRASA: ${totalEspetos} ESPETO${totalEspetos > 1 ? 'S' : ''}</div><table>${brasa
            .map((e) => `<tr><td class="q" style="width:1%;padding-right:2mm">${e.qtd}</td><td>${esc(e.nome.toUpperCase())}</td></tr>`)
            .join('')}</table></div>`
        : totalEspetos
          ? `<hr class="forte"><div class="c grande">TOTAL DE ESPETOS: ${totalEspetos}</div>`
          : ''
    }
  </div>`
}

/** Via do cliente: com preços, pagamento e troco. */
function viaCliente(p: Pedido, config: Config) {
  return `<div class="via">
    ${cabecalhoLoja(config)}
    <div class="tag">CUPOM NÃO FISCAL</div>
    <div class="num"><small>PEDIDO</small>Nº ${numPedido(p.numero)}</div>
    <div class="c">${data(p.criadoEm)} ${hora(p.criadoEm)}</div>
    ${p.viagem ? `<div class="viagem">${rotuloViagem(p)}</div>` : ''}
    ${p.cliente ? `<div class="c grande">${esc(p.cliente)}</div>` : ''}
    ${blocoEntrega(p)}
    ${p.parte ? `<div class="tag">CONTA DIVIDIDA — PARTE ${p.parte.replace('/', ' DE ')}</div>` : ''}
    <hr>
    <table>
      ${p.itens
        .map(
          (i) => `<tr class="linha"><td>${fmtQtd(i.qtd)}x ${esc(i.nome)}${i.escolhas?.length ? `<br><span class="peq">(${i.escolhas.map((e) => `${e.qtd * i.qtd} ${esc(e.nome)}`).join(', ')})</span>` : ''}${i.obs ? `<br><span class="peq">&gt; ${esc(i.obs)}</span>` : ''}</td>
          <td class="r">${p.parte ? '' : brl(i.preco * i.qtd)}</td></tr>`,
        )
        .join('')}
    </table>
    ${p.parte ? `<div class="c peq">Sua parte dos itens acima</div>` : ''}
    <hr>
    <table>
      ${p.desconto > 0 || p.taxaEntrega ? `<tr class="linha"><td>Subtotal</td><td class="r">${brl(p.subtotal)}</td></tr>` : ''}
      ${p.desconto > 0 ? `<tr class="linha"><td>Desconto</td><td class="r">-${brl(p.desconto)}</td></tr>` : ''}
      ${p.taxaEntrega ? `<tr class="linha"><td>Taxa de entrega</td><td class="r">${brl(p.taxaEntrega)}</td></tr>` : ''}
      <tr class="tot"><td>TOTAL</td><td class="r">${brl(p.total)}</td></tr>
      ${p.pagamentos.map((pg) => `<tr class="linha"><td>${NOMES_FORMA[pg.forma]}</td><td class="r">${brl(pg.valor)}</td></tr>`).join('')}
      ${p.recebidoDinheiro > 0 ? `<tr class="linha"><td>Recebido em dinheiro</td><td class="r">${brl(p.recebidoDinheiro)}</td></tr>` : ''}
      ${p.troco > 0 ? `<tr class="tot"><td>TROCO</td><td class="r">${brl(p.troco)}</td></tr>` : ''}
    </table>
    <hr>
    ${config.rodape ? `<div class="rodape">${esc(config.rodape)}</div>` : ''}
    <div class="rodape peq">NÃO É DOCUMENTO FISCAL</div>
  </div>`
}

/**
 * Cada via vira uma página com a altura exata do conteúdo. Com o corte automático da Waytech
 * configurado para cortar ao fim de cada página, cada via sai cortada separada e sem papel em branco.
 */
function imprimirHTML(corpo: string, config: Config) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.open()
  doc.write(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cupom</title><style>${estilo(config)}</style></head><body>${corpo}</body></html>`,
  )
  doc.close()

  const paginar = () => {
    const pxParaMm = 25.4 / 96
    const vias = [...doc.querySelectorAll<HTMLElement>('.via')]
    const alturas = vias.map((v) => Math.ceil(v.getBoundingClientRect().height * pxParaMm) + 2)
    const regras = alturas
      .map((h, i) => `@page via${i} { size: ${config.larguraPapel}mm ${h}mm; margin: 0; } .via[data-pg="${i}"] { page: via${i}; }`)
      .join('\n')
    vias.forEach((v, i) => v.setAttribute('data-pg', String(i)))
    const st = doc.createElement('style')
    st.textContent = `@page { size: ${config.larguraPapel}mm ${Math.max(...alturas, 50)}mm; margin: 0; }\n${regras}`
    doc.head.appendChild(st)
  }

  const remover = () => setTimeout(() => iframe.remove(), 1000)
  iframe.contentWindow!.addEventListener('afterprint', remover)
  const imprimir = () => {
    paginar()
    iframe.contentWindow!.focus()
    iframe.contentWindow!.print()
    // alguns navegadores não disparam afterprint
    setTimeout(() => iframe.isConnected && iframe.remove(), 60000)
  }
  // espera as fontes para medir a altura certa
  ;(doc.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(imprimir, 50))
}

export function imprimirPedido(p: Pedido, config: Config, vias?: { churrasqueira: boolean; cliente: boolean }) {
  // via de preparo só quando tem algo para preparar (espeto, combo, dose/drink, acompanhamento);
  // venda só de bebida pronta (lata, garrafa, fardo) sai só com o cupom do cliente
  const temPreparo = p.itens.some((i) => i.categoria !== 'bebida')
  const v = vias ?? { churrasqueira: config.viaChurrasqueira && temPreparo, cliente: config.viaCliente }
  const partes: string[] = []
  if (v.churrasqueira) partes.push(viaChurrasqueira(p))
  if (v.cliente) partes.push(viaCliente(p, config))
  if (!partes.length) partes.push(viaCliente(p, config))
  imprimirHTML(partes.join(''), config)
}

export function imprimirRelatorio(caixa: Caixa, r: Resumo, config: Config) {
  const linha = (rotulo: string, valor: string, cls = 'linha') =>
    `<tr class="${cls}"><td>${rotulo}</td><td class="r">${valor}</td></tr>`
  const corpo = `<div class="via">
    ${cabecalhoLoja(config)}
    <div class="tag">FECHAMENTO DE CAIXA Nº ${caixa.numero}</div>
    <div class="c">Aberto: ${data(caixa.abertoEm)} ${hora(caixa.abertoEm)}</div>
    ${caixa.fechadoEm ? `<div class="c">Fechado: ${data(caixa.fechadoEm)} ${hora(caixa.fechadoEm)}</div>` : '<div class="c">(PARCIAL - caixa aberto)</div>'}
    <hr class="forte"><div class="sec">Vendas</div>
    <table>
      ${linha('Pedidos', String(r.qtdPedidos))}
      ${linha('Para viagem', String(r.qtdViagem))}
      ${linha('Espetos vendidos', String(r.espetosVendidos))}
      ${linha('Ticket médio', brl(r.ticketMedio))}
      ${r.descontos > 0 ? linha('Descontos dados', brl(r.descontos)) : ''}
      ${r.cancelados.length ? linha('Cancelados', String(r.cancelados.length)) : ''}
      ${linha('FATURAMENTO', brl(r.faturamento), 'tot')}
    </table>
    <hr class="forte"><div class="sec">Por forma de pagamento</div>
    <table>
      ${linha('Dinheiro', brl(r.porForma.dinheiro))}
      ${linha('Pix', brl(r.porForma.pix))}
      ${linha('Débito', brl(r.porForma.debito))}
      ${linha('Crédito', brl(r.porForma.credito))}
    </table>
    <hr class="forte"><div class="sec">Dinheiro na gaveta</div>
    <table>
      ${linha('Troco inicial', brl(r.trocoInicial))}
      ${linha('+ Vendas em dinheiro', brl(r.porForma.dinheiro))}
      ${r.suprimentos ? linha('+ Suprimentos', brl(r.suprimentos)) : ''}
      ${r.sangrias ? linha('- Sangrias/retiradas', brl(r.sangrias)) : ''}
      ${r.despesasDinheiro ? linha('- Despesas pagas em dinheiro', brl(r.despesasDinheiro)) : ''}
      ${linha('ESPERADO', brl(r.dinheiroEsperado), 'tot')}
      ${caixa.dinheiroContado !== undefined ? linha('Contado', brl(caixa.dinheiroContado)) + linha('Diferença', brl(caixa.dinheiroContado - r.dinheiroEsperado)) : ''}
    </table>
    <hr class="forte"><div class="sec">Em conta (Pix + cartão)</div>
    <table>
      ${linha('Pix + cartões', brl(r.porForma.pix + r.porForma.debito + r.porForma.credito))}
      ${linha('- Taxas maquininha', brl(r.taxas))}
      ${r.despesasConta ? linha('- Despesas pagas da conta', brl(r.despesasConta)) : ''}
      ${linha('EM CONTA', brl(r.emConta), 'tot')}
    </table>
    <hr class="forte"><div class="sec">Lucro</div>
    <table>
      ${linha('Faturamento', brl(r.faturamento))}
      ${linha('- Custo dos produtos', brl(r.cmv))}
      ${r.cortesias.qtd ? linha('  (cortesias/consumo)', brl(r.cortesias.custo)) : ''}
      ${linha('- Taxas maquininha', brl(r.taxas))}
      ${linha('- Despesas do dia', brl(r.despesas))}
      ${r.embalagens.map((e) => linha(`(inclui ${e.qtd} ${esc(e.nome.toLowerCase())})`, brl(e.custo))).join('')}
      ${linha('LUCRO', brl(r.lucroLiquido), 'tot')}
    </table>
    <hr class="forte"><div class="sec">Produtos (vendido / sobrou)</div>
    <table>
      ${r.porProduto
        .filter((l) => l.vendidos > 0 || l.final !== undefined)
        .map((l) => linha(`${l.vendidos}x ${esc(l.nome)}`, l.final !== undefined ? `sobrou ${l.final}` : brl(l.receita)))
        .join('')}
    </table>
    ${
      caixa.movimentos.length
        ? `<hr class="forte"><div class="sec">Despesas e retiradas</div><table>${caixa.movimentos
            .map((m) => linha(`${m.tipo === 'despesa' ? 'Desp.' : m.tipo === 'sangria' ? 'Retirada' : 'Supr.'} ${esc(m.descricao)}`, brl(m.valor)))
            .join('')}</table>`
        : ''
    }
    ${caixa.observacao ? `<hr><div>Obs: ${esc(caixa.observacao)}</div>` : ''}
    <hr><div class="rodape peq">Impresso em ${data(new Date().toISOString())} ${hora(new Date().toISOString())}</div>
  </div>`
  imprimirHTML(corpo, config)
}

export function imprimirTeste(config: Config) {
  imprimirHTML(
    `<div class="via">${cabecalhoLoja(config)}<div class="tag">TESTE DE IMPRESSÃO</div>
    <div class="num"><small>PEDIDO</small>Nº 000</div><div class="viagem">PARA VIAGEM</div>
    <table><tr class="item"><td class="q">3x</td><td>CARNE</td></tr><tr class="obs"><td class="seta r">&gt;&gt;</td><td>BEM PASSADO</td></tr></table>
    <hr><div class="c">Papel de ${config.larguraPapel} mm. Se cortou nas bordas, troque a largura nas configurações.</div></div>`,
    config,
  )
}

/** Itens novos lançados numa comanda: via da churrasqueira com a mesa e o número da comanda. */
export function imprimirLancamento(c: Comanda, itens: ItemComanda[], config: Config, primeiro: boolean) {
  const p = {
    numero: c.numero,
    criadoEm: new Date().toISOString(),
    cliente: rotuloComanda(c),
    viagem: false,
    itens,
  } as unknown as Pedido
  imprimirHTML(viaChurrasqueira(p, { rotulo: 'COMANDA', numero: c.numero, aviso: primeiro ? undefined : 'MAIS ITENS' }), config)
}

/** Conferência da conta para o cliente ver antes de pagar (não é o cupom de pagamento). */
export function imprimirConferencia(
  c: Comanda,
  linhas: { item: ItemComanda; pago: number; falta: number }[],
  config: Config,
  divisao?: { faltam: number; valor: number },
) {
  const total = linhas.reduce((s, l) => s + l.item.preco * l.item.qtd, 0)
  const falta = linhas.reduce((s, l) => s + l.item.preco * l.falta, 0)
  imprimirHTML(
    `<div class="via">
    ${cabecalhoLoja(config)}
    <div class="tag">CONFERÊNCIA DA CONTA</div>
    <div class="num"><small>COMANDA</small>Nº ${numPedido(c.numero)}</div>
    <div class="c grande">${esc(rotuloComanda(c))}</div>
    <div class="c">${data(new Date().toISOString())} ${hora(new Date().toISOString())}</div>
    <hr>
    <table>
      ${linhas
        .map(
          (l) => `<tr class="linha"><td>${l.item.qtd}x ${esc(l.item.nome)}${l.item.escolhas?.length ? `<br><span class="peq">(${l.item.escolhas.map((e) => `${e.qtd * l.item.qtd} ${esc(e.nome)}`).join(', ')})</span>` : ''}${l.pago > 0.0005 ? `<br><span class="peq">já pago: ${fmtQtd(l.pago)}</span>` : ''}</td><td class="r">${brl(l.item.preco * l.item.qtd)}</td></tr>`,
        )
        .join('')}
    </table>
    <hr>
    <table>
      <tr class="linha"><td>Total consumido</td><td class="r">${brl(total)}</td></tr>
      ${total - falta > 0.004 ? `<tr class="linha"><td>Já pago</td><td class="r">-${brl(total - falta)}</td></tr>` : ''}
      <tr class="tot"><td>A PAGAR</td><td class="r">${brl(falta)}</td></tr>
      ${divisao ? `<tr class="linha"><td>Faltam ${divisao.faltam} pessoa(s)</td><td class="r">${brl(divisao.valor)} cada</td></tr>` : ''}
    </table>
    <hr><div class="rodape peq">CONFERÊNCIA — NÃO É DOCUMENTO FISCAL</div>
  </div>`,
    config,
  )
}

/** Conta completa da comanda: tudo que foi consumido e cada pagamento (quem pagou, como e quanto). */
export function imprimirContaCompleta(c: Comanda, pagos: Pedido[], config: Config) {
  const total = c.itens.reduce((s, i) => s + i.preco * i.qtd, 0)
  const recebido = pagos.reduce((s, p) => s + p.total, 0)
  const descontos = pagos.reduce((s, p) => s + p.desconto, 0)
  const falta = Math.max(0, total - pagos.reduce((s, p) => s + p.subtotal, 0))
  imprimirHTML(
    `<div class="via">
    ${cabecalhoLoja(config)}
    <div class="tag">CONTA COMPLETA</div>
    <div class="num"><small>COMANDA</small>Nº ${numPedido(c.numero)}</div>
    <div class="c grande">${esc(rotuloComanda(c))}</div>
    <div class="c">Aberta ${data(c.abertaEm)} ${hora(c.abertaEm)}</div>
    <hr class="forte"><div class="sec">Consumo</div>
    <table>
      ${c.itens
        .map(
          (i) => `<tr class="linha"><td>${i.qtd}x ${esc(i.nome)}${i.escolhas?.length ? `<br><span class="peq">(${i.escolhas.map((e) => `${e.qtd * i.qtd} ${esc(e.nome)}`).join(', ')})</span>` : ''}</td><td class="r">${brl(i.preco * i.qtd)}</td></tr>`,
        )
        .join('')}
      <tr class="tot"><td>TOTAL</td><td class="r">${brl(total)}</td></tr>
    </table>
    <hr class="forte"><div class="sec">Pagamentos</div>
    <table>
      ${pagos
        .map(
          (p) =>
            `<tr class="linha"><td>${hora(p.criadoEm)} ${p.cortesia ? `Cortesia (${esc(p.cortesia.motivo)})` : p.parte ? `Pessoa ${p.parte}` : 'Pagamento'}<br><span class="peq">${p.cortesia ? `valor ${brl(p.cortesia.valor)}` : p.pagamentos.map((pg) => NOMES_FORMA[pg.forma]).join(' + ')}${p.desconto > 0 ? ` · desc. ${brl(p.desconto)}` : ''}${p.troco > 0 ? ` · troco ${brl(p.troco)}` : ''}</span></td><td class="r">${brl(p.total)}</td></tr>`,
        )
        .join('')}
      ${descontos > 0 ? `<tr class="linha"><td>Descontos</td><td class="r">-${brl(descontos)}</td></tr>` : ''}
      <tr class="tot"><td>PAGO</td><td class="r">${brl(recebido)}</td></tr>
      ${falta > 0.004 ? `<tr class="tot"><td>FALTA</td><td class="r">${brl(falta)}</td></tr>` : '<tr class="linha"><td colspan="2" class="c"><b>CONTA QUITADA</b></td></tr>'}
    </table>
    <hr>
    ${config.rodape ? `<div class="rodape">${esc(config.rodape)}</div>` : ''}
    <div class="rodape peq">NÃO É DOCUMENTO FISCAL</div>
  </div>`,
    config,
  )
}

/** Vários cupons de cliente de uma vez (cada um sai cortado separado). */
export function imprimirCupons(pedidos: Pedido[], config: Config) {
  if (!pedidos.length) return
  imprimirHTML(pedidos.map((p) => viaCliente(p, config)).join(''), config)
}

/** Lista de compra (Reposição) na térmica. */
export function imprimirListaCompra(texto: string, config: Config) {
  const linhas = texto
    .replace(/\*/g, '')
    .split('\n')
    .map((l) => (l.trim() ? `<div class="${l.startsWith('- ') ? 'linha' : 'grande'}">${esc(l)}</div>` : '<hr>'))
    .join('')
  imprimirHTML(`<div class="via"><div class="tag">LISTA DE COMPRA</div>${linhas}</div>`, config)
}
