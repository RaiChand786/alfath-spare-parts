const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Whitelist of valid channels for IPC communication
const validChannels = {
    send: [
        'window-minimize',
        'window-maximize',
        'window-close',
        'set-theme',
        'open-external',
        'show-notification',
        'print-invoice',
        'show-notifications',
        'global-search'
    ],
    receive: [
        'theme-changed',
        'backup-created',
        'backup-restored',
        'notification-received',
        'search-results'
    ],
    invoke: [
        'get-app-version',
        'get-theme',
        'execute-query',
        'get-products',
        'get-customers',
        'get-suppliers',
        'get-categories',
        'get-brands',
        'get-users',
        'get-user',
        'save-user',
        'delete-user',
        'get-settings',
        'save-settings',
        'create-backup',
        'get-backup-history',
        'restore-backup',
        'delete-backup',
        'select-file',
        'save-file',
        'print-invoice',
        'complete-sale',
        'scan-barcode',
        'encrypt-data',
        'decrypt-data'
    ]
};

// Secure file system operations
const safeFs = {
    readFile: (filePath) => {
        const normalizedPath = path.normalize(filePath);
        if (!normalizedPath.startsWith(app.getPath('userData')) {
            throw new Error('File access restricted to application directory');
        }
        return fs.promises.readFile(normalizedPath, 'utf-8');
    },
    writeFile: (filePath, content) => {
        const normalizedPath = path.normalize(filePath);
        if (!normalizedPath.startsWith(app.getPath('userData'))) {
            throw new Error('File access restricted to application directory');
        }
        return fs.promises.writeFile(normalizedPath, content, 'utf-8');
    }
};

// Secure IPC communication
const secureIpc = {
    send: (channel, ...args) => {
        if (validChannels.send.includes(channel)) {
            ipcRenderer.send(channel, ...args);
        } else {
            console.error(`Blocked attempt to send on invalid channel: ${channel}`);
        }
    },
    receive: (channel, listener) => {
        if (validChannels.receive.includes(channel)) {
            ipcRenderer.on(channel, listener);
        } else {
            console.error(`Blocked attempt to receive on invalid channel: ${channel}`);
        }
    },
    invoke: async (channel, ...args) => {
        if (validChannels.invoke.includes(channel)) {
            return await ipcRenderer.invoke(channel, ...args);
        }
        console.error(`Blocked attempt to invoke on invalid channel: ${channel}`);
        return null;
    },
    removeListener: (channel, listener) => {
        if (validChannels.receive.includes(channel)) {
            ipcRenderer.removeListener(channel, listener);
        }
    }
};

// Expose a secure API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Window control
    minimizeWindow: () => secureIpc.send('window-minimize'),
    maximizeWindow: () => secureIpc.send('window-maximize'),
    closeWindow: () => secureIpc.send('window-close'),

    // Application info
    getAppVersion: () => secureIpc.invoke('get-app-version'),

    // Theme management
    getTheme: () => secureIpc.invoke('get-theme'),
    setTheme: (theme) => secureIpc.send('set-theme', theme),
    onThemeChanged: (callback) => {
        secureIpc.receive('theme-changed', callback);
        return () => secureIpc.removeListener('theme-changed', callback);
    },

    // Database operations
    executeQuery: (query, params) => secureIpc.invoke('execute-query', query, params),
    getProducts: (filters) => secureIpc.invoke('get-products', filters),
    getCustomers: () => secureIpc.invoke('get-customers'),
    getSuppliers: () => secureIpc.invoke('get-suppliers'),
    getCategories: () => secureIpc.invoke('get-categories'),
    getBrands: () => secureIpc.invoke('get-brands'),

    // User management
    getUsers: () => secureIpc.invoke('get-users'),
    getUser: (id) => secureIpc.invoke('get-user', id),
    saveUser: (userData) => secureIpc.invoke('save-user', userData),
    deleteUser: (id) => secureIpc.invoke('delete-user', id),

    // Settings
    getSettings: () => secureIpc.invoke('get-settings'),
    saveSettings: (settingsType, settings) => secureIpc.invoke('save-settings', settingsType, settings),

    // Backup/Restore
    createBackup: () => secureIpc.invoke('create-backup'),
    getBackupHistory: () => secureIpc.invoke('get-backup-history'),
    restoreBackup: (backupPath) => secureIpc.invoke('restore-backup', backupPath),
    deleteBackup: (backupPath) => secureIpc.invoke('delete-backup', backupPath),
    onBackupCreated: (callback) => {
        secureIpc.receive('backup-created', callback);
        return () => secureIpc.removeListener('backup-created', callback);
    },
    onBackupRestored: (callback) => {
        secureIpc.receive('backup-restored', callback);
        return () => secureIpc.removeListener('backup-restored', callback);
    },

    // File operations
    selectFile: (options) => secureIpc.invoke('select-file', options),
    saveFile: (content, options) => secureIpc.invoke('save-file', content, options),
    readFile: safeFs.readFile,
    writeFile: safeFs.writeFile,

    // Printing
    printInvoice: (invoiceId) => secureIpc.invoke('print-invoice', invoiceId),

    // POS/Sales
    completeSale: (saleData) => secureIpc.invoke('complete-sale', saleData),
    scanBarcode: () => secureIpc.invoke('scan-barcode'),

    // Notifications
    showNotification: (options) => secureIpc.send('show-notification', options),
    onNotificationReceived: (callback) => {
        secureIpc.receive('notification-received', callback);
        return () => secureIpc.removeListener('notification-received', callback);
    },

    // Search
    globalSearch: (query) => secureIpc.send('global-search', query),
    onSearchResults: (callback) => {
        secureIpc.receive('search-results', callback);
        return () => secureIpc.removeListener('search-results', callback);
    },

    // Security
    encryptData: (data) => secureIpc.invoke('encrypt-data', data),
    decryptData: (data) => secureIpc.invoke('decrypt-data', data),

    // External
    openExternal: (url) => secureIpc.send('open-external', url)
});

// Context isolation warning
contextBridge.exposeInMainWorld('electronEnvironment', {
    isElectron: true,
    isDev: process.env.NODE_ENV === 'development',
    platform: process.platform
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    secureIpc.send('error-occurred', error.toString());
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    secureIpc.send('error-occurred', reason.toString());
});