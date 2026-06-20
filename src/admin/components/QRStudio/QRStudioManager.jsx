import React, { useState } from 'react';
import ThemeSelector from './Themes/ThemeSelector';
import FrameSelector from './Frames/FrameSelector';
import QRExporter from './Export/QRExporter';

export default function QRStudioManager() {
  const [theme, setTheme] = useState('Clásico');
  const [frame, setFrame] = useState('Ninguno');

  const getFrameClasses = () => {
    switch(frame) {
      case 'Borde Simple': return 'border-4 border-gray-800 p-4';
      case 'Marco Polaroid': return 'border-8 border-b-[32px] border-white shadow-lg bg-white p-2';
      case 'Sci-Fi HUD': return 'border-2 border-cyan-400 bg-gray-900 p-4 shadow-[0_0_15px_rgba(34,211,238,0.5)]';
      default: return 'p-4';
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">QR Studio 2.0</h2>
        <p className="text-gray-600">Configura la apariencia y exporta los códigos de tu misión.</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col">
          <ThemeSelector selectedTheme={theme} onSelectTheme={setTheme} />
          <FrameSelector selectedFrame={frame} onSelectFrame={setFrame} />
          <QRExporter theme={theme} frame={frame} />
        </div>
        
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center bg-gray-100 min-h-[400px]">
          <p className="text-gray-500 mb-6 font-medium">Previsualización en vivo</p>
          <div className={`transition-all duration-300 ${getFrameClasses()}`}>
            <div className={`w-48 h-48 flex flex-col items-center justify-center text-center ${theme === 'Cyberpunk' ? 'bg-yellow-400 text-black' : theme === 'Minimalista' ? 'bg-white text-gray-800 border' : 'bg-gray-800 text-white'}`}>
              <div className="font-mono text-sm opacity-50 mb-2">SCAN ME</div>
              <div className="w-24 h-24 bg-current opacity-20 flex items-center justify-center">QR</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
