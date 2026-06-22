import ExpiryAlerts from './ExpiryAlerts'
import { getRentingAlerts } from '../api'

export default function Renting() {
  return (
    <ExpiryAlerts
      title="Renting · vencimientos"
      fetcher={getRentingAlerts}
      dateField="renting_end_date"
      dateLabel="Fin renting"
      extraCol={{ label: 'Proveedor', field: 'provider' }}
    />
  )
}
