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
