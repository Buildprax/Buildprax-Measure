const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
try {
  // Get isPackaged - in preload context, we can't directly access app
  // But we can check if we're in an asar archive (production indicator)
  // OR we'll have the main process tell us via IPC
  const isPackaged = (() => {
    // Check if we're in an asar archive (reliable production indicator)
    if (typeof __dirname !== 'undefined' && __dirname.includes('.asar')) {
      return true
    }
    // Check process.env (set by electron-builder)
    if (process.env.ELECTRON_IS_PACKAGED === '1') {
      return true
    }
    // Default: assume not packaged (development)
    return false
  })()
  
  contextBridge.exposeInMainWorld('electronAPI', {
    // CRITICAL: Expose app.isPackaged to detect production
    isPackaged: isPackaged,
    
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
    validateLicenseKey: (key) => ipcRenderer.invoke('validate-license-key', key),
    getAppAuthState: () => ipcRenderer.invoke('get-app-auth-state'),
    createAppAccount: (payload) => ipcRenderer.invoke('create-app-account', payload),
    loginAppAccount: (payload) => ipcRenderer.invoke('login-app-account', payload),
    
    // Project management
    saveProject: (projectData) => ipcRenderer.invoke('save-project', projectData),
    loadProject: () => ipcRenderer.invoke('load-project'),
    
    // Menu events
    onMenuNewProject: (callback) => ipcRenderer.on('menu-new-project', callback),
    onMenuOpenProject: (callback) => ipcRenderer.on('menu-open-project', callback),
    onMenuSaveProject: (callback) => ipcRenderer.on('menu-save-project', callback),
    onMenuExportExcel: (callback) => ipcRenderer.on('menu-export-excel', callback),
    onMenuEnterLicenseKey: (callback) => ipcRenderer.on('menu-enter-license-key', callback),
    
    // Force relayout (Windows hit-testing fix)
    forceRelayout: () => ipcRenderer.invoke('force-relayout'),
    
    // Toggle DevTools to force Chromium compositor reset (Windows input fix)
    toggleDevToolsReset: () => ipcRenderer.invoke('toggle-devtools-reset'),
    
    // Windows alert/confirm focus fix - blur and refocus window after alert/confirm
    refocusApplication: () => ipcRenderer.send('focus-fix'),
    
    // Save diagnostic logs to file
    saveDiagnosticLogs: (logs) => ipcRenderer.invoke('save-diagnostic-logs', logs),
    
    // Certificate: save as PDF from HTML (multi-page A4, no app chrome)
    saveCertificatePdfFromHtml: (payload) => ipcRenderer.invoke('save-certificate-pdf-from-html', payload),
    // Certificate: save multiple page HTML documents as one merged PDF
    saveCertificatePdfFromHtmlList: (payload) => ipcRenderer.invoke('save-certificate-pdf-from-html-list', payload),
    // Certificate: open print dialog with cert HTML
    printCertificateHtml: (payload) => ipcRenderer.invoke('print-certificate-html', payload),
    // Certificate: save as Excel (Cover, Cert, Summary sheets)
    saveCertificateExcel: (payload) => ipcRenderer.invoke('save-certificate-excel', payload),
    
    // Remove listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
  })
  
  console.log('✅ Preload script loaded successfully, isPackaged:', isPackaged)
} catch (error) {
  console.error('❌ Error in preload script:', error)
  // Expose minimal API to prevent crashes
  contextBridge.exposeInMainWorld('electronAPI', {
    isPackaged: true,
    getPlatform: () => Promise.resolve(process.platform),
    getLicenseStatus: () => Promise.resolve(null),
    validateLicenseKey: () => Promise.resolve({ success: false, error: 'Preload error' }),
    saveProject: () => Promise.resolve({ success: false }),
    loadProject: () => Promise.resolve({ success: false })
  })
}

