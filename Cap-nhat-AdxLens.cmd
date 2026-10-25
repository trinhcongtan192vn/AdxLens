@echo off
rem Double-click de cap nhat BAN TEAM TEST len develop moi nhat (build truoc, team chi gian doan vai giay).
rem Lan dau tu tao thu muc ban team (vd. E:\VideCode\AdxLens-team). Xem docs/runbooks/dev-public.md muc 7.
chcp 65001 >nul
cd /d "%~dp0"
title Cap nhat AdxLens (ban team)
where node >nul 2>nul || (echo Can cai Node.js 22: https://nodejs.org & pause & exit /b 1)
where pnpm >nul 2>nul || call corepack enable
node scripts\team.mjs
echo.
pause
