; Prediction engine setup runs on first app launch (electron/setupService.mjs).
; Do not launch the .exe during NSIS install — that can trigger AV quarantine
; and leave shortcuts pointing at a removed/missing executable.
