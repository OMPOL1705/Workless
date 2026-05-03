const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("worklessApi", {
  browseLanguagesRoot: () => ipcRenderer.invoke("browse-languages-root"),
  getLanguageOptions: (languagesRoot) => ipcRenderer.invoke("get-language-options", languagesRoot),
  getInnerFolders: (languagesRoot, selectedLanguage) =>
    ipcRenderer.invoke("get-inner-folders", languagesRoot, selectedLanguage),
  loadPairs: (args) => ipcRenderer.invoke("load-pairs", args),
  markResult: (args) => ipcRenderer.invoke("mark-result", args),
  // Text extraction APIs
  getAvailableLanguagesText: (workspacePath) => ipcRenderer.invoke("get-available-languages-text", workspacePath),
  extractTextFromLanguage: (workspacePath, language) =>
    ipcRenderer.invoke("extract-text-from-language", workspacePath, language),
  searchTextOccurrences: (workspacePath, searchText) =>
    ipcRenderer.invoke("search-text-occurrences", workspacePath, searchText),
  searchTextInLanguage: (workspacePath, language, searchText) =>
    ipcRenderer.invoke("search-text-in-language", workspacePath, language, searchText),
  saveTextRecord: (workspacePath, record) => ipcRenderer.invoke("save-text-record", workspacePath, record),
  getEnglishTranslation: (workspacePath, textId) => ipcRenderer.invoke("get-english-translation", workspacePath, textId)
});
