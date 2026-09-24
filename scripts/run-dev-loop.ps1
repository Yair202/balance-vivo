# Mantiene el servidor de desarrollo de BalanceVivo (Vite) corriendo:
# si el proceso se cae, lo reinicia solo. Mismo patron que
# ControlTurnosBodega\scripts\run-app-loop.ps1.
$root = "C:\Users\Usuario\source\repos\BalanceVivo"
$log = "$root\vite-dev.log"
$env:Path += ";C:\Program Files\nodejs"
$npmCmd = "C:\Program Files\nodejs\npm.cmd"

Set-Location $root

while ($true) {
    Add-Content -Path $log -Value "`n[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Iniciando servidor de desarrollo (npm run dev)..." -Encoding utf8
    # Start-Process -NoNewWindow (en vez de "& npm run dev") para que no
    # aparezca una ventana de consola nueva cada vez que se reinicia.
    $p = Start-Process -FilePath $npmCmd -ArgumentList "run", "dev" -WorkingDirectory $root -NoNewWindow -PassThru -Wait -RedirectStandardOutput "$log.tmp" -RedirectStandardError "$log.err.tmp"
    Get-Content "$log.tmp" -ErrorAction SilentlyContinue | Add-Content -Path $log -Encoding utf8
    Get-Content "$log.err.tmp" -ErrorAction SilentlyContinue | Add-Content -Path $log -Encoding utf8
    Remove-Item "$log.tmp", "$log.err.tmp" -ErrorAction SilentlyContinue
    Add-Content -Path $log -Value "`n[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] El servidor se cerro (codigo $($p.ExitCode)). Reintentando en 5 segundos..." -Encoding utf8
    Start-Sleep -Seconds 5
}
