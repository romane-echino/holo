import { FilePlus, FolderPlus, Smile, Pencil, Layers, Link, Copy, ExternalLink, Archive, Undo2, Trash2 } from 'lucide-react'
import type { TreeNode, NodeType } from '../types/app'
import { ContextMenu } from './ContextMenu'
import type { ContextMenuAction } from './ContextMenu'

type ContextMenuState = {
  x: number
  y: number
  node: TreeNode
}

interface ContextMenuPopupProps {
  contextMenu: ContextMenuState
  rootPath: string | null
  fileMetaByPath: Record<string, any>
  onRunContextAction: (action: () => void) => void
  onOpenCreateFileDialog: (path?: string | null, type?: NodeType | null) => void
  onOpenCreateDirectoryDialog: (path?: string | null, type?: NodeType | null) => void
  onSetShowFolderIconPicker: (path: string) => void
  onOpenRenameDialog: (path: string) => void
  onToggleTemplateStatus: (path: string, isTemplate: boolean) => Promise<void>
  onCopyHoloLink: (path: string) => Promise<void>
  onCopyPathTarget: (path: string) => Promise<void>
  onOpenFileInNewWindow: (path: string) => Promise<void>
  onArchivePathTarget: (path: string) => Promise<void>
  onRestoreArchivedPathTarget: (path: string) => Promise<void>
  onDeletePathTarget: (path: string) => Promise<void>
}

export function ContextMenuPopup({
  contextMenu,
  rootPath,
  fileMetaByPath,
  onRunContextAction,
  onOpenCreateFileDialog,
  onOpenCreateDirectoryDialog,
  onSetShowFolderIconPicker,
  onOpenRenameDialog,
  onToggleTemplateStatus,
  onCopyHoloLink,
  onCopyPathTarget,
  onOpenFileInNewWindow,
  onArchivePathTarget,
  onRestoreArchivedPathTarget,
  onDeletePathTarget,
}: ContextMenuPopupProps) {
  const { node } = contextMenu
  const isArchivedContext = Boolean(node.archivedOriginalPath)
  const isRoot = node.path === rootPath
  const isFile = node.type === 'file'
  const isDir = node.type === 'directory'
  const isTemplate = Boolean(fileMetaByPath[node.path]?.isTemplate)

  const close = () => onRunContextAction(() => {})

  const items: ContextMenuAction[] = [
    {
      type: 'header',
      label: `${isDir ? 'Dossier' : isArchivedContext ? 'Fichier archivé' : 'Fichier'} · ${node.name}`,
    },
    { type: 'separator' },

    // Création (non archivé)
    ...(!isArchivedContext ? [
      { type: 'item' as const, label: 'Nouveau fichier', icon: FilePlus, onClick: () => onRunContextAction(() => onOpenCreateFileDialog(node.path, node.type)) },
      { type: 'item' as const, label: 'Nouveau dossier', icon: FolderPlus, onClick: () => onRunContextAction(() => onOpenCreateDirectoryDialog(node.path, node.type)) },
    ] : []),

    // Changer icône (dossier, non archivé)
    ...(!isArchivedContext && isDir ? [
      { type: 'separator' as const },
      { type: 'item' as const, label: "Changer l'icône", icon: Smile, onClick: () => onRunContextAction(() => onSetShowFolderIconPicker(node.path)) },
    ] : []),

    // Actions sur le nœud (hors racine)
    ...(!isRoot ? [
      { type: 'separator' as const },

      ...(!isArchivedContext ? [
        { type: 'item' as const, label: 'Renommer', icon: Pencil, onClick: () => onRunContextAction(() => onOpenRenameDialog(node.path)) },
      ] : []),

      ...(!isArchivedContext && isFile ? [
        { type: 'separator' as const },
        {
          type: 'item' as const,
          label: isTemplate ? 'Retirer du modèle' : 'Définir comme modèle',
          icon: Layers,
          onClick: () => onRunContextAction(() => { void onToggleTemplateStatus(node.path, !isTemplate) }),
        },
        { type: 'item' as const, label: 'Copier le lien', icon: Link, onClick: () => onRunContextAction(() => { void onCopyHoloLink(node.path) }) },
        { type: 'item' as const, label: 'Dupliquer', icon: Copy, onClick: () => onRunContextAction(() => { void onCopyPathTarget(node.path) }) },
        { type: 'item' as const, label: 'Ouvrir dans une nouvelle fenêtre', icon: ExternalLink, onClick: () => onRunContextAction(() => { void onOpenFileInNewWindow(node.path) }) },
        { type: 'separator' as const },
        { type: 'item' as const, label: 'Archiver', icon: Archive, variant: 'warning' as const, onClick: () => onRunContextAction(() => { void onArchivePathTarget(node.path) }) },
      ] : []),

      ...(isArchivedContext && isFile ? [
        { type: 'item' as const, label: 'Récupérer depuis archive', icon: Undo2, variant: 'warning' as const, onClick: () => onRunContextAction(() => { void onRestoreArchivedPathTarget(node.path) }) },
      ] : []),

      ...(!isArchivedContext ? [
        { type: 'item' as const, label: 'Supprimer', icon: Trash2, variant: 'danger' as const, onClick: () => onRunContextAction(() => { void onDeletePathTarget(node.path) }) },
      ] : []),
    ] : []),
  ]

  return (
    <ContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      items={items}
      onClose={close}
    />
  )
}


type ContextMenuState = {
  x: number
  y: number
  node: TreeNode
}

interface ContextMenuPopupProps {
  contextMenu: ContextMenuState
  rootPath: string | null
  fileMetaByPath: Record<string, any>
  onRunContextAction: (action: () => void) => void
  onOpenCreateFileDialog: (path?: string | null, type?: NodeType | null) => void
  onOpenCreateDirectoryDialog: (path?: string | null, type?: NodeType | null) => void
  onSetShowFolderIconPicker: (path: string) => void
  onOpenRenameDialog: (path: string) => void
  onToggleTemplateStatus: (path: string, isTemplate: boolean) => Promise<void>
  onCopyHoloLink: (path: string) => Promise<void>
  onCopyPathTarget: (path: string) => Promise<void>
  onOpenFileInNewWindow: (path: string) => Promise<void>
  onArchivePathTarget: (path: string) => Promise<void>
  onRestoreArchivedPathTarget: (path: string) => Promise<void>
  onDeletePathTarget: (path: string) => Promise<void>
}

export function ContextMenuPopup({
  contextMenu,
  rootPath,
  fileMetaByPath,
  onRunContextAction,
  onOpenCreateFileDialog,
  onOpenCreateDirectoryDialog,
  onSetShowFolderIconPicker,
  onOpenRenameDialog,
  onToggleTemplateStatus,
  onCopyHoloLink,
  onCopyPathTarget,
  onOpenFileInNewWindow,
  onArchivePathTarget,
  onRestoreArchivedPathTarget,
  onDeletePathTarget,
}: ContextMenuPopupProps) {
  const isArchivedContext = Boolean(contextMenu.node.archivedOriginalPath)

  return (
    <div
      className="fixed z-20 min-w-[180px] rounded-lg border border-white/10 bg-[#1b1c1d] p-1.5 shadow-2xl"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white/35">
        {contextMenu.node.type === 'directory' ? 'Dossier' : isArchivedContext ? 'Fichier archivé' : 'Fichier'} · {contextMenu.node.name}
      </div>

      {!isArchivedContext && (
        <>
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
            onClick={() => onRunContextAction(() => onOpenCreateFileDialog(contextMenu.node.path, contextMenu.node.type))}
          >
            <i className="fa-solid fa-file-plus w-4 text-center" />
            Nouveau fichier
          </button>
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
            onClick={() => onRunContextAction(() => onOpenCreateDirectoryDialog(contextMenu.node.path, contextMenu.node.type))}
          >
            <i className="fa-solid fa-folder-plus w-4 text-center" />
            Nouveau dossier
          </button>
        </>
      )}

      {!isArchivedContext && contextMenu.node.type === 'directory' && (
        <>
          <div className="my-1 h-px bg-white/8" />
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
            onClick={() => onRunContextAction(() => onSetShowFolderIconPicker(contextMenu.node.path))}
          >
            <i className="fa-regular fa-face-smile w-4 text-center" />
            Changer l'icône
          </button>
        </>
      )}

      {contextMenu.node.path !== rootPath && (
        <>
          <div className="my-1 h-px bg-white/8" />

          {!isArchivedContext && (
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
              onClick={() => onRunContextAction(() => onOpenRenameDialog(contextMenu.node.path))}
            >
              <i className="fa-solid fa-pen w-4 text-center" />
              Renommer
            </button>
          )}

          {!isArchivedContext && contextMenu.node.type === 'file' && (
            <div className="my-1 h-px bg-white/8" />
          )}

          {!isArchivedContext && contextMenu.node.type === 'file' && (
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
              onClick={() => onRunContextAction(() => {
                void onToggleTemplateStatus(
                  contextMenu.node.path,
                  !fileMetaByPath[contextMenu.node.path]?.isTemplate,
                )
              })}
            >
              <i className="fa-solid fa-layer-group w-4 text-center" />
              {fileMetaByPath[contextMenu.node.path]?.isTemplate ? 'Retirer du modèle' : 'Définir comme modèle'}
            </button>
          )}

          {!isArchivedContext && contextMenu.node.type === 'file' && (
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
              onClick={() => onRunContextAction(() => { void onCopyHoloLink(contextMenu.node.path) })}
            >
              <i className="fa-solid fa-link w-4 text-center" />
              Copier le lien
            </button>
          )}

          {!isArchivedContext && contextMenu.node.type === 'file' && (
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
              onClick={() => onRunContextAction(() => { void onCopyPathTarget(contextMenu.node.path) })}
            >
              <i className="fa-solid fa-copy w-4 text-center" />
              Dupliquer
            </button>
          )}

          {!isArchivedContext && contextMenu.node.type === 'file' && (
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
              onClick={() => onRunContextAction(() => { void onOpenFileInNewWindow(contextMenu.node.path) })}
            >
              <i className="fa-solid fa-up-right-from-square w-4 text-center" />
              Ouvrir dans une nouvelle fenêtre
            </button>
          )}

          {!isArchivedContext && contextMenu.node.type === 'file' && (
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
              onClick={() => onRunContextAction(() => { void onArchivePathTarget(contextMenu.node.path) })}
            >
              <i className="fa-solid fa-box-archive w-4 text-center" />
              Archiver
            </button>
          )}

          {isArchivedContext && contextMenu.node.type === 'file' && (
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100"
              onClick={() => onRunContextAction(() => { void onRestoreArchivedPathTarget(contextMenu.node.path) })}
            >
              <i className="fa-solid fa-box-open w-4 text-center" />
              Récupérer depuis archive
            </button>
          )}

          {!isArchivedContext && (
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-300 hover:bg-red-500/10 hover:text-red-200"
              onClick={() => onRunContextAction(() => { void onDeletePathTarget(contextMenu.node.path) })}
            >
              <i className="fa-solid fa-trash w-4 text-center" />
              Supprimer
            </button>
          )}
        </>
      )}
    </div>
  )
}
