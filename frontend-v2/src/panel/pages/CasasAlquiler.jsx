import { Building2 } from 'lucide-react'
import Directory from './Directory'
import { getRentals } from '../api'

export default function CasasAlquiler() {
  return <Directory title="Casas de alquiler" fetcher={getRentals} icon={Building2} />
}
