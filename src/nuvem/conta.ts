import { useSyncExternalStore } from 'react'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import { FIREBASE } from './firebaseConfig'

/**
 * Contas de clientes com Firebase (gratuito): e-mail e senha, recuperação de senha, Google
 * e histórico de pedidos na nuvem. O Firebase só é baixado quando o cliente abre o login
 * ou quando já estava logado neste aparelho, para não deixar a loja mais lenta.
 */

export type Usuario = { uid: string; nome: string; email: string; foto?: string; verificado?: boolean }


export const contasAtivas = FIREBASE.apiKey.trim().length > 0

const LEMBRAR = 'bardopeixe-logado'
const ouvintes = new Set<() => void>()
let estado: { usuario: Usuario | null; pronto: boolean } = { usuario: null, pronto: !contasAtivas }
let carregando: Promise<{ auth: Auth; db: Firestore }> | null = null

function avisar(novo: typeof estado) {
  estado = novo
  ouvintes.forEach((f) => f())
}

function lembrar(sim: boolean) {
  try {
    if (sim) window.localStorage.setItem(LEMBRAR, '1')
    else window.localStorage.removeItem(LEMBRAR)
  } catch {
    // sem localStorage o cliente só precisa entrar de novo na próxima visita
  }
}

function carregar() {
  carregando ??= (async () => {
    const [{ initializeApp }, authMod, { getFirestore }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ])
    const app = initializeApp(FIREBASE)
    const auth = authMod.getAuth(app)
    auth.languageCode = 'pt-BR'
    authMod.onAuthStateChanged(auth, (u) => {
      lembrar(Boolean(u))
      avisar({
        pronto: true,
        usuario: u
          ? { uid: u.uid, nome: u.displayName || u.email || 'Cliente', email: u.email ?? '', foto: u.photoURL ?? undefined, verificado: u.emailVerified }
          : null,
      })
    })
    return { auth, db: getFirestore(app) }
  })().catch((erro) => {
    carregando = null
    throw erro
  })
  return carregando
}

// Quem já entrou neste aparelho continua logado ao voltar.
if (contasAtivas) {
  let jaEntrou = false
  try {
    jaEntrou = window.localStorage.getItem(LEMBRAR) === '1'
  } catch {
    // ignora
  }
  if (jaEntrou) carregar().catch(() => avisar({ usuario: null, pronto: true }))
  else estado = { usuario: null, pronto: true }
}

export function useConta() {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    () => estado,
  )
}

const mensagens: Record<string, string> = {
  'auth/invalid-email': 'Esse e-mail não parece certo. Confira e tente de novo.',
  'auth/missing-password': 'Digite a sua senha.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'Não encontramos uma conta com esse e-mail. Que tal criar uma?',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Toque em "Entrar".',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet. Tente de novo.',
  'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de terminar.',
  'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Libere pop-ups e tente de novo.',
}

/** Transforma o erro do Firebase em uma frase para o cliente. */
export function mensagemDeErro(erro: unknown) {
  const codigo = (erro as { code?: string })?.code ?? ''
  return mensagens[codigo] ?? 'Não deu certo agora. Tente de novo em instantes.'
}

export async function entrar(email: string, senha: string) {
  const { auth } = await carregar()
  const { signInWithEmailAndPassword } = await import('firebase/auth')
  await signInWithEmailAndPassword(auth, email.trim(), senha)
}

export async function criarConta(nome: string, email: string, senha: string) {
  const { auth } = await carregar()
  const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth')
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), senha)
  await updateProfile(user, { displayName: nome.trim() })
  avisar({ pronto: true, usuario: { uid: user.uid, nome: nome.trim(), email: user.email ?? email.trim() } })
}

export async function entrarComGoogle() {
  const { auth } = await carregar()
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth')
  await signInWithPopup(auth, new GoogleAuthProvider())
}

export async function recuperarSenha(email: string) {
  const { auth } = await carregar()
  const { sendPasswordResetEmail } = await import('firebase/auth')
  await sendPasswordResetEmail(auth, email.trim())
}

export async function sair() {
  const { auth } = await carregar()
  const { signOut } = await import('firebase/auth')
  await signOut(auth)
}

export async function atualizarNome(nome: string) {
  const { auth } = await carregar()
  const { updateProfile } = await import('firebase/auth')
  if (!auth.currentUser) return
  await updateProfile(auth.currentUser, { displayName: nome.trim() })
  if (estado.usuario) avisar({ ...estado, usuario: { ...estado.usuario, nome: nome.trim() } })
}

/** Manda o link de confirmação para o e-mail da conta (garçom com e-mail e senha). */
export async function enviarVerificacao() {
  const { auth } = await carregar()
  const { sendEmailVerification } = await import('firebase/auth')
  if (auth.currentUser) await sendEmailVerification(auth.currentUser)
}

/** Confere de novo se o e-mail já foi confirmado (depois de clicar no link). */
export async function recarregarUsuario() {
  const { auth } = await carregar()
  const u = auth.currentUser
  if (!u) return false
  await u.reload()
  await u.getIdToken(true)
  if (estado.usuario) avisar({ ...estado, usuario: { ...estado.usuario, verificado: u.emailVerified } })
  return u.emailVerified
}

/** Abre o login sob demanda (pré-carrega o Firebase enquanto o cliente digita). */
export const prepararLogin = () => {
  carregar().catch(() => {})
}

/** Acesso direto ao Firebase já iniciado (usado pelo cardápio digital do espetinho e pelo PDV). */
export const conexaoFirebase = () => carregar()
