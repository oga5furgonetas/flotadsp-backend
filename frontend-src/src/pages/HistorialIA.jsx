import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getInspections, getVehicles } from '@/services/api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { History, AlertTriangle, CheckCircle } from 'lucide-react';

const HistorialIA = () => {
  const [inspections, setInspections] = useState([]);
  const [vehicles, setVehicles] = useState({});
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    try {
      const [inspectionsData, vehiclesData] = await Promise.all([
        getInspections(),
        getVehicles()
      ]);
      
      // Create vehicles map for quick lookup
      const vehiclesMap = {};
      vehiclesData.forEach(v => {
        vehiclesMap[v.id] = v;
      });
      
      setInspections(inspectionsData);
      setVehicles(vehiclesMap);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'grave': return 'bg-red-600';
      case 'moderado': return 'bg-yellow-600';
      case 'leve': return 'bg-blue-600';
      default: return 'bg-gray-600';
    }
  };
  
  if (loading) {
    return <div className="text-gray-400">Cargando...</div>;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <History className="w-8 h-8 text-blue-500" />
        <h1 className="text-3xl font-bold text-white">Historial de Análisis IA</h1>
      </div>
      
      <div className="space-y-4">
        {inspections.length === 0 ? (
          <Card className="p-12 bg-gray-800 border-gray-700 text-center">
            <History className="w-16 h-16 mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">No hay inspecciones registradas</p>
            <p className="text-gray-500 text-sm mt-2">Realiza tu primera inspección para ver el historial</p>
          </Card>
        ) : (
          inspections.map((inspection) => {
            const vehicle = vehicles[inspection.vehicle_id];
            const analysis = inspection.analysis;
            
            return (
              <Card key={inspection.id} className="p-6 bg-gray-800 border-gray-700">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-white">
                        {vehicle ? `${vehicle.license_plate} - ${vehicle.brand} ${vehicle.model}` : 'Vehículo desconocido'}
                      </h3>
                      {inspection.is_reference && (
                        <Badge className="bg-purple-600">REFERENCIA</Badge>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm">
                      {format(new Date(inspection.created_at), "PPpp", { locale: es })}
                    </p>
                  </div>
                  
                  {analysis && (
                    <div className="flex items-center gap-2">
                      {analysis.critical_damages_count > 0 ? (
                        <AlertTriangle className="w-6 h-6 text-red-500" />
                      ) : (
                        <CheckCircle className="w-6 h-6 text-green-500" />
                      )}
                      <div className="text-right">
                        <div className="text-2xl font-bold text-white">{analysis.confidence}%</div>
                        <div className="text-xs text-gray-400">confianza</div>
                      </div>
                    </div>
                  )}
                </div>
                
                {analysis && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge className={getSeverityColor(analysis.severity)}>
                        {analysis.severity.toUpperCase()}
                      </Badge>
                      <Badge variant="outline">
                        {analysis.total_damages_count} daños detectados
                      </Badge>
                      <Badge variant="outline">
                        {analysis.critical_damages_count} críticos
                      </Badge>
                      <Badge className={analysis.circulation_safe ? 'bg-green-600' : 'bg-red-600'}>
                        {analysis.circulation_safe ? 'SEGURO' : 'INSEGURO'}
                      </Badge>
                    </div>
                    
                    <div className="p-4 bg-gray-900 rounded-lg">
                      <p className="text-gray-300 text-sm">{analysis.executive_summary}</p>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-gray-400">Coste estimado: </span>
                        <span className="text-yellow-400 font-bold">{analysis.total_estimated_cost}€</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Fotos analizadas: </span>
                        <span className="text-white font-bold">{inspection.photos.length}</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {!analysis && (
                  <div className="text-gray-500 text-sm">Análisis pendiente</div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default HistorialIA;