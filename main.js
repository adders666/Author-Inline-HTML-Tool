const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let lastSavePath = null;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    const entry = path.join(__dirname, 'BookAuthor-lite.html');
    mainWindow.loadFile(entry);
};

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('save-state', async (_event, data) => {
    try {
        let targetPath = lastSavePath;
        if (!targetPath) {
            const { canceled, filePath } = await dialog.showSaveDialog({
                title: 'Save Book State',
                defaultPath: path.join(app.getPath('documents'), 'book-state.json'),
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });
            if (canceled || !filePath) return { ok: false, message: 'Save canceled' };
            targetPath = filePath;
            lastSavePath = filePath;
        }
        fs.writeFileSync(targetPath, data, 'utf8');
        return { ok: true, path: targetPath };
    } catch (e) {
        return { ok: false, message: e.message };
    }
});

ipcMain.handle('save-state-as', async (_event, data) => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Save Book State As',
            defaultPath: path.join(app.getPath('documents'), 'book-state.json'),
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (canceled || !filePath) return { ok: false, message: 'Save canceled' };
        fs.writeFileSync(filePath, data, 'utf8');
        lastSavePath = filePath;
        return { ok: true, path: filePath };
    } catch (e) {
        return { ok: false, message: e.message };
    }
});

ipcMain.handle('load-state', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Load Book State',
            properties: ['openFile'],
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (canceled || !filePaths || !filePaths[0]) return { ok: false, message: 'Load canceled' };
        const data = fs.readFileSync(filePaths[0], 'utf8');
        lastSavePath = filePaths[0];
        return { ok: true, data };
    } catch (e) {
        return { ok: false, message: e.message };
    }
});

ipcMain.handle('export-pdf', async (_event) => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Export PDF',
            defaultPath: path.join(app.getPath('documents'), 'book-export.pdf'),
            filters: [{ name: 'PDF', extensions: ['pdf'] }]
        });
        if (canceled || !filePath) return { ok: false, message: 'Export canceled' };

        const pdf = await mainWindow.webContents.printToPDF({
            margins: { marginType: 'none' },
            printBackground: true,
            landscape: false,
            pageSize: { width: 6 * 72, height: 9 * 72 }
        });
        fs.writeFileSync(filePath, pdf);
        return { ok: true, path: filePath };
    } catch (e) {
        return { ok: false, message: e.message };
    }
});
