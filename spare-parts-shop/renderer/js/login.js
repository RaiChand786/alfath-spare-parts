const { ipcRenderer } = require('electron');

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    ipcRenderer.send('login-attempt', { username, password });
});

ipcRenderer.on('login-result', (event, result) => {
    const errorMsg = document.getElementById('error-msg');
    
    if (result.success) {
        window.location.href = '../index.html'; // ڈیش بورڈ پر ری ڈائریکٹ
    } else {
        errorMsg.textContent = result.message || 'غلط صارف نام یا پاس ورڈ!';
    }
});