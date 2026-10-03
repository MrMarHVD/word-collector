import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { useT } from "@/lib/i18n";

export interface ConfirmOptions {
  /** Localised question, e.g. t("reader.deleteMaterialConfirm"). */
  title: string;
  /** Optional localised detail under the title. */
  description?: ReactNode;
  /** Confirm button text; default t("common.confirm"). */
  confirmLabel?: string;
  /** Cancel button text; default t("common.cancel"). */
  cancelLabel?: string;
  /** Styles the confirm button as destructive (deletions). */
  destructive?: boolean;
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the confirm button is pressed; the dialog then closes. */
  onConfirm: () => void;
}

/** Controlled in-app confirmation dialog (replaces window.confirm). Prefer useConfirm() for one-off prompts. */
export function ConfirmDialog({ open, onOpenChange, onConfirm, title, description, confirmLabel, cancelLabel, destructive = false }: ConfirmDialogProps) {
  const t = useT();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel || t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? "destructive" : "primary"} onClick={onConfirm}>
            {confirmLabel || t("common.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Hosts the single dialog behind useConfirm(); mounted once in the app providers. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback<ConfirmFn>((next) => {
    resolver.current?.(false);
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? <ConfirmDialog {...options} open={open} onOpenChange={(next) => !next && settle(false)} onConfirm={() => settle(true)} /> : null}
    </ConfirmContext.Provider>
  );
}

/** Returns `confirm(options)`, resolving true when confirmed and false when cancelled or dismissed. */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used inside ConfirmProvider");
  }
  return confirm;
}
