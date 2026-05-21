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

  // Escape special characters for regex
  const regexString = sortedTitles.length > 0 
    ? sortedTitles.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    : null;
  const regex = regexString ? new RegExp(`(${regexString})`, 'g') : null;

  const processText = (text: string) => {
    if (!regex) return renderMarkers(text);

    const parts = text.split(regex);
    return parts.flatMap((part, i) => {
      if (sortedTitles.includes(part)) {
        return [
          <strong 
            key={`link-${i}`} 
            onClick={() => onLinkClick(part)}
            style={{ cursor: 'pointer', color: 'var(--primary-color)', textDecoration: 'underline' }}
          >
            {part}
          </strong>
        ];
      }
      return renderMarkers(part);
    });
  };

  const renderChildren = (children: React.ReactNode): React.ReactNode => {
    return React.Children.map(children, child => {
      if (typeof child === 'string') {
        return processText(child);
      }
      // If it's a React element with its own children (like strong, em), 
      // we could recursively process it, but for now just keep it as is.
      return child;
    });
  };

  return (
    <ReactMarkdown 
      components={{
        p: ({ children }) => <p>{renderChildren(children)}</p>,
        li: ({ children }) => <li>{renderChildren(children)}</li>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};
