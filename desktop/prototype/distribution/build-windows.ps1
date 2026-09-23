$ErrorActionPreference = 'Stop'
# Run on native Windows after `npm run desktop:setup` has installed its own platform binaries.
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
Push-Location $RepoRoot
$ToolDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('travel-planner-rcedit-' + [guid]::NewGuid().ToString())
$PreviousToolDirectory = $env:TRAVEL_PLANNER_RCEDIT_DIR
try {
  New-Item -ItemType Directory -Path $ToolDirectory | Out-Null
  # Exact official electron/node-rcedit package; scripts disabled and no global/repo dependency change.
  & npm.cmd install --prefix $ToolDirectory --registry https://registry.npmjs.org --ignore-scripts --no-audit --no-fund --save-exact rcedit@5.0.2
  if ($LASTEXITCODE -ne 0) { throw 'Pinned Windows resource editor installation failed.' }
  $env:TRAVEL_PLANNER_RCEDIT_DIR = $ToolDirectory
  $ResultText = & node (Join-Path $PSScriptRoot 'package.cjs')
  if ($LASTEXITCODE -ne 0) { throw 'Desktop packaging failed.' }
  $Result = $ResultText | ConvertFrom-Json
  $ZipPath = Join-Path (Split-Path $Result.artifact) ('TravelPlanner-' + $Result.version + '-windows-' + $Result.architecture + '.zip')
  if (Test-Path $ZipPath) { throw 'ZIP already exists; retain or rename the old artifact before rebuilding.' }
  Compress-Archive -Path (Join-Path $Result.artifact '*') -DestinationPath $ZipPath -CompressionLevel Optimal
  $Checksum = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -Path ($ZipPath + '.sha256') -Value ($Checksum + '  ' + (Split-Path $ZipPath -Leaf)) -Encoding ascii
  Write-Output ('Portable ZIP: ' + $ZipPath)
  Write-Output 'Unsigned build: native Windows smoke testing is required before release.'
} finally {
  $env:TRAVEL_PLANNER_RCEDIT_DIR = $PreviousToolDirectory
  if (Test-Path $ToolDirectory) { Remove-Item -Recurse -Force $ToolDirectory }
  Pop-Location
}
