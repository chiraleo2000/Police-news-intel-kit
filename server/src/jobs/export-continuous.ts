/**
 * Rewrite the continuous LINE intake workbook (URLs + uploads only).
 * Usage: npm run job:export-continuous
 */
import { writeContinuousIntakeExcel } from "../export/continuous.js";

async function main() {
  const r = await writeContinuousIntakeExcel();
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
