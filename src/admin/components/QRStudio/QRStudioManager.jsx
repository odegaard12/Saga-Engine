import React, { useState } from 'react';
import ThemeSelector from './Themes/ThemeSelector';
import FrameSelector from './Frames/FrameSelector';
import QRExporter from './Export/QRExporter';
import QRValidator from '../QRValidation/QRValidator';

export default function QRStudioManager() {
  const [theme, setTheme] = useState('Clásico');
  const [frame, setFrame] = useState('Ninguno');
  const [view, setView] = useState('editor');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">QR Studio 2.0</h2>
          <p className="text-gray-600">Diseño y Validación Integrada</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('editor')} className={`px-4 py-2 rounded ${view === 'editor' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Editor</button>
          <button onClick={() => setView('validate')} className={`px-4 py-2 rounded ${view === 'validate' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Validar</button>
        </div>
      </div>
      
      {view === 'editor' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <ThemeSelector selectedTheme={theme} onSelectTheme={setTheme} />
            <FrameSelector selectedFrame={frame} onSelectFrame={setFrame} />
            <QRExporter theme={theme} frame={frame} />
          </div>
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 bg-gray-100 flex items-center justify-center">
            <p className="text-gray-500">Vista previa del QR (Estilo: {frame})</p>
          </div>
        </div>
      ) : (
        <QRValidator />
      )}
    </div>
  );
}
