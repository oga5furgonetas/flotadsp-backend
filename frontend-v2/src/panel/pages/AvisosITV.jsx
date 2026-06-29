import ExpiryAlerts from './ExpiryAlerts'
import { getItvAlerts } from '../api'
import { useT } from '../../i18n'

export default function AvisosITV() {
  const { t } = useT()
  return <ExpiryAlerts title={t('itv.title')} fetcher={getItvAlerts} dateField="itv_date" dateLabel={t('itv.date.label')} />
}
