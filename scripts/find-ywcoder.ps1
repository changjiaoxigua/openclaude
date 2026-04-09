#!/usr/bin/env pwsh
<#
.SYNOPSIS
    查找 ywcoder 安装的 cli.mjs 路径
.DESCRIPTION
    在常见位置搜索 @dcywzc/ywcoder/dist/cli.mjs
    支持 npm/yarn/pnpm 全局安装路径
#>

$ErrorActionPreference = "SilentlyContinue"

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

    # 搜索 PATH 中的 node_modules
    $env:PATH -split ";" | ForEach-Object {
        $path = $_.Trim()
        if ($path -and (Test-Path $path)) {
            # 如果 PATH 中有 node_modules 目录
            if ($path -like "*node_modules*") {
                $candidate = Join-Path $path "@dcywzc\ywcoder\dist\cli.mjs"
                if ($possiblePaths -notcontains $candidate) {
                    $possiblePaths += $candidate
                }
            }
            # 检查上级目录是否有 node_modules
            $parent = Split-Path $path -Parent
            if ($parent) {
                $candidate = Join-Path $parent "node_modules\@dcywzc\ywcoder\dist\cli.mjs"
                if ($possiblePaths -notcontains $candidate) {
                    $possiblePaths += $candidate
                }
            }
        }
    }

    # 去重并检查文件存在
    $found = $possiblePaths | Select-Object -Unique | Where-Object {
        Test-Path $_ -PathType Leaf
    } | Select-Object -First 1

    return $found
}

# 主逻辑
$cliPath = Find-YwCoderPath

if ($cliPath) {
    # 输出路径（用于脚本捕获）
    Write-Output $cliPath

    # 同时输出友好信息到标准错误
    Write-Host "找到 ywcoder: $cliPath" -ForegroundColor Green -ErrorAction SilentlyContinue
    exit 0
} else {
    Write-Host "未找到 ywcoder 安装。请确认已执行: npm install -g @dcywzc/ywcoder" -ForegroundColor Red -ErrorAction SilentlyContinue
    exit 1
}
