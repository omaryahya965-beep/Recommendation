"""Live API smoke walk against the running dev server.

Prints HTTP status and a short payload summary for each step.
Does not swallow unexpected failures.
"""
from __future__ import annotations

import datetime
import io
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("API_BASE", "http://127.0.0.1:8000")
PASSWORD = "Demo@12345"
results: list[dict] = []


def summarize(payload):
    if payload is None:
        return None
    if isinstance(payload, dict):
        keep = {}
        for key in (
            "id", "username", "role", "department", "municipality",
            "status", "title", "decision", "resolution", "overdue",
            "target_date", "detail", "code", "count", "created",
        ):
            if key in payload:
                keep[key] = payload[key]
        if "user" in payload and isinstance(payload["user"], dict):
            keep["user"] = {
                k: payload["user"].get(k)
                for k in ("id", "username", "role", "department", "municipality")
            }
        if "evidence_files" in payload:
            keep["evidence_count"] = len(payload["evidence_files"] or [])
            if payload["evidence_files"]:
                first = payload["evidence_files"][0]
                keep["evidence_file"] = first.get("file_url") or first.get("file")
        if "action_plan" in payload and isinstance(payload["action_plan"], dict):
            keep["plan_status"] = payload["action_plan"].get("status")
            keep["steps"] = [
                {"id": s.get("id"), "title": s.get("title"), "is_done": s.get("is_done")}
                for s in (payload["action_plan"].get("steps") or [])
            ]
        if "stats" in payload:
            keep["stats"] = payload["stats"]
        if "action_center" in payload:
            keep["action_center"] = {
                name: {"count": bucket.get("count")}
                for name, bucket in payload["action_center"].items()
                if isinstance(bucket, dict)
            }
        return keep
    return str(payload)[:300]


def request(method, path, token=None, body=None, files=None):
    url = BASE + path
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if files is not None:
        boundary = uuid.uuid4().hex
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        buf = io.BytesIO()
        for key, value in (body or {}).items():
            buf.write(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode()
            )
        for key, (filename, content) in files.items():
            buf.write(
                (
                    f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"; "
                    f"filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
                ).encode()
            )
            buf.write(content)
            buf.write(b"\r\n")
        buf.write(f"--{boundary}--\r\n".encode())
        data = buf.getvalue()
    elif body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read()
            payload = None
            if raw:
                try:
                    payload = json.loads(raw)
                except Exception:
                    payload = {"bytes": len(raw), "content_type": res.headers.get("Content-Type")}
            return res.status, payload
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            payload = json.loads(raw) if raw else None
        except Exception:
            payload = {"raw": raw.decode("utf-8", "replace")[:500]}
        return err.code, payload
    except urllib.error.URLError as err:
        return 0, {"detail": str(err.reason)}


def record(step, method, path, status, payload, expect, extra=""):
    ok = status in expect if isinstance(expect, (tuple, list, set)) else status == expect
    row = {
        "step": step,
        "method": method,
        "path": path,
        "http": status,
        "ok": ok,
        "expected": expect if not isinstance(expect, (list, set, tuple)) else list(expect),
        "body": summarize(payload),
        "note": extra,
    }
    results.append(row)
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {step}  {method} {path} -> {status}")
    if not ok:
        print(f"       expected {expect}; body={json.dumps(summarize(payload), ensure_ascii=True)}")
    return ok, payload


def login(username):
    status, data = request("POST", "/api/auth/login/", body={"username": username, "password": PASSWORD})
    ok, _ = record(f"login {username}", "POST", "/api/auth/login/", status, data, 200)
    if not ok:
        raise SystemExit(1)
    return data["access"], data.get("user")


def main():
    today = datetime.date.today()
    tokens = {}
    mes = {}
    for name in ("audit1", "head_finance", "emp_finance1", "council1"):
        token, user = login(name)
        tokens[name] = token
        status, me = request("GET", "/api/auth/me/", token)
        record(f"me {name}", "GET", "/api/auth/me/", status, me, 200)
        mes[name] = me

    expected_roles = {
        "audit1": "audit",
        "head_finance": "department_head",
        "emp_finance1": "employee",
        "council1": "council",
    }
    for name, role in expected_roles.items():
        actual = (mes.get(name) or {}).get("role")
        record(
            f"role scoping {name}",
            "GET",
            "/api/auth/me/",
            200 if actual == role else 0,
            {"role": actual, "department": (mes.get(name) or {}).get("department")},
            200,
            extra=f"expected role={role}",
        )

    audit, head, emp, council = (tokens[n] for n in ("audit1", "head_finance", "emp_finance1", "council1"))

    status, depts = request("GET", "/api/departments/", audit)
    record("list departments", "GET", "/api/departments/", status, depts, 200)
    finance = next(d for d in depts["results"] if "المالية" in d["name"] or "finance" in d["name"].lower())

    stamp = uuid.uuid4().hex[:6]
    status, report = request("POST", "/api/reports/", audit, {
        "title": f"SMOKE تدقيق الصندوق {stamp}",
        "department": finance["id"],
        "engagement_type": "assurance",
        "response_deadline": str(today + datetime.timedelta(days=14)),
    })
    ok, _ = record("2 create report", "POST", "/api/reports/", status, report, 201)
    if not ok:
        return
    rid = report["id"]

    status, rec = request("POST", "/api/recommendations/", audit, {
        "report": rid,
        "text": f"ضرورة إيداع المقبوضات يومياً في البنك — smoke {stamp}",
        "root_cause": "تأخير الإيداع",
        "risk_level": "high",
        "priority_score": 91,
    })
    ok, _ = record("2 create recommendation", "POST", "/api/recommendations/", status, rec, 201)
    if not ok:
        return
    rec_id = rec["id"]

    status, payload = request("POST", f"/api/reports/{rid}/submit-to-department/", audit)
    record("2 submit to department", "POST", f"/api/reports/{rid}/submit-to-department/", status, payload, 200)

    status, payload = request(
        "POST",
        f"/api/recommendations/{rec_id}/respond/",
        head,
        {"decision": "agree", "justification": "سيتم الإيداع اليومي"},
    )
    rec_status = payload.get("status") if isinstance(payload, dict) else None
    record(
        "3 department respond accept",
        "POST",
        f"/api/recommendations/{rec_id}/respond/",
        status,
        payload,
        200,
        extra=f"rec.status={rec_status}",
    )
    if status == 200 and rec_status != "audit_review":
        record("3 status after respond", "POST", ".../respond/", 0, payload, 200, extra="expected audit_review")

    status, payload = request(
        "POST",
        f"/api/recommendations/{rec_id}/review/",
        audit,
        {"accept": True, "notes": "الرد مقبول"},
    )
    record("4 audit send toward council (review accept)", "POST", f"/api/recommendations/{rec_id}/review/", status, payload, 200)

    status, payload = request("POST", f"/api/reports/{rid}/submit-to-council/", audit)
    record("4 submit report to council", "POST", f"/api/reports/{rid}/submit-to-council/", status, payload, 200)

    status, payload = request("POST", f"/api/reports/{rid}/ratify/", council, {"notes": "مصادقة"})
    record("4 council ratify", "POST", f"/api/reports/{rid}/ratify/", status, payload, 200)

    status, detail = request("GET", f"/api/recommendations/{rec_id}/", audit)
    record("4 rec after ratify", "GET", f"/api/recommendations/{rec_id}/", status, detail, 200)
    if isinstance(detail, dict) and detail.get("status") != "action_plan_required":
        record("4 expected action_plan_required", "GET", "...", 0, detail, 200)

    status, employees = request("GET", "/api/employees/", head)
    record("5 list employees", "GET", "/api/employees/", status, employees, 200)
    employee = next(e for e in employees["results"] if e["username"] == "emp_finance1")
    plan_body = {
        "responsible_employee": employee["id"],
        "target_date": str(today + datetime.timedelta(days=30)),
        "notes": "خطة إيداع يومي",
        "steps": [
            {"title": "تعميم إجراء الإيداع", "order": 0},
            {"title": "تطبيق الإجراء أسبوعاً", "order": 1, "depends_on_index": 0},
        ],
    }
    status, payload = request("POST", f"/api/recommendations/{rec_id}/action-plan/", head, plan_body)
    record("5 submit action plan", "POST", f"/api/recommendations/{rec_id}/action-plan/", status, payload, 200)

    status, payload = request(
        "POST",
        f"/api/recommendations/{rec_id}/action-plan/review/",
        audit,
        {"accept": True, "notes": "معتمدة"},
    )
    record("5b audit approve plan (required to execute)", "POST", f"/api/recommendations/{rec_id}/action-plan/review/", status, payload, 200)

    status, detail = request("GET", f"/api/recommendations/{rec_id}/", emp)
    record("6 rec for employee", "GET", f"/api/recommendations/{rec_id}/", status, detail, 200)
    steps = ((detail or {}).get("action_plan") or {}).get("steps") or []
    if len(steps) < 2:
        record("6 plan steps present", "GET", "...", 0, detail, 200)
        return
    status, payload = request(
        "POST",
        f"/api/recommendations/{rec_id}/steps/{steps[0]['id']}/progress/",
        emp,
        {"is_done": True},
    )
    record("6 execute step 1", "POST", f"/api/recommendations/{rec_id}/steps/{steps[0]['id']}/progress/", status, payload, 200)
    status, payload = request(
        "POST",
        f"/api/recommendations/{rec_id}/steps/{steps[1]['id']}/progress/",
        emp,
        {"is_done": True},
    )
    record("6 execute step 2", "POST", f"/api/recommendations/{rec_id}/steps/{steps[1]['id']}/progress/", status, payload, 200)

    pdf = b"%PDF-1.4 smoke evidence\n"
    status, payload = request(
        "POST",
        f"/api/recommendations/{rec_id}/evidence/",
        emp,
        {"notes": "كشف إيداع"},
        files={"file": ("deposit-slip.pdf", pdf)},
    )
    record("6 upload evidence", "POST", f"/api/recommendations/{rec_id}/evidence/", status, payload, 200)
    file_url = None
    if isinstance(payload, dict) and payload.get("evidence_files"):
        first = payload["evidence_files"][0]
        file_url = first.get("file_url") or first.get("file")
    if file_url:
        parsed = urllib.request.urlparse(file_url if "://" in str(file_url) else BASE + (file_url if str(file_url).startswith("/") else "/" + str(file_url)))
        path = parsed.path
        media_status, media_body = request("GET", path)
        record("6 evidence file fetch", "GET", path, media_status, media_body, 200)
    else:
        record("6 evidence file persisted", "POST", ".../evidence/", 0, payload, 200, extra="no file URL on evidence_files")

    status, payload = request("POST", f"/api/recommendations/{rec_id}/mark-implemented/", emp)
    record("7 mark implemented", "POST", f"/api/recommendations/{rec_id}/mark-implemented/", status, payload, 200)

    status, payload = request(
        "POST",
        f"/api/recommendations/{rec_id}/review-implementation/",
        head,
        {"accept": True, "notes": "التنفيذ مكتمل"},
    )
    record("8 head review implementation", "POST", f"/api/recommendations/{rec_id}/review-implementation/", status, payload, 200)

    status, payload = request(
        "POST",
        f"/api/recommendations/{rec_id}/verify/",
        audit,
        {"decision": "sufficient", "notes": "أدلة كافية"},
    )
    record("9 audit verify sufficient", "POST", f"/api/recommendations/{rec_id}/verify/", status, payload, 200)

    status, payload = request(
        "POST",
        f"/api/recommendations/{rec_id}/submit-for-closure/",
        audit,
        {"notes": "ملف الإغلاق جاهز"},
    )
    record("9b audit submit for closure (required before council)", "POST", f"/api/recommendations/{rec_id}/submit-for-closure/", status, payload, 200)

    status, payload = request(
        "POST",
        f"/api/recommendations/{rec_id}/council-closure/",
        council,
        {"accept": True, "notes": "يغلق"},
    )
    record("10 council close", "POST", f"/api/recommendations/{rec_id}/council-closure/", status, payload, 200)

    # --- Step 3: dashboards, notifications, overdue, register/CSV source -----
    for name, token in (("audit1", audit), ("head_finance", head), ("emp_finance1", emp), ("council1", council)):
        status, dash = request("GET", "/api/dashboard/", token)
        record(f"dashboard {name}", "GET", "/api/dashboard/", status, dash, 200)

    status, notes = request("GET", "/api/notifications/?page_size=100", audit)
    record("notifications audit1", "GET", "/api/notifications/?page_size=100", status, notes, 200)

    status, recs = request("GET", "/api/recommendations/?page_size=100", audit)
    record("register list", "GET", "/api/recommendations/?page_size=100", status, recs, 200)
    overdue_items = []
    demo_titles = 0
    if isinstance(recs, dict):
        for item in recs.get("results") or []:
            if item.get("overdue"):
                overdue_items.append({
                    "id": item.get("id"),
                    "status": item.get("status"),
                    "target_date": item.get("target_date"),
                    "text": (item.get("text") or "")[:60],
                })
            if (item.get("report_title") or "").startswith("[DEMO]"):
                demo_titles += 1
    record(
        "overdue flags on register",
        "GET",
        "/api/recommendations/",
        200 if overdue_items else 0,
        {"overdue_count": len(overdue_items), "items": overdue_items, "demo_rows": demo_titles},
        200,
        extra="overdue must be computed (in_progress + past target_date)",
    )
    record(
        "csv source rows include demo data",
        "GET",
        "/api/recommendations/",
        200 if demo_titles >= 10 else 0,
        {"demo_rows": demo_titles, "total": (recs or {}).get("count")},
        200,
    )

    failed = [r for r in results if not r["ok"]]
    print(f"\n{len(results) - len(failed)}/{len(results)} steps passed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
