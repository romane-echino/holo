import { contextBridge, ipcRenderer } from 'electron'

const updateListeners = {
  'update-available': [],
  'update-ready': [],
  'update-progress': [],
}

contextBridge.exposeInMainWorld('holo', {
  appName: 'Holo',
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  getClipboardFormats: () => ipcRenderer.invoke('clipboard:get-formats'),
  clipboardHasFormat: (format) => ipcRenderer.invoke('clipboard:has-format', format),
  readClipboardFormat: (format) => ipcRenderer.invoke('clipboard:read-format', format),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  getWindowState: () => ipcRenderer.invoke('window:get-state'),
  dragWindowFromMaximized: (payload) => ipcRenderer.invoke('window:drag-from-maximized', payload),
  setWindowPosition: (payload) => ipcRenderer.invoke('window:set-position', payload),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  openFileInNewWindow: (payload) => ipcRenderer.invoke('app:open-file-in-new-window', payload),
  openExternalUrl: (url) => ipcRenderer.invoke('app:open-external-url', url),
  openFolder: () => ipcRenderer.invoke('fs:open-folder'),
  getRecentFolders: () => ipcRenderer.invoke('fs:get-recent-folders'),
  getRecentFolderIcon: (folderPath) => ipcRenderer.invoke('fs:get-recent-folder-icon', folderPath),
  removeRecentFolder: (folderPath) => ipcRenderer.invoke('fs:remove-recent-folder', folderPath),
  showItemInFolder: (folderPath) => ipcRenderer.invoke('shell:show-item-in-folder', folderPath),
  openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath),
  getSearchIndexPath: () => ipcRenderer.invoke('search-index:get-path'),
  readSearchIndex: () => ipcRenderer.invoke('search-index:read'),
  writeSearchIndex: (content) => ipcRenderer.invoke('search-index:write', content),
  openRecentFolder: (folderPath) => ipcRenderer.invoke('fs:open-recent-folder', folderPath),
  refreshTree: () => ipcRenderer.invoke('fs:refresh-tree'),
  readFile: (filePath) => ipcRenderer.invoke('fs:read-file', filePath),
  readFileOptional: (filePath) => ipcRenderer.invoke('fs:read-file-optional', filePath),
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
  copyFile: (sourcePath, targetDirectoryPath) =>
    ipcRenderer.invoke('fs:copy-file', sourcePath, targetDirectoryPath),
  readRepoConfig: () => ipcRenderer.invoke('holo:read-repo-config'),
  writeRepoConfig: (config) => ipcRenderer.invoke('holo:write-repo-config', config),
  gitGetState: (fetchRemote = false) => ipcRenderer.invoke('git:get-state', fetchRemote),
  gitGetFileActivity: (filePath, maxCount = 10) => ipcRenderer.invoke('git:get-file-activity', filePath, maxCount),
  gitFetch: () => ipcRenderer.invoke('git:fetch'),
  gitCommit: (message) => ipcRenderer.invoke('git:commit', message),
  gitSync: () => ipcRenderer.invoke('git:sync'),
  gitPull: () => ipcRenderer.invoke('git:pull'),
  gitMerge: (branch) => ipcRenderer.invoke('git:merge', branch),
  gitResolveConflict: (filePath, strategy) => ipcRenderer.invoke('git:resolve-conflict', filePath, strategy),
  saveImage: (name, dataBase64, options) => ipcRenderer.invoke('fs:save-image', name, dataBase64, options),
  loadImage: (relativePath) => ipcRenderer.invoke('fs:load-image', relativePath),
  gitPickCloneDirectory: () => ipcRenderer.invoke('git:pick-clone-directory'),
  gitCloneRepository: (payload) => ipcRenderer.invoke('git:clone-repository', payload),
  gitGetSavedCredentials: (repoUrl) => ipcRenderer.invoke('git:get-saved-credentials', repoUrl),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  getUpdateState: () => ipcRenderer.invoke('app:get-update-state'),
  getHoloConfig: () => ipcRenderer.invoke('app:get-config'),
  setHoloConfig: (cfg) => ipcRenderer.invoke('app:set-config', cfg),
  getHoloConfigValue: (key) => ipcRenderer.invoke('app:get-config-value', key),
  setHoloConfigValue: (key, value) => ipcRenderer.invoke('app:set-config-value', key, value),
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
