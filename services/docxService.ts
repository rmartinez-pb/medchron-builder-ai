import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, HeadingLevel, AlignmentType } from "docx";
import FileSaver from "file-saver";
import { TimelineEvent } from "../types";

export const exportChronologyToDocx = async (events: TimelineEvent[], title: string = "Medical Chronology Report") => {
  // Sort events by date
  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));

  const tableRows = [
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
          width: { size: 20, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ text: "Event", style: "TableHeader" })],
          shading: { fill: "E0F2FE" },
        }),
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ text: "Details", style: "TableHeader" })],
          shading: { fill: "E0F2FE" },
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ text: "Source", style: "TableHeader" })],
          shading: { fill: "E0F2FE" },
        }),
      ],
    }),
    // Data Rows
    ...sortedEvents.map((event) => {
      return new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({ text: event.date, style: "TableCell" }),
              ...(event.time ? [new Paragraph({ text: event.time, style: "TableCellSmall" })] : [])
            ],
          }),
          new TableCell({
            children: [new Paragraph({ text: event.category, style: "TableCell" })],
          }),
          new TableCell({
            children: [new Paragraph({ text: event.summary, style: "TableCellBold" })],
          }),
          new TableCell({
            children: [new Paragraph({ text: event.details, style: "TableCell" })],
          }),
          new TableCell({
            children: [new Paragraph({ text: event.sourceDocumentName, style: "TableCellSmall" })],
          }),
        ],
      });
    }),
  ];

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