; Silent prediction-engine setup after install (no app window).
!macro customInstall
  DetailPrint "Preparing prediction engine in the background..."
  nsExec::ExecToStack '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --setup-silent'
  Pop $0
  Pop $1
  IntCmp $0 0 setup_ok setup_done setup_done
  setup_ok:
    DetailPrint "Prediction engine ready."
  setup_done:
!macroend
