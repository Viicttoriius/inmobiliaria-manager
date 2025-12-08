const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEST_DIR = path.join(__dirname, 'python_env');

// Asegurar que el directorio existe para evitar errores en electron-builder
if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
}

// Configuración de versiones
const CONFIG = {
    win32: {
        url: 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip',
        filename: 'python.zip',
        extractCmd: (src, dest) => `powershell -command "Expand-Archive -Path '${src}' -DestinationPath '${dest}' -Force"`,
        postInstall: (dest) => {
            // Habilitar pip en python._pth
            const pthFile = path.join(dest, 'python311._pth');
            if (fs.existsSync(pthFile)) {
                let content = fs.readFileSync(pthFile, 'utf8');
                content = content.replace('#import site', 'import site');
                fs.writeFileSync(pthFile, content);
            }
        }
    },
    linux: {
        // Python 3.11.14 Standalone
        url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20251010/cpython-3.11.14+20251010-x86_64-unknown-linux-gnu-install_only.tar.gz',
        filename: 'python.tar.gz',
        extractCmd: (src, dest) => `tar -xzf "${src}" -C "${dest}" --strip-components=1`, 
        postInstall: () => {}
    },
    darwin: {
        // Python 3.11.14 Standalone
        url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20251010/cpython-3.11.14+20251010-x86_64-apple-darwin-install_only.tar.gz',
        filename: 'python.tar.gz',
        extractCmd: (src, dest) => `tar -xzf "${src}" -C "${dest}" --strip-components=1`,
        postInstall: () => {}
    }
};

const currentConfig = CONFIG[process.platform];

if (!currentConfig) {
    console.error(`❌ Plataforma no soportada para Python Portable: ${process.platform}`);
    process.exit(1);
}

const DOWNLOAD_FILE = path.join(__dirname, currentConfig.filename);
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';
const GET_PIP_FILE = path.join(DEST_DIR, 'get-pip.py');

console.log(`🚀 Iniciando instalación automática de Python Portable para ${process.platform}...`);

try {
    // 1. Limpiar directorio
    if (fs.existsSync(DEST_DIR)) {
        console.log('ℹ️ Limpiando directorio anterior...');
        try {
            fs.rmSync(DEST_DIR, { recursive: true, force: true });
        } catch(e) { /* ignore windows lock */ }
        fs.mkdirSync(DEST_DIR, { recursive: true });
    }

    // 2. Descargar Python
    console.log(`⬇️ Descargando Python desde ${currentConfig.url}...`);
    try {
        execSync(`curl -L -f "${currentConfig.url}" -o "${DOWNLOAD_FILE}"`, { stdio: 'inherit' });
    } catch (e) {
        if (process.platform === 'win32') {
             execSync(`powershell -command "Invoke-WebRequest -Uri '${currentConfig.url}' -OutFile '${DOWNLOAD_FILE}'"`, { stdio: 'inherit' });
        } else {
            throw e;
        }
    }

    // 3. Descomprimir
    console.log('📦 Descomprimiendo...');
    try {
        execSync(currentConfig.extractCmd(DOWNLOAD_FILE, DEST_DIR), { stdio: 'inherit' });
    } catch(e) {
        console.error('Error descomprimiendo:', e);
        throw e;
    }

    // 4. Limpieza ZIP/Tar
    if (fs.existsSync(DOWNLOAD_FILE)) fs.unlinkSync(DOWNLOAD_FILE);

    // 5. Post-instalación específica (ej. .pth en windows)
    currentConfig.postInstall(DEST_DIR);

    // 6. Instalar PIP
    console.log('⬇️ Verificando/Instalando pip...');
    // Determinar ejecutable
    let pythonExe;
    if (process.platform === 'win32') {
        pythonExe = path.join(DEST_DIR, 'python.exe');
    } else {
        const binDir = path.join(DEST_DIR, 'bin');
        if (fs.existsSync(path.join(binDir, 'python3'))) {
            pythonExe = path.join(binDir, 'python3');
        } else if (fs.existsSync(path.join(binDir, 'python3.11'))) {
            pythonExe = path.join(binDir, 'python3.11');
        } else {
            // Fallback checking
            console.log('⚠️ No se encontró python3 ni python3.11 en bin. Listando contenido de bin:');
            try {
                if (fs.existsSync(binDir)) {
                    console.log(fs.readdirSync(binDir));
                } else {
                    console.log('Directorio bin no existe. Contenido de DEST_DIR:');
                    console.log(fs.readdirSync(DEST_DIR));
                }
            } catch(e) {}
            pythonExe = path.join(binDir, 'python3'); // Fallback default
        }
        
        // Dar permisos de ejecución en unix
        if (fs.existsSync(pythonExe)) {
            execSync(`chmod +x "${pythonExe}"`);
        }
    }

    if (fs.existsSync(pythonExe)) {
        // Intentar ensurepip primero (más robusto)
        try {
            console.log('🔧 Intentando instalar pip via ensurepip...');
            execSync(`"${pythonExe}" -m ensurepip`, { stdio: 'inherit' });
        } catch (e) {
            console.log('⚠️ ensurepip falló, intentando con get-pip.py...');
            try {
                execSync(`curl -L "${GET_PIP_URL}" -o "${GET_PIP_FILE}"`, { stdio: 'inherit' });
            } catch (err) {
                if (process.platform === 'win32') {
                     execSync(`powershell -command "Invoke-WebRequest -Uri '${GET_PIP_URL}' -OutFile '${GET_PIP_FILE}'"`, { stdio: 'inherit' });
                }
            }
    
            if (fs.existsSync(GET_PIP_FILE)) {
                console.log('🔧 Instalando pip via get-pip.py...');
                execSync(`"${pythonExe}" "${GET_PIP_FILE}"`, { stdio: 'inherit' });
                fs.unlinkSync(GET_PIP_FILE);
            }
        }

        const reqFile = path.join(__dirname, 'requirements.txt');
        if (fs.existsSync(reqFile)) {
            console.log('📚 Instalando dependencias...');
            execSync(`"${pythonExe}" -m pip install -r "${reqFile}"`, { stdio: 'inherit' });
        }
        
        // Limpieza pip
        if (fs.existsSync(GET_PIP_FILE)) fs.unlinkSync(GET_PIP_FILE);
        
        console.log('\n✅✅✅ INSTALACIÓN COMPLETADA ✅✅✅');
        console.log(`Python Portable instalado en: ${DEST_DIR}`);
    } else {
        console.error(`❌ No se encontró el ejecutable de Python en ${pythonExe}`);
        process.exit(1);
    }

} catch (error) {
    console.error('\n❌ ERROR CRÍTICO durante la instalación:', error.message);
    process.exit(1);
}

