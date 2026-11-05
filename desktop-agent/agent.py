"""Windows desktop fax agent: polls the web app and submits jobs locally."""
import json
import os
import tempfile
import time
import urllib.parse
import urllib.request
import urllib.error

import win32com.client
import win32api


CONFIG_PATH = os.path.join(os.getenv("APPDATA", "."), "FaxMailAgent", "config.json")


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
        raise RuntimeError(f"Server returned HTTP {error.code}: {error.read().decode()}") from error


def download(url, name):
    suffix = os.path.splitext(name or urllib.parse.urlparse(url).path)[1] or ".bin"
    path = tempfile.mktemp(prefix="fax-mail-", suffix=suffix)
    urllib.request.urlretrieve(url, path)
    return path


def send_windows_fax(job, config):
    """Use Windows Fax and Scan (fax modem/server); recipient number is automatic."""
    server = win32com.client.Dispatch("FaxComEx.FaxServer")
    server.Connect(config.get("fax_server", ""))
    document = win32com.client.Dispatch("FaxComEx.FaxDocument")
    document.Body = download(job["document_url"], job.get("document_name")) if job.get("document_url") else ""
    document.DocumentName = job.get("subject") or "Fax Mail System"
    document.Recipients.Add(job["fax_number"], "")
    document.ConnectedSubmit(server)
    server.Disconnect()


def print_to_device(job, config):
    """Spool a cover sheet to any Windows printer/FAX driver."""
    cover_path = tempfile.mktemp(prefix="fax-cover-", suffix=".txt")
    with open(cover_path, "w", encoding="utf-8") as cover:
        cover.write(f"FAX TO: {job['fax_number']}\nSUBJECT: {job.get('subject') or ''}\n\n{job.get('body_text') or ''}\n")
    win32api.ShellExecute(0, "printto", cover_path, f'"{config["printer_name"]}"', ".", 0)

    # Print the uploaded card/document as a second spool item using its registered app.
    if job.get("document_url"):
        path = download(job["document_url"], job.get("document_name"))
        win32api.ShellExecute(0, "printto", path, f'"{config["printer_name"]}"', ".", 0)


def run():
    with open(CONFIG_PATH, encoding="utf-8") as file:
        config = json.load(file)
    print(f"Fax Mail Agent started: {config['agent_id']} / {config['mode']}")
    while True:
        try:
            result = request(config)
            if result:
                job = result["job"]
                try:
                    (send_windows_fax if config["mode"] == "windows_fax" else print_to_device)(job, config)
                    request(config, "PATCH", {"id": job["id"], "status": "sent"})
                    print("Submitted", job["id"], job["fax_number"])
                except Exception as error:
                    request(config, "PATCH", {"id": job["id"], "status": "failed", "error": str(error)})
                    print("Failed", job["id"], error)
        except Exception as error:
            print("Poll error:", error)
        time.sleep(config.get("poll_seconds", 5))


if __name__ == "__main__":
    run()
