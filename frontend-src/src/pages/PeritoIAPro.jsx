import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Upload, FileText, Download } from 'lucide-react';
import { getVehicles, uploadInspection, getInspection } from '@/services/api';
import DamageAccordion from '@/components/DamageAccordion';
import { toast } from 'sonner';

const PeritoIAPro = () => {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [inspectionId, setInspectionId] = useState(null);
  
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
    }
  };
  
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(prev => [...prev, ...files]);
    
    // Create previews
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  };
  
  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };
  
  const handleAnalyze = async () => {
    if (!selectedVehicle) {
      toast.error('Por favor selecciona un vehículo');
      return;
    }
    
    if (selectedFiles.length === 0) {
      toast.error('Por favor sube al menos una foto');
      return;
    }
    
    setAnalyzing(true);
    try {
      const result = await uploadInspection(selectedVehicle, null, selectedFiles);
      setInspectionId(result.inspection_id);
      
      // Get inspection with analysis
      const inspection = await getInspection(result.inspection_id);
      setAnalysis(inspection.analysis);
      
      toast.success('Análisis completado exitosamente');
    } catch (error) {
      console.error('Error analyzing:', error);
      toast.error('Error al analizar imágenes');
    } finally {
      setAnalyzing(false);
    }
  };
  
  const handleClear = () => {
    setSelectedFiles([]);
    setPreviews([]);
    setAnalysis(null);
    setInspectionId(null);
  };
  
  const handleExportPDF = () => {
    toast.info('Funcionalidad de exportar PDF próximamente');
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Perito IA Pro</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPDF} disabled={!analysis}>
            <Download className="w-4 h-4 mr-2" />
            Exportar PDF
          </Button>
        </div>
      </div>
      
      {/* Vehicle Selection */}
      <Card className="p-6 bg-gray-800 border-gray-700">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Seleccionar vehículo</label>
            <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
              <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                <SelectValue placeholder="Selecciona un vehículo" />
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
            <label className="text-sm text-gray-400 mb-2 block">Subir fotos del vehículo</label>
            <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                <p className="text-white mb-1">Haz clic para subir fotos</p>
                <p className="text-gray-400 text-sm">o arrastra y suelta aquí</p>
              </label>
            </div>
          </div>
          
          {/* Image Previews */}
          {previews.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {previews.map((preview, index) => (
                <div key={index} className="relative group">
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  <button
                    onClick={() => removeFile(index)}
                    className="absolute top-2 right-2 bg-red-600 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                  <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-xs text-white">
                    foto_{index + 1}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={handleAnalyze}
              disabled={analyzing || !selectedVehicle || selectedFiles.length === 0}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {analyzing ? 'Analizando...' : 'Analizar con IA Forense'}
            </Button>
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={analyzing}
            >
              <X className="w-4 h-4 mr-2" />
              Limpiar
            </Button>
          </div>
        </div>
      </Card>
      
      {/* Analysis Results */}
      {analysis && (
        <DamageAccordion analysis={analysis} />
      )}
      
      {analyzing && (
        <Card className="p-12 bg-gray-800 border-gray-700 text-center">
          <div className="animate-spin w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-white text-lg">Analizando imágenes con IA...</p>
          <p className="text-gray-400 text-sm mt-2">Esto puede tomar algunos segundos</p>
        </Card>
      )}
    </div>
  );
};

export default PeritoIAPro;