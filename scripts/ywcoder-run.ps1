#!/usr/bin/env pwsh
<#
.SYNOPSIS
    查找并运行 ywcoder cli.mjs
.DESCRIPTION
    自动定位 @dcywzc/ywcoder/dist/cli.mjs 并执行
    支持通过 Node.js 或 Bun 运行
    所有参数都会传递给 cli.mjs
.EXAMPLE
    .\ywcoder-run.ps1
    .\ywcoder-run.ps1 --version
    .\ywcoder-run.ps1 --help
#>

$ErrorActionPreference = "Stop"

function Find-YwCoderPath {
    $possiblePaths = @()

    # 通过 npm root -g 获取全局安装路径
    try {
        $npmGlobal = & npm root -g 2>$null
        if ($npmGlobal) {
            $possiblePaths += Join-Path $npmGlobal "@dcywzc\ywcoder\dist\cli.mjs"
        }
    } catch { }

    # 通过 yarn global dir 获取路径
    try {
        $yarnGlobal = & yarn global dir 2>$null
        if ($yarnGlobal) {
            $possiblePaths += Join-Path $yarnGlobal "node_modules\@dcywzc\ywcoder\dist\cli.mjs"
        }
    } catch { }

    # 通过 pnpm root -g 获取路径
    try {
        $pnpmGlobal = & pnpm root -g 2>$null
        if ($pnpmGlobal) {
            $possiblePaths += Join-Path $pnpmGlobal "@dcywzc\ywcoder\dist\cli.mjs"
        }
    } catch { }

    # 常见的 Windows 全局安装路径（作为备选）
    $commonPaths = @(
        "$env:APPDATA\npm\node_modules\@dcywzc\ywcoder\dist\cli.mjs"
        "$env:LOCALAPPDATA\Yarn\Data\global\node_modules\@dcywzc\ywcoder\dist\cli.mjs"
        "$env:ProgramFiles\nodejs\node_modules\@dcywzc\ywcoder\dist\cli.mjs"
        "$env:ProgramFiles(x86)\nodejs\node_modules\@dcywzc\ywcoder\dist\cli.mjs"
        "$env:USERPROFILE\AppData\Roaming\npm\node_modules\@dcywzc\ywcoder\dist\cli.mjs"
        "$env:USERPROFILE\scoop\persist\nodejs\bin\node_modules\@dcywzc\ywcoder\dist\cli.mjs"
        "/usr/local/lib/node_modules/@dcywzc/ywcoder/dist/cli.mjs"
        "/usr/lib/node_modules/@dcywzc/ywcoder/dist/cli.mjs"
    )
    $possiblePaths += $commonPaths

    # 去重并检查文件存在
    $found = $possiblePaths | Select-Object -Unique | Where-Object {
        Test-Path $_ -PathType Leaf
    } | Select-Object -First 1

    return $found
}

function Get-Runtime {
    # 检查 Bun
    $bun = Get-Command bun -ErrorAction SilentlyContinue
    if ($bun) {
        return @{ Name = "bun"; Path = $bun.Source }
    }

    # 检查 Node.js
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        return @{ Name = "node"; Path = $node.Source }
    }

    return $null
}

# 主逻辑
$cliPath = Find-YwCoderPath

if (-not $cliPath) {
    Write-Host "[错误] 未找到 ywcoder 安装。" -ForegroundColor Red
    Write-Host "请确认已执行: npm install -g @dcywzc/ywcoder" -ForegroundColor Yellow
    exit 1
}

$runtime = Get-Runtime
if (-not $runtime) {
    Write-Host "[错误] 未找到 Node.js 或 Bun 运行时。" -ForegroundColor Red
    exit 1
}

# 运行 cli.mjs，传递所有参数
& $runtime.Path $cliPath @args
exit $LASTEXITCODE
