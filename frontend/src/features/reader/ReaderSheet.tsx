import type { ReactNode, RefObject } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface ReaderSheetProps {
  open: boolean;
  onClose: () => void;
  /** The popup's legacy id (#readerWordInfo, #readerTranslation). */
  id: string;
  /** The popup's classes: the floating-layer look plus the hook reader.css lays out as the mobile sheet. */
  className: string;
  contentRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

function preventDefault(event: Event) {
  event.preventDefault();
}

/**
 * Mobile bottom sheet for the reader's word-info and translation popups. This is
 * the kit's Sheet (Radix Dialog) rather than the Vaul Drawer named in contract
 * I2: Vaul always renders a modal Radix dialog, which blocks the text behind the
 * sheet (approved deviation, to be recorded in CONTRACTS.md). Non-modal,
 * like the legacy sheets: the text behind stays tappable and selectable, focus
 * stays where it is, and outside interaction does not close it (the page decides
 * when it closes, including on Escape).
 */
export function ReaderSheet({ open, onClose, id, className, contentRef, children }: ReaderSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()} modal={false}>
      {open ? (
        <SheetContent
          ref={contentRef as RefObject<HTMLDivElement | null>}
          id={id}
          side="bottom"
          showCloseButton={false}
          // Portalled to the body, so it must clear the fixed Reader layout (z-index 11) that holds the desktop popups.
          className={cn(className, "z-[12] gap-0")}
          aria-describedby={undefined}
          onOpenAutoFocus={preventDefault}
          onCloseAutoFocus={preventDefault}
          onEscapeKeyDown={preventDefault}
          onInteractOutside={preventDefault}
        >
          {children}
        </SheetContent>
      ) : null}
    </Sheet>
  );
}
