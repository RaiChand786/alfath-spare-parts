const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// DOM Elements
const settingsTabs = document.getElementById('settingsTabs');
const generalSettingsForm = document.getElementById('general-settings-form');
const companySettingsForm = document.getElementById('company-settings-form');
const appearanceSettingsForm = document.getElementById('appearance-settings-form');
const createBackupBtn = document.getElementById('create-backup-btn');
const restoreBackupBtn = document.getElementById('restore-backup-btn');
const backupHistoryTable = document.getElementById('backup-history-table');
const usersTable = document.getElementById('users-table');
const addUserBtn = document.getElementById('add-user-btn');
const userModal = new bootstrap.Modal(document.getElementById('userModal'));
const saveUserBtn = document.getElementById('save-user-btn');

// Initialize settings
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadBackupHistory();
    loadUsers();
    setupEventListeners();
});

function loadSettings() {
    ipcRenderer.invoke('get-settings').then(settings => {
        if (settings.general) {
            // General settings
            document.getElementById('currency').value = settings.general.currency || 'USD';
            document.getElementById('date-format').value = settings.general.dateFormat || 'YYYY-MM-DD';
            document.getElementById('time-format').value = settings.general.timeFormat || '12h';
            document.getElementById('language').value = settings.general.language || 'en';
            document.getElementById('low-stock-threshold').value = settings.general.lowStockThreshold || 5;
            document.getElementById('backup-frequency').value = settings.general.backupFrequency || 'weekly';
        }

        if (settings.company) {
            // Company settings
            document.getElementById('company-name').value = settings.company.name || '';
            document.getElementById('tax-id').value = settings.company.taxId || '';
            document.getElementById('phone').value = settings.company.phone || '';
            document.getElementById('email').value = settings.company.email || '';
            document.getElementById('address').value = settings.company.address || '';
            
            if (settings.company.logo) {
                const logoPreview = document.getElementById('logo-preview');
                logoPreview.src = settings.company.logo;
                logoPreview.style.display = 'block';
            }
        }

        if (settings.appearance) {
            // Appearance settings
            document.getElementById('theme').value = settings.appearance.theme || 'light';
            document.getElementById('primary-color').value = settings.appearance.primaryColor || '#0d6efd';
            document.getElementById('nav-style').value = settings.appearance.navStyle || 'sidebar';
            document.getElementById('font-size').value = settings.appearance.fontSize || 'medium';
            document.getElementById('compact-mode').checked = settings.appearance.compactMode || false;
        }
    });
}

function loadBackupHistory() {
    ipcRenderer.invoke('get-backup-history').then(backups => {
        const tbody = backupHistoryTable.querySelector('tbody');
        tbody.innerHTML = '';

        backups.forEach(backup => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(backup.date).toLocaleString()}</td>
                <td>${backup.name}</td>
                <td>${formatFileSize(backup.size)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary restore-backup-btn" data-path="${backup.path}">
                        <i class="bi bi-arrow-counterclockwise"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-backup-btn" data-path="${backup.path}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Add event listeners to the new buttons
        document.querySelectorAll('.restore-backup-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const backupPath = btn.getAttribute('data-path');
                restoreBackup(backupPath);
            });
        });

        document.querySelectorAll('.delete-backup-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const backupPath = btn.getAttribute('data-path');
                deleteBackup(backupPath);
            });
        });
    });
}

function loadUsers() {
    ipcRenderer.invoke('get-users').then(users => {
        const tbody = usersTable.querySelector('tbody');
        tbody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${user.full_name || ''}</td>
                <td><span class="badge ${getRoleBadgeClass(user.role)}">${user.role}</span></td>
                <td>${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                <td><span class="badge ${user.is_active ? 'bg-success' : 'bg-secondary'}">${user.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary edit-user-btn" data-id="${user.id}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-user-btn" data-id="${user.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Add event listeners to the new buttons
        document.querySelectorAll('.edit-user-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.getAttribute('data-id');
                editUser(userId);
            });
        });

        document.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.getAttribute('data-id');
                deleteUser(userId);
            });
        });
    });
}

function setupEventListeners() {
    // Save settings forms
    generalSettingsForm.addEventListener('submit', saveGeneralSettings);
    companySettingsForm.addEventListener('submit', saveCompanySettings);
    appearanceSettingsForm.addEventListener('submit', saveAppearanceSettings);

    // Backup buttons
    createBackupBtn.addEventListener('click', createBackup);
    restoreBackupBtn.addEventListener('click', () => {
        ipcRenderer.send('open-backup-dialog');
    });

    // User management
    addUserBtn.addEventListener('click', () => {
        document.getElementById('userModalTitle').textContent = 'Add New User';
        document.getElementById('user-id').value = '';
        document.getElementById('user-form').reset();
        userModal.show();
    });

    saveUserBtn.addEventListener('click', saveUser);

    // Logo preview
    document.getElementById('logo').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const logoPreview = document.getElementById('logo-preview');
                logoPreview.src = event.target.result;
                logoPreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    // Listen for backup created event
    ipcRenderer.on('backup-created', (event, backupPath) => {
        alert(`Backup created successfully at:\n${backupPath}`);
        loadBackupHistory();
    });

    // Listen for backup restored event
    ipcRenderer.on('backup-restored', (event, result) => {
        const restoreStatus = document.getElementById('restore-status');
        if (result.success) {
            restoreStatus.innerHTML = '<div class="alert alert-success">Backup restored successfully!</div>';
            setTimeout(() => {
                restoreStatus.innerHTML = '';
            }, 3000);
        } else {
            restoreStatus.innerHTML = '<div class="alert alert-danger">Failed to restore backup!</div>';
        }
    });
}

function saveGeneralSettings(e) {
    e.preventDefault();
    
    const settings = {
        currency: document.getElementById('currency').value,
        dateFormat: document.getElementById('date-format').value,
        timeFormat: document.getElementById('time-format').value,
        language: document.getElementById('language').value,
        lowStockThreshold: parseInt(document.getElementById('low-stock-threshold').value),
        backupFrequency: document.getElementById('backup-frequency').value
    };

    ipcRenderer.invoke('save-settings', { type: 'general', settings }).then(() => {
        alert('General settings saved successfully!');
    });
}

function saveCompanySettings(e) {
    e.preventDefault();
    
    const logoInput = document.getElementById('logo');
    let logoData = '';
    
    if (logoInput.files.length > 0) {
        const file = logoInput.files[0];
        const reader = new FileReader();
        reader.onload = function(event) {
            logoData = event.target.result;
            saveCompanySettingsData(logoData);
        };
        reader.readAsDataURL(file);
    } else {
        const logoPreview = document.getElementById('logo-preview');
        logoData = logoPreview.src || '';
        saveCompanySettingsData(logoData);
    }
}

function saveCompanySettingsData(logoData) {
    const settings = {
        name: document.getElementById('company-name').value,
        taxId: document.getElementById('tax-id').value,
        phone: document.getElementById('phone').value,
        email: document.getElementById('email').value,
        address: document.getElementById('address').value,
        logo: logoData
    };

    ipcRenderer.invoke('save-settings', { type: 'company', settings }).then(() => {
        alert('Company settings saved successfully!');
    });
}

function saveAppearanceSettings(e) {
    e.preventDefault();
    
    const settings = {
        theme: document.getElementById('theme').value,
        primaryColor: document.getElementById('primary-color').value,
        navStyle: document.getElementById('nav-style').value,
        fontSize: document.getElementById('font-size').value,
        compactMode: document.getElementById('compact-mode').checked
    };

    ipcRenderer.invoke('save-settings', { type: 'appearance', settings }).then(() => {
        alert('Appearance settings saved successfully!');
        // Apply theme immediately
        ipcRenderer.send('apply-theme', settings.theme);
    });
}

function createBackup() {
    createBackupBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Creating...';
    createBackupBtn.disabled = true;
    
    ipcRenderer.invoke('create-backup').then(backupPath => {
        createBackupBtn.innerHTML = '<i class="bi bi-download"></i> Create Backup';
        createBackupBtn.disabled = false;
        alert(`Backup created successfully at:\n${backupPath}`);
        loadBackupHistory();
    }).catch(error => {
        createBackupBtn.innerHTML = '<i class="bi bi-download"></i> Create Backup';
        createBackupBtn.disabled = false;
        alert('Failed to create backup: ' + error.message);
    });
}

function restoreBackup(backupPath) {
    if (confirm('Are you sure you want to restore this backup? All current data will be replaced.')) {
        restoreBackupBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Restoring...';
        restoreBackupBtn.disabled = true;
        
        ipcRenderer.invoke('restore-backup', backupPath).then(result => {
            restoreBackupBtn.innerHTML = '<i class="bi bi-upload"></i> Restore Backup';
            restoreBackupBtn.disabled = false;
            
            if (result.success) {
                alert('Backup restored successfully!');
            } else {
                alert('Failed to restore backup!');
            }
        });
    }
}

function deleteBackup(backupPath) {
    if (confirm('Are you sure you want to delete this backup?')) {
        ipcRenderer.invoke('delete-backup', backupPath).then(() => {
            loadBackupHistory();
        });
    }
}

function editUser(userId) {
    ipcRenderer.invoke('get-user', userId).then(user => {
        document.getElementById('userModalTitle').textContent = 'Edit User';
        document.getElementById('user-id').value = user.id;
        document.getElementById('username').value = user.username;
        document.getElementById('full-name').value = user.full_name || '';
        document.getElementById('user-email').value = user.email || '';
        document.getElementById('role').value = user.role;
        document.getElementById('password').value = '';
        document.getElementById('confirm-password').value = '';
        
        userModal.show();
    });
}

function saveUser() {
    const user = {
        id: document.getElementById('user-id').value || null,
        username: document.getElementById('username').value,
        full_name: document.getElementById('full-name').value,
        email: document.getElementById('user-email').value,
        role: document.getElementById('role').value,
        password: document.getElementById('password').value,
        confirm_password: document.getElementById('confirm-password').value
    };

    if (user.password && user.password !== user.confirm_password) {
        alert('Passwords do not match!');
        return;
    }

    saveUserBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Saving...';
    saveUserBtn.disabled = true;
    
    ipcRenderer.invoke('save-user', user).then(result => {
        saveUserBtn.innerHTML = 'Save User';
        saveUserBtn.disabled = false;
        
        if (result.success) {
            userModal.hide();
            loadUsers();
        } else {
            alert(result.message || 'Failed to save user!');
        }
    });
}

function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
        ipcRenderer.invoke('delete-user', userId).then(() => {
            loadUsers();
        });
    }
}

// Helper functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getRoleBadgeClass(role) {
    switch(role.toLowerCase()) {
        case 'admin': return 'bg-danger';
        case 'manager': return 'bg-primary';
        case 'sales': return 'bg-success';
        default: return 'bg-secondary';
    }
}