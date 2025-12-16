!macro customInit
  ; Intentar cerrar la aplicación si está corriendo
  nsExec::Exec 'taskkill /F /IM "inmobiliaria-manager.exe"'
  nsExec::Exec 'taskkill /F /IM "Inmobiliaria Manager.exe"'
  Sleep 2000

  ; Verificar si Microsoft Edge está instalado
  ; Revisamos claves de registro comunes y rutas de archivo
  
  StrCpy $0 "false"
  
  ; Check Registry (Edge Stable)
  ReadRegStr $1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  ${If} $1 != ""
    StrCpy $0 "true"
  ${EndIf}
  
  ; Check File Paths (x86 and x64)
  ${If} $0 == "false"
    IfFileExists "$PROGRAMFILES86\Microsoft\Edge\Application\msedge.exe" foundEdge 0
    IfFileExists "$PROGRAMFILES\Microsoft\Edge\Application\msedge.exe" foundEdge 0
    Goto notFoundEdge
    
    foundEdge:
      StrCpy $0 "true"
  ${EndIf}
  
  notFoundEdge:
  ${If} $0 == "false"
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "Esta aplicación requiere Microsoft Edge para funcionar correctamente (WhatsApp y Scrapers).$\n$\nNo se ha detectado Microsoft Edge en su sistema.$\n$\n¿Desea descargarlo ahora?" IDYES downloadEdge IDNO continueAnyway
    
    downloadEdge:
      ExecShell "open" "https://www.microsoft.com/edge/download"
      Abort "Instalación cancelada por el usuario."
      
    continueAnyway:
      ; El usuario decidió continuar bajo su riesgo
  ${EndIf}

!macroend
