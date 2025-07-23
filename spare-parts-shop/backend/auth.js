const { ipcMain } = require('electron');
const db = require('./db.js');

// ڈیفالٹ صارف (اگر ڈیٹابیس خالی ہو)
const setupDefaultUser = async () => {
    const users = await db.all('SELECT * FROM users');
    if (users.length === 0) {
        await db.run(
            'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
            ['admin', 'admin123', 'admin']
        );
    }
};

// لاگ ان چیک کریں
ipcMain.on('login-attempt', async (event, { username, password }) => {
    const user = await db.get(
        'SELECT * FROM users WHERE username = ? AND password = ?',
        [username, password]
    );
    
    if (user) {
        event.sender.send('login-result', { 
            success: true,
            user: { username: user.username, role: user.role }
        });
    } else {
        event.sender.send('login-result', { 
            success: false,
            message: 'Invalid credentials!'
        });
    }
});

// ڈیفالٹ صارف کو شامل کریں
setupDefaultUser();