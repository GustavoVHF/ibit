import React, { Component, ErrorInfo, ReactNode } from 'react';
import { getMessages } from '../i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      // Rendered outside the LanguageProvider, so read the current language directly.
      const t = getMessages();
      let errorMessage = t.errors.boundaryUnexpected;
      let details = '';

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            errorMessage = t.errors.boundaryPermission(parsed.operationType);
            details = t.errors.boundaryDetails(parsed.path, parsed.error);
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white border border-red-200 p-8 max-w-md w-full shadow-lg rounded-xl">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h2 className="text-xl font-bold uppercase tracking-wider">{t.errors.boundaryTitle}</h2>
            </div>
            <p className="text-gray-700 mb-4 font-medium">{errorMessage}</p>
            {details && (
              <pre className="bg-gray-100 p-4 text-xs text-gray-600 overflow-auto max-h-40 mb-6 rounded-lg whitespace-pre-wrap">
                {details}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-[#ff7f00] hover:bg-orange-600 text-white font-bold py-3 px-4 transition-colors uppercase tracking-wider rounded-none"
            >
              {t.errors.boundaryReload}
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
