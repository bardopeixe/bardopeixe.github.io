import { useEffect, useRef, useState } from 'react'
import { Modal, btn } from './ui'

/**
 * Leitor de código de barras USB/Bluetooth: ele “digita” o código muito rápido e aperta Enter.
 * Este hook pega essa digitação mesmo sem nenhum campo selecionado, para bipar e já vender.
 * (Quando um campo de texto está em foco, o próprio campo recebe o código — quem usa trata o Enter.)
 */
export function useLeitorCodigo(ativo: boolean, aoLer: (codigo: string) => void, mesmoComJanelaAberta = false) {
  const aoLerRef = useRef(aoLer)
  aoLerRef.current = aoLer
  useEffect(() => {
    if (!ativo) return
    let buffer = ''
    let ultimo = 0
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return
      if (!mesmoComJanelaAberta && document.querySelector('[role=dialog]')) return
      const agora = Date.now()
      // pessoa digitando é devagar; leitor manda tudo em poucos milissegundos
      if (agora - ultimo > 80) buffer = ''
      ultimo = agora
      if (e.key === 'Enter') {
        if (buffer.length >= 4) {
          e.preventDefault()
          aoLerRef.current(buffer)
        }
        buffer = ''
        return
      }
      if (e.key.length === 1) buffer += e.key
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [ativo, mesmoComJanelaAberta])
}

// ---- câmera (Android/Chrome têm o BarcodeDetector; iPhone ainda não) ----
type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type ConstrutorDetector = new (o: { formats: string[] }) => Detector

export const cameraLeSuportada = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia

export function LerComCamera({ aoLer, aoFechar }: { aoLer: (codigo: string) => void; aoFechar: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let parar = false
    let stream: MediaStream | null = null
    ;(async () => {
      try {
        const Ctor = (window as unknown as { BarcodeDetector: ConstrutorDetector }).BarcodeDetector
        const det = new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!video.current) return
        video.current.srcObject = stream
        await video.current.play()
        while (!parar) {
          const achados = await det.detect(video.current).catch(() => [])
          if (achados[0]?.rawValue) {
            aoLer(achados[0].rawValue)
            return
          }
          await new Promise((r) => setTimeout(r, 200))
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não consegui abrir a câmera.')
      }
    })()
    return () => {
      parar = true
      stream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Modal titulo="📷 Ler código de barras" aberto aoFechar={aoFechar}>
      {erro ? (
        <p className="text-red-600">{erro}</p>
      ) : (
        <>
          <video ref={video} className="w-full rounded-xl bg-black" playsInline muted />
          <p className="mt-2 text-center text-sm text-stone-600">Aponte para o código de barras da bebida.</p>
        </>
      )}
      <button className={`${btn.secundario} mt-3 w-full`} onClick={aoFechar}>
        Fechar
      </button>
    </Modal>
  )
}
