param([Parameter(Mandatory=$true)][string]$PakkaPackage, [switch]$Offline, [string]$TypeScriptCompiler)
$offlineFlags = @(if ($Offline) { '--offline' })
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PakkaPackage = (Resolve-Path $PakkaPackage).Path
if ($TypeScriptCompiler) { $TypeScriptCompiler = (Resolve-Path $TypeScriptCompiler).Path }
Set-Location $root
$consumer = node -e "process.stdout.write(require('node:fs').mkdtempSync(require('node:path').join(require('node:fs').realpathSync.native(require('node:os').tmpdir()),'ei-installed-')))"
if ($LASTEXITCODE -ne 0) { throw 'Cannot create consumer' }
$env:TEMP = node -e "process.stdout.write(require('node:fs').realpathSync.native(require('node:os').tmpdir()))"
$env:TMP = $env:TEMP
$env:HOME = Join-Path $consumer 'home'; $env:USERPROFILE = $env:HOME
$env:PI_CODING_AGENT_DIR = Join-Path $env:HOME '.pi'; $env:PI_OFFLINE = '1'
$localConfig = Join-Path $consumer 'user.npmrc'; $globalConfig = Join-Path $consumer 'global.npmrc'
[System.IO.File]::WriteAllText($localConfig, '')
[System.IO.File]::WriteAllText($globalConfig, '')
$packText = npm pack @offlineFlags --json --ignore-scripts --pack-destination $consumer --userconfig $localConfig --globalconfig $globalConfig
if ($LASTEXITCODE -ne 0) { throw 'EI pack failed' }
$pack = ($packText | ConvertFrom-Json)[0]
Copy-Item (Join-Path $root 'test/consumers/pakka.mjs') (Join-Path $consumer 'pakka.mjs')
Copy-Item (Join-Path $root 'test/consumers/pakka.types.ts') (Join-Path $consumer 'pakka.types.ts')
Set-Location $consumer
[System.IO.File]::WriteAllText((Join-Path $consumer 'package.json'), '{"name":"ei-installed-proof","private":true,"type":"module"}')
npm install @offlineFlags --ignore-scripts --no-audit --no-fund --userconfig $localConfig --globalconfig $globalConfig --registry https://registry.npmjs.org (Join-Path $consumer $pack.filename) $PakkaPackage
if ($LASTEXITCODE -ne 0) { throw 'Consumer install failed' }
node pakka.mjs
if ($LASTEXITCODE -ne 0) { throw "Consumer failed: $consumer" }
if ($TypeScriptCompiler) {
  node $TypeScriptCompiler --noEmit --strict --skipLibCheck --target es2023 --module nodenext --lib es2023,dom pakka.types.ts
  if ($LASTEXITCODE -ne 0) { throw 'Installed public API type check failed' }
  Write-Output 'Installed public API type check passed (skipLibCheck applies to external declarations).'
  node $TypeScriptCompiler --noEmit --strict --target es2023 --module nodenext --lib es2023,dom node_modules/@pakka/ei/src/index.d.ts
  if ($LASTEXITCODE -ne 0) { throw 'EI declaration check failed' }
  Write-Output 'EI declarations passed without skipLibCheck.'
}
Write-Output "Consumer: $consumer"
Get-FileHash (Join-Path $consumer $pack.filename),$PakkaPackage -Algorithm SHA256 | Select-Object Path,Hash
