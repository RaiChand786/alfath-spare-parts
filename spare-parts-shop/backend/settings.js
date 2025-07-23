const { ipcMain, app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const db = require('./db');

// Settings file path
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const BACKUP_DIR = path.join(app.getPath('documents'), 'AlfathSparePartsBackups');

// Initialize settings
let settings = {
    general: {
        currency: 'USD',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '12h',
        language: 'en',
        lowStockThreshold: 5,
        backupFrequency: 'weekly'
    },
    company: {
        name: '',
        taxId: '',
        phone: '',
        email: '',
        address: '',
        logo: ''
    },
    appearance: {
        theme: 'light',
        primaryColor: '#0d6efd',
        navStyle: 'sidebar',
        fontSize: 'medium',
        compactMode: false
    }
};

// Load settings from file
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const data = fs.readFileSync(SETTINGS_PATH, 'utf8');
            settings = JSON.parse(data);
        } else {
            saveSettings();
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Save settings to file
function saveSettings() {
    try {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

// Ensure backup directory exists
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

// IPC Handlers
ipcMain.handle('get-settings', () => {
    return settings;
});

ipcMain.handle('save-settings', (event, { type, settings: newSettings }) => {
    settings[type] = newSettings;
    saveSettings();
    
    // Apply theme immediately if appearance settings changed
    if (type === 'appearance') {
        event.sender.send('apply-theme', newSettings.theme);
    }
    
    return true;
});

ipcMain.handle('create-backup', () => {
    ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.db`);
    
    try {
        fs.copyFileSync(path.join(__dirname, '../database/app.db'), backupPath);
        return backupPath;
    } catch (error) {
        throw new Error('Failed to create backup: ' + error.message);
    }
});

ipcMain.handle('get-backup-history', () => {
    ensureBackupDir();
    
    try {
        return fs.readdirSync(BACKUP_DIR)
            .filter(file => file.endsWith('.db'))
            .map(file => {
                const filePath = path.join(BACKUP_DIR, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    path: filePath,
                    date: stats.birthtime,
                    size: stats.size
                };
            })
            .sort((a, b) => b.date - a.date);
    } catch (error) {
        console.error('Error getting backup history:', error);
        return [];
    }
});

ipcMain.handle('restore-backup', (event, backupPath) => {
    try {
        fs.copyFileSync(backupPath, path.join(__dirname, '../database/app.db'));
        return { success: true };
    } catch (error) {
        console.error('Error restoring backup:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-backup', (event, backupPath) => {
    try {
        fs.unlinkSync(backupPath);
        return true;
    } catch (error) {
        console.error('Error deleting backup:', error);
        return false;
    }
});

ipcMain.on('open-backup-dialog', (event) => {
    dialog.showOpenDialog({
        title: 'Select Backup File',
        defaultPath: BACKUP_DIR,
        filters: [
            { name: 'Database Files', extensions: ['db'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
            event.sender.send('backup-selected', result.filePaths[0]);
        }
    });
});

// User Management
ipcMain.handle('get-users', async () => {
    return await db.all('SELECT * FROM users ORDER BY username');
});

ipcMain.handle('get-user', async (event, userId) => {
    return await db.get('SELECT * FROM users WHERE id = ?', [userId]);
});

ipcMain.handle('save-user', async (event, user) => {
    try {
        if (user.id) {
            // Update existing user
            if (user.password) {
                await db.run(
                    'UPDATE users SET username = ?, full_name = ?, email = ?, role = ?, password = ? WHERE id = ?',
                    [user.username, user.full_name, user.email, user.role, user.password, user.id]
                );
            } else {
                await db.run(
                    'UPDATE users SET username = ?, full_name = ?, email = ?, role = ? WHERE id = ?',
                    [user.username, user.full_name, user.email, user.role, user.id]
                );
            }
        } else {
            // Create new user
            if (!user.password) {
                return { success: false, message: 'Password is required for new users' };
            }
            
            await db.run(
                'INSERT INTO users (username, full_name, email, role, password) VALUES (?, ?, ?, ?, ?)',
                [user.username, user.full_name, user.email, user.role, user.password]
            );
        }
        
        return { success: true };
    } catch (error) {
        console.error('Error saving user:', error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('delete-user', async (event, userId) => {
    try {
        await db.run('DELETE FROM users WHERE id = ?', [userId]);
        return true;
    } catch (error) {
        console.error('Error deleting user:', error);
        return false;
    }
});

// Initialize
loadSettings();
ensureBackupDir();

module.exports = {
    loadSettings,
    saveSettings
};