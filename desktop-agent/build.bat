@echo off
if not exist .venv\Scripts\python.exe python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt pyinstaller
.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --onefile --name FaxMailAgent --distpath dist --workpath build agent.py
echo Built dist\FaxMailAgent.exe
