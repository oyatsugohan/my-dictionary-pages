import React from 'react';
import ReactMarkdown from 'react-markdown';

/**
 * Renders custom marker tags to HTML-like React components.
 * <yellow>, <green>, <blue>, <red>
 */
export const renderMarkers = (text: string) => {
  const parts = text.split(/(<yellow>.*?<\/yellow>|<green>.*?<\/green>|<blue>.*?<\/blue>|<red>.*?<\/red>)/gs);
  
  return parts.map((part, index) => {
    if (part.startsWith('<yellow>')) {
      const content = part.replace('<yellow>', '').replace('</yellow>', '');
      return <mark key={index} style={{ backgroundColor: '#ffeb3b', padding: '2px 4px', borderRadius: '3px', color: '#333' }}>{content}</mark>;
    } else if (part.startsWith('<green>')) {
      const content = part.replace('<green>', '').replace('</green>', '');
      return <mark key={index} style={{ backgroundColor: '#8bc34a', padding: '2px 4px', borderRadius: '3px', color: '#333' }}>{content}</mark>;
    } else if (part.startsWith('<blue>')) {
      const content = part.replace('<blue>', '').replace('</blue>', '');
      return <mark key={index} style={{ backgroundColor: '#03a9f4', color: 'white', padding: '2px 4px', borderRadius: '3px' }}>{content}</mark>;
    } else if (part.startsWith('<red>')) {
      const content = part.replace('<red>', '').replace('</red>', '');
      return <mark key={index} style={{ backgroundColor: '#f44336', color: 'white', padding: '2px 4px', borderRadius: '3px' }}>{content}</mark>;
    }
    
    return part;
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
    return <ReactMarkdown components={{
      p: ({ children }) => <p>{renderMarkers(children as string)}</p>,
      li: ({ children }) => <li>{renderMarkers(children as string)}</li>,
    }}>{content}</ReactMarkdown>;
  }

  // Escape special characters for regex
  const regexString = sortedTitles.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(${regexString})`, 'g');

  // Pre-process content to handle links before markdown
  // This is a bit tricky with markdown, so we'll do a simple replacement for now
  // and let ReactMarkdown handle the rest if possible, or just use a custom renderer.
  
  return (
    <ReactMarkdown 
      components={{
        p: ({ children }) => {
          if (typeof children !== 'string') return <p>{children}</p>;
          const parts = children.split(regex);
          return (
            <p>
              {parts.map((part, i) => {
                if (sortedTitles.includes(part)) {
                  return (
                    <strong 
                      key={i} 
                      onClick={() => onLinkClick(part)}
                      style={{ cursor: 'pointer', color: 'var(--primary-color)', textDecoration: 'underline' }}
                    >
                      {part}
                    </strong>
                  );
                }
                return <React.Fragment key={i}>{renderMarkers(part)}</React.Fragment>;
              })}
            </p>
          );
        },
        li: ({ children }) => {
          if (typeof children !== 'string') return <li>{children}</li>;
          const parts = children.split(regex);
          return (
            <li>
              {parts.map((part, i) => {
                if (sortedTitles.includes(part)) {
                  return (
                    <strong 
                      key={i} 
                      onClick={() => onLinkClick(part)}
                      style={{ cursor: 'pointer', color: 'var(--primary-color)', textDecoration: 'underline' }}
                    >
                      {part}
                    </strong>
                  );
                }
                return <React.Fragment key={i}>{renderMarkers(part)}</React.Fragment>;
              })}
            </li>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
};
