import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react'

type ActiveConversationContextType = {
  activeConversationId: string | null
  setActiveConversationId: (id: string | null) => void
}

const ActiveConversationContext = createContext<ActiveConversationContextType | null>(null)

export function ActiveConversationProvider({ children }: { children: ReactNode }) {
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null)
  const activeRef = useRef<string | null>(null)

  const setActiveConversationId = useCallback((id: string | null) => {
    activeRef.current = id
    setActiveConversationIdState(id)
  }, [])

  return (
    <ActiveConversationContext.Provider value={{ activeConversationId, setActiveConversationId }}>
      {children}
    </ActiveConversationContext.Provider>
  )
}

export function useActiveConversation() {
  const ctx = useContext(ActiveConversationContext)
  if (!ctx) throw new Error('useActiveConversation must be used inside ActiveConversationProvider')
  return ctx
}