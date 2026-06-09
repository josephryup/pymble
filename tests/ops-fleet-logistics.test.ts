import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOpsFleetCalendarDayDelta,
  getOpsFleetPlanningBucket,
} from "../src/lib/ops/fleet-logistics";
import {
  buildOpsFleetDispatchReport,
  buildOpsFleetOperatorComplianceReport,
  buildOpsFleetProfitabilityReport,
} from "../src/lib/ops/fleet-logistics-reporting";
import {
  canApproveOpsTransportRequest,
  canCancelOpsAccommodationBooking,
  canCompleteOpsAccommodationBooking,
  canCompleteOpsLabourAllocation,
  canCreateOpsAccommodationBooking,
  canCreateOpsLabourAllocation,
  canCreateOpsTransportRequest,
  canManageOpsFleetOperatorDocuments,
  canScheduleOpsTransportRequest,
  canStartOpsLabourAllocation,
  canSubmitOpsTransportRequest,
  canViewOpsFleetLogistics,
} from "../src/lib/ops/fleet-logistics-permissions";

describe("fleet logistics guards", () => {
  it("buckets transport requests for trip planning attention", () => {
    assert.equal(getOpsFleetCalendarDayDelta("2026-06-12", "2026-06-05"), 7);
    assert.equal(
      getOpsFleetPlanningBucket({
        requestedFor: "2026-06-04",
        scheduledAt: null,
        status: "approved",
        todayDate: "2026-06-05",
      }),
      "overdue",
    );
    assert.equal(
      getOpsFleetPlanningBucket({
        requestedFor: "2026-06-08",
        scheduledAt: null,
        status: "submitted",
        todayDate: "2026-06-05",
      }),
      "next_7_days",
    );
    assert.equal(
      getOpsFleetPlanningBucket({
        requestedFor: "2026-06-20",
        scheduledAt: "2026-06-15T08:00:00+02:00",
        status: "scheduled",
        todayDate: "2026-06-05",
      }),
      "scheduled",
    );
  });

  it("builds dispatch calendar assignment and transport cost variance reports", () => {
    const report = buildOpsFleetDispatchReport({
      todayDate: "2026-06-05",
      transports: [
        {
          actual_cost: 0,
          assigned_equipment_id: null,
          assigned_operator_employee_id: null,
          assigned_operator_worker_id: null,
          destination: "Site B",
          estimated_cost: 1200,
          origin: "HQ",
          passenger_count: 3,
          priority: "normal",
          request_number: "TR-001",
          request_type: "staff_transport",
          requested_for: "2026-06-05",
          scheduled_at: null,
          status: "approved",
          title: "Staff shuttle",
        },
        {
          actual_cost: 0,
          assigned_equipment_id: "equipment-1",
          assigned_operator_employee_id: "employee-1",
          assigned_operator_worker_id: null,
          destination: "Site C",
          estimated_cost: 2500,
          origin: "Plant yard",
          passenger_count: 1,
          priority: "high",
          request_number: "TR-002",
          request_type: "equipment_move",
          requested_for: "2026-06-06",
          scheduled_at: "2026-06-06T09:00:00+02:00",
          status: "scheduled",
          title: "Excavator move",
        },
        {
          actual_cost: 1750,
          assigned_equipment_id: "equipment-2",
          assigned_operator_employee_id: null,
          assigned_operator_worker_id: "worker-1",
          destination: "Site D",
          estimated_cost: 1500,
          origin: "Site A",
          passenger_count: 0,
          priority: "normal",
          request_number: "TR-003",
          request_type: "material_delivery",
          requested_for: "2026-06-01",
          scheduled_at: "2026-06-01T10:00:00+02:00",
          status: "completed",
          title: "Cement delivery",
        },
      ],
    });

    assert.equal(report.days[0]?.transports, 1);
    assert.equal(report.days[0]?.unassigned_transports, 1);
    assert.equal(report.days[1]?.assigned_transports, 1);
    assert.equal(report.days[1]?.urgent_transports, 1);
    assert.equal(report.totals.transportCount, 2);
    assert.equal(report.totals.estimatedCost, 3700);
    assert.equal(report.variance.actualCost, 1750);
    assert.equal(report.variance.estimatedCost, 1500);
    assert.equal(report.variance.overrunCount, 1);
    assert.equal(report.variance.varianceAmount, 250);
    assert.equal(report.variance.rows[0]?.request_number, "TR-003");
  });

  it("builds operator document expiry compliance reports", () => {
    const report = buildOpsFleetOperatorComplianceReport({
      documents: [
        {
          document_type: "driver_license",
          expires_at: "2026-06-04",
          id: "doc-1",
          issued_at: "2025-06-04",
          operator_id: "employee-1",
          operator_name: "Grace Driver",
          operator_reference: "EMP-001",
          operator_type: "employee",
          reference_number: "DL-1",
          reminder_days: 30,
          status: "active",
          title: "Driver license",
        },
        {
          document_type: "operator_permit",
          expires_at: "2026-06-20",
          id: "doc-2",
          issued_at: "2025-06-20",
          operator_id: "worker-1",
          operator_name: "Moses Operator",
          operator_reference: "WRK-001",
          operator_type: "worker",
          reference_number: "OP-1",
          reminder_days: 30,
          status: "active",
          title: "Excavator permit",
        },
        {
          document_type: "medical_certificate",
          expires_at: null,
          id: "doc-3",
          issued_at: "2026-01-01",
          operator_id: "employee-2",
          operator_name: "Amina HSE",
          operator_reference: "EMP-002",
          operator_type: "employee",
          reference_number: "",
          reminder_days: 30,
          status: "active",
          title: "Medical certificate",
        },
        {
          document_type: "defensive_driving",
          expires_at: "2026-12-31",
          id: "doc-4",
          issued_at: "2026-01-01",
          operator_id: "employee-3",
          operator_name: "Peter Fleet",
          operator_reference: "EMP-003",
          operator_type: "employee",
          reference_number: "DD-1",
          reminder_days: 30,
          status: "archived",
          title: "Defensive driving",
        },
      ],
      todayDate: "2026-06-05",
    });

    assert.equal(report.activeDocuments, 3);
    assert.equal(report.archivedDocuments, 1);
    assert.equal(report.expiredDocuments, 1);
    assert.equal(report.dueSoonDocuments, 1);
    assert.equal(report.noExpiryDocuments, 1);
    assert.equal(report.rows[0]?.bucket, "expired");
    assert.equal(report.rows[1]?.bucket, "due_soon");
  });

  it("builds fleet profitability summaries from recovery and operating cost sources", () => {
    const report = buildOpsFleetProfitabilityReport({
      sources: [
        {
          amount: 5000,
          equipment_code: "TRK-01",
          equipment_id: "equipment-1",
          equipment_name: "Tipper truck",
          occurred_on: "2026-06-01",
          site_code: "S01",
          site_id: "site-1",
          site_name: "Pymble Yard",
          source_type: "transport_recovery",
        },
        {
          amount: 3000,
          equipment_code: "EXC-01",
          equipment_id: "equipment-2",
          equipment_name: "Excavator",
          occurred_on: "2026-06-02",
          site_code: "S01",
          site_id: "site-1",
          site_name: "Pymble Yard",
          source_type: "equipment_recovery",
        },
        {
          amount: 1200,
          equipment_code: "TRK-01",
          equipment_id: "equipment-1",
          equipment_name: "Tipper truck",
          occurred_on: "2026-06-03",
          site_code: "S01",
          site_id: "site-1",
          site_name: "Pymble Yard",
          source_type: "fuel_cost",
        },
        {
          amount: 900,
          equipment_code: "EXC-01",
          equipment_id: "equipment-2",
          equipment_name: "Excavator",
          occurred_on: "2026-06-04",
          site_code: "S02",
          site_id: "site-2",
          site_name: "Remote Site",
          source_type: "maintenance_cost",
        },
        {
          amount: 10000,
          equipment_code: "OLD",
          equipment_id: "equipment-old",
          equipment_name: "Old plant",
          occurred_on: "2025-12-01",
          site_code: "OLD",
          site_id: "site-old",
          site_name: "Old Site",
          source_type: "transport_recovery",
        },
      ],
      todayDate: "2026-06-05",
      windowDays: 90,
    });

    assert.equal(report.sourceCount, 4);
    assert.equal(report.recoveryAmount, 8000);
    assert.equal(report.operatingCost, 2100);
    assert.equal(report.contributionAmount, 5900);
    assert.equal(Math.round((report.contributionPercent ?? 0) * 10) / 10, 73.8);
    assert.equal(report.siteRows[0]?.id, "site-2");
    assert.equal(report.equipmentRows[0]?.id, "equipment-2");
  });

  it("scopes logistics visibility to delivery, HR, finance, HSE, and leadership roles", () => {
    assert.equal(canViewOpsFleetLogistics("developer"), true);
    assert.equal(canViewOpsFleetLogistics("operations_manager"), true);
    assert.equal(canViewOpsFleetLogistics("engineer"), true);
    assert.equal(canViewOpsFleetLogistics("human_resource"), true);
    assert.equal(canViewOpsFleetLogistics("finance_manager"), true);
    assert.equal(canViewOpsFleetLogistics("hse_officer"), true);
    assert.equal(canViewOpsFleetLogistics("procurement_assistant"), false);
  });

  it("lets site and HR roles create logistics records", () => {
    assert.equal(canCreateOpsTransportRequest("engineer"), true);
    assert.equal(canCreateOpsAccommodationBooking("human_resource"), true);
    assert.equal(canCreateOpsLabourAllocation("operations_manager"), true);
    assert.equal(canCreateOpsTransportRequest("procurement_assistant"), false);
    assert.equal(canManageOpsFleetOperatorDocuments("human_resource"), true);
    assert.equal(canManageOpsFleetOperatorDocuments("hse_officer"), true);
    assert.equal(canManageOpsFleetOperatorDocuments("engineer"), false);
  });

  it("guards transport request lifecycle transitions", () => {
    const draft = { requested_by: "user-1", status: "draft" as const };
    const submitted = { requested_by: "user-1", status: "submitted" as const };
    const approved = { requested_by: "user-1", status: "approved" as const };

    assert.equal(canSubmitOpsTransportRequest("user-1", "engineer", draft), true);
    assert.equal(canSubmitOpsTransportRequest("someone-else", "engineer", draft), false);
    assert.equal(canApproveOpsTransportRequest("operations_manager", submitted), true);
    assert.equal(canApproveOpsTransportRequest("engineer", submitted), false);
    assert.equal(canScheduleOpsTransportRequest("projects_manager", approved), true);
    assert.equal(canScheduleOpsTransportRequest("engineer", approved), false);
  });

  it("guards accommodation and labour operational transitions", () => {
    const requested = { requested_by: "user-1", status: "requested" as const };
    const checkedIn = { requested_by: "user-1", status: "checked_in" as const };
    const planned = { requested_by: "user-1", status: "planned" as const };
    const active = { requested_by: "user-1", status: "active" as const };

    assert.equal(canCompleteOpsAccommodationBooking("operations_manager", checkedIn), true);
    assert.equal(canCompleteOpsAccommodationBooking("engineer", checkedIn), false);
    assert.equal(canCancelOpsAccommodationBooking("user-1", "engineer", requested), true);
    assert.equal(canStartOpsLabourAllocation("operations_manager", planned), true);
    assert.equal(canStartOpsLabourAllocation("engineer", planned), false);
    assert.equal(canCompleteOpsLabourAllocation("projects_manager", active), true);
  });
});
