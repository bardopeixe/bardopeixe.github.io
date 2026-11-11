/**
 * Endereço do site do Bar do Peixe.
 * Aberto pela internet (GitHub Pages, Netlify…), usa o próprio endereço onde está.
 * Aberto como arquivo no computador (PDV offline), usa o endereço público abaixo.
 */
export const SITE_PUBLICO = 'https://bardopeixe.github.io'

export const SITE = typeof location !== 'undefined' && location.protocol.startsWith('http') ? location.origin : SITE_PUBLICO
