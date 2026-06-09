import type { OpsEmployeeDocumentStatus, OpsEmployeeStatus } from "@/lib/ops/types";

export type OpsHrDocumentCoverageEmployeeInput = {
  department: string;
  id: string;
  status: OpsEmployeeStatus;
};

export type OpsHrDocumentCoverageCategoryInput = {
  category_code: string;
  id: string;
  is_active: boolean;
  is_required: boolean;
  name: string;
};

export type OpsHrDocumentCoverageDocumentInput = {
  category_id: string;
  employee_id: string;
  expiry_date: string | null;
  status: OpsEmployeeDocumentStatus;
};

export type OpsHrDocumentCoverageCategoryRow = {
  categoryCode: string;
  categoryId: string;
  categoryName: string;
  covered: number;
  missing: number;
  required: boolean;
  totalEmployees: number;
};

export type OpsHrDocumentCoverageDepartmentRow = {
  coveredRequiredSlots: number;
  department: string;
  missingRequiredSlots: number;
  totalRequiredSlots: number;
};

export type OpsHrDocumentCoverageReport = {
  acceptedDocuments: number;
  categoryRows: OpsHrDocumentCoverageCategoryRow[];
  coveredRequiredSlots: number;
  departmentRows: OpsHrDocumentCoverageDepartmentRow[];
  expiredDocuments: number;
  missingRequiredSlots: number;
  rejectedDocuments: number;
  requiredCategoryCount: number;
  submittedDocuments: number;
  totalEmployeeDocuments: number;
  totalEmployees: number;
  totalRequiredSlots: number;
};

const COVERING_DOCUMENT_STATUSES: OpsEmployeeDocumentStatus[] = ["submitted", "accepted"];

function isActiveEmployeeStatus(status: OpsEmployeeStatus) {
  return status === "active" || status === "probation" || status === "on_leave";
}

function isDocumentExpired(expiryDate: string | null, today: string) {
  return Boolean(expiryDate && expiryDate < today);
}

function coversRequiredCategory(
  document: OpsHrDocumentCoverageDocumentInput,
  today: string,
) {
  return (
    COVERING_DOCUMENT_STATUSES.includes(document.status) &&
    !isDocumentExpired(document.expiry_date, today)
  );
}

export function buildOpsHrDocumentCoverageReport({
  categories,
  documents,
  employees,
  today,
}: {
  categories: OpsHrDocumentCoverageCategoryInput[];
  documents: OpsHrDocumentCoverageDocumentInput[];
  employees: OpsHrDocumentCoverageEmployeeInput[];
  today: string;
}): OpsHrDocumentCoverageReport {
  const activeEmployees = employees.filter((employee) => isActiveEmployeeStatus(employee.status));
  const activeCategories = categories.filter((category) => category.is_active);
  const requiredCategories = activeCategories.filter((category) => category.is_required);
  const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id));
  const requiredCategoryIds = new Set(requiredCategories.map((category) => category.id));
  const coveredRequiredKeys = new Set<string>();
  const departmentBuckets = new Map<string, OpsHrDocumentCoverageDepartmentRow>();

  activeEmployees.forEach((employee) => {
    const department = employee.department || "Unassigned";
    departmentBuckets.set(department, {
      coveredRequiredSlots: 0,
      department,
      missingRequiredSlots: 0,
      totalRequiredSlots: requiredCategories.length,
    });
  });

  documents.forEach((document) => {
    if (
      !activeEmployeeIds.has(document.employee_id) ||
      !requiredCategoryIds.has(document.category_id) ||
      !coversRequiredCategory(document, today)
    ) {
      return;
    }

    coveredRequiredKeys.add(`${document.employee_id}:${document.category_id}`);
  });

  activeEmployees.forEach((employee) => {
    const department = employee.department || "Unassigned";
    const row = departmentBuckets.get(department);

    if (!row) {
      return;
    }

    requiredCategories.forEach((category) => {
      if (coveredRequiredKeys.has(`${employee.id}:${category.id}`)) {
        row.coveredRequiredSlots += 1;
      }
    });

    row.missingRequiredSlots = row.totalRequiredSlots - row.coveredRequiredSlots;
  });

  const categoryRows = activeCategories.map((category) => {
    const covered = activeEmployees.filter((employee) =>
      documents.some(
        (document) =>
          document.employee_id === employee.id &&
          document.category_id === category.id &&
          coversRequiredCategory(document, today),
      ),
    ).length;

    return {
      categoryCode: category.category_code,
      categoryId: category.id,
      categoryName: category.name,
      covered,
      missing: category.is_required ? activeEmployees.length - covered : 0,
      required: category.is_required,
      totalEmployees: activeEmployees.length,
    };
  });

  const totalRequiredSlots = activeEmployees.length * requiredCategories.length;
  const coveredRequiredSlots = coveredRequiredKeys.size;

  return {
    acceptedDocuments: documents.filter((document) => document.status === "accepted").length,
    categoryRows,
    coveredRequiredSlots,
    departmentRows: Array.from(departmentBuckets.values()).sort((a, b) =>
      b.missingRequiredSlots === a.missingRequiredSlots
        ? a.department.localeCompare(b.department)
        : b.missingRequiredSlots - a.missingRequiredSlots,
    ),
    expiredDocuments: documents.filter(
      (document) => document.status === "expired" || isDocumentExpired(document.expiry_date, today),
    ).length,
    missingRequiredSlots: Math.max(totalRequiredSlots - coveredRequiredSlots, 0),
    rejectedDocuments: documents.filter((document) => document.status === "rejected").length,
    requiredCategoryCount: requiredCategories.length,
    submittedDocuments: documents.filter((document) => document.status === "submitted").length,
    totalEmployeeDocuments: documents.filter((document) => document.status !== "archived").length,
    totalEmployees: activeEmployees.length,
    totalRequiredSlots,
  };
}
