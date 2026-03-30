const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('holo', {
  appName: 'Holo',
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  toggleDevTools: () => ipcRenderer.invoke('window:toggle-devtools'),
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
  renamePath: (targetPath, newName) => ipcRenderer.invoke('fs:rename-path', targetPath, newName),
  movePath: (sourcePath, targetDirectoryPath) =>
    ipcRenderer.invoke('fs:move-path', sourcePath, targetDirectoryPath),
  gitGetState: (fetchRemote = false) => ipcRenderer.invoke('git:get-state', fetchRemote),
  gitFetch: () => ipcRenderer.invoke('git:fetch'),
  gitCommit: (message) => ipcRenderer.invoke('git:commit', message),
  gitSync: () => ipcRenderer.invoke('git:sync'),
  gitPull: () => ipcRenderer.invoke('git:pull'),
  gitMerge: (branch) => ipcRenderer.invoke('git:merge', branch),
  saveImage: (name, dataBase64) => ipcRenderer.invoke('fs:save-image', name, dataBase64),
  loadImage: (relativePath) => ipcRenderer.invoke('fs:load-image', relativePath),
})
