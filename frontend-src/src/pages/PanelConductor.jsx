import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, CheckCircle } from 'lucide-react';
import { getVehicles, getDrivers, uploadInspection } from '@/services/api';
import { toast } from 'sonner';

const PanelConductor = () => {
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    try {
      const [vehiclesData, driversData] = await Promise.all([
        getVehicles(),
        getDrivers()
      ]);
      setVehicles(vehiclesData);
      setDrivers(driversData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar datos');
    }
  };
  
  const handleFileSelect = (e) => {
    setSelectedFiles(Array.from(e.target.files));
  };
  
  const handleUpload = async () => {
    if (!selectedDriver) {
      toast.error('Por favor selecciona tu nombre');
      return;
    }
    
    if (!selectedVehicle) {
      toast.error('Por favor selecciona el vehículo');
      return;
    }
    
    if (selectedFiles.length === 0) {
      toast.error('Por favor sube al menos una foto');
      return;
    }
    
    setUploading(true);
    try {
      await uploadInspection(selectedVehicle, selectedDriver, selectedFiles);
      toast.success('¡Fotos subidas exitosamente! El análisis se ha completado.');
      
      // Reset form
      setSelectedFiles([]);
      setSelectedVehicle('');
    } catch (error) {
      console.error('Error uploading:', error);
      toast.error('Error al subir fotos');
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Panel de Conductor</h1>
        <p className="text-gray-400">Sube las fotos de tu vehículo para inspección</p>
      </div>
      
      <Card className="p-8 bg-gray-800 border-gray-700">
        <div className="space-y-6">
          {/* Driver Selection */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Tu nombre</label>
            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
              <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                <SelectValue placeholder="Selecciona tu nombre" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((driver) => (
                  <SelectItem key={driver.id} value={driver.id}>
                    {driver.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Vehicle Selection */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Vehículo</label>
            <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
              <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                <SelectValue placeholder="Selecciona el vehículo" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.license_plate} - {vehicle.brand} {vehicle.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* File Upload */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">
              Fotos del vehículo (4 laterales recomendado)
            </label>
            <div className="border-2 border-dashed border-gray-600 rounded-lg p-12 text-center hover:border-blue-500 transition-colors">
              <input
                type="file"
                multiple
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
                id="conductor-upload"
              />
              <label htmlFor="conductor-upload" className="cursor-pointer">
                <Upload className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <p className="text-white text-lg mb-2">Toca para tomar fotos</p>
                <p className="text-gray-400">Toma fotos de los 4 lados del vehículo</p>
              </label>
            </div>
            
            {selectedFiles.length > 0 && (
              <div className="mt-4 flex items-center gap-2 text-green-400">
                <CheckCircle className="w-5 h-5" />
                <span>{selectedFiles.length} foto(s) seleccionada(s)</span>
              </div>
            )}
          </div>
          
          {/* Submit Button */}
          <Button
            onClick={handleUpload}
            disabled={uploading || !selectedDriver || !selectedVehicle || selectedFiles.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700 py-6 text-lg"
          >
            {uploading ? 'Subiendo...' : 'Subir fotos y analizar'}
          </Button>
        </div>
      </Card>
      
      {/* Instructions */}
      <Card className="p-6 bg-gray-800 border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-3">Instrucciones</h3>
        <ul className="space-y-2 text-gray-300 text-sm">
          <li>• Selecciona tu nombre de la lista</li>
          <li>• Selecciona el vehículo que vas a inspeccionar</li>
          <li>• Toma fotos de los 4 lados del vehículo (frontal, trasero, lateral izquierdo, lateral derecho)</li>
          <li>• Asegúrate de que las fotos sean claras y con buena iluminación</li>
          <li>• El sistema analizará automáticamente las fotos y detectará posibles daños</li>
        </ul>
      </Card>
    </div>
  );
};

export default PanelConductor;