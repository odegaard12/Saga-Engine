import React, { useState } from 'react';

export default function QRValidator() {
  const [scanMode, setScanMode] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const simulateScan = () => {
    setScanMode(true);
    setValidationResult(null);
    
    // Simulamos el retardo de la cámara y la lectura del QR
    setTimeout(() => {
      setValidationResult({
        status: 'success',
        type: 'item',
        name: 'Llave de la Cripta',
        requirementsMet: true,
        conflicts: 0
      });
      setScanMode(false);
    }, 1500);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto mt-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Validación Avanzada de QR</h2>
        <p className="text-gray-600">Simulación de escaneo y comprobación de flujo de llaves y objetos.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 bg-gray-50 flex flex-col items-center justify-center min-h-[300px]">
          {scanMode ? (
            <div className="flex flex-col items-center animate-pulse">
              <div className="w-48 h-48 border-4 border-blue-500 rounded-lg flex items-center justify-center mb-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-400 animate-[bounce_2s_infinite]"></div>
                <span className="text-blue-500 font-semibold">Cámara Activa...</span>
              </div>
            </div>
          ) : (
            <button onClick={simulateScan} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-bold shadow-md flex items-center gap-2">
              📷 Iniciar Escáner de Prueba
            </button>
          )}
        </div>

        <div className="border rounded-xl p-6 bg-white shadow-sm">
          <h3 className="font-bold text-gray-700 mb-4 text-lg border-b pb-2">Resultados del Análisis</h3>
          {!validationResult && !scanMode && <p className="text-gray-400 italic text-center pt-8">Esperando lectura de código QR...</p>}
          {scanMode && !validationResult && <p className="text-blue-500 italic text-center pt-8">Analizando payload...</p>}
          {validationResult && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                <p className="font-bold text-xl mb-1">✅ Código Válido</p>
                <p className="text-sm">Estructura compatible con SAGA v0.5.4</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded border">
                  <p className="text-xs text-gray-500 uppercase font-bold">Entidad</p>
                  <p className="font-semibold text-gray-800">{validationResult.name}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded border">
                  <p className="text-xs text-gray-500 uppercase font-bold">Tipo</p>
                  <p className="font-semibold text-gray-800 capitalize">{validationResult.type}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
