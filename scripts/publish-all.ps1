# PowerShell script to build, test, pack, and publish TableX to npm and NuGet.
#
# Usage:
#   .\scripts\publish-all.ps1
#   .\scripts\publish-all.ps1 -NugetApiKey "your-nuget-api-key"

param (
    [string]$NugetApiKey = ""
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  TableX Build & Publishing Pipeline     " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Verify npm auth
Write-Host "`n[1/5] Checking npm login status..." -ForegroundColor Yellow
try {
    $npmUser = npm whoami
    Write-Host " Logged in to npm as: $npmUser" -ForegroundColor Green
} catch {
    Write-Host " Not logged in to npm. Run 'npm login' first." -ForegroundColor Red
    exit 1
}

# 2. Build and test all JS/TS packages
Write-Host "`n[2/5] Building & Testing JS packages..." -ForegroundColor Yellow
npm run build
npm run typecheck
npm test
Write-Host " All JS packages built and verified." -ForegroundColor Green

# 3. Publish NPM packages
Write-Host "`n[3/5] Publishing NPM packages..." -ForegroundColor Yellow
Write-Host " -> Publishing @tablex/core..." -ForegroundColor Gray
npm publish --workspace=@tablex/core --access public

Write-Host " -> Publishing @tablex/vanilla..." -ForegroundColor Gray
npm publish --workspace=@tablex/vanilla --access public

Write-Host " -> Publishing @tablex/react..." -ForegroundColor Gray
npm publish --workspace=@tablex/react --access public

Write-Host " -> Publishing @tablex/angular..." -ForegroundColor Gray
Push-Location packages/angular/dist
npm publish --access public
Pop-Location
Write-Host " All 4 NPM packages published successfully!" -ForegroundColor Green

# 4. Build & Pack NuGet Package
Write-Host "`n[4/5] Building and packing TableX.AspNetCore NuGet package..." -ForegroundColor Yellow
dotnet build dotnet/TableX.sln -c Release
dotnet pack dotnet/TableX.AspNetCore/TableX.AspNetCore.csproj -c Release -o ./nupkg
Write-Host " NuGet package created in ./nupkg" -ForegroundColor Green

# 5. Push to NuGet.org
Write-Host "`n[5/5] Publishing to NuGet.org..." -ForegroundColor Yellow
if ($NugetApiKey -ne "") {
    dotnet nuget push ./nupkg/*.nupkg --api-key $NugetApiKey --source https://api.nuget.org/v3/index.json --skip-duplicate
    Write-Host " TableX.AspNetCore published to NuGet.org!" -ForegroundColor Green
} else {
    Write-Host " NugetApiKey parameter not provided." -ForegroundColor Yellow
    Write-Host " Run the following command to push to NuGet:" -ForegroundColor Cyan
    Write-Host " dotnet nuget push ./nupkg/*.nupkg --api-key YOUR_NUGET_KEY --source https://api.nuget.org/v3/index.json" -ForegroundColor White
}

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "  Publishing Completed Successfully!      " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
