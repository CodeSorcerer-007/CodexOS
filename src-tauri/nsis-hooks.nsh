; CodexOS NSIS Custom Lifecycle Hooks
; Automatically cleans up CodexOS-owned HKCU context menus and startup registration on uninstall

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Cleaning up CodexOS Explorer context menus and startup registration..."
  ; Clean up CodexOS-owned context menu keys from HKCU
  DeleteRegKey HKCU "Software\Classes\Directory\shell\CodexOS"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\CodexOS"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\CodexOS"

  ; Clean up CodexOS-owned startup entry from HKCU
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "CodexOS"
!macroend
