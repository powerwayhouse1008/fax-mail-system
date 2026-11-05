@echo off
py -m pip install -r requirements.txt pyinstaller
py -m PyInstaller --onefile --name FaxMailAgent agent.py
echo Built dist\FaxMailAgent.exe
