# 🏠 Sistema Completo de Gestión Inmobiliaria

Sistema integral de automatización inmobiliaria con web scraping, gestión de clientes, generación de mensajes con IA y panel de administración moderno. Ahora disponible como aplicación de escritorio multiplataforma.

## 🚀 Características Principales

### ✅ Aplicación de Escritorio (Electron)
- **Instalable (.exe)**: Todo en uno (Frontend + Backend).
- **Auto-Actualización**: Recibe mejoras y correcciones automáticamente.
- **Multiplataforma**: Soporte para Windows, macOS y Linux.

### ✅ Backend API (Node.js + Express)
- **Ejecución de scrapers**: Integración con scripts Python.
- **Gestión de propiedades**: Carga y sirve datos estructurados.
- **CRUD de Clientes**: Gestión completa de base de datos de clientes.
- **Integración WhatsApp**: Envío de mensajes automáticos (Web JS).
- **Email Support**: Envío de correos transaccionales y de soporte.

### ✅ Frontend (React + Vite)
- **Panel de Control**: Diseño moderno y responsivo.
- **Gestión Visual**: Tablas de propiedades y clientes con filtros avanzados.
- **Generador IA**: Creación de mensajes personalizados.
- **Soporte Técnico**: Modal integrado para contactar al desarrollador.

## 🛠️ Requisitos Previos

- **Node.js** (v16 o superior)
- **Python 3.8+** (para ejecutar los scrapers)
- **Google Chrome** (para Selenium y Puppeteer)

## 📁 Estructura del Proyecto

```
inmobiliaria/
├── electron/              # Configuración de la App de Escritorio
│   └── main.js            # Proceso principal de Electron
├── frontend/              # Aplicación React (UI)
├── backend/               # Servidor API y Lógica de Negocio
├── scrapers/              # Scripts de Python (Selenium)
├── data/                  # Almacenamiento local (JSON)
├── release/               # Ejecutables generados (.exe)
├── package.json           # Configuración raíz y scripts de build
└── README.md
```

## 🚀 Desarrollo Local

1.  **Instalar dependencias (Raíz, Frontend y Backend):**

    ```bash
    # En la raíz
    npm install
    
    # Frontend
    cd frontend
    npm install
    
    # Backend
    cd backend
    npm install
    ```

2.  **Modo Desarrollo (Web):**

    ```bash
    # En la raíz (ejecuta ambos servidores concurrentemente)
    npm run dev
    ```

3.  **Modo Desarrollo (Electron):**

    ```bash
    npm run electron:dev
    ```

## 📦 Construcción y Distribución (Build)

Para generar el instalable (`.exe` para Windows, `.dmg` para Mac, etc.):

```bash
# Generar instalables para el sistema operativo actual
npm run dist
```

Los archivos generados estarán en la carpeta `release/`.

### Sistema de Auto-Actualización
La aplicación busca actualizaciones automáticamente en el repositorio de GitHub configurado.
Para liberar una nueva versión:
1. Actualizar versión en `package.json`.
2. Commitear y pushear cambios.
3. Ejecutar `npm run dist` con las credenciales de GitHub configuradas (GH_TOKEN).

## ⚖️ Licencia

Este proyecto está bajo la Licencia **Apache 2.0**. Ver el archivo `LICENSE` para más detalles.

---
**Desarrollado por Victor Muñoz Lopez**
