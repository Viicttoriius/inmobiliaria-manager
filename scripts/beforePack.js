const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(context) {
    // Map Arch enum to string if necessary
    // Arch: 0=ia32, 1=x64, 2=armv7l, 3=arm64
    const Arch = {
        0: 'ia32',
        1: 'x64',
        2: 'armv7l',
        3: 'arm64'
    };

    let archName = context.arch;
    if (typeof archName === 'number') {
        archName = Arch[archName];
    }

    console.log(`[beforePack] Starting backend rebuild for Platform: ${context.electronPlatformName}, Arch: ${archName} (${context.arch})`);

    // Only proceed if we are in the main project root (sanity check)
    const projectRoot = path.resolve(__dirname, '..');
    
    // Command to rebuild backend
    // We use npx electron-rebuild directly to ensure we use the local dependency
    // --module-dir backend: targets the backend submodule
    // -f: force rebuild
    // -w better-sqlite3: only rebuild this module (optional, but faster) -> Actually we want to rebuild all native deps if any others exist
    // But currently only better-sqlite3 is critical.
    const cmd = `npx electron-rebuild --module-dir backend -f -w better-sqlite3 --arch ${archName}`;

    try {
        console.log(`[beforePack] Executing: ${cmd}`);
        execSync(cmd, {
            cwd: projectRoot,
            stdio: 'inherit'
        });
        console.log(`[beforePack] ✅ Rebuild successful for ${archName}`);
    } catch (error) {
        console.error(`[beforePack] ❌ Rebuild failed for ${archName}`);
        throw error;
    }
};
