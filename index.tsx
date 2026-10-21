import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { handleOAuthCallbackPage, OAUTH_CALLBACK_PATH } from './services/mcpOAuth';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

if (window.location.pathname === OAUTH_CALLBACK_PATH) {
  // Ventana emergente de OAuth (servidores MCP): avisa a la app y se cierra sola
  handleOAuthCallbackPage();
  root.render(
    <div className="h-full flex items-center justify-center text-sm text-text-muted p-6 text-center">
      Autorización recibida. Puedes cerrar esta ventana.
    </div>
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
