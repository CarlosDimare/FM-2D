
import React from 'react';

/**
 * FM Industrial Steel Design System
 * Focus: High contrast, technical gray tones, zero white/blue backgrounds.
 */

export const FMSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({ size = 'md', className = '' }) => {
    const sizeClass = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-10 h-10' : 'w-7 h-7';
    return (
        <div className={`${sizeClass} border-2 border-[#a0b0a0] border-t-[#3a4a3a] rounded-full animate-spin ${className}`} />
    );
};

export const FMProgressBar: React.FC<{ value: number; max?: number; className?: string; height?: 'sm' | 'md' | 'lg' }> = ({ 
    value, 
    max = 100, 
    className = '', 
    height = 'md' 
}) => {
    const percentage = Math.max(0, Math.min(100, (value / max) * 100));
    const heightClass = height === 'sm' ? 'h-2' : height === 'lg' ? 'h-4' : 'h-3';
    return (
        <div className={`w-full bg-[#e0e8e0] border border-[#a0b0a0] rounded-sm ${heightClass} overflow-hidden ${className}`}>
            <div 
                className="h-full bg-[#3a4a3a] transition-all duration-300 ease-out" 
                style={{ width: `${percentage}%` }} 
            />
        </div>
    );
};

export const FMLoadingOverlay: React.FC<{ 
    message?: string; 
    detail?: string; 
    progress?: { current: number; total: number; detail: string };
    onCancel?: () => void;
    showCancel?: boolean;
}> = ({ 
    message = 'Procesando...', 
    detail, 
    progress, 
    onCancel, 
    showCancel = false 
}) => (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm" style={{ fontFamily: 'Verdana, sans-serif' }}>
        <FMSpinner size="lg" />
        <p className="mt-4 text-[#1a1a1a] font-bold text-[12px] uppercase tracking-wider">{message}</p>
        {progress && (
            <div className="mt-4 w-full max-w-md">
                <FMProgressBar value={progress.current} max={progress.total} />
                <p className="mt-2 text-[#64748b] text-[10px] uppercase tracking-wider text-center">{progress.detail}</p>
            </div>
        )}
        {detail && !progress && <p className="mt-2 text-[#64748b] text-[10px] uppercase tracking-wider">{detail}</p>}
        {showCancel && onCancel && (
            <FMButton variant="danger" className="mt-4 w-full max-w-md" onClick={onCancel}>
                Cancelar y Volver
            </FMButton>
        )}
    </div>
);

export const FMBox: React.FC<{ 
    title?: React.ReactNode; 
    children: React.ReactNode; 
    className?: string; 
    noPadding?: boolean;
    headerRight?: React.ReactNode;
}> = ({ title, children, className = "", noPadding = false, headerRight }) => {
    return (
        <div className={`bg-[#e8ece8] border border-[#8e9b90] rounded-sm shadow-sm flex flex-col min-h-0 ${className}`}>
            {title && (
                <div
                  className="relative border-b border-[#1c1f24] px-2.5 py-1.5 flex flex-wrap justify-between items-center gap-1 min-h-8 shrink-0 overflow-hidden"
                  style={{ background: 'linear-gradient(180deg, #434950 0%, #2d3238 100%)' }}
                >
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 h-3"
                      style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 100%)' }}
                    />
                    <span className="relative z-10 text-slate-100 font-bold text-[11px] tracking-wide uppercase min-w-0 truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                      {title}
                    </span>
                    {headerRight && <div className="relative z-10 min-w-0 flex-wrap">{headerRight}</div>}
                </div>
            )}
            <div className={`flex-1 min-h-0 overflow-y-auto ${noPadding ? '' : 'p-2.5'}`}>
                {children}
            </div>
        </div>
    );
};

export const FMEmptyState: React.FC<{
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
    className?: string;
}> = ({ icon, title, subtitle, action, className = "" }) => {
    return (
        <div className={`flex flex-col items-center justify-center text-center px-6 py-14 ${className}`}>
            <div className="w-16 h-16 rounded-full bg-[#e0e8e0] border border-[#8e9b90] shadow-inner flex items-center justify-center text-[#3a3f45] mb-4">
                {icon}
            </div>
            <h4 className="text-[#1a1a1a] font-bold text-xs uppercase tracking-wider mb-1.5">{title}</h4>
            {subtitle && <p className="text-slate-600 text-xs max-w-xs leading-relaxed">{subtitle}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
};

export const FMButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'vacation' }> = ({ 
    className = "", variant = 'primary', children, ...props 
}) => {
    const baseStyles = "px-3 py-1.5 text-[11px] font-bold tracking-wide rounded-[2px] border shadow-sm active:translate-y-px transition-all flex items-center justify-center gap-1.5 uppercase whitespace-nowrap cursor-pointer";
    let variantStyles = "";
    
    switch(variant) {
        case 'primary': 
            variantStyles = "bg-gradient-to-b from-[#2b5d2c] to-[#1d431e] border-[#133014] text-white hover:brightness-110";
            break;
        case 'secondary':
            variantStyles = "bg-gradient-to-b from-[#f3f4f6] via-[#d4d8de] to-[#b9bfc6] border-[#737a82] text-[#1f2428] hover:brightness-105";
            break;
        case 'danger':
            variantStyles = "bg-gradient-to-b from-[#c0392b] to-[#8e241b] border-[#641711] text-white hover:brightness-110";
            break;
        case 'vacation':
            variantStyles = "bg-gradient-to-b from-[#d97706] to-[#a15507] border-[#783f05] text-white hover:brightness-110";
            break;
    }

    return (
        <button className={`${baseStyles} ${variantStyles} ${className} disabled:opacity-50 disabled:cursor-not-allowed`} {...props}>
            {children}
        </button>
    );
};

export const FMTable: React.FC<{
    headers: string[];
    children: React.ReactNode;
    colWidths?: string[];
    onHeaderClick?: (index: number) => void;
}> = ({ headers, children, colWidths, onHeaderClick }) => {
    return (
        <div className="w-full h-full overflow-x-auto overflow-y-auto bg-white custom-scroll">
            <table className="w-full text-left border-collapse min-w-full">
                <thead className="sticky top-0 z-10 text-[10.5px] font-bold text-[#1f2428] shadow-xs border-b border-[#737a82]"
                       style={{ 
                           background: 'linear-gradient(180deg, #f3f4f6 0%, #d4d8de 52%, #c2c8cf 100%)',
                       }}>
                    <tr>
                        {headers.map((h, i) => (
                            <th 
                                key={i} 
                                className={`px-2 py-1.5 whitespace-nowrap border-r border-[#9aa2ab]/60 last:border-0 uppercase tracking-tight ${onHeaderClick ? 'cursor-pointer hover:bg-black/5 select-none' : ''}`} 
                                style={{ width: colWidths?.[i] }}
                                onClick={() => onHeaderClick && onHeaderClick(i)}
                            >
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="text-[11.5px] text-[#1a1a1a]">
                    {children}
                </tbody>
            </table>
        </div>
    );
};

export const FMTableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement> & { isNumber?: boolean }> = ({ children, className = "", isNumber, ...props }) => (
    <td className={`px-2 py-1.5 whitespace-nowrap border-b border-[#e2e7e2] ${isNumber ? 'font-mono tabular-nums' : 'font-normal'} ${className}`} {...props}>
        {children}
    </td>
);

export const FMModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    title: string;
    size?: 'md' | 'lg';
    children: React.ReactNode;
}> = ({ isOpen, onClose, title, size = 'md', children }) => {
    if (!isOpen) return null;
    const maxWidth = size === 'lg' ? 'max-w-2xl' : 'max-w-md';
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 backdrop-blur-sm" onClick={onClose}>
            <div className={`bg-[#e8ece8] border border-[#1c1f24] rounded-sm shadow-2xl w-full ${maxWidth} mx-4 max-h-[85vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
                <div
                  className="relative border-b border-[#14171a] px-3.5 py-2 flex justify-between items-center overflow-hidden"
                  style={{ background: 'linear-gradient(90deg, #2b5d2c 0%, #23272c 65%, #191c20 100%)' }}
                >
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 h-3.5"
                      style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%)' }}
                    />
                    <span className="relative z-10 text-white font-bold text-xs tracking-wide uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{title}</span>
                    <button onClick={onClose} className="relative z-10 text-slate-300 hover:text-white transition-colors font-bold text-lg leading-none cursor-pointer">&times;</button>
                </div>
                <div className="p-4">
                    {children}
                </div>
            </div>
        </div>
    );
};
