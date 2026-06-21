import { useEffect, useState } from 'react'
import { getPortalVehicles } from '../../services/api'
import DriverLogin from './DriverLogin'
import InspectionFlow from './InspectionFlow'
import InspectionDone from './InspectionDone'

const DRIVER_KEY = 'flotadsp_driver'

export default function DriverPortal() {
  const [driver, setDriver] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(DRIVER_KEY)) || null
    } catch {
      return null
    }
  })
  const [vehicles, setVehicles] = useState([])
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!driver) return
    getPortalVehicles()
      .then((r) => setVehicles(r.data || []))
      .catch(() => setVehicles([]))
  }, [driver])

  const login = (d) => {
    localStorage.setItem(DRIVER_KEY, JSON.stringify(d))
    setDriver(d)
  }
  const logout = () => {
    localStorage.removeItem(DRIVER_KEY)
    localStorage.removeItem('flotadsp_token')
    setDriver(null)
    setResult(null)
  }

  if (!driver) return <DriverLogin onLogin={login} />
  if (result)
    return <InspectionDone result={result} onNew={() => setResult(null)} onLogout={logout} />
  return (
    <InspectionFlow driver={driver} vehicles={vehicles} onComplete={setResult} onLogout={logout} />
  )
}
