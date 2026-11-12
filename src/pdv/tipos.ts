export type Unidade = 'kg' | 'un' | 'L' | 'pct'

/** Insumo comprado (carne, palito, farofa...). O custo por unidade é precoCompra ÷ qtdCompra. */
export interface Insumo {
  id: string
  nome: string
  unidade: Unidade
  /** Quanto pagou na compra (R$). */
  precoCompra: number
  /** Quanto veio na compra, na unidade do insumo (ex.: 5 kg, 100 un). */
  qtdCompra: number
  /** Quanto tem guardado, na unidade do insumo (ex.: 12,5 kg). Sem valor = não controla. */
  estoque?: number
  /** Grupo livre para organizar a lista (Carnes, Embalagens, Temperos…). */
  grupo?: string
  /** Como aparece escrito nas notas dos fornecedores (aprendido na leitura por foto). */
  nomesNota?: string[]
  /** Códigos de barras de embalagens deste insumo. */
  codigos?: string[]
}

/** Regra de embalagem usada só quando o pedido é para viagem (ex.: saquinho térmico). */
export interface RegraViagem {
  insumoId: string
  /** Quantas por pedido para viagem. */
  porPedido: number
  /** +1 a cada N espetos do pedido (0 = não usa). */
  aCadaEspetos: number
}

export interface EmbalagemPedido {
  insumoId: string
  nome: string
  qtd: number
  /** Custo unitário na hora da venda. */
  custo: number
}

export type Categoria = 'prato' | 'porcao' | 'espeto' | 'combo' | 'bebida' | 'drink' | 'outro'

/** Adicional que o cliente pode pedir num prato (ex.: ovo frito +R$ 3). Cadastrado em Configurações. */
export interface Adicional {
  id: string
  nome: string
  preco: number
  /** Custo do adicional (entra no lucro). */
  custo?: number
  /** Em quais categorias aparece (ex.: pratos e porções). */
  categorias: Categoria[]
  ativo: boolean
}

/** Adicional escolhido num item (o preço do item já inclui os adicionais). */
export interface AdicionalItem {
  id: string
  nome: string
  preco: number
  custo?: number
}

/** Quanto de um insumo vai em 1 unidade do produto. Em gramas se o insumo é kg, em ml se é L. */
export interface ItemFicha {
  insumoId: string
  qtd: number
}

/** Parte de um combo/jantinha. Com mais de uma opção, o caixa escolhe na hora da venda. */
export interface Componente {
  id: string
  /** Ex.: "Espeto", "Refri". */
  nome: string
  qtd: number
  /** Produtos que podem ser escolhidos. */
  opcoes: string[]
  /** Valor a mais no preço quando o cliente escolhe esta opção (ex.: energético +R$ 3). */
  acrescimos?: Record<string, number>
}

export interface Produto {
  id: string
  nome: string
  categoria: Categoria
  /** Preço de venda. */
  preco: number
  emoji: string
  /** Foto reduzida (data URL). Se existir, aparece no botão no lugar do emoji. */
  imagem?: string
  /** Ficha técnica: insumos usados em 1 unidade. */
  ficha: ItemFicha[]
  /** Custo que não vem de insumo (ex.: refri comprado pronto, embalagem). */
  custoDireto: number
  ativo: boolean
  /** Unidades prontas (espetos montados, latas na geladeira). Sem valor = não controla. */
  estoque?: number
  /** Só para combos/jantinhas (e fardos: N unidades de uma bebida). */
  componentes?: Componente[]
  /** Códigos de barras (EAN) — o leitor bipa e o produto entra na venda ou na compra. */
  codigos?: string[]
  /** Quantas unidades vêm na caixa/fardo do fornecedor (para sugerir a compra em caixas). */
  unidadesCaixa?: number
  /** Ficha técnica de antes de passar a comprar pronto (guardada para poder voltar). */
  fichaAnterior?: ItemFicha[]
  /** Como o produto aparece escrito nas notas dos fornecedores (aprendido na leitura por foto). */
  nomesNota?: string[]
  /** Cardápio: descrição curta (ex.: "Cerveja puro malte, lata gelada"). */
  descricao?: string
  /** Cardápio: seção onde aparece (vazio = automático: Cervejas, Destilados, Espetos…). */
  secao?: string
  /** Cardápio: tamanho/porção (ex.: "350 ml", "1 kg", "serve 2 pessoas"). */
  tamanho?: string
  /** Preço no iFood/99Food. Sem valor = preço de venda + acréscimo do delivery (Configurações). */
  precoDelivery?: number
  /** Não aparece no cardápio de delivery (ex.: carvão, gelo, se não quiser vender pelo app). */
  foraDoDelivery?: boolean
  /** Tirado do cardápio por enquanto (ex.: acabou a Skol). Continua na venda. */
  foraDoCardapio?: boolean
}

export type FormaPagamento = 'dinheiro' | 'pix' | 'debito' | 'credito' | 'app'

/** Onde o pedido foi feito: no balcão ou num app de delivery. */
export type Canal = 'balcao' | 'ifood' | '99food' | 'site'

export interface Pagamento {
  forma: FormaPagamento
  /** Valor que abate do pedido. */
  valor: number
}

export interface ItemPedido {
  produtoId: string
  nome: string
  categoria: Categoria
  emoji: string
  preco: number
  /** Custo unitário no momento da venda. */
  custo: number
  qtd: number
  obs: string
  /** Combo: produtos escolhidos para 1 unidade do combo. */
  escolhas?: Escolha[]
  /** Preço normal quando o preço foi mudado na hora (promoção). */
  precoNormal?: number
  /** Pagamento de comanda: qual item da comanda este pagamento quita (qtd pode ser fração ao dividir a conta). */
  comandaItemId?: string
  /** Adicionais do prato (já somados no preço). */
  adicionais?: AdicionalItem[]
}

export interface Escolha {
  produtoId: string
  nome: string
  categoria: Categoria
  qtd: number
}

export interface Pedido {
  id: string
  numero: number
  caixaId: string
  criadoEm: string
  cliente: string
  viagem: boolean
  itens: ItemPedido[]
  subtotal: number
  desconto: number
  total: number
  pagamentos: Pagamento[]
  /** Quanto o cliente entregou em dinheiro (para calcular o troco). */
  recebidoDinheiro: number
  troco: number
  /** Taxa da maquininha (débito/crédito/pix) calculada na hora da venda. */
  taxas: number
  /** Custo dos itens + embalagens para viagem. */
  custoTotal: number
  /** Embalagens usadas no pedido para viagem (saquinho térmico…). */
  embalagens?: EmbalagemPedido[]
  /** Pagamento de uma comanda (o estoque já saiu quando os itens foram lançados). */
  comandaId?: string
  /** Conta dividida: qual divisão e qual parte (ex.: "2/3"). */
  divisaoId?: string
  parte?: string
  /** Saída sem venda (consumo próprio, cortesia…): sai do estoque, não entra dinheiro; o custo sai do lucro. */
  cortesia?: { motivo: string; /** quanto valeria na venda */ valor: number }
  /** Reclamações, estornos e cancelamento registrados depois da venda. */
  ocorrencias?: Ocorrencia[]
  /** Pedido que veio do iFood/99Food (a comissão do app entra em `taxas`). */
  canal?: Canal
  /** Taxa de entrega cobrada do cliente (já somada no total). */
  taxaEntrega?: number
  /** Taxa de serviço (garçom) cobrada na mesa, já somada no total. Não entra no lucro. */
  taxaServico?: number
  /** Pedido feito pelo cardápio digital: endereço/contato e o id do pedido na nuvem. */
  online?: {
    id: string
    tipo: 'entrega' | 'retirada'
    telefone: string
    endereco?: string
    bairro?: string
    referencia?: string
    pagamento: string
    obs?: string
    /** Pix pago pelo celular: o motoboy não cobra nada. */
    pagoAntecipado?: boolean
    /** Dinheiro: troco para quanto. */
    trocoPara?: number
  }
  cancelado: boolean
  entregue: boolean
}

export type TipoMovimento = 'despesa' | 'sangria' | 'suprimento'

export type TipoOcorrencia = 'reclamacao' | 'estorno' | 'cancelamento'

/** Algo que aconteceu com um pedido depois da venda (reclamação do cliente, devolução de dinheiro, cancelamento). */
export interface Ocorrencia {
  id: string
  em: string
  tipo: TipoOcorrencia
  /** Ex.: "Atraso", "Item errado", "Faltou item". */
  categoria?: string
  texto: string
  /** Estorno: quanto devolveu ao cliente e de onde saiu. */
  valor?: number
  origem?: 'dinheiro' | 'conta'
}

export interface Movimento {
  id: string
  tipo: TipoMovimento
  descricao: string
  valor: number
  /** De onde saiu (despesa) ou para onde foi o dinheiro. */
  origem: 'dinheiro' | 'conta'
  criadoEm: string
}

export interface Caixa {
  id: string
  numero: number
  abertoEm: string
  fechadoEm?: string
  /** Dinheiro na gaveta ao abrir (troco). */
  trocoInicial: number
  /** Estoque de cada produto controlado na abertura do caixa. */
  estoque: Record<string, number>
  /** Estoque de cada produto controlado no fechamento. */
  estoqueFinal?: Record<string, number>
  movimentos: Movimento[]
  /** Dinheiro contado na gaveta ao fechar. */
  dinheiroContado?: number
  observacao?: string
}

export interface Config {
  nomeLoja: string
  endereco: string
  telefone: string
  rodape: string
  larguraPapel: 58 | 80
  imprimirAoFinalizar: boolean
  viaChurrasqueira: boolean
  viaCliente: boolean
  /** Entregas: imprimir a via do motoboy (endereço, telefone e quanto cobrar). */
  viaMotoboy?: boolean
  /** % cobrada pela maquininha. */
  taxaDebito: number
  taxaCredito: number
  taxaPix: number
  /** Observações de um toque para os espetos (ponto da carne etc.). */
  obsRapidas: string[]
  /** Avisar quando restarem esta quantidade ou menos. */
  alertaEstoque: number
  /** Embalagens que entram automaticamente nos pedidos para viagem. */
  regrasViagem: RegraViagem[]
  /** Endereço do Apps Script ligado à planilha do Google (sincronização). */
  planilhaUrl: string
  /** Chave combinada com o script, para ninguém mais gravar na planilha. */
  planilhaChave: string
  /** Enviar para a planilha sozinho a cada mudança. */
  planilhaAuto: boolean
  /** Dia de espeto: mostra espetos/combos na venda e imprime a via da churrasqueira. */
  espetoHoje: boolean
  /** Reposição: comprar para durar quantos dias. */
  diasCobertura: number
  /** Comissão total do iFood (plano + pagamento online), em %. */
  taxaIfood: number
  /** Comissão total do 99Food, em %. */
  taxa99: number
  /** Quanto o preço do app fica acima do balcão, em % (para cobrir a comissão). */
  acrescimoDelivery: number
  /** Cardápio: esconder sozinho o que está sem estoque. */
  cardapioSemEsgotados?: boolean
  /** Cardápio digital (pedidos pelo celular do cliente). */
  online?: ConfigOnline
  /** Adicionais dos pratos (ovo frito, fritas extra…). */
  adicionais?: Adicional[]
  /** Taxa de serviço nas mesas (só mesa; balcão, retirada e delivery não pagam). */
  taxaServico?: { ativa: boolean; pct: number }
  /** Comanda da cozinha: deixar bebidas de fora (só sai o que a cozinha prepara). */
  cozinhaSemBebidas?: boolean
  /** Garçons que podem lançar pedidos pelo celular (e-mail da conta de cada um). */
  garcons?: Garcom[]
}

export interface Garcom {
  email: string
  nome: string
  ativo: boolean
}

export type TipoChavePix = 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria'

export interface ConfigOnline {
  /** Recebendo pedidos agora (loja aberta no cardápio digital). */
  aceitando: boolean
  bairros: { nome: string; taxa: number }[]
  retirada: boolean
  entrega: boolean
  tempoEntrega: string
  tempoRetirada: string
  pedidoMinimo: number
  pixTipo: TipoChavePix
  pixChave: string
  pixNome: string
  pixCidade: string
  /** Aceita Pix pago na hora pelo celular (o cliente vê o QR Code). */
  pixAntecipado: boolean
  aviso: string
  /** WhatsApp da loja (só números, com DDD) para o cliente falar com vocês. */
  whatsapp: string
  /** Toca o alarme até aceitar o pedido. */
  som: boolean
}

export type TipoMovEstoque = 'compra' | 'preparo' | 'montagem' | 'contagem'

/** Histórico de estoque: compras que chegaram, espetos montados e contagens/perdas. */
export interface MovEstoque {
  id: string
  criadoEm: string
  tipo: TipoMovEstoque
  /** Insumo que entrou (compra) ou foi contado. */
  insumoId?: string
  /** Produto montado, comprado pronto (bebida) ou contado. */
  produtoId?: string
  nome: string
  /** Quantidade que entrou (+) ou saiu (−), na unidade do insumo ou em unidades do produto. */
  qtd: number
  unidade: string
  /** Valor pago (compras). */
  valor?: number
  /** Montagem: insumos usados. */
  consumo?: { insumoId: string; nome: string; qtd: number; unidade: string }[]
  obs?: string
  /** Compra: de quem comprou e qual nota (várias linhas da mesma compra têm o mesmo compraId). */
  fornecedor?: string
  compraId?: string
  /** Compra: número da nota/pedido do fornecedor. */
  nota?: string
}

/** Item anotado numa comanda (mesa). Sai do estoque ao ser lançado; entra no caixa quando é pago. */
export interface ItemComanda {
  id: string
  /** Preço normal quando o preço foi mudado na hora (promoção). */
  precoNormal?: number
  produtoId: string
  nome: string
  categoria: Categoria
  emoji: string
  preco: number
  custo: number
  qtd: number
  obs: string
  escolhas?: Escolha[]
  adicionais?: AdicionalItem[]
  lancadoEm: string
  /** Quem lançou (nome do garçom, quando veio pelo celular). */
  garcom?: string
}

export interface Comanda {
  id: string
  numero: number
  mesa: string
  nome: string
  abertaEm: string
  itens: ItemComanda[]
  /** Conta dividida igualmente entre pessoas (a divisão vale para o que ainda falta pagar). */
  divisao?: { id: string; pessoas: number }
  canceladaEm?: string
  /** Quando foi juntada em outra comanda (mesas que se juntaram), o número da comanda que recebeu os itens. */
  juntadaNa?: number
}
