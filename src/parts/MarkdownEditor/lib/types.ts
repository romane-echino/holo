/**
 * types.ts — Types locaux compatibles mdast pour le BlockEditor
 *
 * Structurellement identiques aux types remark/mdast pour que
 * remark-stringify puisse les sérialiser sans casting.
 */

// ─── Inline nodes ───────────────────────────────────────────────────────────

export type TextNode      = { type: 'text';       value: string }
export type StrongNode    = { type: 'strong';     children: InlineNode[] }
export type EmphasisNode  = { type: 'emphasis';   children: InlineNode[] }
export type InlineCodeNode = { type: 'inlineCode'; value: string }
export type LinkNode      = { type: 'link';       url: string; title: string | null; children: InlineNode[] }
export type DeleteNode    = { type: 'delete';     children: InlineNode[] }
export type BreakNode     = { type: 'break' }

export type InlineNode =
  | TextNode | StrongNode | EmphasisNode | InlineCodeNode
  | LinkNode | DeleteNode | BreakNode

// ─── Block nodes ────────────────────────────────────────────────────────────

export type ParagraphNode    = { type: 'paragraph';    children: InlineNode[] }
export type HeadingNode      = { type: 'heading';      depth: 1|2|3|4|5|6; children: InlineNode[] }
export type CodeNode         = { type: 'code';         lang: string | null; value: string }
export type BlockquoteNode   = { type: 'blockquote';   children: BlockNode[] }
export type ListItemNode     = { type: 'listItem';     spread: boolean; checked: boolean | null; children: BlockNode[] }
export type ListNode         = { type: 'list';         ordered: boolean; start: number | null; spread: boolean; children: ListItemNode[] }
export type ThematicBreakNode = { type: 'thematicBreak' }
export type ImageNode        = { type: 'image';        url: string; alt: string; title: string | null }

// ─── Table nodes (remark-gfm) ───────────────────────────────────────────────

export type TableCellNode = { type: 'tableCell'; children: InlineNode[] }
export type TableRowNode  = { type: 'tableRow';  children: TableCellNode[] }
export type TableNode     = { type: 'table'; align: ('left'|'center'|'right'|null)[]; children: TableRowNode[] }

export type BlockNode =
  | ParagraphNode | HeadingNode | CodeNode | BlockquoteNode
  | ListNode | ThematicBreakNode | ImageNode | TableNode

// ─── Editor state ────────────────────────────────────────────────────────────

export interface BlockState {
  id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node: BlockNode | any  // 'any' pour accueillir les nœuds remark-parse bruts (tables, etc.)
}
