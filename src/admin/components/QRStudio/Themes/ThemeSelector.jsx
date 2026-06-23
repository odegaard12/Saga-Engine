import React from 'react';

export default function ThemeSelector({ selectedTheme, onSelectTheme }) {
  const themes = ['Clásico', 'Cyberpunk', 'Fantasía', 'Minimalista'];
  return (
    <div className="p-4 border rounded bg-white">
      <h3 className="font-bold mb-3 text-gray-700">1. Tema Visual</h3>
      <div className="flex flex-wrap gap-2">
        {themes.map(t => (
          <button key={t} onClick={() => onSelectTheme(t)} className={`px-4 py-2 border rounded transition-colors ${selectedTheme === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 hover:bg-gray-100'}`}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
