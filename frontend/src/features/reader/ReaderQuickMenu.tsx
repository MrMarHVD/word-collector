import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ReaderToken } from "@/lib/api/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { QUICK_MENU_ACTIONS, READER_MENU_RADIUS, type Point, type QuickMenuActionKey } from "./quick-menu";

/** The open quick menu: the pressed word, the menu centre and the option under the pointer. */
export interface ReaderQuickMenuState {
  token: ReaderToken;
  origin: Point;
  selectedKey: QuickMenuActionKey | null;
}

const ACTION_LABEL_KEYS: Record<QuickMenuActionKey, string> = {
  unknown: "word.unknown",
  learning: "word.learning",
  known: "word.known",
  practice: "reader.practice"
};

/**
 * The radial quick menu shown while a word is held (non-eligible readers;
 * ported from reader.controller.js showReaderConvenienceMenu). It is driven
 * entirely by the pointer: the gesture controller tracks the option under the
 * pointer and applies it on release, so the menu itself takes no events.
 */
export function ReaderQuickMenu({ menu }: { menu: ReaderQuickMenuState }) {
  const t = useT();
  const style = {
    "--readerMenuX": `${menu.origin.x}px`,
    "--readerMenuY": `${menu.origin.y}px`,
    "--readerMenuRadius": `${READER_MENU_RADIUS}px`
  } as CSSProperties;
  return createPortal(
    <div className={cn("reader-convenience-menu", menu.selectedKey && "has-selection")} role="menu" style={style}>
      <div className="reader-convenience-scrim" />
      <div className="reader-convenience-center" aria-hidden="true">
        <span>{menu.token.surface}</span>
      </div>
      {QUICK_MENU_ACTIONS.map((action) => {
        const selected = action.key === menu.selectedKey;
        return (
          <button
            key={action.key}
            className={cn("reader-convenience-option", `reader-convenience-${action.key}`, selected && "is-selected")}
            type="button"
            role="menuitemradio"
            data-action={action.key}
            aria-pressed={selected}
            style={{ "--optionX": action.x, "--optionY": action.y } as CSSProperties}
          >
            {action.key === "practice" ? (
              <span className={cn("reader-convenience-checkbox", menu.token.wantToPractice && "is-checked")} aria-hidden="true" />
            ) : null}
            <span>{t(ACTION_LABEL_KEYS[action.key])}</span>
          </button>
        );
      })}
    </div>,
    document.body
  );
}
