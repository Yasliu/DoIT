!macro NSIS_HOOK_POSTINSTALL
  CopyFiles /SILENT "$INSTDIR\resources\WebView2Loader.dll" "$INSTDIR\WebView2Loader.dll"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Only remove the bundled loader in $INSTDIR; never touch $DOCUMENTS, $APPDATA, or any notes folder.
  Delete "$INSTDIR\WebView2Loader.dll"
!macroend
