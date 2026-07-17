import { createContext, useContext } from 'react'
import type { AccountErrorShape, AccountSession } from '../lib/accountClient'

export interface AccountContextValue {
  session: AccountSession
  logout: () => Promise<void>
  lock: (error?: AccountErrorShape) => Promise<void>
  registerBeforeLock: (handler: (() => Promise<void>) | null) => void
}

const AccountContext = createContext<AccountContextValue | null>(null)

export const AccountProvider = AccountContext.Provider

export function useOptionalAccount() {
  return useContext(AccountContext)
}

export function useAccount() {
  const value = useOptionalAccount()
  if (!value) {
    throw new Error('AccountProvider is missing')
  }
  return value
}
