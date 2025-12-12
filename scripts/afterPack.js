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
        // rcedit es un ejecutable, no una función directa en todas las versiones.
        // Si la librería falla al importarse como función, usamos child_process para llamarla o intentamos require alternativo.
        // En versiones recientes de rcedit npm wrapper, a veces es necesario llamar al binario.
        // Pero intentemos primero verificar la importación.
        
        // Fix: rcedit v3+ returns a promise directly, but sometimes it needs to be imported differently depending on environment
        // Vamos a usar una forma más robusta invocando el ejecutable si la función falla, o arreglando el require.
        
        // Intento directo con la librería
        // Fix for rcedit returning an object in some versions
        const rceditFunc = typeof rcedit === 'function' ? rcedit : rcedit.rcedit;
        
        if (typeof rceditFunc !== 'function') {
             throw new Error(`rcedit is not a function. It is: ${typeof rcedit}`);
        }

        await rceditFunc(exePath, {
            'icon': iconPath,
            'version-string': {
                'FileDescription': 'Inmobiliaria Manager',
                'ProductName': 'Inmobiliaria Manager',
                'LegalCopyright': 'Victor Muñoz'
            }
        });
        console.log('✅ [Hook] Icono parcheado correctamente antes de empaquetar.');
    } catch (error) {
        // Fallback: Si rcedit function falla, intentamos no romper el build
        console.error(`❌ [Hook] Error parcheando icono: ${error.message}. Intentando continuar...`);
    }
}
