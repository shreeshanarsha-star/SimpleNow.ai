// Minimal RFC 4180 CSV parser: quoted fields, "" escapes, CRLF/LF, newlines inside quotes.
// Each record keeps the 1-based line number it starts on, for error reports.

export interface CsvRecord {
  line: number;
  cells: string[];
}

export function parseCsv(input: string): CsvRecord[] {
  const text = input.replace(/^\uFEFF/, "");
  const out: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let startLine = 1;
  let any = false;

  const endField = () => {
    cells.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    out.push({ line: startLine, cells });
    cells = [];
    any = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (c === "\n") line++;
        field += c;
      }
      continue;
    }
    if (!any) {
      startLine = line;
      any = true;
    }
    if (c === '"' && field === "") inQuotes = true;
    else if (c === ",") endField();
    else if (c === "\r") {
      // swallow; \n ends the record
    } else if (c === "\n") {
      endRecord();
      line++;
    } else field += c;
  }
  if (any || field) endRecord();
  return out;
}
