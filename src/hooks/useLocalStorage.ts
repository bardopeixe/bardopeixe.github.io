import { useEffect, useState } from 'react'

const EVENTO = 'local-storage-alterado'

function ler<T>(key: string, initialValue: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : initialValue
  } catch {
    return initialValue
  }
}

/** Estado guardado no localStorage. Componentes que usam a mesma chave ficam sincronizados. */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => ler(key, initialValue))

  useEffect(() => {
    try {
      const raw = JSON.stringify(value)
      if (window.localStorage.getItem(key) === raw) return
      window.localStorage.setItem(key, raw)
      window.dispatchEvent(new CustomEvent(EVENTO, { detail: key }))
    } catch {
      // localStorage indisponível (modo privado, cota excedida, etc.) — ignora
    }
  }, [key, value])

  useEffect(() => {
    const aoMudar = (e: Event) => {
      const chave = e instanceof StorageEvent ? e.key : (e as CustomEvent<string>).detail
      if (chave !== key) return
      try {
        const raw = window.localStorage.getItem(key)
        setValue((atual) => (raw === JSON.stringify(atual) ? atual : raw ? (JSON.parse(raw) as T) : atual))
      } catch {
        // ignora valores corrompidos
      }
    }
    window.addEventListener(EVENTO, aoMudar)
    window.addEventListener('storage', aoMudar)
    return () => {
      window.removeEventListener(EVENTO, aoMudar)
      window.removeEventListener('storage', aoMudar)
    }
  }, [key])

  return [value, setValue] as const
}
