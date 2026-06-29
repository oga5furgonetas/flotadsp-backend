import { useEffect, useState } from 'react'
import { api } from '../services/api'

const DEFAULT_LIMITS = {
  max_vehicles: -1, max_drivers: -1, max_centers: -1,
  ai: true, scorecard: true, chat: true, forensics: true,
  maintenance: true, assignments: true, export: true,
}

let _cache = null
let _fetchPromise = null

export function usePlan() {
  const [billing, setBilling] = useState(_cache)

  useEffect(() => {
    if (_cache) { setBilling(_cache); return }
    if (!_fetchPromise) {
      _fetchPromise = api.get('/org/billing')
        .then(r => { _cache = r.data; return r.data })
        .catch(() => null)
        .finally(() => { _fetchPromise = null })
    }
    _fetchPromise.then(d => d && setBilling(d))
  }, [])

  const plan = billing?.plan || 'pro'
  const limits = billing?.limits || DEFAULT_LIMITS
  const status = billing?.status || 'trial'
  const daysLeft = billing?.days_left ?? null
  const isTrialing = status === 'trial'
  const isBlocked = billing?.required === true

  return { plan, limits, status, daysLeft, isTrialing, isBlocked, billing }
}

// Invalida cache tras cambios de plan
export function invalidatePlanCache() { _cache = null }

// Checks de feature individuales
export const canFeature = (limits, key) => limits?.[key] === true || limits?.[key] === -1 || limits?.[key] > 0
