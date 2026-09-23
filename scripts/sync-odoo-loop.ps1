# Mantiene el tablero alimentado solo: corre "npm run sync-odoo" (trae
# ventas reales de Odoo dia a dia) cada 5 minutos, para siempre. Mismo
# patron que run-dev-loop.ps1 / run-app-loop.ps1 de ControlTurnosBodega.
$root = "C:\Users\Usuario\source\repos\BalanceVivo"
$log = "$root\sync-odoo.log"
$env:Path += ";C:\Program Files\nodejs"

Set-Location $root

$npmCmd = "C:\Program Files\nodejs\npm.cmd"

while ($true) {
    Add-Content -Path $log -Value "`n[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Sincronizando con Odoo..." -Encoding utf8
    $p = Start-Process -FilePath $npmCmd -ArgumentList "run", "sync-odoo" -WorkingDirectory $root -NoNewWindow -PassThru -Wait -RedirectStandardOutput "$log.tmp" -RedirectStandardError "$log.err.tmp"
    Get-Content "$log.tmp" -ErrorAction SilentlyContinue | Add-Content -Path $log -Encoding utf8
    Get-Content "$log.err.tmp" -ErrorAction SilentlyContinue | Add-Content -Path $log -Encoding utf8
    Remove-Item "$log.tmp", "$log.err.tmp" -ErrorAction SilentlyContinue
    Add-Content -Path $log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Sincronizacion terminada (codigo $($p.ExitCode)). Proxima en 5 minutos." -Encoding utf8
    Start-Sleep -Seconds 300
}
