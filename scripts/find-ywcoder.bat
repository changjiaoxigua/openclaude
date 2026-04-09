@echo off
chcp 65001 > nul
REM 查找 ywcoder 安装的 cli.mjs 路径
REM 支持 npm/yarn/pnpm 全局安装路径

setlocal enabledelayedexpansion

set "FOUND="

REM 尝试通过 npm root -g 获取路径
for /f "tokens=* usebackq" %%a in (`npm root -g 2^>nul`) do (
    if exist "%%a\@dcywzc\ywcoder\dist\cli.mjs" (
        set "FOUND=%%a\@dcywzc\ywcoder\dist\cli.mjs"
        goto :found
    )
)

REM 尝试通过 yarn 获取路径
for /f "tokens=* usebackq" %%a in (`yarn global dir 2^>nul`) do (
    if exist "%%a\node_modules\@dcywzc\ywcoder\dist\cli.mjs" (
        set "FOUND=%%a\node_modules\@dcywzc\ywcoder\dist\cli.mjs"
        goto :found
    )
)

REM 尝试通过 pnpm 获取路径
for /f "tokens=* usebackq" %%a in (`pnpm root -g 2^>nul`) do (
    if exist "%%a\@dcywzc\ywcoder\dist\cli.mjs" (
        set "FOUND=%%a\@dcywzc\ywcoder\dist\cli.mjs"
        goto :found
    )
)

REM 检查常见路径
set "PATHS=%APPDATA%\npm\node_modules\@dcywzc\ywcoder\dist\cli.mjs"
set "PATHS=!PATHS!;%LOCALAPPDATA%\Yarn\Data\global\node_modules\@dcywzc\ywcoder\dist\cli.mjs"
set "PATHS=!PATHS!;%ProgramFiles%\nodejs\node_modules\@dcywzc\ywcoder\dist\cli.mjs"
set "PATHS=!PATHS!;%ProgramFiles(x86)%\nodejs\node_modules\@dcywzc\ywcoder\dist\cli.mjs"
set "PATHS=!PATHS!;%USERPROFILE%\AppData\Roaming\npm\node_modules\@dcywzc\ywcoder\dist\cli.mjs"
set "PATHS=!PATHS!;%USERPROFILE%\scoop\persist\nodejs\bin\node_modules\@dcywzc\ywcoder\dist\cli.mjs"

for %%p in (!PATHS!) do (
    if exist "%%p" (
        set "FOUND=%%p"
        goto :found
    )
)

REM 尝试在 PATH 中查找
for %%d in (npm yarn pnpm) do (
    for /f "tokens=* usebackq" %%a in (`where %%d 2^>nul`) do (
        set "BINDIR=%%~dpa"
        if exist "!BINDIR!..\node_modules\@dcywzc\ywcoder\dist\cli.mjs" (
            set "FOUND=!BINDIR!..\node_modules\@dcywzc\ywcoder\dist\cli.mjs"
            goto :found
        )
    )
)

echo [[31m错误[0m] 未找到 ywcoder 安装。
echo 请确认已执行: npm install -g @dcywzc/ywcoder
exit /b 1

:found
echo %FOUND%
exit /b 0
