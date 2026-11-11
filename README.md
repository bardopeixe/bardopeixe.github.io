# Bar do Peixe — PDV, cardápio digital e garçom no celular

Sistema do restaurante **Bar do Peixe** (Rua João Theodoro Genesi, 138 — Diadema · (11) 98236-9034).
Adaptado do PDV do bar, com projeto Firebase próprio e separado.

| Endereço | O que é | Quem usa |
|---|---|---|
| `https://bardopeixe.github.io/` | Cardápio digital: o cliente pede **delivery** ou **retirada** | Clientes |
| `https://bardopeixe.github.io/garcom/` | App do garçom: lança os pedidos das **mesas** | Garçons (login próprio) |
| `https://bardopeixe.github.io/pdv/` | PDV: venda, mesas, caixa, estoque, relatórios | Caixa / dono |

## O que tem

- **Mesas** (aba 🍽️ Mesas): abre a mesa, lança os itens (no PDV ou pelo celular do garçom), recebe tudo junto, por itens ou dividido; junta mesas.
- **Garçom no celular**: cada garçom entra com o próprio e-mail (Google ou e-mail e senha confirmado). Ele só **lança pedidos**: o pedido entra sozinho na comanda da mesa no PDV e sai a **comanda da cozinha** na impressora. Receber e fechar a conta é no caixa. Os garçons são liberados em **PDV → Config. → Garçons no celular**.
- **Comanda da cozinha** impressa (térmica 58/80 mm): letra grande, sem preço, com mesa, garçom, adicionais e observações; "MAIS ITENS" a partir do 2º lançamento. Opção de deixar as bebidas fora.
- **Taxa de serviço** (padrão 10%): só nas mesas, pode ser ligada/desligada em Config. e desmarcada na hora de receber, se o cliente não quiser pagar. Aparece separada no painel, no fechamento do caixa e nos relatórios ("a repassar aos garçons") e não entra no lucro.
- **Adicionais nos pratos** (ovo frito, fritas extra, vinagrete…): cadastrados em Config., por categoria (pratos, porções…). Aparecem no PDV, no app do garçom e no cardápio digital, somam no preço e saem na comanda da cozinha.
- **Delivery e retirada** pelo cardápio digital (taxa por bairro, Pix com QR Code, acompanhamento do pedido), com alarme no PDV.
- Mantidos do PDV original: ficha técnica e estoque de insumos, compras com leitor de código de barras, ler nota por foto com IA, sincronia com Google Drive e Planilhas, iFood/99Food, caixa e relatórios.
- **Sem nota fiscal** (cupom "não é documento fiscal").

Cardápio inicial (do "Menu do dia"): pratos comerciais (R$ 15), executivos (**sem preço no cardápio impresso — ficam desativados até colocar o preço em Cadastros**), porções e algumas bebidas de exemplo.

## Configurar o Firebase (uma vez)

1. Em <https://console.firebase.google.com> crie o projeto (ex.: `bar-do-peixe`).
2. **Authentication → Começar**: ative **E-mail/senha** e **Google**. Em **Configurações → Domínios autorizados**, adicione `bardopeixe.github.io`.
3. **Firestore Database → Criar banco de dados** → região `southamerica-east1` → modo de produção.
4. **⚙️ Configurações do projeto → Seus apps → Web `</>`**: registre o app e copie o `firebaseConfig` para [`src/nuvem/firebaseConfig.ts`](src/nuvem/firebaseConfig.ts) (esses valores não são secretos).
5. Publique (push na `main`). Abra o PDV → **Pedidos online** → entre com a **conta do dono** → **Copiar regras** e cole em **Firestore → Regras → Publicar**.
6. Em **Config. → Garçons no celular**, cadastre nome e e-mail de cada garçom e mostre o QR Code para eles.

> O PDV precisa ficar aberto (e conectado com a conta do dono) para receber os pedidos dos garçons e do delivery.

## Publicar (GitHub Pages)

Em **Settings → Pages → Source**, escolha **GitHub Actions**. A cada push na `main`, o workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) gera o cardápio, o app do garçom e o PDV.

## Desenvolvimento

```bash
npm install
npm run dev          # cardápio em /, garçom em /garcom/
npm run build        # cardápio + garçom em dist/
npm run build:pdv    # PDV num arquivo só: pdv/pdv-bar-do-peixe.html (abre direto no Chrome, sem internet)
```

Código: `src/pdv` (PDV), `src/cardapio` (cardápio digital), `src/garcom` (app do garçom), `src/nuvem` (login/Firebase).
