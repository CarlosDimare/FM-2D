import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('FM2 Render Error:', error, info.componentStack);
  }

  private handleRecover = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#191c20] flex flex-col items-center justify-center text-white p-6">
          <div className="max-w-md w-full bg-[#23272c] border border-[#3a3f45] rounded-sm shadow-2xl overflow-hidden">
            <div className="bg-[#3a3f45] border-b border-[#14171a] px-4 py-2.5">
              <h1 className="text-xs font-bold uppercase tracking-wider text-white">
                Error inesperado en pantalla
              </h1>
            </div>
            <div className="p-6 text-center space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Ocurrió un problema al renderizar esta vista. Podés intentar continuar sin perder el avance o recargar la aplicación.
              </p>
              <p className="text-[11px] text-amber-300 font-mono bg-[#14171a] border border-[#2d3238] rounded-sm p-3 break-words">
                {this.state.error?.message || 'Error desconocido'}
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={this.handleRecover}
                  className="px-4 py-2 rounded-sm bg-[#2b5d2c] hover:bg-[#1f4920] border border-[#133815] text-white text-xs font-bold cursor-pointer"
                >
                  Intentar continuar
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 rounded-sm border border-[#737a82] text-xs font-semibold text-[#1f2428] cursor-pointer"
                  style={{
                    background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 48%, #b9bfc6 100%)',
                  }}
                >
                  Recargar
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
