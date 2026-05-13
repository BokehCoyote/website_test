const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("galleryUploader", {
  chooseImage: () => ipcRenderer.invoke("image:choose"),
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  uploadArtwork: (payload) => ipcRenderer.invoke("artwork:upload", payload),
  addVideo: (payload) => ipcRenderer.invoke("video:add", payload),
  listArtwork: () => ipcRenderer.invoke("artwork:list"),
  setArtworkHidden: (payload) => ipcRenderer.invoke("artwork:set-hidden", payload),
  updateArtwork: (payload) => ipcRenderer.invoke("artwork:update", payload)
});
