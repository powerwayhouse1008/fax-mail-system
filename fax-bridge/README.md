# SHARP PC-FAX Bridge

Runs on the Windows PC with the installed `SHARP MX-2661 FAX` printer. It accepts a PDF and fax number from the central web server, then fills the SHARP PC-FAX recipient dialog.

```powershell
py -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
$env:FAX_BRIDGE_TOKEN = "use-a-long-random-token"
$env:FAX_PRINTER_NAME = "SHARP MX-2661 FAX"
py bridge.py
```

If an older failed install left the environment incomplete, run:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\pip install -r requirements.txt
```

The bridge listens on port `8787` and accepts `POST /send` with header `X-Fax-Bridge-Token` and JSON `{ faxNumber, contentBase64 }`.

The SHARP driver UI must remain available; first test manually with one PDF before installing it as a Windows service. Build a portable executable with `pyinstaller --onefile --noconsole bridge.py`.
