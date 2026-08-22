@echo off
rem ---------------------------------------------------------------------------
rem  Excel editor (HTA) launcher for a shared folder.
rem
rem  Windows treats \\server\share as the Internet zone, and an HTA running
rem  there is not allowed to touch files. Copying it to the local disk first
rem  puts it in the Local Machine zone, where it works normally.
rem
rem  Keep this file next to the .hta in the shared folder. Everyone just
rem  double-clicks this.
rem ---------------------------------------------------------------------------
chcp 65001 >nul 2>&1
setlocal
title 엑셀 편집기

set "SRC=%~dp0"
set "DEST=%LOCALAPPDATA%\ExcelEditor"

echo.
echo   엑셀 편집기를 시작합니다.
echo.

rem 폴더 안의 .hta 파일을 찾는다 (이름이 무엇이든)
set "HTA="
for %%F in ("%SRC%*.hta") do if not defined HTA set "HTA=%%~nxF"
if not defined HTA goto :nohta

if not exist "%DEST%" mkdir "%DEST%" 2>nul
if not exist "%DEST%" goto :nodest

rem 공유폴더에서 실행하면 보안 구역 제한에 걸리므로 내 PC 로 복사해서 연다.
copy /Y "%SRC%%HTA%" "%DEST%\%HTA%" >nul
if errorlevel 1 goto :nocopy

echo   준비 완료: %DEST%\%HTA%
echo   창이 열립니다. 이 검은 창은 닫으셔도 됩니다.
start "" "%DEST%\%HTA%"
goto :eof

:nohta
echo   [!] 이 폴더에 .hta 파일이 없습니다.
echo       폴더: %SRC%
echo       엑셀편집기.hta 를 이 파일과 같은 폴더에 두세요.
goto :hold

:nodest
echo   [!] 내 PC 에 작업 폴더를 만들지 못했습니다.
echo       %DEST%
goto :hold

:nocopy
echo   [!] 파일을 내 PC 로 복사하지 못했습니다.
echo       %SRC%%HTA%
echo       -^> %DEST%\%HTA%
echo       .hta 파일을 바탕화면으로 직접 복사한 뒤 실행해 보세요.
goto :hold

:hold
echo.
pause
