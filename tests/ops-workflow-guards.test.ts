import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canDecideOpsApprovalStep } from "../src/lib/ops/approval-permissions";
import { canDownloadOpsDocument } from "../src/lib/ops/document-access";
import { canMutateOpsDocument } from "../src/lib/ops/document-permissions";
import {
  opsNotificationNoticeHref,
  parseOpsNotificationActionInput,
  safeOpsNotificationReturnTo,
} from "../src/lib/ops/notification-form";
import { OPS_DOCUMENT_VISIBILITY_ORDER } from "../src/lib/ops/document-permissions";
import {
  isOpsRecordActivitySourceTable,
  normalizeOpsRecordCommentBody,
  OPS_RECORD_ACTIVITY_SOURCE_TABLES,
  OPS_RECORD_ATTACHMENT_DEFAULT_VISIBILITY,
  validateOpsRecordCommentBody,
} from "../src/lib/ops/record-activity";
import { safeOpsReturnTo } from "../src/lib/ops/return-paths";
import {
  isOpsUploadScope,
  OPS_MAX_UPLOAD_BYTES,
  OPS_UPLOAD_KEY_PREFIXES,
  safeOpsFileName,
  validateOpsUploadDescriptor,
  validateOpsUploadFile,
} from "../src/lib/ops/upload-validation";

const uploadMessages = {
  empty: "Select a file.",
  tooLarge: "Too large.",
  unsupportedType: "Unsupported.",
};

describe("approval decision guards", () => {
  it("allows Developer override and direct assignees", () => {
    assert.equal(
      canDecideOpsApprovalStep("developer", "actor-1", {
        approver_role: null,
        approver_user_id: null,
      }),
      true,
    );
    assert.equal(
      canDecideOpsApprovalStep("engineer", "actor-1", {
        approver_role: null,
        approver_user_id: "actor-1",
      }),
      true,
    );
  });

  it("allows Managing Director aliases and rejects unrelated roles", () => {
    assert.equal(
      canDecideOpsApprovalStep("owner", "owner-1", {
        approver_role: "managing_director",
        approver_user_id: null,
      }),
      true,
    );
    assert.equal(
      canDecideOpsApprovalStep("engineer", "engineer-1", {
        approver_role: "finance_manager",
        approver_user_id: null,
      }),
      false,
    );
  });
});

describe("document mutation guards", () => {
  it("allows super-admins (owner/developer) or the uploader only", () => {
    assert.equal(
      canMutateOpsDocument("developer-1", "developer", { uploaded_by: "someone-else" }),
      true,
    );
    assert.equal(
      canMutateOpsDocument("owner-1", "owner", { uploaded_by: "someone-else" }),
      true,
    );
    assert.equal(
      canMutateOpsDocument("uploader-1", "engineer", { uploaded_by: "uploader-1" }),
      true,
    );
    // A plain MD does not edit documents they do not own — they approve via
    // the approval flow instead (least privilege).
    assert.equal(
      canMutateOpsDocument("md-1", "managing_director", { uploaded_by: "someone-else" }),
      false,
    );
    assert.equal(
      canMutateOpsDocument("engineer-1", "engineer", { uploaded_by: "someone-else" }),
      false,
    );
  });
});

describe("document download guards", () => {
  it("allows sensitive roles, company files, and the uploader", () => {
    assert.equal(
      canDownloadOpsDocument("developer", "developer-1", {
        status: "active",
        uploaded_by: "someone-else",
        visibility: "private",
      }),
      true,
    );
    assert.equal(
      canDownloadOpsDocument("engineer", "engineer-1", {
        status: "active",
        uploaded_by: "someone-else",
        visibility: "public",
      }),
      true,
    );
    assert.equal(
      canDownloadOpsDocument("engineer", "engineer-1", {
        status: "active",
        uploaded_by: "engineer-1",
        visibility: "private",
      }),
      true,
    );
  });

  it("rejects archived or unauthorized private files", () => {
    assert.equal(
      canDownloadOpsDocument("engineer", "engineer-1", {
        status: "archived",
        uploaded_by: "engineer-1",
        visibility: "public",
      }),
      false,
    );
    assert.equal(
      canDownloadOpsDocument("engineer", "engineer-1", {
        status: "active",
        uploaded_by: "someone-else",
        visibility: "private",
      }),
      false,
    );
  });
});

describe("record activity guards", () => {
  it("keeps record activity scoped to implemented source tables", () => {
    assert.equal(isOpsRecordActivitySourceTable("sites"), true);
    assert.equal(isOpsRecordActivitySourceTable("boq_documents"), true);
    assert.equal(isOpsRecordActivitySourceTable("invoices"), true);
    assert.equal(isOpsRecordActivitySourceTable("material_requests"), true);
    assert.equal(isOpsRecordActivitySourceTable("suppliers"), true);
    assert.equal(isOpsRecordActivitySourceTable("rfqs"), true);
    assert.equal(isOpsRecordActivitySourceTable("goods_received_notes"), true);
    assert.equal(isOpsRecordActivitySourceTable("daily_site_reports"), true);
    assert.equal(isOpsRecordActivitySourceTable("site_instructions"), true);
    assert.equal(isOpsRecordActivitySourceTable("qa_inspections"), true);
    assert.equal(isOpsRecordActivitySourceTable("material_tests"), true);
    assert.equal(isOpsRecordActivitySourceTable("snag_items"), true);
    assert.equal(isOpsRecordActivitySourceTable("drawing_register"), true);
    assert.equal(isOpsRecordActivitySourceTable("programme_milestones"), true);
    assert.equal(isOpsRecordActivitySourceTable("delivery_exceptions"), true);
    assert.equal(isOpsRecordActivitySourceTable("project_budgets"), true);
    assert.equal(isOpsRecordActivitySourceTable("payment_requests"), true);
    assert.equal(isOpsRecordActivitySourceTable("equipment_requests"), true);
    assert.equal(isOpsRecordActivitySourceTable("fuel_logs"), true);
    assert.equal(isOpsRecordActivitySourceTable("maintenance_jobs"), true);
    assert.equal(isOpsRecordActivitySourceTable("transport_requests"), true);
    assert.equal(isOpsRecordActivitySourceTable("accommodation_bookings"), true);
    assert.equal(isOpsRecordActivitySourceTable("labour_allocations"), true);
    assert.equal(isOpsRecordActivitySourceTable("fleet_operator_documents"), true);
    assert.equal(isOpsRecordActivitySourceTable("commercial_ipcs"), true);
    assert.equal(isOpsRecordActivitySourceTable("commercial_variations"), true);
    assert.equal(isOpsRecordActivitySourceTable("commercial_claims"), true);
    assert.equal(isOpsRecordActivitySourceTable("commercial_contracts"), true);
    assert.equal(isOpsRecordActivitySourceTable("commercial_valuations"), true);
    assert.equal(isOpsRecordActivitySourceTable("commercial_risks"), true);
    assert.equal(isOpsRecordActivitySourceTable("hse_incidents"), true);
    assert.equal(isOpsRecordActivitySourceTable("corrective_actions"), true);
    assert.equal(isOpsRecordActivitySourceTable("ppe_items"), true);
    assert.equal(isOpsRecordActivitySourceTable("ppe_issues"), true);
    assert.equal(isOpsRecordActivitySourceTable("toolbox_talks"), true);
    assert.equal(isOpsRecordActivitySourceTable("hse_inspections"), true);
    assert.equal(isOpsRecordActivitySourceTable("hse_inspection_findings"), true);
    assert.equal(isOpsRecordActivitySourceTable("safety_training_records"), true);
    assert.equal(isOpsRecordActivitySourceTable("hse_risk_assessments"), true);
    assert.equal(isOpsRecordActivitySourceTable("hse_compliance_audits"), true);
    assert.equal(isOpsRecordActivitySourceTable("employees"), true);
    assert.equal(isOpsRecordActivitySourceTable("leave_requests"), true);
    assert.equal(isOpsRecordActivitySourceTable("recruitment_requisitions"), true);
    assert.equal(isOpsRecordActivitySourceTable("employee_contracts"), true);
    assert.equal(isOpsRecordActivitySourceTable("performance_appraisals"), true);
    assert.equal(isOpsRecordActivitySourceTable("leave_balances"), true);
    assert.equal(isOpsRecordActivitySourceTable("employee_onboarding_items"), true);
    assert.equal(isOpsRecordActivitySourceTable("users"), false);
  });

  it("normalizes and validates comment bodies", () => {
    assert.equal(normalizeOpsRecordCommentBody("  Site   note\nready  "), "Site note ready");
    assert.deepEqual(validateOpsRecordCommentBody("x"), {
      message: "Comment is required.",
      ok: false,
    });
    assert.deepEqual(validateOpsRecordCommentBody("  Progress   checked  "), {
      body: "Progress checked",
      ok: true,
    });
    assert.deepEqual(validateOpsRecordCommentBody("x".repeat(801)), {
      message: "Comment must be 800 characters or fewer.",
      ok: false,
    });
  });
});

describe("notification return paths", () => {
  it("allows internal ops paths only", () => {
    assert.equal(
      safeOpsReturnTo("/ops/notifications?status=read", "/ops"),
      "/ops/notifications?status=read",
    );
    assert.equal(safeOpsReturnTo("/ops?updated=1", "/ops/notifications"), "/ops?updated=1");
    assert.equal(
      safeOpsReturnTo("https://example.com", "/ops/notifications"),
      "/ops/notifications",
    );
    assert.equal(safeOpsReturnTo("//example.com", "/ops/notifications"), "/ops/notifications");
    assert.equal(safeOpsReturnTo("/operations", "/ops/notifications"), "/ops/notifications");
  });
});

describe("notification acknowledgement form helpers", () => {
  const validNotificationId = "11111111-1111-4111-8111-111111111111";

  it("parses valid notification actions and sanitizes return paths", () => {
    assert.deepEqual(
      parseOpsNotificationActionInput({
        id: validNotificationId,
        return_to: "/ops/approvals?status=submitted",
      }),
      {
        id: validNotificationId,
        ok: true,
        returnTo: "/ops/approvals?status=submitted",
      },
    );
    assert.equal(safeOpsNotificationReturnTo("https://example.com"), "/ops/notifications");
  });

  it("rejects invalid notification ids and appends notices safely", () => {
    assert.deepEqual(
      parseOpsNotificationActionInput({
        id: "bad-id",
        return_to: "/ops/notifications?status=read",
      }),
      {
        message: "Select a notification.",
        ok: false,
        returnTo: "/ops/notifications?status=read",
      },
    );
    assert.equal(
      opsNotificationNoticeHref("/ops/notifications?status=read", "updated", "notification_read"),
      "/ops/notifications?status=read&updated=notification_read",
    );
    assert.equal(
      opsNotificationNoticeHref("/ops/notifications", "error", "Try again."),
      "/ops/notifications?error=Try%20again.",
    );
  });
});

describe("upload validation", () => {
  it("normalizes file names for private object keys", () => {
    assert.equal(safeOpsFileName("  Site Plan Final (A).PDF  "), "site-plan-final-a.pdf");
    assert.equal(safeOpsFileName("../../../secret.txt"), "secret.txt");
    assert.equal(safeOpsFileName("..."), "file");
  });

  it("accepts allowed files and rejects empty, oversized, and unsupported files", () => {
    const valid = validateOpsUploadFile(
      new File(["hello"], "note.txt", { type: "text/plain" }),
      uploadMessages,
    );
    assert.equal(valid.ok, true);

    const empty = validateOpsUploadFile(
      new File([], "empty.txt", { type: "text/plain" }),
      uploadMessages,
    );
    assert.deepEqual(empty, { message: "Select a file.", ok: false });

    const unsupported = validateOpsUploadFile(
      new File(["hello"], "script.js", { type: "application/javascript" }),
      uploadMessages,
    );
    assert.deepEqual(unsupported, { message: "Unsupported.", ok: false });

    const oversized = validateOpsUploadFile(
      new File([new Uint8Array(OPS_MAX_UPLOAD_BYTES + 1)], "large.pdf", {
        type: "application/pdf",
      }),
      uploadMessages,
    );
    assert.deepEqual(oversized, { message: "Too large.", ok: false });
  });

  it("applies the same gate to a described file as to its bytes", () => {
    assert.deepEqual(
      validateOpsUploadDescriptor(
        { contentType: "application/pdf", size: 1024 },
        uploadMessages,
      ),
      { ok: true },
    );
    assert.deepEqual(
      validateOpsUploadDescriptor({ contentType: "application/pdf", size: 0 }, uploadMessages),
      { message: "Select a file.", ok: false },
    );
    assert.deepEqual(
      validateOpsUploadDescriptor(
        { contentType: "application/pdf", size: OPS_MAX_UPLOAD_BYTES + 1 },
        uploadMessages,
      ),
      { message: "Too large.", ok: false },
    );
    assert.deepEqual(
      validateOpsUploadDescriptor(
        { contentType: "application/javascript", size: 1024 },
        uploadMessages,
      ),
      { message: "Unsupported.", ok: false },
    );
  });

  it("only signs uploads into a known key prefix", () => {
    assert.equal(isOpsUploadScope("record_attachment"), true);
    assert.equal(isOpsUploadScope("document"), true);
    // A caller-chosen prefix is what would let a presigned PUT overwrite the
    // object behind an existing document version.
    assert.equal(isOpsUploadScope("documents/../../anything"), false);
    assert.equal(isOpsUploadScope(""), false);
    assert.equal(isOpsUploadScope(undefined), false);

    for (const prefix of Object.values(OPS_UPLOAD_KEY_PREFIXES)) {
      assert.ok(prefix.startsWith("documents/"));
    }
  });
});

describe("record attachment visibility", () => {
  it("defaults every source table to a real ops_document_visibility member", () => {
    // The panel used to offer "restricted"/"company", which are not members of
    // the Postgres enum, so every attachment upload failed with a raw
    // `invalid input value for enum ops_document_visibility` error. Anything
    // pre-selected must exist in the database's vocabulary.
    for (const table of OPS_RECORD_ACTIVITY_SOURCE_TABLES) {
      assert.ok(
        OPS_DOCUMENT_VISIBILITY_ORDER.includes(
          OPS_RECORD_ATTACHMENT_DEFAULT_VISIBILITY[table],
        ),
        `${table} defaults to a visibility tier that does not exist`,
      );
    }
  });

  it("never starts personal or commercial records company-wide", () => {
    // Public means every signed-in staff member, so an employee contract or a
    // payment request must not land there by default.
    for (const table of [
      "employee_contracts",
      "employees",
      "invoices",
      "leave_requests",
      "payment_requests",
      "performance_appraisals",
      "department_reports",
    ] as const) {
      assert.notEqual(
        OPS_RECORD_ATTACHMENT_DEFAULT_VISIBILITY[table],
        "public",
        `${table} attachments must not default to all staff`,
      );
    }
  });

  it("keeps site evidence visible to the people working the record", () => {
    for (const table of [
      "daily_site_reports",
      "qa_inspections",
      "snag_items",
      "material_tests",
    ] as const) {
      assert.equal(OPS_RECORD_ATTACHMENT_DEFAULT_VISIBILITY[table], "public");
    }
  });
});
