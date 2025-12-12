const rcedit = require('rcedit');
const path = require('path');
const fs = require('fs');

async function fixIcon() {
    const exePath = path.resolve(__dirname, '../dist/win-unpacked/Inmobiliaria Manager.exe');
    const iconPath = path.resolve(__dirname, '../build/icon.ico');

    if (!fs.existsSync(exePath)) {
        console.error(`❌ No se encontró el ejecutable en: ${exePath}`);
        console.error('   Asegúrate de haber ejecutado "npm run dist" primero.');
        return;
    }

    if (!fs.existsSync(iconPath)) {
        console.error(`❌ No se encontró el icono en: ${iconPath}`);
        return;
    }

    console.log(`🔨 Usando rcedit para forzar el icono...`);
    console.log(`   EXE: ${exePath}`);
    console.log(`   ICONO: ${iconPath}`);

    try {
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
        console.log('✅ Icono y metadatos actualizados con éxito.');
    } catch (err) {
        console.error('❌ Error actualizando el icono:', err);
    }
}

fixIcon();
