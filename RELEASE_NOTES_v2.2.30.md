# Notas de la Versión v2.2.30

## 🔧 Correcciones de Infraestructura (CI/CD)
- **Corrección de Build en macOS (Arquitectura Dual):**
  - **Problema:** La compilación unificada fallaba porque el módulo nativo `better-sqlite3` no puede compilarse para `x64` y `arm64` simultáneamente en un solo paso; requiere una recompilación explícita para cada arquitectura antes de empaquetar.
  - **Solución:** Se ha dividido el trabajo de macOS en pasos secuenciales estrictos dentro del mismo runner:
    1.  Recompilar backend para `x64`.
    2.  Empaquetar y publicar versión `x64`.
    3.  Recompilar backend para `arm64`.
    4.  Empaquetar y publicar versión `arm64`.
  - **Resultado:** Esto asegura que cada ejecutable (`.dmg` / `.zip`) contenga los binarios nativos correctos para su procesador (Intel vs Apple Silicon) y elimina el error de compilación.
