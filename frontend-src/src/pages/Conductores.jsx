import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, UserCircle } from 'lucide-react';
import { getDrivers, createDriver, updateDriver, deleteDriver } from '@/services/api';
import { toast } from 'sonner';

const Conductores = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    dni: '',
    phone: '',
    email: '',
    license_number: ''
  });
  
  useEffect(() => {
    loadDrivers();
  }, []);
  
  const loadDrivers = async () => {
    try {
      const data = await getDrivers();
      setDrivers(data);
    } catch (error) {
      console.error('Error loading drivers:', error);
      toast.error('Error al cargar conductores');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDriver) {
        await updateDriver(editingDriver.id, formData);
        toast.success('Conductor actualizado');
      } else {
        await createDriver(formData);
        toast.success('Conductor creado');
      }
      setIsDialogOpen(false);
      resetForm();
      loadDrivers();
    } catch (error) {
      console.error('Error saving driver:', error);
      toast.error('Error al guardar conductor');
    }
  };
  
  const handleEdit = (driver) => {
    setEditingDriver(driver);
    setFormData({
      name: driver.name,
      dni: driver.dni || '',
      phone: driver.phone || '',
      email: driver.email || '',
      license_number: driver.license_number || ''
    });
    setIsDialogOpen(true);
  };
  
  const handleDelete = async (driverId) => {
    if (!window.confirm('¿Estás seguro de eliminar este conductor?')) return;
    
    try {
      await deleteDriver(driverId);
      toast.success('Conductor eliminado');
      loadDrivers();
    } catch (error) {
      console.error('Error deleting driver:', error);
      toast.error('Error al eliminar conductor');
    }
  };
  
  const resetForm = () => {
    setFormData({
      name: '',
      dni: '',
      phone: '',
      email: '',
      license_number: ''
    });
    setEditingDriver(null);
  };
  
  if (loading) {
    return <div className="text-gray-400">Cargando...</div>;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Conductores</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo conductor
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-800 border-gray-700 text-white">
            <DialogHeader>
              <DialogTitle>
                {editingDriver ? 'Editar conductor' : 'Nuevo conductor'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-gray-400">Nombre completo *</label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">DNI</label>
                <Input
                  value={formData.dni}
                  onChange={(e) => setFormData({...formData, dni: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">Teléfono</label>
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">Email</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">Número de licencia</label>
                <Input
                  value={formData.license_number}
                  onChange={(e) => setFormData({...formData, license_number: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                  {editingDriver ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {drivers.map((driver) => (
          <Card key={driver.id} className="p-6 bg-gray-800 border-gray-700">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-green-600 p-2 rounded-lg">
                <UserCircle className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">{driver.name}</h3>
                {driver.license_number && (
                  <p className="text-sm text-gray-400">Lic: {driver.license_number}</p>
                )}
              </div>
            </div>
            
            <div className="space-y-2 text-sm text-gray-300 mb-4">
              {driver.dni && <div>DNI: {driver.dni}</div>}
              {driver.phone && <div>Tel: {driver.phone}</div>}
              {driver.email && <div>Email: {driver.email}</div>}
            </div>
            
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleEdit(driver)}
                className="flex-1"
              >
                <Edit className="w-4 h-4 mr-1" />
                Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDelete(driver.id)}
                className="text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
      
      {drivers.length === 0 && (
        <Card className="p-12 bg-gray-800 border-gray-700 text-center">
          <UserCircle className="w-16 h-16 mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">No hay conductores registrados</p>
          <p className="text-gray-500 text-sm mt-2">Crea tu primer conductor para comenzar</p>
        </Card>
      )}
    </div>
  );
};

export default Conductores;