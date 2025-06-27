const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = 3000;

// 文件名编码处理
const fixFilenameEncoding = (filename) => {
    try {
        if (Buffer.from(filename, 'latin1').toString('latin1') === filename) {
            return Buffer.from(filename, 'latin1').toString('utf8');
        }
        return filename;
    } catch (e) {
        console.error('文件名编码处理失败:', e);
        return `file_${Date.now()}`;
    }
};

// 配置multer存储
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        try {
            const safeName = fixFilenameEncoding(file.originalname);
            cb(null, safeName);
        } catch (error) {
            console.error('文件名处理错误:', error);
            cb(null, `file_${Date.now()}`);
        }
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024,
        files: 1
    }
});

// 创建上传目录
fs.mkdirSync('uploads', { recursive: true });

// 中间件设置
app.use(express.static('public'));
app.use((req, res, next) => {
    res.header('Content-Type', 'text/html; charset=utf-8');
    next();
});

// 首页路由
app.get('/', (req, res) => {
    try {
        const files = fs.readdirSync('uploads', { encoding: 'utf8' });
        const fileItems = files
            .filter(file => !file.startsWith('.'))
            .map(file => `
                <div class="file-item">
                    <div class="file-name">${file}</div>
                    <div class="file-actions">
                        <a href="/download/${encodeURIComponent(file)}" class="download-btn">下载</a>
                        <a href="/delete/${encodeURIComponent(file)}" class="delete-btn">删除</a>
                    </div>
                </div>
            `).join('');

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>文件共享</title>
                <style>
    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }
    body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 20px;
        max-width: 100%;
        overflow-x: hidden;
    }
    .container {
        max-width: 1000px;
        margin: 0 auto;
        padding: 0 15px;
    }
    h1 {
        margin-bottom: 20px;
    }
    .upload-form {
        margin-bottom: 30px;
    }
    .file-list {
        width: 100%;
        border: 1px solid #ddd;
        border-radius: 4px;
        overflow: hidden;
    }
    .file-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 15px;
        border-bottom: 1px solid #eee;
        width: 100%;
    }
    .file-item:last-child {
        border-bottom: none;
    }
    .file-name {
        flex: 1;
        word-break: break-word;  /* 允许长单词和URL换行 */
        white-space: normal;     /* 覆盖nowrap，允许换行 */
        overflow: hidden;
        padding-right: 15px;
    }
    .file-actions {
        flex-shrink: 0;
        display: flex;
        gap: 10px; /* 按钮间距 */
    }
    .download-btn, .delete-btn {
        display: inline-block;
        padding: 5px 12px;
        text-decoration: none;
        border-radius: 3px;
        font-size: 14px;
        white-space: nowrap; /* 按钮文字不换行 */
    }
    .download-btn {
        background-color: #4CAF50;
        color: white;
    }
    .delete-btn {
        background-color: #f44336;
        color: white;
    }
    #uploadStatus {
        margin: 10px 0;
        color: #666;
    }
    @media (max-width: 600px) {
        .file-item {
            flex-direction: column;
            align-items: flex-start;
        }
        .file-actions {
            margin-top: 8px;
            width: 100%;
            justify-content: flex-end;
        }
    }
</style>
            </head>
            <body>
                <div class="container">
                    <h1>文件共享</h1>
                    <form action="/upload" method="post" enctype="multipart/form-data" class="upload-form">
                        <input type="file" name="file" id="fileInput">
                        <button type="submit">上传</button>
                    </form>
                    <div id="uploadStatus"></div>
                    <h2>文件列表</h2>
                    <div class="file-list">
                        ${fileItems || '<p style="padding: 15px;">暂无文件</p>'}
                    </div>
                </div>
                <script>
                    document.getElementById('fileInput').addEventListener('change', function() {
                        const statusDiv = document.getElementById('uploadStatus');
                        if(this.files.length > 0) {
                            statusDiv.textContent = '已选择文件: ' + this.files[0].name;
                        }
                    });
                </script>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('页面错误:', err);
        res.status(500).send('服务器错误');
    }
});

// 文件上传处理
app.post('/upload', (req, res, next) => {
    req.setTimeout(30 * 1000, () => {
        if (!res.headersSent) {
            res.status(408).send('上传超时');
        }
    });

    upload.single('file')(req, res, (err) => {
        if (err) {
            console.error('上传错误:', err);
            if (!res.headersSent) {
                return res.status(500).send('上传失败: ' + err.message);
            }
        }
        if (!req.file) {
            return res.status(400).send('没有选择文件');
        }
        res.redirect('/');
    });
});

// 文件下载处理
app.get('/download/:filename', (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(__dirname, 'uploads', filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('文件不存在');
    }

    const fileStream = fs.createReadStream(filePath);

    fileStream.on('error', (err) => {
        if (!res.headersSent) {
            res.status(500).send('下载出错');
        }
        console.error('下载错误:', err);
    });

    req.on('close', () => {
        fileStream.destroy();
    });

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    fileStream.pipe(res);
});

// 文件删除处理
app.get('/delete/:filename', (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(__dirname, 'uploads', filename);

    try {
        fs.unlinkSync(filePath);
        res.redirect('/');
    } catch (err) {
        console.error('删除错误:', err);
        res.status(404).send('文件不存在');
    }
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    const network = os.networkInterfaces();
    let ip = 'localhost';

    Object.keys(network).forEach(dev => {
        network[dev].forEach(addr => {
            if (addr.family === 'IPv4' && !addr.internal) {
                ip = addr.address;
            }
        });
    });

    console.log(`服务器已启动:`);
    console.log(`- 本地访问: http://localhost:${PORT}`);
    console.log(`- 局域网访问: http://${ip}:${PORT}`);
});