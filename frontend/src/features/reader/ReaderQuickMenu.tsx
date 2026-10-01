import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { m } from "motion/react";
import type { ReaderToken } from "@/lib/api/types";
import { useT } from "@/lib/i18n";
import { MOTION_FADE_FAST, MOTION_STAGGER } from "@/lib/motion";
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
 * pointer and applies it on release, so the menu itself takes no events. The scrim
 * and centre fade in and the options follow one after another; opacity only,
 * because the options' CSS transforms position them around the word.
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
      <m.div className="reader-convenience-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={MOTION_FADE_FAST} />
      <m.div className="reader-convenience-center" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={MOTION_FADE_FAST}>
        <span>{menu.token.surface}</span>
      </m.div>
      {QUICK_MENU_ACTIONS.map((action, index) => {
        const selected = action.key === menu.selectedKey;
        return (
          <m.button
            key={action.key}
            className={cn("reader-convenience-option", `reader-convenience-${action.key}`, selected && "is-selected")}
            type="button"
            role="menuitemradio"
            data-action={action.key}
            aria-pressed={selected}
            style={{ "--optionX": action.x, "--optionY": action.y } as CSSProperties}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...MOTION_FADE_FAST, delay: (index + 1) * MOTION_STAGGER }}
          >
            {action.key === "practice" ? (
              <span className={cn("reader-convenience-checkbox", menu.token.wantToPractice && "is-checked")} aria-hidden="true" />
            ) : null}
            <span>{t(ACTION_LABEL_KEYS[action.key])}</span>
          </m.button>
        );
      })}
    </div>,
    document.body
  );
}
