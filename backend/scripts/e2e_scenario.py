"""Live end-to-end workflow scenario over HTTP against the running dev server.

Exercises all four roles through the corrected default flow:
audit creates -> department responds -> audit approves (AUDIT_APPROVAL) ->
council ratifies (COUNCIL_RATIFICATION, sets anchor date) -> plan AFTER
ratification -> plan review loop -> execution + evidence -> verification loop
-> closure. Also checks the AI recurrence flag on a similar recommendation.

Run: python scripts/e2e_scenario.py  (server on 127.0.0.1:8000, seed_demo applied)
"""
import datetime
import io
import json
import sys
import urllib.error
import urllib.request
import uuid

BASE = "http://127.0.0.1:8000"
PASSWORD = "Demo@12345"

checks = []


def check(name, condition, detail=""):
    checks.append((name, bool(condition), detail))
    mark = "PASS" if condition else "FAIL"
    print(f"[{mark}] {name}" + (f" -- {detail}" if detail and not condition else ""))


def request(method, path, token=None, body=None, files=None, expect_error=False):
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
            buf.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode())
        for key, (filename, content) in files.items():
            buf.write(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"; filename=\"{filename}\"\r\n"
                f"Content-Type: application/octet-stream\r\n\r\n".encode()
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
            payload = res.read()
            return res.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as err:
        payload = err.read()
        parsed = None
        try:
            parsed = json.loads(payload)
        except Exception:
            pass
        if not expect_error:
            print(f"  !! {method} {path} -> {err.code}: {parsed}")
        return err.code, parsed


def login(username):
    status, data = request("POST", "/api/auth/login/", body={"username": username, "password": PASSWORD})
    assert status == 200, f"login failed for {username}"
    return data["access"]


def main():
    audit = login("audit1")
    head = login("head_finance")
    other_head = login("head_eng")
    emp = login("emp_finance1")
    council = login("council1")

    today = datetime.date.today()

    # 1. Audit creates report + recommendations -------------------------------
    _, dept_list = request("GET", "/api/departments/", audit)
    finance = next(d for d in dept_list["results"] if d["name"] == "الدائرة المالية")
    status, report = request("POST", "/api/reports/", audit, {
        "title": "تدقيق إدارة النقد " + uuid.uuid4().hex[:6],
        "department": finance["id"],
        "engagement_type": "assurance",
        "response_deadline": str(today + datetime.timedelta(days=14)),
    })
    check("audit creates report", status == 201)
    rid = report["id"]

    status, rec = request("POST", "/api/recommendations/", audit, {
        "report": rid,
        "text": "ضرورة الفصل بين مهام أمين الصندوق ومهام تسجيل القيود المحاسبية في الدائرة المالية",
        "root_cause": "غياب هيكل رقابي واضح",
        "risk_level": "high",
        "priority_score": 90,
    })
    check("audit creates recommendation", status == 201)
    rec_id = rec["id"]

    # 2. Submit to department --------------------------------------------------
    status, _ = request("POST", f"/api/reports/{rid}/submit-to-department/", audit)
    check("report submitted to department", status == 200)

    # RBAC: other department head must not see it
    _, other_view = request("GET", f"/api/recommendations/?report={rid}", other_head)
    check("other department head sees nothing (scoping)", other_view["count"] == 0)

    # Wrong role cannot respond
    status, _ = request("POST", f"/api/recommendations/{rec_id}/respond/", emp,
                        {"decision": "agree"}, expect_error=True)
    check("employee cannot submit management response", status == 403)

    # 3. Department responds (no action plan required at this stage) ----------
    status, detail = request("POST", f"/api/recommendations/{rec_id}/respond/", head,
                             {"decision": "agree", "justification": "سيتم إعادة توزيع المهام"})
    check("department responds without a plan (default policy)", status == 200
          and detail["status"] == "audit_review" and detail["action_plan"] is None)

    # 4. Audit approves -> AUDIT_APPROVAL record, no council date yet ----------
    status, detail = request("POST", f"/api/recommendations/{rec_id}/review/", audit,
                             {"accept": True, "notes": "الرد مقبول"})
    approvals = [a["approval_type"] for a in detail["approvals"]]
    check("audit approval recorded, pending council", status == 200
          and detail["status"] == "pending_council" and approvals == ["audit_approval"])

    _, report_view = request("GET", f"/api/reports/{rid}/", audit)
    check("council_approval_date still unset after audit approval",
          report_view["council_approval_date"] is None)

    # 5. Submit to council + ratify --------------------------------------------
    status, _ = request("POST", f"/api/reports/{rid}/submit-to-council/", audit)
    check("report submitted to council", status == 200)

    # Audit must NOT be able to ratify
    status, _ = request("POST", f"/api/reports/{rid}/ratify/", audit, expect_error=True)
    check("audit role cannot ratify", status == 403)

    status, ratified = request("POST", f"/api/reports/{rid}/ratify/", council, {"notes": "مصادقة"})
    check("council ratifies; anchor date set", status == 200
          and ratified["council_approval_date"] is not None)

    _, detail = request("GET", f"/api/recommendations/{rec_id}/", audit)
    approvals = [a["approval_type"] for a in detail["approvals"]]
    check("plan requested AFTER ratification (default flow)",
          detail["status"] == "action_plan_required" and "council_ratification" in approvals)

    # 6. Department submits plan ----------------------------------------------
    _, employees = request("GET", "/api/employees/", head)
    employee = employees["results"][0]
    plan_body = {
        "responsible_employee": employee["id"],
        "target_date": str(today + datetime.timedelta(days=30)),
        "notes": "خطة إعادة توزيع المهام",
        "steps": [
            {"title": "إعداد مصفوفة فصل المهام", "order": 0},
            {"title": "اعتماد المصفوفة وتطبيقها", "order": 1, "depends_on_index": 0},
        ],
    }
    status, detail = request("POST", f"/api/recommendations/{rec_id}/action-plan/", head, plan_body)
    check("plan submitted for review", status == 200 and detail["status"] == "action_plan_review")

    # 7. Audit requests revision then approves ---------------------------------
    status, detail = request("POST", f"/api/recommendations/{rec_id}/action-plan/review/", audit,
                             {"accept": False, "notes": "الموعد غير واقعي"})
    check("plan revision requested", status == 200 and detail["status"] == "revision_required")

    plan_body["target_date"] = str(today + datetime.timedelta(days=45))
    status, detail = request("POST", f"/api/recommendations/{rec_id}/action-plan/", head, plan_body)
    check("plan resubmitted", status == 200 and detail["status"] == "action_plan_review"
          and detail["action_plan"]["revision_count"] == 1)

    status, detail = request("POST", f"/api/recommendations/{rec_id}/action-plan/review/", audit,
                             {"accept": True, "notes": "معتمدة"})
    check("plan approved -> execution starts", status == 200 and detail["status"] == "in_progress")

    steps = detail["action_plan"]["steps"]

    # 8. Employee executes ------------------------------------------------------
    # Dependency guard: step 2 cannot be done before step 1
    status, err = request("POST", f"/api/recommendations/{rec_id}/steps/{steps[1]['id']}/progress/",
                          emp, {"is_done": True}, expect_error=True)
    check("step dependency enforced", status == 409)

    request("POST", f"/api/recommendations/{rec_id}/steps/{steps[0]['id']}/progress/", emp, {"is_done": True})
    request("POST", f"/api/recommendations/{rec_id}/steps/{steps[1]['id']}/progress/", emp, {"is_done": True})

    # mark-implemented refused without evidence
    status, _ = request("POST", f"/api/recommendations/{rec_id}/mark-implemented/", emp, expect_error=True)
    check("closure guard: evidence required before submission", status == 409)

    status, detail = request("POST", f"/api/recommendations/{rec_id}/evidence/", emp,
                             {"notes": "مصفوفة فصل المهام موقعة"},
                             files={"file": ("matrix.pdf", b"%PDF-1.4 demo evidence")})
    check("evidence uploaded", status == 200 and len(detail["evidence_files"]) == 1)

    status, detail = request("POST", f"/api/recommendations/{rec_id}/mark-implemented/", emp)
    check("employee submits to department head (not audit, not closed)",
          status == 200 and detail["status"] == "pending_head_review")

    status, _ = request("POST", f"/api/recommendations/{rec_id}/verify/", audit,
                        {"decision": "sufficient"}, expect_error=True)
    check("audit cannot verify before head review", status == 409)

    status, detail = request("POST", f"/api/recommendations/{rec_id}/review-implementation/", head,
                             {"accept": True, "notes": "التنفيذ مكتمل"})
    check("head submits to internal audit",
          status == 200 and detail["status"] == "submitted_for_verification")

    # 9. Verification loop -------------------------------------------------------
    status, _ = request("POST", f"/api/recommendations/{rec_id}/verify/", audit,
                        {"decision": "insufficient"}, expect_error=True)
    check("insufficient verdict requires structured feedback", status == 409)

    status, detail = request("POST", f"/api/recommendations/{rec_id}/verify/", audit, {
        "decision": "insufficient",
        "rejected_items": "المصفوفة غير موقعة من المدير",
        "rejection_reason": "لا يمكن اعتماد وثيقة غير موقعة",
        "required_action": "رفع النسخة الموقعة",
        "action_deadline": str(today + datetime.timedelta(days=7)),
    })
    check("returned insufficient with structured record", status == 200
          and detail["status"] == "returned_insufficient"
          and detail["verifications"][0]["assigned_to_detail"] is not None)

    status, detail = request("POST", f"/api/recommendations/{rec_id}/evidence/", emp,
                             {"notes": "النسخة الموقعة"},
                             files={"file": ("matrix-signed.pdf", b"%PDF-1.4 signed")})
    check("new evidence auto-resumes execution", status == 200 and detail["status"] == "in_progress")

    request("POST", f"/api/recommendations/{rec_id}/mark-implemented/", emp)
    status, detail = request("POST", f"/api/recommendations/{rec_id}/review-implementation/", head,
                             {"accept": True, "notes": "النسخة الموقعة مكتملة"})
    check("head resubmits to audit after return",
          status == 200 and detail["status"] == "submitted_for_verification")

    status, detail = request("POST", f"/api/recommendations/{rec_id}/verify/", audit,
                             {"decision": "sufficient", "notes": "أدلة كافية"})
    check("sufficient evidence starts closure review (does not close)",
          status == 200 and detail["status"] == "closure_review"
          and not detail["resolution"])

    status, _ = request("POST", f"/api/recommendations/{rec_id}/council-closure/", council,
                        {"accept": True}, expect_error=True)
    check("council cannot close before audit sends the closure package", status == 409)

    status, detail = request("POST", f"/api/recommendations/{rec_id}/submit-for-closure/", audit,
                             {"notes": "ملف الإغلاق جاهز"})
    check("audit sends closure package to council",
          status == 200 and detail["status"] == "pending_closure_council")

    status, detail = request("POST", f"/api/recommendations/{rec_id}/council-closure/", council,
                             {"accept": True, "notes": "يوافق المجلس"})
    check("council agrees -> CLOSED", status == 200 and detail["status"] == "closed"
          and detail["resolution"] == "implemented")

    trail_actions = [t["action"] for t in detail["trail"]]
    check("immutable trail covers the full lifecycle",
          all(a in trail_actions for a in [
              "recommendation_created", "report_submitted_to_department",
              "management_response_submitted", "audit_approved_response",
              "council_ratification", "action_plan_submitted", "action_plan_approved",
              "evidence_uploaded", "marked_implemented", "implementation_submitted_to_audit",
              "verified_insufficient", "verified_sufficient",
              "closure_submitted_to_council", "council_closed_recommendation",
          ]), detail=str(trail_actions))

    # 10. AI recurrence flag ------------------------------------------------------
    status, report2 = request("POST", "/api/reports/", audit, {
        "title": "تدقيق لاحق " + uuid.uuid4().hex[:6],
        "department": finance["id"],
        "engagement_type": "assurance",
    })
    status, rec2 = request("POST", "/api/recommendations/", audit, {
        "report": report2["id"],
        "text": "ضرورة الفصل بين مهام أمين الصندوق ومهام تسجيل القيود المحاسبية في الدائرة المالية",
        "risk_level": "high",
    })
    check("similar recommendation flagged as possible recurrence",
          status == 201 and rec2 is not None)
    _, rec2_detail = request("GET", f"/api/recommendations/{rec2['id']}/", audit)
    check("recurrence links to the original with a score",
          rec2_detail["is_recurring"] and rec2_detail["similar_recommendation"] == rec_id
          and rec2_detail["similarity_score"] and rec2_detail["similarity_score"] > 0.85)

    # 11. Dashboards render for every role ----------------------------------------
    for name, token in [("audit", audit), ("department_head", head), ("employee", emp), ("council", council)]:
        status, dash = request("GET", "/api/dashboard/", token)
        check(f"dashboard for {name}", status == 200 and dash["role"] == name)

    failed = [c for c in checks if not c[1]]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
