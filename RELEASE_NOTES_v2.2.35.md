# Notas de la Versión v2.2.35

## 🚀 Mantenimiento y Estabilidad
- **Verificación de Build macOS:**
  - Esta versión consolida las correcciones críticas en el flujo de trabajo de GitHub Actions para macOS:
    1.  **Unificación de Arquitecturas:** Compilación simultánea de x64 y arm64 para evitar conflictos en `latest-mac.yml`.
    2.  **Hook `beforePack`:** Recompilación automática de dependencias nativas (`better-sqlite3`) antes del empaquetado.
    3.  **Cleanup Robusto:** Mecanismo de reintento y verificación para la limpieza de assets previos, eliminando el error 422.
- **Sin cambios funcionales en el código fuente:** Esta release asegura que la infraestructura de despliegue funcione correctamente para futuras actualizaciones.
