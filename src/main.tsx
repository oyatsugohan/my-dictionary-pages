import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

console.log("Application starting...");

const container = document.getElementById('root');
if (!container) {
  console.error("Root element not found!");
} else {
  try {
    const root = createRoot(container);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    console.log("Application rendered.");
  } catch (error) {
    console.error("Failed to render application:", error);
  }
}
