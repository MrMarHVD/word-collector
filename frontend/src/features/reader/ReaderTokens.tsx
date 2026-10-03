import { memo, type ReactNode } from "react";
import type { ReaderToken } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import {
  READER_LIST_CLASS,
  READER_TOKEN_CLASS,
  readerTokenHighlightClass,
  tokenDataStatus,
  type ReaderBlock,
  type ReaderLayout,
  type ReaderPart
} from "./reader-tokens";

interface ReaderTokenButtonProps {
  token: ReaderToken;
  selected: boolean;
  segmentSelected: boolean;
}

/** One word of the page (a `.reader-token` button); gestures are handled on #readerText. */
const ReaderTokenButton = memo(function ReaderTokenButton({ token, selected, segmentSelected }: ReaderTokenButtonProps) {
  const status = tokenDataStatus(token);
  return (
    <button
      className={cn(READER_TOKEN_CLASS, readerTokenHighlightClass(status, selected, segmentSelected))}
      type="button"
      data-word-id={token.wordId}
      data-token-id={token.id}
      data-status={status}
    >
      {token.surface}
    </button>
  );
});

export interface ReaderTokensProps {
  layout: ReaderLayout;
  /** Token highlighted as selected (word-info or quick menu), or null. */
  selectedTokenId: number | null;
  /** Highlighted segment, as an inclusive range of indices into the page's tokens. */
  segmentRange: { start: number; end: number } | null;
}

/**
 * The page's tokens inside #readerText: token buttons with the literal text
 * between them, flat or wrapped in block elements (see reader-tokens.ts).
 * Memoised, so preference and popup changes elsewhere do not re-render it.
 */
export const ReaderTokens = memo(function ReaderTokens({ layout, selectedTokenId, segmentRange }: ReaderTokensProps) {
  let index = 0;
  const renderParts = (parts: ReaderPart[]): ReactNode[] =>
    parts.map((part) => {
      if (part.kind === "text") {
        return part.text;
      }
      const tokenIndex = index++;
      const segmentSelected = segmentRange !== null && tokenIndex >= segmentRange.start && tokenIndex <= segmentRange.end;
      return <ReaderTokenButton key={part.token.id} token={part.token} selected={part.token.id === selectedTokenId} segmentSelected={segmentSelected} />;
    });
  const renderBlock = (block: ReaderBlock) => {
    const Tag = block.tag;
    return (
      <Tag key={block.key} className={block.className}>
        {renderParts(block.parts)}
      </Tag>
    );
  };

  if (layout.kind === "flat") {
    return <>{renderParts(layout.parts)}</>;
  }
  return (
    <>
      {layout.nodes.map((node) =>
        node.kind === "list" ? (
          <ul key={node.key} className={READER_LIST_CLASS}>
            {node.items.map(renderBlock)}
          </ul>
        ) : (
          renderBlock(node)
        )
      )}
    </>
  );
});
