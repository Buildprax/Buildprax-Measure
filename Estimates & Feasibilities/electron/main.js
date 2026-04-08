const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { PDFDocument } = require('pdf-lib')
const { generateHardwareFingerprint, validateLicenseKey: validateLicenseKeyWithFingerprint } = require('./hardware-fingerprint')
const { hasHardwareUsedTrial, registerHardwareForTrial } = require('./trial-registry')

// CRITICAL: Ensure production uses separate userData to prevent data leakage
// Must be called BEFORE app.whenReady()
const isProduction = !process.env.NODE_ENV || process.env.NODE_ENV === 'production'
if (isProduction && !app.isPackaged) {
  // Only set if we're building for production (even if not yet packaged)
  // This ensures clean separation
}
if (app.isPackaged) {
  // In packaged production builds, use dedicated userData directory
  // Platform-specific paths: macOS uses 'Library', Windows uses 'AppData'
  let appDataFolder
  if (process.platform === 'darwin') {
    // macOS
    appDataFolder = path.join(app.getPath('home'), 'Library', 'Application Support', 'Buildprax Global')
  } else if (process.platform === 'win32') {
    // Windows
    appDataFolder = path.join(app.getPath('appData'), 'Buildprax Global')
  } else {
    // Linux and other platforms
    appDataFolder = path.join(app.getPath('home'), '.config', 'Buildprax Global')
  }
  app.setPath('userData', appDataFolder)
}

// Keep a global reference of the window object
let mainWindow
let runtimeAuthenticatedEmail = null

// License and trial management
let trialData = null
const TRIAL_DAYS = 14
const SUBSCRIPTION_GRACE_DAYS = 2

function getAuthFilePath() {
  return path.join(app.getPath('userData'), 'accounts.json')
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex')
}

function readAuthStore() {
  const authPath = getAuthFilePath()
  if (!fs.existsSync(authPath)) return { users: {}, persistentSession: null }
  try {
    const parsed = JSON.parse(fs.readFileSync(authPath, 'utf8'))
    return {
      users: parsed.users || {},
      persistentSession: parsed.persistentSession || null,
    }
  } catch (_) {
    return { users: {}, persistentSession: null }
  }
}

function writeAuthStore(store) {
  fs.writeFileSync(getAuthFilePath(), JSON.stringify(store, null, 2))
}

function getCurrentPeriodEndIso() {
  const status = trialData || checkLicenseStatus()
  if (!status) return null
  if (status.type === 'subscription' && status.expiryDate) {
    const expiry = new Date(status.expiryDate)
    expiry.setDate(expiry.getDate() + SUBSCRIPTION_GRACE_DAYS)
    return expiry.toISOString()
  }
  if (status.type === 'trial' && status.startDate) {
    const end = new Date(status.startDate)
    end.setDate(end.getDate() + TRIAL_DAYS + SUBSCRIPTION_GRACE_DAYS)
    return end.toISOString()
  }
  return null
}


function getDaysRemainingFromTrialStart(startDateIso) {
  if (!startDateIso) return 0
  const trialStart = new Date(startDateIso)
  const now = new Date()
  const daysElapsed = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24))
  return Math.max(0, TRIAL_DAYS - daysElapsed)
}

function isRestrictedByTrialOrSubscription() {
  const status = trialData || checkLicenseStatus()
  if (!status) return false
  if (status.type === 'subscription') {
    if (!status.expiryDate) return false
    const expiryMs = new Date(status.expiryDate).getTime()
    const graceMs = SUBSCRIPTION_GRACE_DAYS * 24 * 60 * 60 * 1000
    return Date.now() > (expiryMs + graceMs)
  }
  if (status.type === 'trial') {
    return getDaysRemainingFromTrialStart(status.startDate) <= 0
  }
  return false
}

function blockedTrialResponse() {
  return {
    success: false,
    error: 'Your 14-day trial has ended. You can continue working, but saving and exporting require a subscription.'
  }
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      sandbox: false // Disable sandbox to allow preload script to work
    },
    icon: path.join(__dirname, '../build/icons/icon.png'), // Add your app icon
    titleBarStyle: 'hiddenInset',
    show: false // Don't show until ready
  })

  // Load the app
  // Use app.isPackaged to reliably detect production (not NODE_ENV which may not be set)
  const isDev = !app.isPackaged && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production')
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // Don't auto-open DevTools - user can press F12 if needed
    // mainWindow.webContents.openDevTools()
  } else {
    // PRODUCTION MODE - app.isPackaged is true
    // In production, files are in app.asar - use app.getAppPath() which handles asar correctly
    const appPath = app.getAppPath()
    const htmlPath = path.join(appPath, 'dist', 'index.html')
    
    console.log('Production mode:')
    console.log('  app.getAppPath():', appPath)
    console.log('  app.getAppPath() type:', typeof appPath)
    console.log('  HTML path:', htmlPath)
    
    // In packaged Electron apps, loadFile with relative path should work
    // The relative path is resolved from app.getAppPath() which points to app.asar
    console.log('Loading with loadFile (relative): dist/index.html')
    mainWindow.loadFile('dist/index.html', {
      query: {},
      search: ''
    }).catch(err => {
      console.error('loadFile error:', err)
      // Fallback: construct file:// URL manually
      // In Electron, app.getAppPath() returns the path to app.asar when packaged
      const filePath = path.resolve(htmlPath)
      let fileUrl = `file://${filePath.replace(/\\/g, '/')}`
      if (process.platform === 'win32') {
        fileUrl = `file:///${filePath.replace(/\\/g, '/')}`
      }
      console.log('Fallback: Loading with loadURL:', fileUrl)
      mainWindow.loadURL(fileUrl).catch(urlErr => {
        console.error('loadURL also failed:', urlErr)
        dialog.showErrorBox('Load Failed', `Could not load application.\n\nPath: ${htmlPath}\n\nError: ${err.message}`)
      })
    })
    
    // Log any load failures
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame) {
        console.error('❌ Failed to load:', errorCode, errorDescription)
        console.error('   URL attempted:', validatedURL)
      }
    })
    
    // Log successful load
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('✅ Page finished loading')
      mainWindow.webContents.executeJavaScript(`
        console.log('✅ Renderer loaded');
        console.log('Root element:', document.getElementById('root'));
        console.log('Scripts:', document.scripts.length);
      `).catch(err => console.error('Debug script error:', err))
    })
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    
    // Don't auto-open DevTools in production
    // Users can open via menu: View > Toggle Developer Tools (or Cmd+Option+I / Ctrl+Shift+I)
    if (!app.isPackaged && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production')) {
      // Only in development mode - but still don't auto-open
      // DevTools can be opened manually via menu if needed
    }
    
    // Check license/trial status
    checkLicenseStatus()
  })
  
  // Log when page finishes loading
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('✅ Page finished loading')
    // Inject debug script
    mainWindow.webContents.executeJavaScript(`
      console.log('Window location:', window.location.href);
      console.log('Root element:', document.getElementById('root'));
      console.log('Scripts loaded:', document.scripts.length);
      Array.from(document.scripts).forEach((s, i) => {
        console.log('Script', i, ':', s.src || 'inline', s.type);
      });
      if (document.getElementById('root') && document.getElementById('root').innerHTML === '') {
        console.error('❌ Root element is empty - React may not be mounting');
      }
    `).catch(err => console.error('Debug script error:', err))
  })
  
  // Log any console errors from renderer
  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (level === 3) { // Error level
      console.error('Renderer error:', message)
    }
  })

  // Intercept window.open from renderer: mailto opens default email client; http(s) to Buildprax site
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && String(url).toLowerCase().startsWith('mailto:')) {
      console.log('WINDOW_OPEN_MAILTO:', url)
      shell.openExternal(url)
      return { action: 'deny' }
    }
    let targetUrl = 'https://buildprax.com'
    if (url && url.includes('buildprax.com')) {
      targetUrl = 'https://buildprax.com'
    }
    console.log('WINDOW_OPEN_INTERCEPTED:', url, '-> FORCED TO:', targetUrl)
    shell.openExternal(targetUrl)
    return { action: 'deny' }
  })

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Create application menu
  createMenu()
}

// License and trial management functions
function checkLicenseStatus() {
  const licensePath = path.join(app.getPath('userData'), 'license.json')
  
  try {
    if (fs.existsSync(licensePath)) {
      const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'))
      
      if (licenseData.type === 'trial') {
        const trialStart = new Date(licenseData.startDate)
        const now = new Date()
        const daysElapsed = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24))
        
        if (daysElapsed >= TRIAL_DAYS) {
          // Trial expired - keep the expired license data, don't start new trial
          console.log('⚠️ Trial expired - keeping expired license, not starting new trial')
          trialData = licenseData
          // DON'T show Electron dialog - React overlay handles this better
          // showTrialExpiredDialog()
          return trialData // Return expired data instead of undefined
        } else {
          const daysRemaining = TRIAL_DAYS - daysElapsed
          if (daysRemaining <= 3 && process.platform !== 'win32') {
            showTrialWarningDialog(daysRemaining)
          }
        }
      } else if (licenseData.type === 'subscription') {
        const expiryDate = new Date(licenseData.expiryDate)
        const now = new Date()
        
        if (now > expiryDate) {
          // Subscription expired - keep expired data
          trialData = licenseData
          if (process.platform !== 'win32') showSubscriptionExpiredDialog()
          return trialData
        }
      }
      
      trialData = licenseData
      return trialData
    } else {
      // First time user - check if hardware has used trial before
      // On Windows (Store): fingerprint must NOT block launch - only control save/export
      if (hasHardwareUsedTrial()) {
        console.log('⚠️ Hardware has already used trial - trial reset prevented')
        trialData = {
          type: 'trial',
          startDate: new Date(Date.now() - (TRIAL_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString(),
          daysRemaining: 0
        }
        return trialData
      }
      
      console.log('📝 No license file found - starting new trial for new hardware')
      startTrial()
      registerHardwareForTrial()
      return trialData
    }
  } catch (error) {
    console.error('Error checking license:', error)
    // Only start new trial on actual error, not if file is expired
    if (!fs.existsSync(licensePath)) {
      // Check hardware registry before starting trial
      if (hasHardwareUsedTrial()) {
        console.log('⚠️ Hardware has already used trial - cannot start new trial')
        trialData = {
          type: 'trial',
          startDate: new Date(Date.now() - (TRIAL_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString(),
          daysRemaining: 0
        }
        return trialData
      }
      startTrial()
      return trialData
    }
    return null
  }
}

function startTrial() {
  // CRITICAL: Check hardware registry before starting trial
  if (hasHardwareUsedTrial()) {
    console.log('⚠️ Cannot start trial - hardware has already used trial')
    // Return expired state
    trialData = {
      type: 'trial',
      startDate: new Date(Date.now() - (TRIAL_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString(),
      daysRemaining: 0
    }
    return
  }
  
  // CRITICAL: Assign to global trialData, don't create local variable
  // For testing: Check if TEST_TRIAL_DAYS environment variable is set
  const testDays = process.env.TEST_TRIAL_DAYS ? parseInt(process.env.TEST_TRIAL_DAYS) : null
  const trialDays = testDays || TRIAL_DAYS
  
  // For testing: Check if TEST_TRIAL_START_DATE is set (allows simulating past dates)
  let startDate = new Date().toISOString()
  if (process.env.TEST_TRIAL_START_DATE) {
    startDate = process.env.TEST_TRIAL_START_DATE
    console.log('🧪 TEST MODE: Using test trial start date:', startDate)
  }
  
  trialData = {
    type: 'trial',
    startDate: startDate,
    daysRemaining: trialDays
  }
  
  const licensePath = path.join(app.getPath('userData'), 'license.json')
  fs.writeFileSync(licensePath, JSON.stringify(trialData, null, 2))
  
  // Register hardware fingerprint to prevent future trial resets
  registerHardwareForTrial()
  
  console.log('✅ Trial started:', trialData)
  if (testDays) {
    console.log(`🧪 TEST MODE: Trial set to ${testDays} days for testing`)
  }
  if (process.platform !== 'win32') showTrialStartedDialog()
}

function showTrialStartedDialog() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Welcome to BUILDPRAX MEASURE PRO',
    message: 'Free Trial Started',
    detail: `You have ${TRIAL_DAYS} days to try all features. After the trial, you'll need a subscription to continue using the app.`,
    buttons: ['Continue Trial', 'Subscribe Now'],
    defaultId: 0
  }).then((result) => {
    if (result.response === 1) {
      showSubscriptionDialog()
    }
  })
}

function showTrialWarningDialog(daysRemaining) {
  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Trial Expiring Soon',
    message: `${daysRemaining} days remaining in your trial`,
    detail: 'Your free trial will expire soon. Subscribe now to continue using BUILDPRAX MEASURE PRO without interruption.',
    buttons: ['Continue Trial', 'Subscribe Now'],
    defaultId: 1
  }).then((result) => {
    if (result.response === 1) {
      showSubscriptionDialog()
    }
  })
}

function showTrialExpiredDialog() {
  dialog.showMessageBox(mainWindow, {
    type: 'error',
    title: 'Trial Expired',
    message: 'Your free trial has expired',
    detail: 'To continue using BUILDPRAX MEASURE PRO, please subscribe to one of our plans.\n\nVisit our website to see all subscription options and pricing.',
    buttons: ['Visit Website', 'Enter License Key', 'Exit'],
    defaultId: 0
  }).then((result) => {
    if (result.response === 0) {
      // Open website homepage - force exact URL
      const url = 'https://buildprax.com'
      console.log('OPEN_EXTERNAL:', url)
      shell.openExternal(url)
    } else if (result.response === 1) {
      // Trigger license key entry dialog
      mainWindow.webContents.send('show-license-dialog')
    } else {
      app.quit()
    }
  })
}

function showSubscriptionDialog() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Subscribe to BUILDPRAX MEASURE PRO',
    message: 'Choose Your Subscription Plan',
    detail: 'We offer flexible subscription options to suit your needs:\n\n• Monthly subscription\n• Quarterly subscription\n• Half-yearly subscription\n• Annual subscription (with multi-license options)\n\nVisit our website to see all plans, pricing, and subscribe.',
    buttons: ['Visit Website', 'Enter License Key', 'Cancel'],
    defaultId: 0
  }).then((result) => {
    if (result.response === 0) {
      // Open website homepage - force exact URL
      const url = 'https://buildprax.com'
      console.log('OPEN_EXTERNAL:', url)
      shell.openExternal(url)
    } else if (result.response === 1) {
      showLicenseKeyDialog()
    }
  })
}

function showLicenseKeyDialog() {
  dialog.showInputBox(mainWindow, {
    title: 'Enter License Key',
    message: 'Please enter your license key:',
    inputType: 'text'
  }).then((result) => {
    if (result.response === 0 && result.text) {
      validateLicenseKey(result.text)
    }
  })
}

function validateLicenseKey(licenseKey) {
  try {
    // Generate hardware fingerprint for this machine
    const hardwareFingerprint = generateHardwareFingerprint()
    console.log('Hardware fingerprint:', hardwareFingerprint)
    
    // Validate license key against hardware fingerprint
    const validation = validateLicenseKeyWithFingerprint(licenseKey, hardwareFingerprint)
    
    if (validation.valid) {
      const licenseData = {
        type: 'subscription',
        licenseKey: licenseKey,
        hardwareFingerprint: hardwareFingerprint,
        packageCode: validation.packageCode || 'DMD',
        startDate: new Date().toISOString(),
        expiryDate: validation.expiryDate
      }
      
      const licensePath = path.join(app.getPath('userData'), 'license.json')
      fs.writeFileSync(licensePath, JSON.stringify(licenseData, null, 2))
      
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'License Activated',
        message: 'Your subscription is now active!',
        detail: 'You can now use all features of BUILDPRAX MEASURE PRO.',
        buttons: ['OK']
      })
    } else {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Invalid License Key',
        message: 'The license key you entered is invalid.',
        detail: validation.error || 'Please check your license key and try again.',
        buttons: ['Try Again', 'Cancel'],
        defaultId: 0
      }).then((result) => {
        if (result.response === 0) {
          showLicenseKeyDialog()
        }
      })
    }
  } catch (error) {
    console.error('Error validating license key:', error)
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'License Validation Error',
      message: 'An error occurred while validating your license key.',
      detail: 'Please try again or contact support.',
      buttons: ['Try Again', 'Cancel'],
      defaultId: 0
    }).then((result) => {
      if (result.response === 0) {
        showLicenseKeyDialog()
      }
    })
  }
}

function showSubscriptionExpiredDialog() {
  dialog.showMessageBox(mainWindow, {
    type: 'error',
    title: 'Subscription Expired',
    message: 'Your subscription has expired',
    detail: 'Please renew your subscription to continue using BUILDPRAX MEASURE PRO.',
    buttons: ['Renew Subscription', 'Exit'],
    defaultId: 0
  }).then((result) => {
    if (result.response === 0) {
      showSubscriptionDialog()
    } else {
      app.quit()
    }
  })
}

// Create application menu
function createMenu() {
  const appVersionLabel = 'Buildprax 1.0.10.0'
  const template = [
    ...(process.platform === 'darwin'
      ? [{
          label: 'Buildprax Measure Pro',
          submenu: [
            {
              label: `About ${appVersionLabel}`,
              click: () => {
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'About BUILDPRAX MEASURE PRO',
                  message: appVersionLabel,
                  detail: 'Professional measurement tool for construction estimating.\n\n© 2024 Buildprax. All rights reserved.',
                  buttons: ['OK']
                })
              }
            },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        }]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-project')
          }
        },
        {
          label: 'Open Project',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow.webContents.send('menu-open-project')
          }
        },
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('menu-save-project')
          }
        },
        { type: 'separator' },
        {
          label: 'Export Excel',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('menu-export-excel')
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { 
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => {
            if (mainWindow) mainWindow.webContents.toggleDevTools()
          }
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About BUILDPRAX MEASURE PRO',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About BUILDPRAX MEASURE PRO',
              message: appVersionLabel,
              detail: 'Professional measurement tool for construction estimating.\n\n© 2024 Buildprax. All rights reserved.',
              buttons: ['OK']
            })
          }
        },
        { type: 'separator' },
        {
          label: 'Enter License Key',
          click: () => {
            // Send message to renderer to show license dialog
            if (mainWindow) {
              mainWindow.webContents.send('menu-enter-license-key')
            }
          }
        },
        {
          label: 'License Information',
          click: () => {
            checkLicenseStatus()
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// App event handlers
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC handlers for communication with renderer process
ipcMain.handle('get-platform', () => process.platform)

ipcMain.handle('get-license-status', () => {
  // Always return trialData, or check fresh if null
  if (!trialData) {
    checkLicenseStatus()
  }
  
  // CRITICAL: If trialData exists and is expired, return it without starting new trial
  if (trialData && trialData.type === 'trial') {
    const trialStart = new Date(trialData.startDate)
    const now = new Date()
    const daysElapsed = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24))
    if (daysElapsed >= TRIAL_DAYS) {
      // Trial is expired - return expired state, don't start new trial
      console.log('⚠️ IPC: Returning expired trial status, not starting new trial')
      return trialData
    }
  }
  
  console.log('IPC get-license-status returning:', trialData)
  return trialData
})

ipcMain.handle('validate-license-key', async (event, licenseKey) => {
  try {
    const hardwareFingerprint = generateHardwareFingerprint()
    const validation = validateLicenseKeyWithFingerprint(licenseKey, hardwareFingerprint)
    
    if (validation.valid) {
      const licenseData = {
        type: 'subscription',
        licenseKey: licenseKey,
        hardwareFingerprint: hardwareFingerprint,
        packageCode: validation.packageCode || 'DMD',
        startDate: new Date().toISOString(),
        expiryDate: validation.expiryDate
      }
      
      const licensePath = path.join(app.getPath('userData'), 'license.json')
      fs.writeFileSync(licensePath, JSON.stringify(licenseData, null, 2))
      trialData = licenseData
      
      return { success: true, valid: true, message: 'License activated successfully' }
    } else {
      return { success: false, valid: false, error: validation.error || 'Invalid license key' }
    }
  } catch (error) {
    console.error('Error validating license key:', error)
    return { success: false, valid: false, error: 'License validation failed' }
  }
})

ipcMain.handle('get-app-auth-state', () => {
  const store = readAuthStore()
  const nowMs = Date.now()
  const session = store.persistentSession
  const hasPersistent = !!(session?.email && session?.validUntil)
  const persistentValid = hasPersistent && nowMs <= new Date(session.validUntil).getTime()
  const currentEmail = runtimeAuthenticatedEmail || (persistentValid ? session.email : null)
  const hasAnyAccount = Object.keys(store.users || {}).length > 0
  return {
    isAuthenticated: !!currentEmail,
    currentEmail,
    hasAnyAccount,
    validUntil: persistentValid ? session.validUntil : null,
  }
})

ipcMain.handle('create-app-account', (event, { email, password, stayLoggedIn }) => {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' }
  }
  if (!password || String(password).length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' }
  }
  const store = readAuthStore()
  store.users[normalizedEmail] = {
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  }
  const validUntil = getCurrentPeriodEndIso()
  runtimeAuthenticatedEmail = normalizedEmail
  if (stayLoggedIn && validUntil) {
    store.persistentSession = { email: normalizedEmail, validUntil }
  } else {
    store.persistentSession = null
  }
  writeAuthStore(store)
  return { success: true, email: normalizedEmail, validUntil }
})

ipcMain.handle('login-app-account', (event, { email, password, stayLoggedIn }) => {
  const normalizedEmail = normalizeEmail(email)
  const store = readAuthStore()
  const user = store.users[normalizedEmail]
  if (!user) return { success: false, error: 'No account found for this email.' }
  if (user.passwordHash !== hashPassword(password)) {
    return { success: false, error: 'Incorrect password.' }
  }
  const validUntil = getCurrentPeriodEndIso()
  runtimeAuthenticatedEmail = normalizedEmail
  if (stayLoggedIn && validUntil) {
    store.persistentSession = { email: normalizedEmail, validUntil }
  } else {
    store.persistentSession = null
  }
  writeAuthStore(store)
  return { success: true, email: normalizedEmail, validUntil }
})


ipcMain.handle('save-project', async (event, projectData) => {
  try {
    if (isRestrictedByTrialOrSubscription()) return blockedTrialResponse()
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Project',
      defaultPath: `${(projectData.name || 'project').replace(/[^a-z0-9]/gi, '_')}_project.json`,
      filters: [
        { name: 'Project Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    
    if (filePath) {
      fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2))
      return { success: true, filePath }
    }
    return { success: false }
  } catch (error) {
    console.error('Error saving project:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('load-project', async () => {
  try {
    if (isRestrictedByTrialOrSubscription()) return blockedTrialResponse()
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Load Project',
      filters: [
        { name: 'Project Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    
    if (filePaths && filePaths.length > 0) {
      const projectData = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'))
      return { success: true, projectData, filePath: filePaths[0] }
    }
    return { success: false }
  } catch (error) {
    console.error('Error loading project:', error)
    return { success: false, error: error.message }
  }
})

// Certificate / Annexure: save as PDF from standalone HTML (proper A4 multi-page, no app chrome)
ipcMain.handle('save-certificate-pdf-from-html', async (event, { html, defaultFileName, footerPrefix }) => {
  if (isRestrictedByTrialOrSubscription()) return blockedTrialResponse()
  const parentWin = BrowserWindow.fromWebContents(event.sender)
  if (!parentWin) return { success: false, error: 'No window' }
  let printWin = null
  try {
    const { filePath, canceled } = await dialog.showSaveDialog(parentWin, {
      title: 'Save certificate as PDF',
      defaultPath: defaultFileName || 'Certificate.pdf',
      filters: [
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (canceled || !filePath) return { success: false, canceled: true }
    const tempPath = path.join(app.getPath('temp'), `cert-print-${Date.now()}.html`)
    fs.writeFileSync(tempPath, html, 'utf8')
    printWin = new BrowserWindow({
      show: false,
      width: 794,
      height: 1123,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    // IMPORTANT: do not await did-finish-load *after* awaiting loadFile(), because the event
    // may have already fired, leaving this handler hanging forever.
    await printWin.loadFile(tempPath)
    await new Promise((r) => setTimeout(r, 150))
    const useNativeFooter = typeof footerPrefix === 'string' && footerPrefix.trim() !== ''
    const pdfData = await printWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      preferCSSPageSize: true,
      margins: { marginType: 'none' },
      scaleFactor: 100,
      displayHeaderFooter: useNativeFooter,
      headerTemplate: useNativeFooter ? '<div></div>' : undefined,
      footerTemplate: useNativeFooter
        ? `<div style="width:100%;font-size:11px;text-align:center;color:#444;"><span>${footerPrefix}-</span><span class="pageNumber"></span></div>`
        : undefined,
    })
    fs.writeFileSync(filePath, pdfData)
    try { fs.unlinkSync(tempPath) } catch (_) {}
    return { success: true, filePath }
  } catch (err) {
    console.error('save-certificate-pdf-from-html error:', err)
    return { success: false, error: err.message }
  } finally {
    if (printWin && !printWin.isDestroyed()) printWin.destroy()
  }
})

// Save multiple standalone HTML documents as one merged PDF.
ipcMain.handle('save-certificate-pdf-from-html-list', async (event, { documents, defaultFileName }) => {
  if (isRestrictedByTrialOrSubscription()) return blockedTrialResponse()
  const parentWin = BrowserWindow.fromWebContents(event.sender)
  if (!parentWin) return { success: false, error: 'No window' }
  let printWin = null
  try {
    const docs = Array.isArray(documents) ? documents.filter((d) => d && typeof d.html === 'string' && d.html.trim() !== '') : []
    if (!docs.length) return { success: false, error: 'No pages selected.' }
    const { filePath, canceled } = await dialog.showSaveDialog(parentWin, {
      title: 'Save document as PDF',
      defaultPath: defaultFileName || 'Feasibility-Document.pdf',
      filters: [
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (canceled || !filePath) return { success: false, canceled: true }

    const mergedPdf = await PDFDocument.create()
    for (let i = 0; i < docs.length; i += 1) {
      const { html, footerPrefix } = docs[i]
      const tempPath = path.join(app.getPath('temp'), `cert-print-${Date.now()}-${i}.html`)
      fs.writeFileSync(tempPath, html, 'utf8')
      printWin = new BrowserWindow({
        show: false,
        width: 794,
        height: 1123,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      })
      await printWin.loadFile(tempPath)
      await new Promise((r) => setTimeout(r, 120))
      const useNativeFooter = typeof footerPrefix === 'string' && footerPrefix.trim() !== ''
      const pdfData = await printWin.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        preferCSSPageSize: true,
        margins: { marginType: 'none' },
        scaleFactor: 100,
        displayHeaderFooter: useNativeFooter,
        headerTemplate: useNativeFooter ? '<div></div>' : undefined,
        footerTemplate: useNativeFooter
          ? `<div style="width:100%;font-size:11px;text-align:center;color:#444;"><span>${footerPrefix}-</span><span class="pageNumber"></span></div>`
          : undefined,
      })
      const srcPdf = await PDFDocument.load(pdfData)
      const srcPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices())
      srcPages.forEach((p) => mergedPdf.addPage(p))
      if (printWin && !printWin.isDestroyed()) printWin.destroy()
      printWin = null
      try { fs.unlinkSync(tempPath) } catch (_) {}
    }
    const mergedBytes = await mergedPdf.save()
    fs.writeFileSync(filePath, Buffer.from(mergedBytes))
    return { success: true, filePath }
  } catch (err) {
    console.error('save-certificate-pdf-from-html-list error:', err)
    return { success: false, error: err.message }
  } finally {
    if (printWin && !printWin.isDestroyed()) printWin.destroy()
  }
})

// Certificate / Annexure: open print dialog with cert HTML (same multi-page document)
ipcMain.handle('print-certificate-html', async (event, { html, footerPrefix }) => {
  let printWin = null
  try {
    const tempPath = path.join(app.getPath('temp'), `cert-print-${Date.now()}.html`)
    fs.writeFileSync(tempPath, html, 'utf8')
    printWin = new BrowserWindow({
      show: false,
      width: 794,
      height: 1123,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    // IMPORTANT: do not await did-finish-load *after* awaiting loadFile(), because the event
    // may have already fired, leaving this handler hanging forever.
    await printWin.loadFile(tempPath)
    await new Promise((r) => setTimeout(r, 150))
    const useNativeFooter = typeof footerPrefix === 'string' && footerPrefix.trim() !== ''
    await new Promise((resolve, reject) => {
      printWin.webContents.print({
        printBackground: true,
        silent: false,
        displayHeaderFooter: useNativeFooter,
        header: useNativeFooter ? '' : undefined,
        footer: useNativeFooter ? `${footerPrefix}-<span class="pageNumber"></span>` : undefined,
      }, (success, failureReason) => {
        if (success) resolve()
        else reject(new Error(failureReason || 'Print cancelled'))
      })
    })
    try { fs.unlinkSync(tempPath) } catch (_) {}
    return { success: true }
  } catch (err) {
    console.error('print-certificate-html error:', err)
    return { success: false, error: err.message }
  } finally {
    if (printWin && !printWin.isDestroyed()) printWin.destroy()
  }
})

// Certificate: save Excel workbook (base64 buffer) to user-chosen path
ipcMain.handle('save-certificate-excel', async (event, { defaultFileName, base64Data }) => {
  if (isRestrictedByTrialOrSubscription()) return blockedTrialResponse()
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { success: false, error: 'No window' }
  try {
    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: 'Save certificate as Excel',
      defaultPath: defaultFileName || 'Certificate.xlsx',
      filters: [
        { name: 'Excel', extensions: ['xlsx'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (canceled || !filePath) return { success: false, canceled: true }
    const buf = Buffer.from(base64Data, 'base64')
    fs.writeFileSync(filePath, buf)
    return { success: true, filePath }
  } catch (err) {
    console.error('save-certificate-excel error:', err)
    return { success: false, error: err.message }
  }
})

// CRITICAL FIX: Windows alert/confirm focus bug fix
// When using alert()/confirm() in the renderer process, inputs become unusable on Windows
// The workaround is to blur and refocus the window (from Reddit/AnythingLLM fix)
ipcMain.on('focus-fix', () => {
  if (process.platform !== 'win32' || !mainWindow) return
  mainWindow.blur()
  mainWindow.focus()
})

// DWG file handling removed - app is PDF-only
