"""Windows desktop fax agent: polls the web app and submits jobs locally."""
import base64
import json
import os
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
import urllib.error

import win32com.client
import win32api


CONFIG_PATH = os.path.join(os.getenv("APPDATA", "."), "FaxMailAgent", "config.json")
LOG_PATH = os.path.join(os.getenv("LOCALAPPDATA", "."), "FaxMailAgent", "agent.log")


def log(*items):
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} " + " ".join(str(item) for item in items)
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        print(line.encode("ascii", "backslashreplace").decode("ascii"), flush=True)
    with open(LOG_PATH, "a", encoding="utf-8") as output:
        output.write(line + "\n")


def request(config, method="GET", payload=None):
    url = config["server_url"].rstrip("/") + "/api/desktop-fax/jobs"
    if method == "GET":
        url += "?agentId=" + urllib.parse.quote(config["agent_id"])
    data = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + config["agent_key"],
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return None if response.status == 204 else json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 204:
            return None
        detail = error.read(500).decode("utf-8", "replace").replace("\r", " ").replace("\n", " ")
        raise RuntimeError(f"Server returned HTTP {error.code}: {detail}") from error


def materialize(job):
    name = os.path.basename(job.get("document_name") or "fax-document.pdf")
    encoded = job.get("document_base64")
    if encoded:
        raw = base64.b64decode(encoded, validate=True)
        if not raw.startswith(b"%PDF"):
            raise RuntimeError("Queued document is not a PDF")
        short_id = str(job.get("id") or "job").replace("-", "")[:8]
        path = os.path.join(tempfile.gettempdir(), f"fax-{short_id}.pdf")
        with open(path, "wb") as output:
            output.write(raw)
        return path
    url = job.get("document_url")
    if not url:
        raise RuntimeError("Queued fax has no document")
    suffix = os.path.splitext(name or urllib.parse.urlparse(url).path)[1] or ".bin"
    short_id = str(job.get("id") or "job").replace("-", "")[:8]
    path = os.path.join(tempfile.gettempdir(), f"fax-{short_id}{suffix}")
    urllib.request.urlretrieve(url, path)
    return path


def send_windows_fax(job, config):
    """Use Windows Fax and Scan (fax modem/server); recipient number is automatic."""
    server = win32com.client.Dispatch("FaxComEx.FaxServer")
    server.Connect(config.get("fax_server", ""))
    document = win32com.client.Dispatch("FaxComEx.FaxDocument")
    document.Body = materialize(job)
    document.DocumentName = job.get("subject") or "Fax Mail System"
    document.Recipients.Add(job["fax_number"], "")
    document.ConnectedSubmit(server)
    server.Disconnect()


def send_sharp_pcfax(job, config):
    """Print one PDF and fill the SHARP PC-Fax recipient dialog."""
    from pywinauto import Desktop

    path = materialize(job)
    viewer = config.get("pdf_viewer", "")
    printer = config["printer_name"]
    if viewer and os.path.isfile(viewer):
        subprocess.Popen([viewer, "-print-to", printer, path], close_fds=True)
    else:
        win32api.ShellExecute(0, "printto", path, f'"{printer}"', ".", 0)
    timeout = config.get("dialog_timeout_seconds", 60)
    desktop = Desktop(backend="uia")
    recipient = desktop.window(title_re=config.get("recipient_window", ".*相手先の選択.*"))
    recipient.wait("visible", timeout=timeout)
    recipient.child_window(title="Fax番号(F):", control_type="RadioButton").click()
    recipient.child_window(control_type="Edit", found_index=1).set_edit_text(job["fax_number"])
    recipient.child_window(title="追加(A)", control_type="Button").click()
    recipient.child_window(title="次へ(N) >", control_type="Button").click()

    cover = desktop.window(title="送付状の選択")
    cover.wait("visible", timeout=timeout)
    cover.child_window(title="次へ(N) >", control_type="Button").click()

    settings = desktop.window(title="ジョブの設定")
    settings.wait("visible", timeout=timeout)
    short_id = str(job.get("id") or "job").replace("-", "")[:8]
    settings.child_window(title="ジョブ名(J)", control_type="Edit").set_edit_text(f"fax-{short_id}.pdf")
    settings.child_window(title="次へ(N) >", control_type="Button").click()

    preview = desktop.window(title="プレビュー")
    preview.wait("visible", timeout=timeout)
    preview.child_window(title="完了", control_type="Button").click()
    preview.wait_not("visible", timeout=timeout)


def run():
    with open(CONFIG_PATH, encoding="utf-8") as file:
        config = json.load(file)
    log(f"Fax Mail Agent started: {config['agent_id']} / {config['mode']}")
    while True:
        try:
            result = request(config)
            if result:
                job = result["job"]
                try:
                    sender = send_windows_fax if config["mode"] == "windows_fax" else send_sharp_pcfax
                    sender(job, config)
                    request(config, "PATCH", {"id": job["id"], "status": "sent"})
                    log("Submitted", job["id"], job["fax_number"])
                except Exception as error:
                    request(config, "PATCH", {"id": job["id"], "status": "failed", "error": str(error)})
                    log("Failed", job["id"], error)
        except Exception as error:
            log("Poll error:", error)
        time.sleep(config.get("poll_seconds", 5))


if __name__ == "__main__":
    run()
