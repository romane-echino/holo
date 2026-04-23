import { contextBridge, ipcRenderer } from 'electron'

const updateListeners: Record<string, Function[]> = {
  'update-available': [],
  'update-ready': [],
  'update-progress': [],
}

contextBridge.exposeInMainWorld('holo', {
  appName: 'Holo',
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  openFileInNewWindow: (payload) => ipcRenderer.invoke('app:open-file-in-new-window', payload),
  openExternalUrl: (url) => ipcRenderer.invoke('app:open-external-url', url),
  openFolder: () => ipcRenderer.invoke('fs:open-folder'),
  getRecentFolders: () => ipcRenderer.invoke('fs:get-recent-folders'),
  removeRecentFolder: (folderPath) => ipcRenderer.invoke('fs:remove-recent-folder', folderPath),
  openRecentFolder: (folderPath) => ipcRenderer.invoke('fs:open-recent-folder', folderPath),
  refreshTree: () => ipcRenderer.invoke('fs:refresh-tree'),
  readFile: (filePath) => ipcRenderer.invoke('fs:read-file', filePath),
  getPathStats: (targetPath) => ipcRenderer.invoke('fs:get-path-stats', targetPath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:write-file', filePath, content),
  createFile: (parentDirectoryPath, name) =>
    ipcRenderer.invoke('fs:create-file', parentDirectoryPath, name),
  createDirectory: (parentDirectoryPath, name) =>
    ipcRenderer.invoke('fs:create-directory', parentDirectoryPath, name),
  archivePath: (targetPath) => ipcRenderer.invoke('fs:archive-path', targetPath),
  listArchivedFiles: () => ipcRenderer.invoke('fs:list-archived-files'),
  restoreArchivedPath: (archivedPath) => ipcRenderer.invoke('fs:restore-archived-path', archivedPath),
  deletePath: (targetPath) => ipcRenderer.invoke('fs:delete-path', targetPath),
  renamePath: (targetPath, newName) =>
    ipcRenderer.invoke('fs:rename-path', targetPath, newName),
  movePath: (sourcePath, targetDirectoryPath) =>
    ipcRenderer.invoke('fs:move-path', sourcePath, targetDirectoryPath),
  gitPickCloneDirectory: () => ipcRenderer.invoke('git:pick-clone-directory'),
  gitCloneRepository: (payload) => ipcRenderer.invoke('git:clone-repository', payload),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  getUpdateState: () => ipcRenderer.invoke('app:get-update-state'),
  onUpdateAvailable: (callback) => {
    if (!updateListeners['update-available'].includes(callback)) {
      updateListeners['update-available'].push(callback)
    }
    return () => {
      updateListeners['update-available'] = updateListeners['update-available'].filter(c => c !== callback)
    }
  },
  onUpdateReady: (callback) => {
    if (!updateListeners['update-ready'].includes(callback)) {
      updateListeners['update-ready'].push(callback)
    }
    return () => {
      updateListeners['update-ready'] = updateListeners['update-ready'].filter(c => c !== callback)
    }
  },
  onUpdateProgress: (callback) => {
    if (!updateListeners['update-progress'].includes(callback)) {
      updateListeners['update-progress'].push(callback)
    }
    return () => {
      updateListeners['update-progress'] = updateListeners['update-progress'].filter(c => c !== callback)
    }
  },
})

// Set up IPC event listeners
ipcRenderer.on('app:update-available', () => {
  updateListeners['update-available'].forEach(cb => cb())
})

ipcRenderer.on('app:update-ready', () => {
  updateListeners['update-ready'].forEach(cb => cb())
})

ipcRenderer.on('app:update-progress', (_event, data) => {
  updateListeners['update-progress'].forEach(cb => cb(data))
})
