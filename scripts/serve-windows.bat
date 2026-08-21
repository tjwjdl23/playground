@echo off
rem ---------------------------------------------------------------------------
rem  Excel editor - local web server launcher (Windows, no install required)
rem
rem  Chrome never grants file-write permission to pages opened as file://,
rem  so the editor must be served over http://127.0.0.1 instead.
rem  Put this file next to the editor HTML and double-click it.
rem ---------------------------------------------------------------------------
setlocal
set "SELF=%~f0"
set "EDITOR_DIR=%~dp0"
title Excel editor - local server
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:SELF,[Text.Encoding]::UTF8); $i=$t.IndexOf('#PS'+'_START'); iex $t.Substring($i)"
endlocal
exit /b

#PS_START
# ---------------------------------------------------------------------------
# 이 아래는 위의 batch 줄이 실행하는 PowerShell 코드다.
# 폴더 안의 파일을 127.0.0.1 로만 제공하는 최소 웹 서버.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$root = $env:EDITOR_DIR
if (-not $root) { $root = (Get-Location).Path }
$root = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\')

$pages = @(Get-ChildItem -LiteralPath $root -Filter *.html -File | Sort-Object Name)
if ($pages.Count -eq 0) {
  Write-Host ''
  Write-Host '  이 폴더에 HTML 파일이 없습니다.' -ForegroundColor Red
  Write-Host "  폴더: $root"
  Read-Host '  엔터를 누르면 닫힙니다'
  exit
}
$target = $pages | Where-Object { $_.Name -like '*편집기*' -or $_.Name -like '*editor*' } | Select-Object -First 1
if (-not $target) { $target = $pages[0] }

$listener = $null
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
  Write-Host '  사용할 수 있는 포트를 찾지 못했습니다.' -ForegroundColor Red
  Read-Host '  엔터를 누르면 닫힙니다'
  exit
}

$url = "http://127.0.0.1:$port/" + [uri]::EscapeDataString($target.Name)
Write-Host ''
Write-Host '  엑셀 편집기 로컬 서버가 시작됐습니다.' -ForegroundColor Cyan
Write-Host "  주소 : $url"
Write-Host "  폴더 : $root"
Write-Host ''
Write-Host '  * 브라우저가 자동으로 열립니다. Chrome 또는 Edge 로 여세요.'
Write-Host '  * 편집이 끝나면 이 검은 창을 닫으면 서버가 종료됩니다.'
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
