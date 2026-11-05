"""Windows SHARP PC-FAX bridge.

Receives {faxNumber, filename, contentBase64} and automates the installed
SHARP PC-FAX dialog. Run this only on the Windows PC connected to the fax.
"""
import base64, json, os, secrets, subprocess, tempfile, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.getenv("FAX_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.getenv("FAX_BRIDGE_PORT", "8787"))
PRINTER = os.getenv("FAX_PRINTER_NAME", "SHARP MX-2661 FAX")
BRIDGE_TOKEN = os.getenv("FAX_BRIDGE_TOKEN", "")

def send_with_sharp(pdf_path: str, fax_number: str):
    try:
        from pywinauto import Desktop
        from pywinauto.application import Application
    except ImportError as exc:
        raise RuntimeError("pywinauto is not installed") from exc

    print(f"[send] printing {os.path.basename(pdf_path)} to {PRINTER} for {fax_number}", flush=True)
    os.startfile(pdf_path, "printto", PRINTER)
    window = Desktop(backend="uia").window(title_re=".*相手先の選択.*")
    window.wait("visible", timeout=30)
    window.child_window(title="Fax番号(F):", control_type="RadioButton").click()
    fax_box = window.child_window(control_type="Edit", found_index=1)
    fax_box.set_edit_text(fax_number)
    window.child_window(title="追加(A)", control_type="Button").click()
    window.child_window(title="次へ(N) >", control_type="Button").click()
    print("[send] SHARP PC-FAX dialog accepted", flush=True)
    return {"ok": True, "message": "PC-FAX送信を開始しました。"}

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/send":
            self.send_error(404); return
        if BRIDGE_TOKEN and self.headers.get("X-Fax-Bridge-Token") != BRIDGE_TOKEN:
            self.send_error(401); return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length))
            number = str(body.get("faxNumber", "")).strip()
            if not number or not all(c in "+-() 0123456789" for c in number):
                raise ValueError("faxNumber is invalid")
            raw = base64.b64decode(body["contentBase64"], validate=True)
            if not raw.startswith(b"%PDF"):
                raise ValueError("Only PDF files are supported")
            fd, path = tempfile.mkstemp(prefix="fax-", suffix=".pdf")
            os.close(fd)
            with open(path, "wb") as output:
                output.write(raw)
            result = send_with_sharp(path, number)
            self.respond(200, result)
        except Exception as exc:
            print(f"[error] {type(exc).__name__}: {exc}", flush=True)
            self.respond(500, {"ok": False, "error": str(exc)})

    def respond(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_): pass

if __name__ == "__main__":
    if not BRIDGE_TOKEN:
        raise SystemExit("Set FAX_BRIDGE_TOKEN before starting the bridge")
    print(f"FAX Bridge listening on {HOST}:{PORT} -> {PRINTER}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
