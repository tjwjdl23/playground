@echo off
chcp 65001 >nul 2>&1
setlocal
set "SELF=%~f0"
set "EDITOR_DIR=%~dp0"
title Excel editor - local server
cd /d "%~dp0"

echo.
echo   ============================================
echo     엑셀 편집기 - 로컬 서버
echo   ============================================
echo   폴더: %CD%
echo.

rem --- 1) Python 이 있으면 가장 안정적이므로 먼저 쓴다 --------------------
set "PY="
py -3 -c "pass" >nul 2>&1
if not errorlevel 1 set "PY=py -3"
python -c "pass" >nul 2>&1
if not errorlevel 1 if not defined PY set "PY=python"
python3 -c "pass" >nul 2>&1
if not errorlevel 1 if not defined PY set "PY=python3"
if defined PY goto :python

rem --- 2) PowerShell 이 제한 없이 쓸 수 있는지 확인 -----------------------
where powershell >nul 2>&1
if errorlevel 1 goto :nothing

set "LM="
for /f "usebackq delims=" %%L in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ExecutionContext.SessionState.LanguageMode" 2^>nul`) do set "LM=%%L"
if not defined LM goto :psblocked
if /i not "%LM%"=="FullLanguage" goto :psrestricted
goto :powershell

rem ------------------------------------------------------------------ Python
:python
echo   Python 을 찾았습니다 (%PY%). 서버를 시작합니다.
echo.
echo     http://127.0.0.1:8123/
echo.
echo   * 브라우저가 자동으로 열립니다. 안 열리면 위 주소를 직접 입력하세요.
echo   * 목록에서 엑셀편집기.html 을 클릭하세요.
echo   * 편집이 끝나면 이 창을 닫으세요.
echo.
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul & start http://127.0.0.1:8123/"
%PY% -m http.server 8123 --bind 127.0.0.1
goto :end

rem -------------------------------------------------------------- PowerShell
:powershell
echo   PowerShell 로 서버를 시작합니다.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $t=[IO.File]::ReadAllText($env:SELF,[Text.Encoding]::UTF8); $i=$t.IndexOf('#PS'+'_START'); if ($i -lt 0) { throw '스크립트 구간을 찾지 못했습니다.' }; Invoke-Expression $t.Substring($i) } catch { Write-Host ''; Write-Host ('오류: ' + $_.Exception.Message) -ForegroundColor Red; Write-Host $_.ScriptStackTrace }"
goto :end

rem ------------------------------------------------------------------ 안내
:psrestricted
echo   [!] 이 PC 의 PowerShell 이 제한 모드입니다 (LanguageMode=%LM%).
echo       보안 정책으로 잠겨 있어 서버를 띄울 수 없습니다.
goto :advice

:psblocked
echo   [!] PowerShell 을 실행할 수 없습니다 (보안 정책 차단으로 보입니다).
goto :advice

:nothing
echo   [!] Python 도 PowerShell 도 사용할 수 없습니다.
goto :advice

:advice
echo.
echo   대신 이렇게 하세요:
echo.
echo     1. 웹 주소로 여는 방법 (설치 · 실행 권한 필요 없음)
echo        인터넷이 되는 PC 라면 배포된 주소를 즐겨찾기 해두고 쓰면 됩니다.
echo        (담당자에게 주소를 요청하세요)
echo.
echo     2. Python 설치가 가능하다면
echo        https://www.python.org/downloads/ 설치 후 이 파일을 다시 실행
echo.
echo     3. 그래도 안 되면
echo        엑셀편집기.html 을 그냥 열어서 편집한 뒤
echo        [위치를 골라 저장...] 또는 [수정본 내려받기] 버튼을 쓰세요.
echo        (원본 자동 덮어쓰기만 안 될 뿐, 수정 자체는 됩니다)
echo.

:end
echo.
echo   서버가 종료되었습니다.
echo   위에 오류 메시지가 있으면 그대로 알려주세요.
echo.
pause
exit /b

#PS_START
# ---------------------------------------------------------------------------
# 위 batch 구간이 이 아래 PowerShell 코드를 읽어서 실행한다.
# 폴더 안의 파일을 127.0.0.1 로만 제공하는 최소 웹 서버.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$root = $env:EDITOR_DIR
if (-not $root) { $root = (Get-Location).Path }
$root = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\')

$pages = @(Get-ChildItem -LiteralPath $root -Filter *.html -File | Sort-Object Name)
if ($pages.Count -eq 0) {
  Write-Host ''
  Write-Host ('  이 폴더에 HTML 파일이 없습니다: ' + $root) -ForegroundColor Red
  return
}
$target = $pages | Where-Object { $_.Name -like '*편집기*' -or $_.Name -like '*editor*' } | Select-Object -First 1
if (-not $target) { $target = $pages[0] }

$listener = $null
$port = 0
foreach ($p in 8123..8143) {
  try {
    $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
    $l.Start()
    $listener = $l
    $port = $p
    break
  } catch { }
}
if (-not $listener) {
  Write-Host '  사용할 수 있는 포트를 찾지 못했습니다 (8123-8143).' -ForegroundColor Red
  return
}

$url = "http://127.0.0.1:$port/" + [uri]::EscapeDataString($target.Name)
Write-Host ''
Write-Host '  서버가 시작됐습니다.' -ForegroundColor Cyan
Write-Host "  주소 : $url"
Write-Host ''
Write-Host '  * 브라우저가 자동으로 열립니다. Chrome 또는 Edge 로 여세요.'
Write-Host '  * 편집이 끝나면 이 창을 닫으면 서버가 종료됩니다.'
Write-Host ''
try { Start-Process $url } catch { Write-Host '  브라우저를 자동으로 열지 못했습니다. 위 주소를 직접 붙여넣으세요.' }

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.json' = 'application/json; charset=utf-8'
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $buf = New-Object byte[] 16384
    $n = $stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { continue }
    $head = [Text.Encoding]::ASCII.GetString($buf, 0, $n)
    $parts = (($head -split "`r`n")[0]).Split(' ')

    $status = '404 Not Found'
    $type = 'text/plain; charset=utf-8'
    $body = [Text.Encoding]::UTF8.GetBytes('not found')

    if ($parts.Length -ge 2 -and $parts[0] -eq 'GET') {
      $rel = [uri]::UnescapeDataString($parts[1].Split('?')[0]).TrimStart('/')
      if ($rel -eq '') { $rel = $target.Name }
      $full = Join-Path $root $rel.Replace('/', '\')
      $serve = $null
      # 폴더 밖의 파일은 절대 내보내지 않는다.
      try {
        if (Test-Path -LiteralPath $full -PathType Leaf) {
          $resolved = (Resolve-Path -LiteralPath $full).Path
          if ($resolved.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { $serve = $resolved }
        }
      } catch { }
      if ($serve) {
        $body = [IO.File]::ReadAllBytes($serve)
        $ext = [IO.Path]::GetExtension($serve).ToLower()
        if ($mime.ContainsKey($ext)) { $type = $mime[$ext] } else { $type = 'application/octet-stream' }
        $status = '200 OK'
      }
    }

    $resp = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $rb = [Text.Encoding]::ASCII.GetBytes($resp)
    $stream.Write($rb, 0, $rb.Length)
    $stream.Write($body, 0, $body.Length)
    $stream.Flush()
  } catch {
  } finally {
    $client.Close()
  }
}
