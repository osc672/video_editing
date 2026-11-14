import React from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/ToastProvider'
import Login from './pages/Login'
import Upload from './pages/Upload'
import Editor from './pages/Editor'
import Result from './pages/Result'
import VideoCut from './pages/VideoCut'
import { getToken } from './api/client'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-app-gradient flex items-center justify-center p-6 text-white text-center">
          <div className="max-w-md rounded-2xl border border-white/10 bg-ink-900/90 p-8 shadow-panel">
            <h2 className="text-xl font-bold text-rose-400 mb-2">Something went wrong</h2>
            <p className="text-xs text-white/60 mb-6 leading-relaxed">
              {this.state.error?.message || 'An unexpected error occurred while loading this page.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false })
                window.location.reload()
              }}
              className="btn-accent px-4 py-2 text-xs font-semibold"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function Protected({ children }) {
  const location = useLocation()
  if (!getToken()) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/upload" replace />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/upload"
            element={
              <Protected>
                <Upload />
              </Protected>
            }
          />
          <Route
            path="/cut/:projectId"
            element={
              <Protected>
                <VideoCut />
              </Protected>
            }
          />
          <Route
            path="/editor/:projectId"
            element={
              <Protected>
                <Editor />
              </Protected>
            }
          />
          <Route
            path="/result/:projectId"
            element={
              <Protected>
                <Result />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/upload" replace />} />
        </Routes>
      </ToastProvider>
    </ErrorBoundary>
  )
}
