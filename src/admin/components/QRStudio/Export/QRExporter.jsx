import React from 'react';

export default function QRExporter({ theme, frame }) {
  const handleExport = () => {
    alert(`Generando plantilla lista para imprimir...\nTema: ${theme}\nMarco: ${frame}`);
  };

  return (
    <div className="p-4 border rounded mt-4 bg-gray-50">
      <h3 className="font-bold mb-2 text-gray-800">3. Exportación Profesional</h3>
      <p className="text-sm text-gray-600 mb-4">Descarga el diseño en PDF/PNG con marcas de corte para imprenta.</p>
      <button onClick={handleExport} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 w-full font-semibold transition-colors">
        Exportar Diseño
      </button>
    </div>
  );
}
