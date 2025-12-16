import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, HeadingLevel, AlignmentType } from "docx";
import FileSaver from "file-saver";
import { TimelineEvent } from "../types";

export const exportChronologyToDocx = async (events: TimelineEvent[], title: string = "Medical Chronology Report") => {
  // Sort events by date
  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));

  // Flatten the grouped structure into rows for the table
  const tableRows: TableRow[] = [
    // Header Row
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ text: "Date/Time", style: "TableHeader" })],
          shading: { fill: "E0F2FE" }, // medical-100
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ text: "Category", style: "TableHeader" })],
          shading: { fill: "E0F2FE" },
        }),
        new TableCell({
          width: { size: 40, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ text: "Event Details", style: "TableHeader" })],
          shading: { fill: "E0F2FE" },
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ text: "Page Ref", style: "TableHeader" })],
          shading: { fill: "E0F2FE" },
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ text: "Source", style: "TableHeader" })],
          shading: { fill: "E0F2FE" },
        }),
      ],
    }),
  ];

  sortedEvents.forEach((group) => {
    // Add a section header row for the date summary? 
    // Or just list the facts. Let's list the facts and use the date column.
    
    group.facts.forEach((fact) => {
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({ text: group.date, style: "TableCellBold" }),
                ...(fact.time ? [new Paragraph({ text: fact.time, style: "TableCellSmall" })] : [])
              ],
            }),
            new TableCell({
              children: [new Paragraph({ text: fact.category, style: "TableCell" })],
            }),
            new TableCell({
              children: [
                new Paragraph({ text: fact.detail, style: "TableCell" }),
                // Add group summary as context if needed, or keep it clean
              ],
            }),
            new TableCell({
              children: [new Paragraph({ text: fact.pageNumber ? `Pg ${fact.pageNumber}` : "-", style: "TableCellSmall" })],
            }),
            new TableCell({
              children: [new Paragraph({ text: group.sourceDocumentName, style: "TableCellSmall" })],
            }),
          ],
        })
      );
    });
  });

  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: "TableHeader",
          name: "Table Header",
          basedOn: "Normal",
          next: "Normal",
          run: {
            bold: true,
            size: 20, // 10pt
            color: "0C4A6E", // medical-900
          },
        },
        {
          id: "TableCell",
          name: "Table Cell",
          basedOn: "Normal",
          next: "Normal",
          run: {
            size: 20, // 10pt
          },
        },
        {
          id: "TableCellBold",
          name: "Table Cell Bold",
          basedOn: "Normal",
          next: "Normal",
          run: {
            bold: true,
            size: 20, // 10pt
          },
        },
        {
          id: "TableCellSmall",
          name: "Table Cell Small",
          basedOn: "Normal",
          next: "Normal",
          run: {
            size: 16, // 8pt
            color: "64748B", // slate-500
          },
        },
      ],
    },
    sections: [
      {
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new Paragraph({
            text: `Generated on ${new Date().toLocaleDateString()}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Table({
            rows: tableRows,
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  FileSaver.saveAs(blob, "Medical_Chronology.docx");
};