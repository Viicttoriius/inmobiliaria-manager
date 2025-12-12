const rcedit = require('rcedit');
const path = require('path');
const fs = require('fs');

exports.default = async function(context) {
    // Solo aplicar en Windows
    if (context.electronPlatformName !== 'win32') {
        return;
    }

    const appOutDir = context.appOutDir;
    // Nombre del ejecutable (usualmente coincide con productName)
    const appName = context.packager.appInfo.productFilename;
    const exePath = path.join(appOutDir, `${appName}.exe`);
    
    // Ruta al icono
    const iconPath = path.resolve(__dirname, '../build/icon.ico');

    if (!fs.existsSync(iconPath)) {
        console.warn(`⚠️ Icono no encontrado en: ${iconPath}`);
        return;
    }

    console.log(`🔨 [Hook] Usando rcedit para parchear icono en: ${exePath}`);

    try {
        await rcedit(exePath, {
            'icon': iconPath,
            'version-string': {
                'FileDescription': 'Inmobiliaria Manager',
                'ProductName': 'Inmobiliaria Manager',
                'LegalCopyright': 'Victor Muñoz'
            }
        });
        console.log('✅ [Hook] Icono parcheado correctamente antes de empaquetar.');
    } catch (error) {
        console.error(`❌ [Hook] Error parcheando icono: ${error.message}`);
    }
}
