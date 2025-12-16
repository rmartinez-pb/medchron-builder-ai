import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, HeadingLevel, AlignmentType, VerticalMergeType, VerticalAlign, TextRun } from "docx";
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
          children: [new Paragraph({ text: "Date", style: "TableHeader" })],
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
          width: { size: 10, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ text: "Page Ref", style: "TableHeader" })],
          shading: { fill: "E0F2FE" },
        }),
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ text: "Source", style: "TableHeader" })],
          shading: { fill: "E0F2FE" },
        }),
      ],
    }),
  ];

  sortedEvents.forEach((group) => {
    // If no facts, skip (though extraction schema requires facts)
    if (!group.facts || group.facts.length === 0) return;

    group.facts.forEach((fact, index) => {
      const isFirst = index === 0;
      
      // Date Cell (Merged)
      const dateCell = new TableCell({
        verticalMerge: isFirst ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE,
        children: isFirst ? [new Paragraph({ text: group.date, style: "TableCellBold" })] : [],
        verticalAlign: VerticalAlign.TOP,
      });

      // Source Cell (Merged)
      const sourceCell = new TableCell({
        verticalMerge: isFirst ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE,
        children: isFirst ? [new Paragraph({ text: group.sourceDocumentName, style: "TableCellSmall" })] : [],
        verticalAlign: VerticalAlign.TOP,
      });

      // Event Details Cell content construction
      const detailsChildren: Paragraph[] = [];
      
      // If first item, add the group summary as a header within the cell
      if (isFirst) {
          detailsChildren.push(new Paragraph({
              children: [new TextRun({ text: group.summary, bold: true, color: "0284C7" })], // medical-600
              spacing: { after: 120 } // Space after summary
          }));
      }

      // Fact Detail with optional Time
      const timeText = fact.time ? `[${fact.time}] ` : "";
      detailsChildren.push(new Paragraph({
          children: [
              new TextRun({ text: timeText, bold: true, size: 16, color: "64748B" }), // slate-500
              new TextRun({ text: fact.detail })
          ],
          style: "TableCell"
      }));

      tableRows.push(
        new TableRow({
          children: [
            dateCell,
            new TableCell({
              children: [new Paragraph({ text: fact.category, style: "TableCell" })],
              verticalAlign: VerticalAlign.TOP,
            }),
            new TableCell({
              children: detailsChildren,
              verticalAlign: VerticalAlign.TOP,
            }),
            new TableCell({
              children: [new Paragraph({ text: fact.pageNumber ? `Pg ${fact.pageNumber}` : "-", style: "TableCellSmall" })],
              verticalAlign: VerticalAlign.TOP,
            }),
            sourceCell,
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