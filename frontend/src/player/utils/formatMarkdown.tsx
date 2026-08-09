import React from 'react'

export function renderMarkdown(text: string): React.ReactNode[] {
  if (!text) return []
  
  // Basic split by paragraphs (double newline)
  const paragraphs = text.split(/\n\s*\n/)
  
  return paragraphs.map((p, pIndex) => {
    const parts: React.ReactNode[] = []
    
    // Simple regex to match images: ![alt](url)
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
    let match
    let lastIndex = 0
    
    while ((match = imgRegex.exec(p)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`text-${lastIndex}`}>{p.substring(lastIndex, match.index)}</span>)
      }
      parts.push(
        <img 
          key={`img-${match.index}`} 
          src={match[2]} 
          alt={match[1]} 
          style={{ maxWidth: '100%', maxHeight: '40vh', objectFit: 'contain', borderRadius: '8px', margin: '16px auto', display: 'block' }} 
        />
      )
      lastIndex = match.index + match[0].length
    }
    
    if (lastIndex < p.length) {
      parts.push(<span key={`text-${lastIndex}`}>{p.substring(lastIndex)}</span>)
    }
    
    return (
      <p key={`p-${pIndex}`} style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem', lineHeight: 1.6 }}>
        {parts.length > 0 ? parts : p}
      </p>
    )
  })
}
