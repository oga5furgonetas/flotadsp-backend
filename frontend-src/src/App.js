import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import Sidebar from '@/components/Sidebar';
import Dashboard from '@/pages/Dashboard';
import PeritoIAPro from '@/pages/PeritoIAPro';
import PanelConductor from '@/pages/PanelConductor';
import Flota from '@/pages/Flota';
import Conductores from '@/pages/Conductores';
import HistorialIA from '@/pages/HistorialIA';
import '@/App.css';

// Placeholder components for other routes
const Placeholder = ({ title }) => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center">
      <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
      <p className="text-gray-400">Próximamente</p>
    </div>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen bg-[#0f0f10] overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/flota" element={<Flota />} />
              <Route path="/en-taller" element={<Placeholder title="En Taller" />} />
              <Route path="/alertas" element={<Placeholder title="Alertas" />} />
              <Route path="/fotos-referencia" element={<Placeholder title="Fotos de Referencia" />} />
              <Route path="/analizar-laterales" element={<Placeholder title="Analizar 4 Laterales" />} />
              <Route path="/historial" element={<HistorialIA />} />
              <Route path="/chat-ia" element={<Placeholder title="Chat con IA" />} />
              <Route path="/perito-ia-pro" element={<PeritoIAPro />} />
              <Route path="/ficha-vehiculo" element={<Placeholder title="Ficha Vehículo" />} />
              <Route path="/incidencias" element={<Placeholder title="Incidencias" />} />
              <Route path="/panel-conductor" element={<PanelConductor />} />
              <Route path="/conductores" element={<Conductores />} />
              <Route path="/calendario-itv" element={<Placeholder title="Calendario ITV" />} />
              <Route path="/en-transito" element={<Placeholder title="En Tránsito" />} />
              <Route path="/reportes" element={<Placeholder title="Reportes" />} />
              <Route path="/actividad" element={<Placeholder title="Actividad" />} />
              <Route path="/import-export" element={<Placeholder title="Import/Export" />} />
              <Route path="/papelera" element={<Placeholder title="Papelera" />} />
              <Route path="/multas" element={<Placeholder title="Multas" />} />
              <Route path="/documentos" element={<Placeholder title="Documentos" />} />
              <Route path="/ajustes" element={<Placeholder title="Ajustes" />} />
            </Routes>
          </div>
        </div>
      </div>
      <Toaster position="top-right" theme="dark" richColors />
    </BrowserRouter>
  );
}

export default App;