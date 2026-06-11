import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Truck, Wrench, Bell, Image, Scan, History, 
  MessageSquare, FileCheck, FileText, UserCircle, Users, Calendar,
  TruckIcon, BarChart, Activity, FileUp, Trash2, FileSpreadsheet, Settings
} from 'lucide-react';

const Sidebar = () => {
  const location = useLocation();
  
  const isActive = (path) => location.pathname === path;
  
  const menuSections = [
    {
      title: 'PRINCIPAL',
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        { icon: Truck, label: 'Flota', path: '/flota' },
        { icon: Wrench, label: 'En taller', path: '/en-taller', badge: 10 },
        { icon: Bell, label: 'Alertas', path: '/alertas', badge: 15 }
      ]
    },
    {
      title: 'ANÁLISIS IA',
      items: [
        { icon: Image, label: 'Fotos referencia', path: '/fotos-referencia' },
        { icon: Scan, label: 'Analizar 4 laterales', path: '/analizar-laterales' },
        { icon: History, label: 'Historial IA', path: '/historial' },
        { icon: MessageSquare, label: 'Hablar con la analizadora', path: '/chat-ia' },
        { icon: FileCheck, label: 'Perito IA Pro', path: '/perito-ia-pro', badge: 'NEW', badgeColor: 'bg-purple-500' }
      ]
    },
    {
      title: 'GESTIÓN',
      items: [
        { icon: FileText, label: 'Ficha vehículo', path: '/ficha-vehiculo' },
        { icon: FileText, label: 'Incidencias', path: '/incidencias' },
        { icon: UserCircle, label: 'Panel conductor', path: '/panel-conductor' },
        { icon: Users, label: 'Conductores', path: '/conductores' }
      ]
    },
    {
      title: 'PLANIFICACIÓN',
      items: [
        { icon: Calendar, label: 'Calendario ITV', path: '/calendario-itv' },
        { icon: TruckIcon, label: 'En tránsito', path: '/en-transito' }
      ]
    },
    {
      title: 'ANÁLISIS',
      items: [
        { icon: BarChart, label: 'Reportes', path: '/reportes' },
        { icon: Activity, label: 'Actividad', path: '/actividad' }
      ]
    },
    {
      title: 'DATOS',
      items: [
        { icon: FileUp, label: 'Import/Export', path: '/import-export' },
        { icon: Trash2, label: 'Papelera', path: '/papelera' },
        { icon: FileSpreadsheet, label: 'Multas', path: '/multas' },
        { icon: FileText, label: 'Documentos', path: '/documentos' },
        { icon: Settings, label: 'Ajustes', path: '/ajustes' }
      ]
    }
  ];
  
  return (
    <div className="w-64 bg-[#0f0f10] text-white h-screen overflow-y-auto flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold">FlotaDSP</span>
        </div>
      </div>
      
      {/* Centro Activo */}
      <div className="p-4 border-b border-gray-800">
        <div className="text-xs text-gray-400 mb-2">CENTRO ACTIVO</div>
        <div className="flex gap-2">
          <button className="px-3 py-1 bg-blue-600 rounded text-sm">OCAS</button>
          <button className="px-3 py-1 bg-gray-700 rounded text-sm">DGA1</button>
          <button className="px-3 py-1 bg-gray-700 rounded text-sm">Todos</button>
        </div>
      </div>
      
      {/* Navigation */}
      <div className="flex-1 overflow-y-auto">
        {menuSections.map((section, idx) => (
          <div key={idx} className="py-3">
            <div className="px-4 text-xs text-gray-500 font-semibold mb-2">{section.title}</div>
            {section.items.map((item, itemIdx) => (
              <Link
                key={itemIdx}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors ${
                  isActive(item.path) ? 'bg-gray-800 border-l-2 border-blue-500' : ''
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span className="text-sm flex-1">{item.label}</span>
                {item.badge && (
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    item.badgeColor || 'bg-red-600'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ))}
      </div>
      
      {/* Footer */}
      <div className="p-4 border-t border-gray-800 text-xs text-gray-500">
        <div className="mb-2">Claude IA • Sync</div>
        <button className="text-red-400 hover:text-red-300">Cerrar sesión</button>
        <div className="mt-2">Hecho por Daniel Lampón</div>
      </div>
    </div>
  );
};

export default Sidebar;