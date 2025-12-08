const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEST_DIR = path.join(__dirname, 'python_env');

// Asegurar que el directorio existe para evitar errores en electron-builder (extraResources)
if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR);
}

if (process.platform !== 'win32') {
    console.log('ℹ️ No estamos en Windows. Creando marcador de posición para evitar errores de build.');
    fs.writeFileSync(path.join(DEST_DIR, 'placeholder.txt'), 'Python environment is handled by the system on non-Windows platforms.');
    process.exit(0);
}

const PYTHON_VERSION = '3.11.9';
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const ZIP_FILE = path.join(__dirname, 'python.zip');
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';
const GET_PIP_FILE = path.join(DEST_DIR, 'get-pip.py');

console.log('🚀 Iniciando instalación automática de Python Portable...');

try {
    // 1. Limpiar directorio si existe (para asegurar instalación limpia en Windows)
    if (fs.existsSync(DEST_DIR)) {
         console.log('ℹ️ Limpiando directorio para instalación limpia...');
         // En Windows, fs.rmSync puede fallar si hay archivos bloqueados, pero en CI debería estar bien
         try {
            fs.rmSync(DEST_DIR, { recursive: true, force: true });
         } catch(e) { console.warn('No se pudo borrar completamente, intentando continuar...'); }
         fs.mkdirSync(DEST_DIR, { recursive: true });
    } else {
        fs.mkdirSync(DEST_DIR, { recursive: true });
    }

    // 2. Descargar Python ZIP
    console.log(`⬇️ Descargando Python ${PYTHON_VERSION}...`);
    // Usar curl.exe si está disponible (Windows 10+ lo trae), si no fallback a PowerShell
    try {
        execSync(`curl -L "${PYTHON_URL}" -o "${ZIP_FILE}"`, { stdio: 'inherit' });
    } catch (e) {
        console.log('⚠️ curl falló, intentando con PowerShell...');
        execSync(`powershell -command "Invoke-WebRequest -Uri '${PYTHON_URL}' -OutFile '${ZIP_FILE}'"`, { stdio: 'inherit' });
    }

    // 3. Descomprimir
    console.log('📦 Descomprimiendo...');
    execSync(`powershell -command "Expand-Archive -Path '${ZIP_FILE}' -DestinationPath '${DEST_DIR}' -Force"`, { stdio: 'inherit' });

    // 4. Eliminar ZIP
    if (fs.existsSync(ZIP_FILE)) fs.unlinkSync(ZIP_FILE);

    // 5. Configurar ._pth para permitir pip (import site)
    // El nombre del archivo depende de la versión, ej python311._pth
    const pthFileName = `python${PYTHON_VERSION.split('.').slice(0,2).join('')}._pth`;
    const pthFile = path.join(DEST_DIR, pthFileName);
    
    console.log(`⚙️ Configurando ${pthFileName}...`);
    if (fs.existsSync(pthFile)) {
        let content = fs.readFileSync(pthFile, 'utf8');
        // Descomentar 'import site'
        content = content.replace('#import site', 'import site');
        fs.writeFileSync(pthFile, content);
    } else {
        console.error(`❌ No se encontró el archivo ${pthFileName}. Pip podría fallar.`);
    }

    // 6. Descargar get-pip.py
    console.log('⬇️ Descargando get-pip.py...');
    try {
        execSync(`curl -L "${GET_PIP_URL}" -o "${GET_PIP_FILE}"`, { stdio: 'inherit' });
    } catch (e) {
         execSync(`powershell -command "Invoke-WebRequest -Uri '${GET_PIP_URL}' -OutFile '${GET_PIP_FILE}'"`, { stdio: 'inherit' });
    }

    // 7. Instalar pip
    console.log('🔧 Instalando pip...');
    const pythonExe = path.join(DEST_DIR, 'python.exe');
    execSync(`"${pythonExe}" "${GET_PIP_FILE}"`, { stdio: 'inherit' });

    // 8. Instalar dependencias
    const reqFile = path.join(__dirname, 'requirements.txt');
    if (fs.existsSync(reqFile)) {
        console.log('📚 Instalando dependencias desde requirements.txt...');
        execSync(`"${pythonExe}" -m pip install -r "${reqFile}"`, { stdio: 'inherit' });
    }

    // Limpieza final
    if (fs.existsSync(GET_PIP_FILE)) fs.unlinkSync(GET_PIP_FILE);

    console.log('\n✅✅✅ INSTALACIÓN COMPLETADA EXITOSAMENTE ✅✅✅');
    console.log(`Python Portable listo en: ${DEST_DIR}`);

} catch (error) {
    console.error('\n❌ ERROR CRÍTICO durante la instalación:', error.message);
    process.exit(1);
}
