import React from 'react';

export default function FrameSelector({ selectedFrame, onSelectFrame }) {
  const frames = ['Ninguno', 'Borde Simple', 'Marco Polaroid', 'Sci-Fi HUD'];
  return (
    <div className="p-4 border rounded bg-white mt-4">
      <h3 className="font-bold mb-3 text-gray-700">2. Marco del QR</h3>
      <div className="flex flex-wrap gap-2">
        {frames.map(f => (
          <button key={f} onClick={() => onSelectFrame(f)} className={`px-4 py-2 border rounded transition-colors ${selectedFrame === f ? 'bg-green-600 text-white border-green-600' : 'bg-gray-50 hover:bg-gray-100'}`}>
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}
