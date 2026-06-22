import { Construction } from 'lucide-react'

// Stub temporal de F0. Cada módulo (F1+) reemplaza esto por su pantalla real
// conectada a la API del backend.
export default function Placeholder({ title }) {
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">{title}</h1>
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <Construction size={32} className="text-brand-400" />
        <p className="text-dark-300">Módulo en construcción.</p>
        <p className="text-sm text-dark-500">
          Se conectará a los datos reales del backend en la siguiente fase.
        </p>
      </div>
    </div>
  )
}
