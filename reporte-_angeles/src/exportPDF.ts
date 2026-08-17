import jsPDF from 'jspdf';

type SummarySection = {
  titulo: string;
  unidad: string;
  clues: Array<{
    tipo: string;
    valor: number;
    delta: number;
    variacion: string;
  }>;
  tablaCambios?: Array<{
    clues_imb: string;
    entidad: string;
    nombre_de_la_unidad: string;
    tipo: string;
    delta: number;
    cambio: 'sumó' | 'se eliminó';
  }>;
};

export async function descargarResumenPDF(sections: SummarySection[]): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPosition = 15;

  // Título
  doc.setFontSize(18);
  doc.setTextColor(27, 92, 78); // Color IMSS verde
  doc.text('Resumen de Cambios - Reporte ECE', pageWidth / 2, yPosition, { align: 'center' });

  yPosition += 12;

  // Fecha de corte
  doc.setFontSize(10);
  doc.setTextColor(75, 85, 99);
  const hoy = new Date();
  const fechaFormato = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;
  doc.text(`Fecha de generación: ${fechaFormato}`, pageWidth / 2, yPosition, { align: 'center' });

  yPosition += 10;

  // Secciones por indicador
  for (const section of sections) {
    // Verificar si cabe en la página actual
    if (yPosition > pageHeight - 60) {
      doc.addPage();
      yPosition = 15;
    }

    // Título de sección
    doc.setFontSize(13);
    doc.setTextColor(27, 92, 78);
    doc.text(`${section.titulo} (${section.unidad})`, 15, yPosition);
    yPosition += 8;

    // Encabezados de tabla
    const colWidth = pageWidth - 30;
    const col1Width = 50;
    const col2Width = 25;
    const col3Width = colWidth - col1Width - col2Width;

    // Header
    doc.setFillColor(27, 92, 78);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');

    let xPos = 15;
    doc.rect(xPos, yPosition - 5, col1Width, 7, 'F');
    doc.text('Categoría', xPos + 2, yPosition);

    xPos += col1Width;
    doc.rect(xPos, yPosition - 5, col2Width, 7, 'F');
    doc.text('Total', xPos + 2, yPosition, { align: 'center' });

    xPos += col2Width;
    doc.rect(xPos, yPosition - 5, col3Width, 7, 'F');
    doc.text('Cambio vs Corte Anterior', xPos + 2, yPosition, { align: 'center' });

    yPosition += 8;

    // Filas de datos
    doc.setTextColor(75, 85, 99);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);

    section.clues.forEach((row, idx) => {
      if (yPosition > pageHeight - 20) {
        doc.addPage();
        yPosition = 15;
      }

      xPos = 15;

      // Categoría
      doc.text(row.tipo, xPos + 2, yPosition, { maxWidth: col1Width - 4 });

      // Total
      doc.text(String(row.valor), xPos + col1Width + 2, yPosition, { align: 'center' });

      // Variación (con color según delta)
      const deltaColor = row.delta > 0 ? [4, 120, 87] : row.delta < 0 ? [185, 28, 28] : [165, 127, 44];
      doc.setTextColor(deltaColor[0], deltaColor[1], deltaColor[2]);
      doc.text(
        row.variacion,
        xPos + col1Width + col2Width + 2,
        yPosition,
        { maxWidth: col3Width - 4, align: 'center' }
      );

      doc.setTextColor(75, 85, 99);
      yPosition += 6;

      // Línea separadora
      doc.setDrawColor(230, 231, 235);
      doc.line(15, yPosition, pageWidth - 15, yPosition);
      yPosition += 1;
    });

    if (section.tablaCambios && section.tablaCambios.length > 0) {
      yPosition += 8;
      doc.setFontSize(11);
      doc.setTextColor(27, 92, 78);
      doc.text('CLUES con cambio real', 15, yPosition);
      yPosition += 6;

      const tableWidth = pageWidth - 30;
      const colWidths = [46, 26, 38, 40, 18];
      const headers = ['CLUES', 'Entidad', 'Unidad', 'Cambio', 'Delta'];
      doc.setFontSize(8);
      doc.setFillColor(27, 92, 78);
      doc.setTextColor(255, 255, 255);
      doc.setFont(undefined, 'bold');

      let startX = 15;
      headers.forEach((header, index) => {
        const cellWidth = tableWidth * (index === 0 ? 0.32 : index === 1 ? 0.19 : index === 2 ? 0.28 : index === 3 ? 0.19 : 0.12);
        doc.rect(startX, yPosition - 4, cellWidth, 7, 'F');
        doc.text(header, startX + 2, yPosition, { maxWidth: cellWidth - 4 });
        startX += cellWidth;
      });

      yPosition += 8;
      doc.setFont(undefined, 'normal');
      doc.setTextColor(75, 85, 99);
      doc.setFontSize(7.5);

      for (const row of section.tablaCambios) {
        if (yPosition > pageHeight - 22) {
          doc.addPage();
          yPosition = 15;
          doc.setFontSize(8);
          doc.setFillColor(27, 92, 78);
          doc.setTextColor(255, 255, 255);
          doc.setFont(undefined, 'bold');
          let newX = 15;
          headers.forEach((header, index) => {
            const cellWidth = tableWidth * (index === 0 ? 0.32 : index === 1 ? 0.19 : index === 2 ? 0.28 : index === 3 ? 0.19 : 0.12);
            doc.rect(newX, yPosition - 4, cellWidth, 7, 'F');
            doc.text(header, newX + 2, yPosition, { maxWidth: cellWidth - 4 });
            newX += cellWidth;
          });
          yPosition += 8;
          doc.setFont(undefined, 'normal');
          doc.setTextColor(75, 85, 99);
          doc.setFontSize(7.5);
        }

        let currentX = 15;
        const fields = [
          row.clues_imb,
          row.entidad,
          row.nombre_de_la_unidad,
          `${row.cambio} en ${row.tipo}`,
          String(row.delta),
        ];

        fields.forEach((field, index) => {
          const isSinba = row.tipo?.toUpperCase() === 'SINBA';
          const isSumo = row.cambio === 'sumó';
          const isRed = isSinba ? isSumo : !isSumo;
          const textColor = index === 3 ? (isRed ? [185, 28, 28] : [4, 120, 87]) : [75, 85, 99];
          doc.setTextColor(textColor[0], textColor[1], textColor[2]);
          doc.text(field, currentX + 2, yPosition, { maxWidth: cellWidth - 4 });
          currentX += cellWidth;
        });

        doc.setTextColor(75, 85, 99);
        yPosition += 6;
        doc.setDrawColor(230, 231, 235);
        doc.line(15, yPosition, pageWidth - 15, yPosition);
        yPosition += 2;
      }
    }

    yPosition += 8;
  }

  // Pie de página
  const totalPages = (doc as any).internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160, 174, 192);
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  // Descargar
  doc.save('resumen_ece_cambios.pdf');
}
