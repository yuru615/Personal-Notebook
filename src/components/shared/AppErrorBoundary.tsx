import { Component, type ReactNode } from 'react'
import { uiCopy } from '../../ui/copy'

interface AppErrorBoundaryProps {
  children: ReactNode
  resetKey: string | null
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError() {
    return {
      hasError: true,
    }
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return <div className="page-empty">{uiCopy.app.renderError}</div>
    }

    return this.props.children
  }
}
