import { Wrench } from 'lucide-react'
import Directory from './Directory'
import { getWorkshops } from '../api'

export default function Talleres() {
  return <Directory title="Talleres" fetcher={getWorkshops} icon={Wrench} />
}
