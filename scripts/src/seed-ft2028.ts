import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { db, members } from "@workspace/db";
import { sql } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));

const COHORT = "ft_2028";

interface XlsxRow {
  "First Name"?: string;
  "Last Name"?: string;
  "Email"?: string;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  const filePath = process.env.XLSX_PATH ?? join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../Downloads/ClassOf2028.xlsx",
  );

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<XlsxRow>(ws);

  const records: { id: string; email: string; name: string }[] = [];

  for (const row of rows) {
    const firstName = (row["First Name"] as string | undefined)?.trim() ?? "";
    const lastName = (row["Last Name"] as string | undefined)?.trim() ?? "";
    const name = [firstName, lastName].filter(Boolean).join(" ");
    if (!name) continue;

    const rawEmail = (row["Email"] as string | undefined)?.trim() ?? "";
    if (!rawEmail || rawEmail.toLowerCase() === "n/a") continue;

    const email = rawEmail.toLowerCase();
    const netId = email.split("@")[0];
    records.push({ id: netId, email, name });
  }

  console.log(`Parsed ${records.length} members from ${sheetName}`);

  const BATCH = 50;
  let upserted = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    await db
      .insert(members)
      .values(records.slice(i, i + BATCH).map(r => ({ ...r, cohort: COHORT })))
      .onConflictDoUpdate({
        target: members.id,
        set: {
          email: sql`excluded.email`,
          name: sql`excluded.name`,
          cohort: sql`excluded.cohort`,
        },
      });
    upserted += Math.min(BATCH, records.length - i);
  }

  console.log(`Done. Upserted ${upserted} members with cohort="${COHORT}".`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
