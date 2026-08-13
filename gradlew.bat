@echo off
set VER=8.9
set ROOT=%~dp0
set DIST=%ROOT%.gradle-dist\gradle-%VER%
if not exist "%DIST%\bin\gradle.bat" (
  echo Please install Gradle 8.9 or build from Android Studio.
  exit /b 1
)
call "%DIST%\bin\gradle.bat" %*
