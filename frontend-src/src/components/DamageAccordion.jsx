import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

const DamageAccordion = ({ analysis }) => {
  if (!analysis) return null;
  
  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'critical': return 'bg-red-600';
      case 'severe': return 'bg-orange-600';
      case 'moderate': return 'bg-yellow-600';
      case 'light': return 'bg-blue-600';
      default: return 'bg-gray-600';
    }
  };
  
  const getSeverityLabel = (severity) => {
    switch(severity) {
      case 'critical': return 'CRÍTICO';
      case 'severe': return 'GRAVE';
      case 'moderate': return 'MODERADO';
      case 'light': return 'LEVE';
      default: return severity.toUpperCase();
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Critical Summary */}
      <Card className="p-6 bg-gradient-to-r from-red-950 to-red-900 border-red-800">
        <div className="flex items-start gap-4">
          <div className="bg-red-600 p-3 rounded-lg">
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-white mb-2">Daños críticos</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge className="bg-red-700 hover:bg-red-700">SEVERIDAD {analysis.severity.toUpperCase()}</Badge>
              <Badge className="bg-orange-700 hover:bg-orange-700">URGENCIA {analysis.urgency.toUpperCase()}</Badge>
              <Badge className="bg-red-800 hover:bg-red-800">RIESGO {analysis.risk.toUpperCase()}</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-white">
              <div>
                <div className="text-gray-300 text-sm">Daños</div>
                <div className="text-2xl font-bold">{analysis.critical_damages_count}</div>
              </div>
              <div>
                <div className="text-gray-300 text-sm">Coste estimado</div>
                <div className="text-2xl font-bold text-yellow-400">{analysis.total_estimated_cost}€</div>
              </div>
              <div>
                <div className="text-gray-300 text-sm">Circulación</div>
                <div className={`text-lg font-bold ${analysis.circulation_safe ? 'text-green-400' : 'text-red-400'}`}>
                  {analysis.circulation_safe ? 'SEGURA' : 'INSEGURA'}
                </div>
              </div>
              <div>
                <div className="text-gray-300 text-sm">Daño oculto prob.</div>
                <div className="text-2xl font-bold">{analysis.hidden_damage_probability}%</div>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-white">{analysis.confidence}%</div>
            <div className="text-xs text-gray-300">CONFIANZA IA</div>
          </div>
        </div>
      </Card>
      
      {/* Accordion with sections */}
      <Accordion type="multiple" className="space-y-2" defaultValue={['summary', 'damages']}>
        {/* Resumen Ejecutivo */}
        <AccordionItem value="summary" className="border border-gray-700 rounded-lg bg-gray-900">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <span className="font-semibold text-white">Resumen ejecutivo</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <p className="text-gray-300 leading-relaxed">{analysis.executive_summary}</p>
          </AccordionContent>
        </AccordionItem>
        
        {/* Avisos de calidad de imagen */}
        {analysis.image_quality_warnings && analysis.image_quality_warnings.length > 0 && (
          <AccordionItem value="quality" className="border border-yellow-700 rounded-lg bg-gray-900">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                <span className="font-semibold text-white">Avisos de calidad de imagen</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-2">
                {analysis.image_quality_warnings.map((warning, idx) => (
                  <div key={idx} className="p-3 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-200 text-sm">
                    {warning}
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
        
        {/* Partes Afectadas */}
        <AccordionItem value="parts" className="border border-gray-700 rounded-lg bg-gray-900">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Partes afectadas</span>
              <Badge variant="outline" className="ml-2">{analysis.affected_parts?.length || 0}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              {analysis.affected_parts?.map((part, idx) => (
                <Badge key={idx} variant="secondary" className="bg-gray-800 text-gray-200">
                  {part}
                </Badge>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
        
        {/* Daños Críticos Detallados */}
        {analysis.critical_damages && analysis.critical_damages.length > 0 && (
          <AccordionItem value="critical" className="border border-red-700 rounded-lg bg-gray-900">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span className="font-semibold text-white">Daños críticos</span>
                <Badge className="ml-2 bg-red-600">{analysis.critical_damages.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-3">
                {analysis.critical_damages.map((damage, idx) => (
                  <div key={idx} className="p-4 bg-red-950/50 border border-red-800 rounded text-red-100">
                    {damage}
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
        
        {/* Listado Técnico */}
        <AccordionItem value="damages" className="border border-gray-700 rounded-lg bg-gray-900">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Listado técnico</span>
              <Badge variant="outline" className="ml-2">{analysis.damages?.length || 0}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.damages?.map((damage, idx) => (
                <Card key={idx} className="p-4 bg-gray-800 border-gray-700">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <h4 className="font-bold text-white uppercase">{damage.part}</h4>
                      <Badge className={getSeverityColor(damage.severity)}>
                        {getSeverityLabel(damage.severity)}
                      </Badge>
                    </div>
                    
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Descripción</div>
                      <p className="text-sm text-gray-300">{damage.description}</p>
                    </div>
                    
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Reparación</div>
                      <p className="text-sm text-gray-300">{damage.repair_suggestion}</p>
                    </div>
                    
                    <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                      <div>
                        <div className="text-xs text-gray-400">Confianza</div>
                        <div className="text-lg font-bold text-white">{damage.confidence}%</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Coste estimado</div>
                        <div className="text-lg font-bold text-yellow-400">{damage.estimated_cost}€</div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default DamageAccordion;