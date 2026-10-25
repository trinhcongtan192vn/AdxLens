@echo off
rem Double-click de mo BAN XEM TRUOC (chi may nay, http://localhost:3100) voi develop moi nhat.
rem Test xong thi bam Cap-nhat-AdxLens.cmd de dua DUNG ban nay len team. Xem docs/runbooks/dev-public.md muc 8.
chcp 65001 >nul
cd /d "%~dp0"
title Xem truoc AdxLens
where node >nul 2>nul || (echo Can cai Node.js 22: https://nodejs.org & pause & exit /b 1)
where pnpm >nul 2>nul || call corepack enable
node scripts\preview.mjs
echo.
pause
