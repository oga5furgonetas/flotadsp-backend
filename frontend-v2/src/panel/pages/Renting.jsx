import { useT } from '../../i18n'
import ExpiryAlerts from './ExpiryAlerts'
import { getRentingAlerts } from '../api'

export default function Renting() {
  const { t } = useT()
  return (
    <ExpiryAlerts
      title={t('rent.title')}
      fetcher={getRentingAlerts}
      dateField="renting_end_date"
      dateLabel={t('rent.date.label')}
      extraCol={{ label: t('rent.provider'), field: 'provider' }}
    />
  )
}
