import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from "docx";
import type { JdDraft, JdTemplate } from "./types";

interface JdDocInput {
  jobTitle: string;
  department: string;
  draft: JdDraft;
}

const GOLD = "B08D57";
const INK = "1F2430";
const MUTED = "6B7280";

function bulletParas(items: string[]) {
  return items.length
    ? items.map((t) => new Paragraph({ text: t, bullet: { level: 0 }, spacing: { after: 80 } }))
    : [new Paragraph({ text: "Not specified.", spacing: { after: 80 } })];
}

// -- Standard: classic single-column formatted document -----------------
function buildStandard({ jobTitle, department, draft }: JdDocInput): Document {
  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: jobTitle || "Job Description",
            heading: HeadingLevel.TITLE,
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `${department} · ${draft.employment_type || "Full-time"} · ${draft.location_mode || ""}`, color: MUTED }),
            ],
            spacing: { after: 300 },
          }),
          new Paragraph({ text: "Role summary", heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }),
          new Paragraph({ text: draft.summary || "—", spacing: { after: 200 } }),
          new Paragraph({ text: "Key responsibilities", heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }),
          ...bulletParas(draft.responsibilities),
          new Paragraph({ text: "Must-have skills", heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }),
          ...bulletParas(draft.must_have_skills),
          new Paragraph({ text: "Good-to-have skills", heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }),
          ...bulletParas(draft.good_to_have_skills),
          new Paragraph({ text: "Experience & qualifications", heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }),
          new Paragraph({ text: draft.experience || "—", spacing: { after: 80 } }),
          new Paragraph({ text: draft.qualifications || "", spacing: { after: 200 } }),
          ...(draft.compensation_range
            ? [
                new Paragraph({ text: "Compensation", heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }),
                new Paragraph({ text: draft.compensation_range }),
              ]
            : []),
        ],
      },
    ],
  });
}

// -- Compact: dense two-column-feel via a borderless table --------------
function buildCompact({ jobTitle, department, draft }: JdDocInput): Document {
  const row = (label: string, value: string) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 28, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: MUTED, size: 18 })] })],
        }),
        new TableCell({
          width: { size: 72, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ text: value || "—", spacing: { after: 40 } })],
        }),
      ],
    });

  return new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: jobTitle || "Job Description", heading: HeadingLevel.HEADING_1, spacing: { after: 40 } }),
          new Paragraph({ children: [new TextRun({ text: department, color: MUTED, size: 20 })], spacing: { after: 200 } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB" },
              insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
            rows: [
              row("Summary", draft.summary),
              row("Responsibilities", draft.responsibilities.join(" • ")),
              row("Must-have", draft.must_have_skills.join(", ")),
              row("Good-to-have", draft.good_to_have_skills.join(", ") || "—"),
              row("Experience", draft.experience),
              row("Qualifications", draft.qualifications),
              row("Location / mode", draft.location_mode),
              row("Employment type", draft.employment_type),
              row("Compensation", draft.compensation_range || "—"),
            ],
          }),
        ],
      },
    ],
  });
}

// -- Branded: title band with accent color + shaded section headers -----
function buildBranded({ jobTitle, department, draft }: JdDocInput): Document {
  const sectionHeading = (text: string) =>
    new Paragraph({
      spacing: { before: 240, after: 100 },
      shading: { type: ShadingType.SOLID, color: "F5EFE4", fill: "F5EFE4" },
      children: [new TextRun({ text: text.toUpperCase(), bold: true, color: GOLD, size: 20 })],
    });

  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 8 } },
            children: [new TextRun({ text: jobTitle || "Job Description", bold: true, size: 44, color: INK })],
            spacing: { after: 60 },
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({ text: `${department}  ·  ${draft.employment_type || "Full-time"}  ·  ${draft.location_mode || ""}`, color: MUTED, size: 20 }),
            ],
            spacing: { after: 200 },
          }),
          sectionHeading("Role summary"),
          new Paragraph({ text: draft.summary || "—", spacing: { after: 100 } }),
          sectionHeading("Key responsibilities"),
          ...bulletParas(draft.responsibilities),
          sectionHeading("Must-have skills"),
          ...bulletParas(draft.must_have_skills),
          sectionHeading("Good-to-have skills"),
          ...bulletParas(draft.good_to_have_skills),
          sectionHeading("Experience & qualifications"),
          new Paragraph({ text: draft.experience || "—", spacing: { after: 60 } }),
          new Paragraph({ text: draft.qualifications || "" }),
          ...(draft.compensation_range
            ? [sectionHeading("Compensation"), new Paragraph({ text: draft.compensation_range })]
            : []),
        ],
      },
    ],
  });
}

export async function generateJdDocx(input: JdDocInput, template: JdTemplate): Promise<Buffer> {
  const doc =
    template === "compact" ? buildCompact(input) : template === "branded" ? buildBranded(input) : buildStandard(input);
  return Packer.toBuffer(doc);
}
