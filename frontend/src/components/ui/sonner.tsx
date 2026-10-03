import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { useThemeStore } from "@/stores/theme";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Canonical toast host (SPEC-005 D2): toasts use the glass material and the floating shadow. */
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useThemeStore((state) => state.resolved);

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{ classNames: { toast: "glass shadow-float!" } }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />
      }}
      style={
        {
          "--normal-bg": "var(--glass-bg)",
          "--normal-text": "var(--text-main)",
          "--normal-border": "var(--glass-border)",
          "--border-radius": "var(--radius-container)"
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
