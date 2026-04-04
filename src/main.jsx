import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return React.createElement('div', { style: { padding: 40, color: '#EF4444', background: '#0F1117', minHeight: '100vh', fontFamily: 'monospace' } },
        React.createElement('h1', null, 'App Error'),
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', fontSize: 12 } }, String(this.state.error)),
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', fontSize: 10, color: '#94A3B8', marginTop: 10 } }, this.state.error?.stack)
      );
    }
    return this.props.children;
  }
}

// Lazy import to catch module-level errors
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  React.createElement(ErrorBoundary, null, React.createElement(App))
)
