import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('holo', {
  appName: 'Holo',
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
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
  deletePath: (targetPath) => ipcRenderer.invoke('fs:delete-path', targetPath),
  renamePath: (targetPath, newName) =>
    ipcRenderer.invoke('fs:rename-path', targetPath, newName),
  movePath: (sourcePath, targetDirectoryPath) =>
    ipcRenderer.invoke('fs:move-path', sourcePath, targetDirectoryPath),
})
