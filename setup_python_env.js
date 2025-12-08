const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const PYTHON_VERSION = '3.11.9';
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';
const DEST_DIR = path.join(__dirname, 'backend', 'python_env');
const ZIP_FILE = path.join(__dirname, 'python.zip');
const GET_PIP_FILE = path.join(DEST_DIR, 'get-pip.py');

console.log('🚀 Iniciando configuración de entorno Python Portable...');

// 1. Crear directorio destino
if (fs.existsSync(DEST_DIR)) {
    console.log('🗑️  Limpiando instalación previa...');
    fs.rmSync(DEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DEST_DIR, { recursive: true });

// Función de descarga
const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Fallo descarga: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
};

(async () => {
    try {
        // 2. Descargar Python
        console.log(`⬇️  Descargando Python ${PYTHON_VERSION}...`);
        await downloadFile(PYTHON_URL, ZIP_FILE);

        // 3. Descomprimir (Usando PowerShell)
        console.log('📦 Descomprimiendo...');
        execSync(`powershell -Command "Expand-Archive -Path '${ZIP_FILE}' -DestinationPath '${DEST_DIR}' -Force"`);
        
        // Borrar zip
        fs.unlinkSync(ZIP_FILE);

        // 4. Configurar .pth para permitir pip
        console.log('⚙️  Configurando python311._pth...');
        const pthFile = path.join(DEST_DIR, 'python311._pth');
        if (fs.existsSync(pthFile)) {
            let content = fs.readFileSync(pthFile, 'utf8');
            // Descomentar 'import site'
            content = content.replace('#import site', 'import site');
            fs.writeFileSync(pthFile, content);
        }

        // 5. Descargar get-pip.py
        console.log('⬇️  Descargando get-pip.py...');
        await downloadFile(PIP_URL, GET_PIP_FILE);

        // 6. Instalar pip
        console.log('🔧 Instalando pip...');
        const pythonExe = path.join(DEST_DIR, 'python.exe');
        execSync(`"${pythonExe}" "${GET_PIP_FILE}"`, { stdio: 'inherit' });

        // 7. Instalar requerimientos
        console.log('📚 Instalando librerías (selenium, beautifulsoup4)...');
        const requirementsPath = path.join(__dirname, 'backend', 'requirements.txt');
        execSync(`"${pythonExe}" -m pip install -r "${requirementsPath}"`, { stdio: 'inherit' });

        // Limpieza final
        if (fs.existsSync(GET_PIP_FILE)) fs.unlinkSync(GET_PIP_FILE);

        console.log('\n✅ Entorno Python Portable configurado exitosamente en backend/python_env');
        console.log('   Ahora la aplicación puede usar este Python sin instalación en el sistema.');

    } catch (error) {
        console.error('\n❌ Error durante la configuración:', error);
        process.exit(1);
    }
})();
