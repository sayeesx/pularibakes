import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in Admin application:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] dark:bg-[#141212] p-4 text-[#141212] dark:text-white font-sans select-none">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1B1B] rounded-2xl border border-stone-200 dark:border-stone-800 p-6 shadow-xl text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-red-600 dark:text-red-400">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-lg font-black mb-2">ആപ്ലിക്കേഷൻ പിശക് സംഭവിച്ചു</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400 mb-6 leading-relaxed">
              An unexpected error occurred in the Admin Portal.
              {this.state.error?.message && (
                <span className="block mt-2 font-mono text-[11px] text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-2 rounded-lg border border-red-200 dark:border-red-900/50 text-left overflow-x-auto">
                  {this.state.error.message}
                </span>
              )}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => {
                  sessionStorage.clear();
                  localStorage.removeItem('pulari_admin_session');
                  window.location.reload();
                }}
                className="px-5 py-2.5 rounded-xl bg-stone-900 dark:bg-white text-white dark:text-stone-900 text-xs font-bold shadow-md active:scale-95 transition-all cursor-pointer"
              >
                റീലോഡ് ചെയ്യുക (Reload Portal)
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

