import ExpiryAlerts from './ExpiryAlerts'
import { getItvAlerts } from '../api'

export default function AvisosITV() {
  return <ExpiryAlerts title="Avisos ITV" fetcher={getItvAlerts} dateField="itv_date" dateLabel="Caduca ITV" />
}
