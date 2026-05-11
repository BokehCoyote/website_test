const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("galleryUploader", {
  chooseImage: () => ipcRenderer.invoke("image:choose"),
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  uploadArtwork: (payload) => ipcRenderer.invoke("artwork:upload", payload)
});
