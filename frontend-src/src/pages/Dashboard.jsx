import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { getDashboardStats, getAlerts } from '@/services/api';
import { Truck, Wrench, Users, Bell, FileText, AlertTriangle } from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    try {
      const [statsData, alertsData] = await Promise.all([
        getDashboardStats(),
        getAlerts(true)
      ]);
      setStats(statsData);
      setAlerts(alertsData);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Cargando...</div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">Dashboard</h1>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6 bg-gray-800 border-gray-700">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-lg">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-gray-400 text-sm">Vehículos activos</div>
              <div className="text-2xl font-bold text-white">{stats?.total_vehicles || 0}</div>
            </div>
          </div>
        </Card>
        
        <Card className="p-6 bg-gray-800 border-gray-700">
          <div className="flex items-center gap-4">
            <div className="bg-orange-600 p-3 rounded-lg">
              <Wrench className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-gray-400 text-sm">En taller</div>
              <div className="text-2xl font-bold text-white">{stats?.vehicles_in_workshop || 0}</div>
            </div>
          </div>
        </Card>
        
        <Card className="p-6 bg-gray-800 border-gray-700">
          <div className="flex items-center gap-4">
            <div className="bg-green-600 p-3 rounded-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-gray-400 text-sm">Conductores</div>
              <div className="text-2xl font-bold text-white">{stats?.total_drivers || 0}</div>
            </div>
          </div>
        </Card>
        
        <Card className="p-6 bg-gray-800 border-gray-700">
          <div className="flex items-center gap-4">
            <div className="bg-red-600 p-3 rounded-lg">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-gray-400 text-sm">Alertas sin leer</div>
              <div className="text-2xl font-bold text-white">{stats?.unread_alerts || 0}</div>
            </div>
          </div>
        </Card>
      </div>
      
      {/* Recent Alerts */}
      <Card className="p-6 bg-gray-800 border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Alertas recientes
        </h2>
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="text-gray-400 text-center py-8">No hay alertas pendientes</div>
          ) : (
            alerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="p-4 bg-gray-900 border border-gray-700 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{alert.title}</h3>
                    <p className="text-sm text-gray-400 mt-1">{alert.description}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    alert.severity === 'critical' ? 'bg-red-600' :
                    alert.severity === 'high' ? 'bg-orange-600' :
                    alert.severity === 'medium' ? 'bg-yellow-600' : 'bg-blue-600'
                  }`}>
                    {alert.severity.toUpperCase()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 bg-gray-800 border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Inspecciones totales
          </h2>
          <div className="text-4xl font-bold text-blue-400">{stats?.total_inspections || 0}</div>
          <p className="text-gray-400 text-sm mt-2">Inspecciones realizadas</p>
        </Card>
        
        <Card className="p-6 bg-gray-800 border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Inspecciones críticas (24h)
          </h2>
          <div className="text-4xl font-bold text-red-400">{stats?.recent_critical_inspections || 0}</div>
          <p className="text-gray-400 text-sm mt-2">Últimas 24 horas</p>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;