@echo off
echo.
echo ============================================
echo   Tailwind CSS - Build de Producao
echo ============================================
echo.
echo Compilando CSS estatico com classes otimizadas...
echo.

tailwindcss.exe -i src\input.css -o dist\tailwind.css --config tailwind.config.js --minify

echo.
echo Build concluido!
echo Arquivo gerado: dist\tailwind.css
echo.
for %%F in (dist\tailwind.css) do echo Tamanho: %%~zF bytes
echo.
pause
