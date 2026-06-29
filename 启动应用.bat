@echo off
chcp 65001 >nul 2>&1
title 个人知识库
echo ========================================
echo        个人知识库 - 正在启动...
echo ========================================
echo.
echo 启动完成后浏览器会自动打开
echo 关闭此窗口即可停止服务
echo.
cd /d "%~dp0"
start "" "http://localhost:58890"
npx vite preview --port 58890
pause
