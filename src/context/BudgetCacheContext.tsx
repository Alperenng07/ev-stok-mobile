import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { BudgetResult, PricedLine } from '../types/budget'

type BudgetCacheValue = {
  result: BudgetResult | null
  calculatedAt: string | null
  setResult: (result: BudgetResult | null) => void
  getLineForItem: (itemId: string) => PricedLine | null
  hasCache: boolean
  hasCacheFor: (locationKey: string) => boolean
  getLineForItemAt: (itemId: string, locationKey: string) => PricedLine | null
}

const BudgetCacheContext = createContext<BudgetCacheValue | null>(null)

export function BudgetCacheProvider({ children }: { children: ReactNode }) {
  const [result, setResultState] = useState<BudgetResult | null>(null)
  const [calculatedAt, setCalculatedAt] = useState<string | null>(null)

  const setResult = useCallback((next: BudgetResult | null) => {
    setResultState(next)
    setCalculatedAt(next ? new Date().toISOString() : null)
  }, [])

  const getLineForItem = useCallback(
    (itemId: string) => result?.lines.find((l) => l.itemId === itemId) ?? null,
    [result],
  )

  const hasCacheFor = useCallback(
    (locationKey: string) =>
      Boolean(result && result.locationKey === locationKey && result.lines.length > 0),
    [result],
  )

  const getLineForItemAt = useCallback(
    (itemId: string, locationKey: string) => {
      if (!result || result.locationKey !== locationKey) return null
      return result.lines.find((l) => l.itemId === itemId) ?? null
    },
    [result],
  )

  const value = useMemo(
    () => ({
      result,
      calculatedAt,
      setResult,
      getLineForItem,
      hasCache: Boolean(result && result.lines.length > 0),
      hasCacheFor,
      getLineForItemAt,
    }),
    [result, calculatedAt, setResult, getLineForItem, hasCacheFor, getLineForItemAt],
  )

  return <BudgetCacheContext.Provider value={value}>{children}</BudgetCacheContext.Provider>
}

export function useBudgetCache() {
  const ctx = useContext(BudgetCacheContext)
  if (!ctx) throw new Error('useBudgetCache BudgetCacheProvider içinde kullanılmalı')
  return ctx
}
