import { useEffect, useState } from 'react'
import { getPortalVehicles } from '../../services/api'
import { lista } from '../../lib/lista'
import DriverLogin from './DriverLogin'
import InspectionFlow from './InspectionFlow'
import InspectionDone from './InspectionDone'
import MisTurnos from './MisTurnos'

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
  const [verTurnos, setVerTurnos] = useState(false)

  useEffect(() => {
    if (!driver) return
    getPortalVehicles()
      .then((r) => setVehicles(lista(r.data)))
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
  if (verTurnos) return <MisTurnos onBack={() => setVerTurnos(false)} />
  if (result)
    return <InspectionDone result={result} onNew={() => setResult(null)} onLogout={logout} />
  return (
    <InspectionFlow driver={driver} vehicles={vehicles} onComplete={setResult}
      onLogout={logout} onShifts={() => setVerTurnos(true)} />
  )
}
