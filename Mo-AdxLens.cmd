@echo off
rem Double-click de mo AdxLens o local (Meta, Stripe, PayOS gia). Dong cua so nay de tat app.
chcp 65001 >nul
cd /d "%~dp0"
title AdxLens (local)
where node >nul 2>nul || (echo Can cai Node.js 22: https://nodejs.org & pause & exit /b 1)
where pnpm >nul 2>nul || call corepack enable
node scripts\start-local.mjs
echo.
pause
