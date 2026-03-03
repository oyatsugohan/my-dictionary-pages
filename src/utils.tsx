import React from 'react';

/**
 * Renders custom marker tags to HTML-like React components.
 * <yellow>, <green>, <blue>, <red>
 */
export const renderMarkers = (text: string) => {
  const parts = text.split(/(<yellow>.*?<\/yellow>|<green>.*?<\/green>|<blue>.*?<\/blue>|<red>.*?<\/red>)/gs);
  
  return parts.map((part, index) => {
    if (part.startsWith('<yellow>')) {
      const content = part.replace('<yellow>', '').replace('</yellow>', '');
      return <mark key={index} style={{ backgroundColor: '#ffeb3b', padding: '2px 4px', borderRadius: '3px' }}>{content}</mark>;
    } else if (part.startsWith('<green>')) {
      const content = part.replace('<green>', '').replace('</green>', '');
      return <mark key={index} style={{ backgroundColor: '#8bc34a', padding: '2px 4px', borderRadius: '3px' }}>{content}</mark>;
    } else if (part.startsWith('<blue>')) {
      const content = part.replace('<blue>', '').replace('</blue>', '');
      return <mark key={index} style={{ backgroundColor: '#03a9f4', color: 'white', padding: '2px 4px', borderRadius: '3px' }}>{content}</mark>;
    } else if (part.startsWith('<red>')) {
      const content = part.replace('<red>', '').replace('</red>', '');
      return <mark key={index} style={{ backgroundColor: '#f44336', color: 'white', padding: '2px 4px', borderRadius: '3px' }}>{content}</mark>;
    }
    
    // Handle newlines
    const textParts = part.split('
');
    return textParts.map((t, i) => (
      <React.Fragment key={`${index}-${i}`}>
        {t}
        {i < textParts.length - 1 && <br />}
      </React.Fragment>
    ));
  });
};

/**
 * Creates automatic links for article titles found within content.
 */
export const createLinks = (content: string, allTitles: string[], currentTitle: string, onLinkClick: (title: string) => void) => {
  // Sort titles by length (descending) to avoid partial matches
  const sortedTitles = allTitles
    .filter(t => t !== currentTitle)
    .sort((a, b) => b.length - a.length);

  if (sortedTitles.length === 0) {
    return renderMarkers(content);
  }

  // Escape special characters for regex
  const regexString = sortedTitles.map(t => t.replace(/[.*+?^${}()|[\]\]/g, '\$&')).join('|');
  const regex = new RegExp(`(${regexString})`, 'g');

  const parts = content.split(regex);

  const processedParts = parts.map((part, index) => {
    if (sortedTitles.includes(part)) {
      return (
        <strong 
          key={index} 
          onClick={() => onLinkClick(part)}
          style={{ cursor: 'pointer', color: '#1a73e8', textDecoration: 'underline' }}
        >
          {part}
        </strong>
      );
    }
    return <React.Fragment key={index}>{renderMarkers(part)}</React.Fragment>;
  });

  return processedParts;
};
