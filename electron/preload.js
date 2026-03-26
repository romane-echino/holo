import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('holo', {
  appName: 'Holo',
  openFolder: () => ipcRenderer.invoke('fs:open-folder'),
  refreshTree: () => ipcRenderer.invoke('fs:refresh-tree'),
  readFile: (filePath) => ipcRenderer.invoke('fs:read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:write-file', filePath, content),
  createFile: (parentDirectoryPath, name) =>
    ipcRenderer.invoke('fs:create-file', parentDirectoryPath, name),
  createDirectory: (parentDirectoryPath, name) =>
    ipcRenderer.invoke('fs:create-directory', parentDirectoryPath, name),
  deletePath: (targetPath) => ipcRenderer.invoke('fs:delete-path', targetPath),
  renamePath: (targetPath, newName) =>
    ipcRenderer.invoke('fs:rename-path', targetPath, newName),
})
