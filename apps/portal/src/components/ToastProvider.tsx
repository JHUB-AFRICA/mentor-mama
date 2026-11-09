import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Toaster, toast } from "sonner";

type ToastKind = "success" | "error" | "info";
type ToastInput = {
  kind: ToastKind;
  title: string;
  message?: string;
  duration?: number;
};

type ToastId = number | string;

type ToastContextValue = {
  pushToast: (toast: ToastInput) => void;
  dismissToast: (id: ToastId) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toastTheme = {
  "--normal-bg": "#FFFFFF",
  "--normal-border": "#E4E8EE",
  "--normal-text": "#0D1B33",
  "--success-bg": "#EEF8F3",
  "--success-border": "#C5E5D4",
  "--success-text": "#276747",
  "--info-bg": "#EAF6F6",
  "--info-border": "#C4E3E3",
  "--info-text": "#176B6B",
  "--error-bg": "#FFF2F1",
  "--error-border": "#F0CECB",
  "--error-text": "#A63B3B",
} as CSSProperties & Record<`--${string}`, string>;

export function ToastProvider({ children }: { children: ReactNode }) {
  const pushToast = useCallback((input: ToastInput) => {
    const options = {
      description: input.message,
      duration: input.duration ?? (input.kind === "error" ? 7000 : 5000),
      closeButton: true,
    };

    if (input.kind === "success") toast.success(input.title, options);
    else if (input.kind === "error") toast.error(input.title, options);
    else toast.info(input.title, options);
  }, []);

  const dismissToast = useCallback((id: ToastId) => {
    toast.dismiss(id);
  }, []);

  const value = useMemo(
    () => ({ pushToast, dismissToast }),
    [dismissToast, pushToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster
        className="mentormama-toaster"
        position="top-right"
        theme="light"
        richColors
        closeButton
        expand={false}
        visibleToasts={3}
        offset="5rem"
        style={toastTheme}
        toastOptions={{
          classNames: {
            toast: "font-body rounded-2xl shadow-[0_16px_40px_rgb(11_27_58/16%)]",
            title: "font-body text-sm font-semibold",
            description: "font-body text-xs leading-5",
          },
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
