@echo off
chcp 65001 > nul
title Bridge Ui.Vision - Porta 5000
echo ===================================================
echo   INICIANDO PONTE LOCAL UI.VISION (PORTA 5000)
echo ===================================================
python bridge_uivision.py
pause
