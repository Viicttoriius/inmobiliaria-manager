# Notas de la Versión v2.2.36

## 📦 Visibilidad de Release Garantizada
- **Creación Explícita de Release:**
  - Se ha añadido un nuevo paso (`create-release`) al inicio del flujo de despliegue.
  - **Beneficio:** Esto garantiza que la entrada de la Release se cree en GitHub **inmediatamente** al subir el tag, independientemente de si los builds de los instaladores tardan o fallan después.
  - Ahora verás la Release como un "Draft" (Borrador) con estas notas al instante, y los instaladores (`.exe`, `.dmg`, `.AppImage`) se irán adjuntando a medida que terminen de compilarse.
- **Incluye todas las mejoras de estabilidad previas:**
  - Build unificado de macOS.
  - Reintentos en limpieza de assets para evitar error 422.
