// Run: node -r sucrase/register src/lib/nrs/invoice/payslip.test.ts
import assert from "node:assert/strict";
import { isPayslipStatus, payslipBreakdown, payslipMonth, payslipNumber } from "./payslipCalc";

const b = payslipBreakdown([
  { kind: "fee", description: "Monthly retainer", quantity: "1", amount_minor: 500000 },
  { kind: "leave_deduction", description: "Unpaid leave", quantity: "2", amount_minor: -45000 },
  { kind: "adjustment", description: "Bonus", quantity: "1", amount_minor: 10000 },
  { kind: "expense", description: "Taxi", quantity: "1", amount_minor: 2500 },
]);
assert.equal(b.grossMinor, 510000);
assert.equal(b.deductionsMinor, 45000);
assert.equal(b.reimbursementsMinor, 2500);
assert.equal(b.netMinor, 467500); // equals the invoice total
assert.equal(b.deductions[0].amount_minor, 45000);
assert.equal(b.deductions[0].detail, "2 days");
assert.equal(payslipMonth("2026-09-01"), "September 2026");
assert.equal(payslipNumber("INV-2026-09-0001"), "PS-INV-2026-09-0001");
assert.equal(isPayslipStatus("paid"), true);
assert.equal(isPayslipStatus("finance_approved"), true);
assert.equal(isPayslipStatus("submitted"), false);
console.log("payslip.test.ts: all assertions passed");
