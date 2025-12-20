# Notas de la Versión v2.2.32

## 🛠️ Mejoras en Infraestructura (CI/CD)
- **Corrección en Workflow de Release (GitHub Actions):**
  - **Problema:** Error 422 Unprocessable Entity al reintentar builds, debido a que los assets existentes no se eliminaban correctamente antes de subir los nuevos.
  - **Solución:**
    - Se ha mejorado el script de "Cleanup Existing Assets".
    - Ahora verifica explícitamente la autenticación de `gh` CLI.
    - Se han ampliado los patrones de borrado para cubrir todos los archivos generados por `electron-builder` en Windows (`.exe`, `latest.yml`), macOS (`.dmg`, `.zip`, `latest-mac.yml`, `-mac-`) y Linux (`.AppImage`, `latest-linux.yml`).
    - Se añade verificación final para asegurar que los assets han sido eliminados antes de proceder con el build.
