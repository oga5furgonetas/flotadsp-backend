import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Truck } from 'lucide-react';
import { getVehicles, createVehicle, updateVehicle, deleteVehicle } from '@/services/api';
import { toast } from 'sonner';

const Flota = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [formData, setFormData] = useState({
    license_plate: '',
    brand: '',
    model: '',
    year: '',
    color: '',
    vin: ''
  });
  
  useEffect(() => {
    loadVehicles();
  }, []);
  
  const loadVehicles = async () => {
    try {
      const data = await getVehicles();
      setVehicles(data);
    } catch (error) {
      console.error('Error loading vehicles:', error);
      toast.error('Error al cargar vehículos');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, formData);
        toast.success('Vehículo actualizado');
      } else {
        await createVehicle(formData);
        toast.success('Vehículo creado');
      }
      setIsDialogOpen(false);
      resetForm();
      loadVehicles();
    } catch (error) {
      console.error('Error saving vehicle:', error);
      toast.error('Error al guardar vehículo');
    }
  };
  
  const handleEdit = (vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      license_plate: vehicle.license_plate,
      brand: vehicle.brand || '',
      model: vehicle.model || '',
      year: vehicle.year || '',
      color: vehicle.color || '',
      vin: vehicle.vin || ''
    });
    setIsDialogOpen(true);
  };
  
  const handleDelete = async (vehicleId) => {
    if (!window.confirm('¿Estás seguro de eliminar este vehículo?')) return;
    
    try {
      await deleteVehicle(vehicleId);
      toast.success('Vehículo eliminado');
      loadVehicles();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      toast.error('Error al eliminar vehículo');
    }
  };
  
  const resetForm = () => {
    setFormData({
      license_plate: '',
      brand: '',
      model: '',
      year: '',
      color: '',
      vin: ''
    });
    setEditingVehicle(null);
  };
  
  const getStatusBadge = (status) => {
    switch(status) {
      case 'active': return 'bg-green-600';
      case 'in_workshop': return 'bg-orange-600';
      case 'inactive': return 'bg-gray-600';
      default: return 'bg-gray-600';
    }
  };
  
  const getStatusLabel = (status) => {
    switch(status) {
      case 'active': return 'Activo';
      case 'in_workshop': return 'En taller';
      case 'inactive': return 'Inactivo';
      default: return status;
    }
  };
  
  if (loading) {
    return <div className="text-gray-400">Cargando...</div>;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Flota de Vehículos</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo vehículo
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-800 border-gray-700 text-white">
            <DialogHeader>
              <DialogTitle>
                {editingVehicle ? 'Editar vehículo' : 'Nuevo vehículo'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-gray-400">Matrícula *</label>
                <Input
                  required
                  value={formData.license_plate}
                  onChange={(e) => setFormData({...formData, license_plate: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">Marca</label>
                <Input
                  value={formData.brand}
                  onChange={(e) => setFormData({...formData, brand: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">Modelo</label>
                <Input
                  value={formData.model}
                  onChange={(e) => setFormData({...formData, model: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">Año</label>
                <Input
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({...formData, year: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">Color</label>
                <Input
                  value={formData.color}
                  onChange={(e) => setFormData({...formData, color: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">VIN</label>
                <Input
                  value={formData.vin}
                  onChange={(e) => setFormData({...formData, vin: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                  {editingVehicle ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vehicles.map((vehicle) => (
          <Card key={vehicle.id} className="p-6 bg-gray-800 border-gray-700">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-lg">
                  <Truck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{vehicle.license_plate}</h3>
                  <p className="text-sm text-gray-400">{vehicle.brand} {vehicle.model}</p>
                </div>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(vehicle.status)}`}>
                {getStatusLabel(vehicle.status)}
              </span>
            </div>
            
            <div className="space-y-2 text-sm text-gray-300 mb-4">
              {vehicle.year && <div>Año: {vehicle.year}</div>}
              {vehicle.color && <div>Color: {vehicle.color}</div>}
              {vehicle.vin && <div>VIN: {vehicle.vin}</div>}
            </div>
            
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleEdit(vehicle)}
                className="flex-1"
              >
                <Edit className="w-4 h-4 mr-1" />
                Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDelete(vehicle.id)}
                className="text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
      
      {vehicles.length === 0 && (
        <Card className="p-12 bg-gray-800 border-gray-700 text-center">
          <Truck className="w-16 h-16 mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">No hay vehículos registrados</p>
          <p className="text-gray-500 text-sm mt-2">Crea tu primer vehículo para comenzar</p>
        </Card>
      )}
    </div>
  );
};

export default Flota;