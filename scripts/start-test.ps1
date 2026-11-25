<#
.SYNOPSIS
Starts a disposable CSUPAK-TEST frontend at http://127.0.0.1:8765/.
.DESCRIPTION
Run .\scripts\start-test.ps1 in the VS Code PowerShell terminal. The first run
asks for values from the CSUPAK-TEST Supabase dashboard. Confirm the project
name and copy its Project ID from Project Settings, then copy the Project URL
and publishable key from Connect. The verified configuration is saved in
.csupak-test.local.json in the repository root and is ignored by Git.

Run the same command to serve a fresh copy of the current frontend. Press
Ctrl+C to stop and remove that copy. Use -Reset to clear the saved settings
before entering a new URL, project reference, or key on the next run.
If the terminal blocks local scripts, use RemoteSigned in the Process scope
for that terminal, subject to any organizational PowerShell policy.
.PARAMETER Reset
Deletes the saved local TEST configuration and exits.
.EXAMPLE
.\scripts\start-test.ps1
.EXAMPLE
.\scripts\start-test.ps1 -Reset
#>

[CmdletBinding()]
param([switch]$Reset)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot '.csupak-test.local.json'
$localUrl = 'http://127.0.0.1:8765/'
$productionConfig = Join-Path $repoRoot 'js/supabase.js'
$projectUrlPattern = '\Ahttps://(?<ref>[a-z0-9]{20})\.supabase\.co/?\z'

function Get-TestPython {
    foreach ($name in @('python', 'python3', 'py')) {
        $commands = Get-Command -Name $name -CommandType Application -All -ErrorAction SilentlyContinue
        foreach ($command in $commands) {
            $prefix = @()
            if ($name -eq 'py') { $prefix = @('-3') }
            elseif ($command.Source -like '*\Microsoft\WindowsApps\*') { continue }
            try {
                $version = & $command.Source @prefix --version 2>$null
                if ($LASTEXITCODE -eq 0 -and $version -match '^Python 3\.') {
                    return @{ Path = $command.Source; Arguments = $prefix }
                }
            } catch {
                continue
            }
        }
    }
    throw 'Python 3 is required. Install it, make it available on PATH, and restart the VS Code terminal.'
}

function Assert-TestPortAvailable {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 8765)
    try {
        $listener.Server.ExclusiveAddressUse = $true
        $listener.Start()
    } catch {
        throw 'Cannot bind 127.0.0.1:8765. Stop the server or other process using this port and retry.'
    } finally {
        $listener.Stop()
    }
}

function Get-TestProjectRef {
    param([string]$ProjectUrl)

    $match = [regex]::Match($ProjectUrl, $projectUrlPattern)
    if (!$match.Success) {
        throw 'Enter a Supabase Project URL in the form https://<20-character-project-ref>.supabase.co.'
    }
    $ref = $match.Groups['ref'].Value
    if ($ref -eq $productionRef) {
        throw 'The production Supabase project is blocked. Use the CSUPAK-TEST project URL.'
    }
    return $ref
}

function Assert-TestProjectConnection {
    param([string]$ProjectUrl, [string]$PublishableKey)

    $projectHost = ([uri]$ProjectUrl).Host
    try {
        $addresses = [Net.Dns]::GetHostAddresses($projectHost)
        if ($addresses.Length -eq 0) { throw 'No addresses returned.' }
    } catch {
        throw "Cannot resolve $projectHost. Check the CSUPAK-TEST project reference and your DNS connection."
    }

    try {
        $request = @{
            Uri = "$ProjectUrl/auth/v1/health"
            Method = 'Get'
            UseBasicParsing = $true
            Headers = @{ apikey = $PublishableKey }
            MaximumRedirection = 0
            TimeoutSec = 15
            Verbose = $false
            Debug = $false
        }
        Invoke-WebRequest @request | Out-Null
    } catch {
        $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode }
        if ($status -in @(401, 403)) {
            throw 'CSUPAK-TEST did not authorize the publishable key. Check the Project URL and key in the TEST dashboard. Use -Reset to clear saved settings.'
        }
        throw "Could not verify Supabase Auth on $projectHost. Check connectivity and the TEST project's status."
    }
}

$siteRoot = $null
$tempParent = $null
try {
    if ($Reset) {
        if (Test-Path -LiteralPath $configPath -PathType Leaf) {
            Remove-Item -LiteralPath $configPath
        }
        Write-Host 'Local TEST configuration cleared. Run the script again to set it up.'
        return
    }

    $siteItems = @('index.html', 'style.css', 'js', 'pages', 'src')
    $requiredFiles = @(
        'index.html', 'style.css', 'js/supabase.js', 'js/login.js', 'js/auth.js',
        'js/settings.js', 'js/settings-security.js', 'pages/dashboard.html',
        'pages/settings.html', 'src/output.css'
    )
    foreach ($file in $requiredFiles) {
        if (!(Test-Path -LiteralPath (Join-Path $repoRoot $file) -PathType Leaf)) {
            throw "Missing frontend source file: $file."
        }
    }

    $productionUrl = [regex]::Match(
        [IO.File]::ReadAllText($productionConfig),
        'const\s+supabaseUrl\s*=\s*["'']([^"'']+)["'']'
    ).Groups[1].Value
    $productionRef = [regex]::Match($productionUrl, $projectUrlPattern).Groups['ref'].Value
    if (!$productionRef) {
        throw 'Could not identify production from js/supabase.js. TEST startup was stopped.'
    }

    $python = Get-TestPython
    Assert-TestPortAvailable

    $saved = Test-Path -LiteralPath $configPath -PathType Leaf
    if ($saved) {
        try {
            $config = [IO.File]::ReadAllText($configPath) | ConvertFrom-Json
            if ($config.projectUrl -isnot [string] -or $config.projectRef -isnot [string] -or
                $config.publishableKey -isnot [string]) {
                throw 'Required configuration fields are missing.'
            }
        } catch {
            throw 'Invalid local TEST configuration. Run .\scripts\start-test.ps1 -Reset and set it up again.'
        }
        $projectRef = Get-TestProjectRef $config.projectUrl
    } else {
        Write-Host 'Open the Supabase dashboard for CSUPAK-TEST before entering these values.'
        $projectRef = Get-TestProjectRef (Read-Host 'CSUPAK-TEST Project URL').Trim()
        $dashboardRef = (Read-Host 'Project ID shown in CSUPAK-TEST Project Settings').Trim()
        if ($dashboardRef -cne $projectRef) {
            throw 'The URL does not match the Project ID from CSUPAK-TEST Project Settings.'
        }
        $secureKey = Read-Host 'CSUPAK-TEST publishable key' -AsSecureString
        try {
            $key = [Net.NetworkCredential]::new('', $secureKey).Password.Trim()
        } finally {
            $secureKey.Dispose()
        }
        $config = [pscustomobject]@{
            projectUrl = "https://$projectRef.supabase.co"
            projectRef = $dashboardRef
            publishableKey = $key
        }
    }

    if ($config.projectRef -cne $projectRef) {
        throw 'The saved URL does not match the saved CSUPAK-TEST Project ID. Use -Reset to reconfigure.'
    }
    if ($config.publishableKey -cnotmatch '\Asb_publishable_[A-Za-z0-9_-]+\z') {
        throw 'Use an sb_publishable_ key from CSUPAK-TEST. Secret and legacy JWT keys are rejected.'
    }
    $testUrl = "https://$projectRef.supabase.co"
    Assert-TestProjectConnection $testUrl $config.publishableKey
    if (!$saved) {
        [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json))
    }

    $tempParent = (Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).Path
    $siteRoot = Join-Path $tempParent ('csupak-test-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $siteRoot | Out-Null
    foreach ($item in $siteItems) {
        Copy-Item -LiteralPath (Join-Path $repoRoot $item) -Destination $siteRoot -Recurse
    }
    $clientConfig = @"
const supabaseUrl = "$testUrl";
const supabaseKey = "$($config.publishableKey)";
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
"@
    [IO.File]::WriteAllText((Join-Path $siteRoot 'js/supabase.js'), $clientConfig)

    Write-Host 'CSUPAK-TEST mode'
    Write-Host "Supabase project: $testUrl"
    Write-Host "Local website:    $localUrl"
    Write-Host 'Press Ctrl+C to stop.'
    $arguments = $python.Arguments + @('-m', 'http.server', '8765', '--bind', '127.0.0.1', '--directory', $siteRoot)
    & $python.Path @arguments
    if ($LASTEXITCODE -ne 0) {
        throw 'The local HTTP server exited with an error. Check whether another process is using port 8765.'
    }
} catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
} finally {
    if ($siteRoot -and (Test-Path -LiteralPath $siteRoot -PathType Container)) {
        $resolved = Get-Item -LiteralPath $siteRoot
        if ($resolved.FullName -eq $siteRoot -and
            $resolved.Parent.FullName -eq [IO.Path]::GetDirectoryName($siteRoot) -and
            !($resolved.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            Remove-Item -LiteralPath $resolved.FullName -Recurse -Force -ErrorAction Continue
        }
    }
}
