# Mantiene el servidor de desarrollo de BalanceVivo (Vite) corriendo:
# si el proceso se cae, lo reinicia solo. Mismo patron que
# ControlTurnosBodega\scripts\run-app-loop.ps1.
$root = "C:\Users\Usuario\source\repos\BalanceVivo"
$log = "$root\vite-dev.log"
$env:Path += ";C:\Program Files\nodejs"

Set-Location $root

while ($true) {
    Add-Content -Path $log -Value "`n[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Iniciando servidor de desarrollo (npm run dev)..." -Encoding utf8
    & npm run dev *>> $log
    Add-Content -Path $log -Value "`n[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] El servidor se cerro. Reintentando en 5 segundos..." -Encoding utf8
    Start-Sleep -Seconds 5
}
