import JSZip from 'jszip';

type PptCard = {
  tipo: string;
  valor: number;
  delta?: number;
};

type PptSection = {
  titulo: string;
  subtitulo: string;
  unidad: string;
  clues: PptCard[];
  resumen: {
    ece: number;
    sinba: number;
    total: number;
  };
};

type PptTrendPoint = {
  label: string;
  ece: number;
  sinba: number;
  ambas: number;
};

type PptTrendChart = {
  title: string;
  categoryLabel: string;
  points: PptTrendPoint[];
};

type PptTrendSlidePlan = {
  slidePath: string;
  relsPath: string;
  chartPath: string;
  chartRelId: string;
  presentationRelId: string;
  slideId: number;
  slideTarget: string;
  chartTarget: string;
  chart: PptTrendChart;
};

function formatThousands(value: number): string {
  return new Intl.NumberFormat('es-MX').format(Number(value) || 0);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceFirstLiteral(source: string, literal: string, replacement: string): string {
  return source.replace(new RegExp(escapeRegex(literal)), replacement);
}

const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

function normalizeSubtitle(subtitle: string): string {
  return subtitle.replace(/^\s*\(/, '(').trim();
}

function formatDeltaLabel(delta: number): string {
  if (delta > 0) return `▲ +${formatThousands(delta)} vs corte anterior (historico)`;
  if (delta < 0) return `▼ ${formatThousands(delta)} vs corte anterior (historico)`;
  return '● 0 vs corte anterior (historico)';
}

function deltaColor(delta: number): string {
  if (delta > 0) return '047857';
  if (delta < 0) return 'B91C1C';
  return 'A57F2C';
}

function formatFechaCorte(): string {
  const d = new Date();
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `Fecha de corte: ${d.getDate()} de ${meses[d.getMonth()]}, ${d.getFullYear()}.`;
}

function buildContextLabel(entidad: string, clues: string): string {
  const e = entidad.trim();
  const c = clues.trim();
  if (!e && !c) return 'General';
  return `Entidad: ${e || 'General'} | CLUES: ${c || 'General'}`;
}

function normalizeForFilename(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function buildExportFilename(entidad: string, clues: string): string {
  const e = entidad.trim();
  const c = clues.trim();

  if (!e && !c) {
    return 'informe_transicion_completo.pptx';
  }

  const ePart = normalizeForFilename(e || 'general');
  const cPart = normalizeForFilename(c || 'general');
  return `informe_transicion_${ePart}_${cPart}.pptx`;
}

function toSafeInt(value: number): number {
  const n = Number(value);
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function toXmlNumber(value: number): string {
  return String(toSafeInt(value));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function buildChartStringPoints(labels: string[]): string {
  return labels
    .map((label, index) => `<c:pt idx="${index}"><c:v>${escapeXml(label)}</c:v></c:pt>`)
    .join('');
}

function buildChartNumberPoints(values: number[]): string {
  return values
    .map((value, index) => `<c:pt idx="${index}"><c:v>${toXmlNumber(value)}</c:v></c:pt>`)
    .join('');
}

function buildLineSeriesXml(index: number, name: string, color: string, labels: string[], values: number[]): string {
  return `<c:ser>
          <c:idx val="${index}"/>
          <c:order val="${index}"/>
          <c:tx><c:v>${escapeXml(name)}</c:v></c:tx>
          <c:spPr>
            <a:ln w="31750"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln>
          </c:spPr>
          <c:marker>
            <c:symbol val="circle"/>
            <c:size val="6"/>
            <c:spPr>
              <a:solidFill><a:srgbClr val="${color}"/></a:solidFill>
              <a:ln w="12700"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln>
            </c:spPr>
          </c:marker>
          <c:cat>
            <c:strLit>
              <c:ptCount val="${labels.length}"/>
              ${buildChartStringPoints(labels)}
            </c:strLit>
          </c:cat>
          <c:val>
            <c:numLit>
              <c:formatCode>General</c:formatCode>
              <c:ptCount val="${values.length}"/>
              ${buildChartNumberPoints(values)}
            </c:numLit>
          </c:val>
          <c:smooth val="0"/>
        </c:ser>`;
}

function buildLineChartXml(chart: PptTrendChart): string {
  const safePoints = chart.points.length > 0
    ? chart.points
    : [{ label: 'Sin datos', ece: 0, sinba: 0, ambas: 0 }];

  const labels = safePoints.map((point) => point.label.length > 14 ? `${point.label.slice(0, 14)}.` : point.label);
  const axisMax = Math.max(
    5,
    ...safePoints.flatMap((point) => [point.ece, point.sinba, point.ambas]),
  );
  const roundedAxisMax = Math.max(5, Math.ceil(axisMax / 5) * 5);
  const safeTitle = escapeXml(`${chart.title} por ${chart.categoryLabel}`);
  const seriesXml = [
    buildLineSeriesXml(0, 'ECE', '047857', labels, safePoints.map((point) => point.ece)),
    buildLineSeriesXml(1, 'SINBA', 'B45309', labels, safePoints.map((point) => point.sinba)),
    buildLineSeriesXml(2, 'AMBAS', '334155', labels, safePoints.map((point) => point.ambas)),
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="es-MX"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="es-MX" sz="1100" b="1"/><a:t>${safeTitle}</a:t></a:r></a:p></c:rich></c:tx>
      <c:layout/>
    </c:title>
    <c:plotArea>
      <c:layout/>
      <c:lineChart>
        <c:grouping val="standard"/>
        <c:varyColors val="0"/>
        ${seriesXml}
        <c:axId val="123456"/>
        <c:axId val="654321"/>
      </c:lineChart>
      <c:catAx>
        <c:axId val="123456"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:majorTickMark val="none"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:spPr><a:ln w="12700"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></c:spPr>
        <c:txPr>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p><a:pPr><a:defRPr sz="700"><a:solidFill><a:srgbClr val="475569"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-MX"/></a:p>
        </c:txPr>
        <c:crossAx val="654321"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="654321"/>
        <c:scaling>
          <c:orientation val="minMax"/>
          <c:max val="${roundedAxisMax}"/>
          <c:min val="0"/>
        </c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:majorTickMark val="none"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:spPr><a:ln w="12700"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></c:spPr>
        <c:txPr>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p><a:pPr><a:defRPr sz="700"><a:solidFill><a:srgbClr val="475569"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-MX"/></a:p>
        </c:txPr>
        <c:crossAx val="123456"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="b"/>
      <c:layout/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
  <c:spPr><a:noFill/></c:spPr>
</c:chartSpace>`;
}

function buildTrendSlideXml(chartRelId: string, contexto: string, chartTitle: string): string {
  const safeContexto = escapeXml(contexto);
  const safeTitle = escapeXml(chartTitle);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>

      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Titulo 1"/>
          <p:cNvSpPr txBox="1"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="609600" y="304800"/><a:ext cx="10972800" cy="457200"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:noFill/>
          <a:ln><a:noFill/></a:ln>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="es-MX" sz="2400" b="1"><a:solidFill><a:srgbClr val="1B5C4E"/></a:solidFill></a:rPr>
              <a:t>${safeTitle}</a:t>
            </a:r>
          </a:p>
          <a:p>
            <a:r>
              <a:rPr lang="es-MX" sz="1300"><a:solidFill><a:srgbClr val="4B5563"/></a:solidFill></a:rPr>
              <a:t>${safeContexto}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>

      <p:graphicFrame>
        <p:nvGraphicFramePr>
          <p:cNvPr id="3" name="Grafica Tendencia"/>
          <p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>
          <p:nvPr/>
        </p:nvGraphicFramePr>
        <p:xfrm>
          <a:off x="1219200" y="1676400"/>
          <a:ext cx="9753600" cy="3962400"/>
        </p:xfrm>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
            <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${chartRelId}"/>
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function buildTrendSlidePlans(trendCharts: PptTrendChart[]): PptTrendSlidePlan[] {
  const MAX_POINTS_PER_SLIDE = 16;
  const baseSlideNumber = 3;
  const baseChartNumber = 10;
  const basePresentationRel = 14;
  let offset = 0;

  return trendCharts.flatMap((chart) => {
    const pages = chunkArray(chart.points, MAX_POINTS_PER_SLIDE);

    return pages.map((pagePoints, pageIndex) => {
      const slideNumber = baseSlideNumber + offset;
      const chartNumber = baseChartNumber + offset;
      const presentationRelId = `rId${basePresentationRel + offset}`;
      const pageSuffix = pages.length > 1 ? ` (${pageIndex + 1}/${pages.length})` : '';

      offset += 1;

      return {
        slidePath: `ppt/slides/slide${slideNumber}.xml`,
        relsPath: `ppt/slides/_rels/slide${slideNumber}.xml.rels`,
        chartPath: `ppt/charts/chart${chartNumber}.xml`,
        chartRelId: 'rId2',
        presentationRelId,
        slideId: 275 + offset - 1,
        slideTarget: `slides/slide${slideNumber}.xml`,
        chartTarget: `../charts/chart${chartNumber}.xml`,
        chart: {
          ...chart,
          title: `${chart.title}${pageSuffix}`,
          points: pagePoints,
        },
      };
    });
  });
}

function ensureOverride(contentTypesXml: string, partName: string, contentType: string): string {
  if (contentTypesXml.includes(`PartName="${partName}"`)) return contentTypesXml;
  return contentTypesXml.replace(
    '</Types>',
    `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`,
  );
}

function upsertSlideInPresentation(presentationXml: string, relId: string, slideId: number): string {
  const hasRel = presentationXml.includes(`r:id="${relId}"`);
  if (hasRel) return presentationXml;

  const slideTag = `<p:sldId id="${slideId}" r:id="${relId}"/>`;
  return presentationXml.replace('</p:sldIdLst>', `${slideTag}</p:sldIdLst>`);
}

function upsertPresentationSlideRelationship(presentationRelsXml: string, relId: string, slideTarget: string): string {
  if (presentationRelsXml.includes(`Target="${slideTarget}"`)) return presentationRelsXml;

  const rel = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${slideTarget}"/>`;
  return presentationRelsXml.replace('</Relationships>', `${rel}</Relationships>`);
}

export async function descargarInformeTransicionDesdePlantilla(opts: {
  templateUrl: string;
  sections: PptSection[];
  selectedEntidad: string;
  selectedClues: string;
  trendCharts: PptTrendChart[];
}): Promise<void> {
  const [consultas, procedimientos, egresos] = opts.sections;
  if (!consultas || !procedimientos || !egresos) {
    throw new Error('No hay datos suficientes para generar el PowerPoint.');
  }

  const response = await fetch(opts.templateUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('No se pudo cargar la plantilla de PowerPoint.');
  }

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const slidePath = 'ppt/slides/slide1.xml';
  const slideFile = zip.file(slidePath);
  if (!slideFile) {
    throw new Error('La plantilla no contiene la primera diapositiva esperada.');
  }

  let xml = await slideFile.async('string');

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, 'application/xml');
  const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error('No se pudo leer la plantilla PPTX (slide1.xml).');
  }

  const textNodes = Array.from(xmlDoc.getElementsByTagName('a:t'));

  const findFirstTextNode = (predicate: (text: string) => boolean): Element | null => {
    for (const node of textNodes) {
      const text = node.textContent ?? '';
      if (predicate(text)) return node;
    }
    return null;
  };

  const setFirstByPrefix = (prefix: string, newValue: string): void => {
    const node = findFirstTextNode((t) => t.startsWith(prefix));
    if (node) node.textContent = newValue;
  };

  setFirstByPrefix('Consultas (', `${consultas.titulo} ${normalizeSubtitle(consultas.subtitulo)}`);
  setFirstByPrefix('Procedimientos Quirurgicos (', `${procedimientos.titulo} ${normalizeSubtitle(procedimientos.subtitulo)}`);
  setFirstByPrefix('Egresos Hospitalarios (', `${egresos.titulo} ${normalizeSubtitle(egresos.subtitulo)}`);

  const slideContexto = buildContextLabel(opts.selectedEntidad, opts.selectedClues);
  const trendSlides: PptTrendSlidePlan[] = [];

  trendSlides.forEach((slide) => {
    zip.file(slide.chartPath, buildLineChartXml(slide.chart));
    zip.file(slide.slidePath, buildTrendSlideXml(slide.chartRelId, slideContexto, slide.chart.title));
    zip.file(
      slide.relsPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="${slide.chartRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="${slide.chartTarget}"/>
</Relationships>`,
    );
  });

  const headerFechaNode = findFirstTextNode((t) => t.startsWith('Fecha de corte:'));
  if (headerFechaNode) {
    headerFechaNode.textContent = '';
  }

  const countReplacements = [
    formatThousands(consultas.clues[2]?.valor ?? 0),
    formatThousands(consultas.clues[1]?.valor ?? 0),
    formatThousands(consultas.clues[0]?.valor ?? 0),
    formatThousands(procedimientos.clues[2]?.valor ?? 0),
    formatThousands(procedimientos.clues[1]?.valor ?? 0),
    formatThousands(procedimientos.clues[0]?.valor ?? 0),
    formatThousands(egresos.clues[2]?.valor ?? 0),
    formatThousands(egresos.clues[1]?.valor ?? 0),
    formatThousands(egresos.clues[0]?.valor ?? 0),
  ];

  const templateCountLiterals = ['495', '69', '8', '426', '39', '9', '479', '52', '8'];
  const usedIndexes = new Set<number>();
  templateCountLiterals.forEach((oldValue, idx) => {
    const target = countReplacements[idx] ?? '0';
    const nodeIndex = textNodes.findIndex((node, nidx) => !usedIndexes.has(nidx) && (node.textContent ?? '') === oldValue);
    if (nodeIndex >= 0) {
      textNodes[nodeIndex].textContent = target;
      usedIndexes.add(nodeIndex);
    }
  });

  const consultasResumenNode = findFirstTextNode((t) => t.includes('consultas') && t.includes('SINBA:') && t.includes('Total:'));
  if (consultasResumenNode) {
    consultasResumenNode.textContent = `ECE: ${formatThousands(consultas.resumen.ece)} consultas\nSINBA: ${formatThousands(consultas.resumen.sinba)} consultas\nTotal: ${formatThousands(consultas.resumen.total)} (sin duplicados)`;
  }
  const procedimientosResumenNode = findFirstTextNode((t) => t.includes('procedimientos') && t.includes('SINBA:') && t.includes('Total:'));
  if (procedimientosResumenNode) {
    procedimientosResumenNode.textContent = `ECE: ${formatThousands(procedimientos.resumen.ece)} procedimientos\nSINBA: ${formatThousands(procedimientos.resumen.sinba)} procedimientos\nTotal: ${formatThousands(procedimientos.resumen.total)} (sin duplicados)`;
  }
  const egresosResumenNode = findFirstTextNode((t) => t.includes('egresos') && t.includes('SINBA:') && t.includes('Total:'));
  if (egresosResumenNode) {
    egresosResumenNode.textContent = `ECE: ${formatThousands(egresos.resumen.ece)} egresos\nSINBA: ${formatThousands(egresos.resumen.sinba)} egresos\nTotal: ${formatThousands(egresos.resumen.total)} (sin duplicados)`;
  }

  const deltaValues = [
    consultas.clues[0]?.delta ?? 0,
    consultas.clues[1]?.delta ?? 0,
    consultas.clues[2]?.delta ?? 0,
    procedimientos.clues[0]?.delta ?? 0,
    procedimientos.clues[1]?.delta ?? 0,
    procedimientos.clues[2]?.delta ?? 0,
    egresos.clues[0]?.delta ?? 0,
    egresos.clues[1]?.delta ?? 0,
    egresos.clues[2]?.delta ?? 0,
  ];

  const deltaNodes = textNodes.filter((node) => (node.textContent ?? '').includes('vs corte anterior (historico)'));
  deltaNodes.forEach((node, idx) => {
    if (idx >= deltaValues.length) return;
    const delta = Number(deltaValues[idx] ?? 0);
    node.textContent = formatDeltaLabel(delta);

    const run = node.parentElement;
    if (!run) return;
    let runPr = run.getElementsByTagName('a:rPr')[0];
    if (!runPr) {
      runPr = xmlDoc.createElementNS(DRAWING_NS, 'a:rPr');
      run.insertBefore(runPr, node);
    }
    let fill = runPr.getElementsByTagName('a:solidFill')[0];
    if (!fill) {
      fill = xmlDoc.createElementNS(DRAWING_NS, 'a:solidFill');
      runPr.appendChild(fill);
    }
    let color = fill.getElementsByTagName('a:srgbClr')[0];
    if (!color) {
      color = xmlDoc.createElementNS(DRAWING_NS, 'a:srgbClr');
      fill.appendChild(color);
    }
    color.setAttribute('val', deltaColor(delta));
    // Fija una fuente compacta para evitar texto amontonado en la plantilla.
    runPr.setAttribute('sz', '1100');
    runPr.setAttribute('b', '1');
  });

  xml = new XMLSerializer().serializeToString(xmlDoc);

  zip.file(slidePath, xml);

  const contentTypesPath = '[Content_Types].xml';
  const contentTypesFile = zip.file(contentTypesPath);
  if (contentTypesFile) {
    let contentTypesXml = await contentTypesFile.async('string');
    trendSlides.forEach((slide) => {
      contentTypesXml = ensureOverride(
        contentTypesXml,
        `/${slide.slidePath}`,
        'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
      );
      contentTypesXml = ensureOverride(
        contentTypesXml,
        `/${slide.chartPath}`,
        'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
      );
    });
    zip.file(contentTypesPath, contentTypesXml);
  }

  const presentationPath = 'ppt/presentation.xml';
  const presentationFile = zip.file(presentationPath);
  if (presentationFile) {
    let presentationXml = await presentationFile.async('string');
    trendSlides.forEach((slide) => {
      presentationXml = upsertSlideInPresentation(presentationXml, slide.presentationRelId, slide.slideId);
    });
    zip.file(presentationPath, presentationXml);
  }

  const presentationRelsPath = 'ppt/_rels/presentation.xml.rels';
  const presentationRelsFile = zip.file(presentationRelsPath);
  if (presentationRelsFile) {
    let presentationRelsXml = await presentationRelsFile.async('string');
    trendSlides.forEach((slide) => {
      presentationRelsXml = upsertPresentationSlideRelationship(
        presentationRelsXml,
        slide.presentationRelId,
        slide.slideTarget,
      );
    });
    zip.file(presentationRelsPath, presentationRelsXml);
  }

  const outBytes = await zip.generateAsync({ type: 'uint8array' });
  const blob = new Blob([outBytes], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = buildExportFilename(opts.selectedEntidad, opts.selectedClues);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
