import React from 'react'
import type { FileMeta, TreeNode } from '../types/app'

type ExplorerTreeItemProps = {
  node: TreeNode
  selectedPath: string | null
  fileIconByPath: Record<string, string>
  folderIconByPath: Record<string, string>
  fileMetaByPath: Record<string, FileMeta>
  onSelect: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, position: { x: number; y: number }) => void
  expandedDirectories: Set<string>
  onToggleDirectory: (directoryPath: string) => void
  draggedPath: string | null
  dropTargetPath: string | null
  onDragStart: (node: TreeNode) => void
  onDragEnd: () => void
  onDragOverDirectory: (node: TreeNode) => void
  onDragLeaveDirectory: (node: TreeNode) => void
  onDropOnDirectory: (node: TreeNode) => void
  level?: number
}

export const ExplorerTreeItem: React.FC<ExplorerTreeItemProps> = ({
  node,
  selectedPath,
  fileIconByPath,
  folderIconByPath,
  fileMetaByPath,
  onSelect,
  onContextMenu,
  expandedDirectories,
  onToggleDirectory,
  draggedPath,
  dropTargetPath,
  onDragStart,
  onDragEnd,
  onDragOverDirectory,
  onDragLeaveDirectory,
  onDropOnDirectory,
  level = 0,
}) => {
  const isSelected = selectedPath === node.path
  const isDirectory = node.type === 'directory'
  const isExpanded = isDirectory ? expandedDirectories.has(node.path) : false
  const isDragged = draggedPath === node.path
  const isDropTarget = dropTargetPath === node.path
  const fileMeta = node.type === 'file' ? fileMetaByPath[node.path] : null

  return (
    <li>
      <button
        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${
          isSelected
            ? 'bg-[#7B61FF]/20 border border-[#7B61FF]/50 text-[#7B61FF]'
            : isDropTarget
              ? 'border border-emerald-400/60 bg-emerald-400/10 text-emerald-200'
              : 'text-white/60 hover:text-white/90 hover:bg-white/5'
        }`}
        draggable={node.path.length > 0}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => {
          if (isDirectory) {
            onToggleDirectory(node.path)
          } else {
            onSelect(node)
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onContextMenu(node, { x: event.clientX, y: event.clientY })
        }}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', node.path)
          onDragStart(node)
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          if (!isDirectory) {
            return
          }

          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          onDragOverDirectory(node)
        }}
        onDragLeave={() => {
          if (isDirectory) {
            onDragLeaveDirectory(node)
          }
        }}
        onDrop={(event) => {
          if (!isDirectory) {
            return
          }

          event.preventDefault()
          onDropOnDirectory(node)
        }}
        aria-grabbed={isDragged}
      >
        <span className="w-5 text-center text-[10px] text-white/55">
          {isDirectory ? (
            <i className={`fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
          ) : (
            <span />
          )}
        </span>
        <span className="w-5 text-center text-sm text-white/70">
          {node.type === 'directory' ? (
            folderIconByPath[node.path] ? (
              <span>{folderIconByPath[node.path]}</span>
            ) : (
              <i className={`fa-regular ${isExpanded ? 'fa-folder-open' : 'fa-folder'}`} />
            )
          ) : (
            fileIconByPath[node.path] ? <span>{fileIconByPath[node.path]}</span> : <i className="fa-regular fa-file-lines" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="block min-w-0 flex-1 truncate text-xs">
              {node.type === 'file'
                ? (fileMeta?.title?.trim() || node.name.replace(/\.md$/i, ''))
                : node.name}
            </span>
            {node.type === 'file' && fileMeta?.isTemplate && (
              <span className="shrink-0 rounded-full border border-violet-400/40 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-violet-200">
                Modèle
              </span>
            )}
          </span>
          {node.type === 'file' && fileMeta?.description?.trim() && (
            <span className="block truncate text-[10px] text-white/35">{fileMeta.description.trim()}</span>
          )}
        </span>
      </button>

      {node.type === 'directory' && isExpanded && node.children && node.children.length > 0 && (
        <ul className="mt-0.5">
          {node.children.map((childNode) => (
            <ExplorerTreeItem
              key={childNode.path}
              node={childNode}
              selectedPath={selectedPath}
              fileIconByPath={fileIconByPath}
              folderIconByPath={folderIconByPath}
              fileMetaByPath={fileMetaByPath}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              expandedDirectories={expandedDirectories}
              onToggleDirectory={onToggleDirectory}
              draggedPath={draggedPath}
              dropTargetPath={dropTargetPath}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverDirectory={onDragOverDirectory}
              onDragLeaveDirectory={onDragLeaveDirectory}
              onDropOnDirectory={onDropOnDirectory}
              level={level + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}