import type { StudentInvitationRow } from "../../services/api";

export async function parseRosterFile(
  file: File,
  requireRegistrationNumber: boolean,
): Promise<StudentInvitationRow[]> {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Choose a file smaller than 5 MB.");
  if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet)
      throw new Error("The Excel file does not contain a worksheet.");
    const worksheet = workbook.Sheets[firstSheet];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    return parseStudentRows(
      matrix.map((row) => row.map((cell) => String(cell ?? ""))),
      requireRegistrationNumber,
    );
  }
  return parseStudentRows(
    parseCsvMatrix((await file.text()).replace(/^\uFEFF/, "")),
    requireRegistrationNumber,
  );
}

function parseStudentRows(
  matrix: string[][],
  requireRegistrationNumber: boolean,
): StudentInvitationRow[] {
  if (matrix.length < 2)
    throw new Error("Add at least one member row to the CSV file.");
  const headers = matrix[0].map((header) => header.trim().toLowerCase());
  const required = [
    "email",
    "first_name",
    "last_name",
    ...(requireRegistrationNumber ? ["registration_number"] : []),
  ];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length)
    throw new Error(
      `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
    );
  const indexOf = (header: string) => headers.indexOf(header);
  const rows = matrix
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => ({
      email: row[indexOf("email")]?.trim() ?? "",
      first_name: row[indexOf("first_name")]?.trim() ?? "",
      last_name: row[indexOf("last_name")]?.trim() ?? "",
      phone: indexOf("phone") >= 0 ? (row[indexOf("phone")]?.trim() ?? "") : "",
      registration_number:
        indexOf("registration_number") >= 0
          ? (row[indexOf("registration_number")]?.trim() ?? "")
          : "",
    }));
  if (rows.length > 500)
    throw new Error("A single upload can contain at most 500 member rows.");
  return rows;
}

function parseCsvMatrix(input: string): string[][] {
  const output: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      output.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }
  if (cell || row.length) {
    row.push(cell);
    output.push(row);
  }
  return output;
}
