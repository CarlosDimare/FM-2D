import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ActiveConfirm extends ConfirmOptions {
  resolve: (accepted: boolean) => void;
}

interface FeedbackStore {
  toasts: ToastItem[];
  activeConfirm: ActiveConfirm | null;
  toast: (message: string, variant?: ToastVariant, durationMs?: number) => void;
  dismissToast: (id: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  resolveConfirm: (accepted: boolean) => void;
}

let toastSeq = 0;

export const useFeedbackStore = create<FeedbackStore>((set, get) => ({
  toasts: [],
  activeConfirm: null,

  toast: (message, variant = 'info', durationMs = 3800) => {
    const id = `toast_${Date.now()}_${++toastSeq}`;
    set((state) => ({
      toasts: [...state.toasts.slice(-3), { id, message, variant }],
    }));
    if (durationMs > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => {
        get().dismissToast(id);
      }, durationMs);
    }
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      const prev = get().activeConfirm;
      if (prev) prev.resolve(false);
      set({
        activeConfirm: {
          ...options,
          resolve,
        },
      });
    }),

  resolveConfirm: (accepted) => {
    const current = get().activeConfirm;
    if (current) {
      set({ activeConfirm: null });
      current.resolve(accepted);
    }
  },
}));

export const showToast = (message: string, variant: ToastVariant = 'info', durationMs?: number) =>
  useFeedbackStore.getState().toast(message, variant, durationMs);

export const confirmAction = (options: ConfirmOptions) =>
  useFeedbackStore.getState().confirm(options);
