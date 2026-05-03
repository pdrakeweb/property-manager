import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="card-surface rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
              {this.props.fallbackTitle ?? 'Something went wrong'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {this.state.error?.message ?? 'An unexpected error occurred on this screen.'}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={this.handleReload} className="btn btn-info">
                Try again
              </button>
              <a href="#/" onClick={this.handleReload} className="btn">
                Dashboard
              </a>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
