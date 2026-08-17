import { useEffect, useMemo, useState } from 'react';
import { Database, Building2, Layers3, AlertTriangle, LayoutGrid, Gauge, FileSearch, ClipboardList, Stethoscope, Scissors, LogOut, X, Download } from 'lucide-react';
import { Header } from './components/Header';
import { AvanceCharts, AvanceSummaryCards } from './components/Charts';
import { DataTable } from './components/DataTable';
import { cargarTablasFormulario } from './data';
import { descargarInformeTransicionDesdePlantilla } from './exportPowerPoint';
import { descargarResumenPDF } from './exportPDF';
import { exportarExcel } from './exportExcel';
import type { DashboardStats, DataRow, EntidadChart, InternetPieItem, TopFaltanteChart, CluesGeoItem } from './types';

type DataTabKey =
  | 'cruda'
  | 'clues'
  | 'estado'
  | 'faltantes'
  | 'tabla_avance'
  | 'tabla_entidades'
  | 'tabla_unidades'
  | 'faltantes_por_estado'
  | 'tabla_faltantes_por_estado';
type MainTabKey = 'infraestructura' | 'avance' | 'pendientes';
type AvanceIndicadorKey = 'consultas' | 'procedimientos_quirurgicos' | 'egresos_hospitalarios';
type PendientesTabKey = 'estado_consultas' | 'clues_consultas';

type IndicadorCardsPayload = {
  cards_clues?: {
    unicamente_en_ece?: number;
    ambos_sistemas?: number;
    unicamente_en_sinba?: number;
  };
  metadata?: {
    total_clues_evaluadas?: number;
    clues_sin_reporte_ambos?: number;
    no_reportaron?: number;
    delta_cards_clues?: {
      unicamente_en_ece?: number;
      ambos_sistemas?: number;
      unicamente_en_sinba?: number;
    };
    resumen_sistema?: {
      ece?: number;
      sinba?: number;
      total?: number;
    };
  };
  detalle_clues?: Array<{
    clues_imb?: string;
    nombre_de_la_unidad?: string;
    entidad?: string;
    reporta_ece_bool?: boolean | string | number;
    reporta_sinba_bool?: boolean | string | number;
    cuatro_columnas_en_cero?: boolean | string | number;
    resumen_ece?: number | string;
    resumen_sinba?: number | string;
    resumen_total?: number | string;
    delta_clues_ece?: number | string;
    delta_clues_ambas?: number | string;
    delta_clues_sinba?: number | string;
  }>;
};

type InfraestructuraCardsPayload = {
  consultas?: IndicadorCardsPayload;
  procedimientos_quirurgicos?: IndicadorCardsPayload;
  egresos_hospitalarios?: IndicadorCardsPayload;
};

type AvanceCoberturaEntidadRow = {
  entidad?: string;
  ece?: number;
  sinba?: number;
  ambas?: number;
  delta_ece?: number;
  delta_sinba?: number;
  delta_ambas?: number;
  total_clues?: number;
  clues_evaluadas?: number;
  pct_cobertura?: number;
};

type AvanceCoberturaEntidadPayload = {
  fecha_corte?: string;
  fecha_corte_anterior?: string | null;
  rows?: AvanceCoberturaEntidadRow[];
};

type CluesFilterOption = {
  clues: string;
  unidad: string;
  entidad: string;
};

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeKey(value: unknown): string {
  return toText(value).toUpperCase();
}

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
}

function toBoolLike(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const text = toText(value).toLowerCase();
  return text === 'true' || text === '1' || text === 'si' || text === 'yes';
}

function isMissingValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'boolean') return value === false;
  if (typeof value === 'number') return value <= 0;

  const text = toText(value).toLowerCase();
  return text === '' || text === 'false' || text === 'no' || text === '0' || text === 'nan';
}

function isZeroValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '' || value === false) return true;
  if (typeof value === 'number') return value <= 0;
  const text = toText(value).toLowerCase();
  return text === '' || text === '0' || text === '0.0' || text === 'false' || text === 'no' || text === 'nan';
}

function normalizeInsumoLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function excelSerialToDate(serial: number): Date {
  // Excel epoch: Dec 30, 1899 = day 0; JS epoch: Jan 1, 1970 = day 25569
  return new Date((serial - 25569) * 86400 * 1000);
}

function parseDateValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    if (value > 25569 && value < 73050) {
      const d = excelSerialToDate(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  const text = toText(value);
  if (!text) return null;

  const nativeDate = new Date(text);
  if (!Number.isNaN(nativeDate.getTime())) return nativeDate;

  const mxFormat = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!mxFormat) return null;

  const day = Number(mxFormat[1]);
  const month = Number(mxFormat[2]);
  const year = Number(mxFormat[3]);
  const hour = Number(mxFormat[4] ?? 0);
  const minute = Number(mxFormat[5] ?? 0);
  const second = Number(mxFormat[6] ?? 0);

  const parsed = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inferDataUpdatedAt(rows: DataRow[]): Date | null {
  let latest: Date | null = null;

  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (!/fecha/i.test(key)) continue;
      const parsed = parseDateValue(value);
      if (!parsed) continue;

      if (!latest || parsed.getTime() > latest.getTime()) {
        latest = parsed;
      }
    }
  }

  return latest;
}

function formatLastUpdateLabel(date: Date): string {
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hour24 = date.getHours();
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minute = String(date.getMinutes()).padStart(2, '0');
  const ampm = hour24 >= 12 ? 'p.m.' : 'a.m.';
  return `${day} ${month} ${year}, ${String(hour12).padStart(2, '0')}:${minute} ${ampm}`;
}

function formatCellValue(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Si' : 'No';
  if (typeof value === 'number') {
    // Detecta serial de fecha Excel en columnas cuyo nombre contiene 'fecha'
    if (key && /fecha/i.test(key) && value > 25569 && value < 73050) {
      const d = excelSerialToDate(value);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getDate()}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  const text = String(value).trim();
  if (text.toLowerCase() === 'true') return 'Si';
  if (text.toLowerCase() === 'false') return 'No';
  return text;
}

function formatThousands(value: number): string {
  return new Intl.NumberFormat('es-MX').format(value);
}

function formatDeltaLabel(delta: number): string {
  if (delta > 0) return `▲ +${formatThousands(delta)} vs corte anterior (historico)`;
  if (delta < 0) return `▼ ${formatThousands(delta)} vs corte anterior (historico)`;
  return '● 0 vs corte anterior (historico)';
}

export default function App() {
  const [mainTab, setMainTab] = useState<MainTabKey>('infraestructura');
  const [avanceIndicadorTab, setAvanceIndicadorTab] = useState<AvanceIndicadorKey>('consultas');
  const [pendientesTab, setPendientesTab] = useState<PendientesTabKey>('estado_consultas');
  const [selectedAvanceEntidad, setSelectedAvanceEntidad] = useState<string>('');
  const [showAvanceEntidadSuggestions, setShowAvanceEntidadSuggestions] = useState(false);
  const [dataTab, setDataTab] = useState<DataTabKey>('clues');
  const [selectedCluesFilter, setSelectedCluesFilter] = useState<string>('');
  const [selectedEntidadFilter, setSelectedEntidadFilter] = useState<string>('');
  const [showCluesSuggestions, setShowCluesSuggestions] = useState(false);
  const [showEntidadSuggestions, setShowEntidadSuggestions] = useState(false);
  const [showEceVideo, setShowEceVideo] = useState(false);
  const [infraSubTabs, setInfraSubTabs] = useState<Record<string, 'resumen' | 'cambios'>>({});
  const [crudaUnlocked, setCrudaUnlocked] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [baseAn, setBaseAn] = useState<DataRow[]>([]);
  const [baseClues, setBaseClues] = useState<string[]>([]);
  const [baseMeta, setBaseMeta] = useState<{ cluesTotal: number; entidadesEsperadas: number }>({
    cluesTotal: 0,
    entidadesEsperadas: 0,
  });
  const [resultado, setResultado] = useState<DataRow[]>([]);
  const [resumen, setResumen] = useState<DataRow[]>([]);
  const [resumenEntidad, setResumenEntidad] = useState<DataRow[]>([]);
  const [tablaAvance, setTablaAvance] = useState<DataRow[]>([]);
  const [tablaEntidades, setTablaEntidades] = useState<DataRow[]>([]);
  const [tablaUnidadesAvance, setTablaUnidadesAvance] = useState<DataRow[]>([]);
  const [faltantes, setFaltantes] = useState<DataRow[]>([]);
  const [cluesGeo, setCluesGeo] = useState<CluesGeoItem[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [infraCards, setInfraCards] = useState<InfraestructuraCardsPayload | null>(null);
  const [avanceCoberturaEntidad, setAvanceCoberturaEntidad] = useState<AvanceCoberturaEntidadPayload | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const { tablas } = await cargarTablasFormulario();
      setBaseClues(tablas.baseClues);
      setBaseMeta(tablas.baseMeta);
      setBaseAn(tablas.baseAn);
      setResultado(tablas.resultado);
      setResumen(tablas.resumen);
      setResumenEntidad(tablas.resumenEntidad);
      setTablaAvance(tablas.tablaAvance);
      setTablaEntidades(tablas.tablaEntidades);
      setTablaUnidadesAvance(tablas.tablaUnidadesAvance);
      setFaltantes(
        tablas.faltantes.filter((row) => toText(row.entidad).toUpperCase() !== 'MEXICO')
      );
      setCluesGeo(tablas.cluesGeo);

      try {
        const infraRes = await fetch(`${import.meta.env.BASE_URL}infraestructura_cards.json?_cb=${Date.now()}`);
        if (infraRes.ok) {
          const payload = await infraRes.json() as InfraestructuraCardsPayload;
          setInfraCards(payload);
        } else {
          const pqxRes = await fetch(`${import.meta.env.BASE_URL}procedimientos_quirurgicos_cards.json?_cb=${Date.now()}`);
          if (pqxRes.ok) {
            const pqxPayload = await pqxRes.json() as IndicadorCardsPayload;
            setInfraCards({ procedimientos_quirurgicos: pqxPayload });
          } else {
            setInfraCards(null);
          }
        }
      } catch {
        setInfraCards(null);
      }

      try {
        const avanceRes = await fetch(`${import.meta.env.BASE_URL}avance_cobertura_entidad.json?_cb=${Date.now()}`);
        if (avanceRes.ok) {
          const payload = await avanceRes.json() as AvanceCoberturaEntidadPayload;
          setAvanceCoberturaEntidad(payload);
        } else {
          setAvanceCoberturaEntidad(null);
        }
      } catch {
        setAvanceCoberturaEntidad(null);
      }

      const updatedFromScript = parseDateValue(tablas.baseMeta.scriptLastRunAt);
      setLastUpdate(updatedFromScript ?? inferDataUpdatedAt(tablas.baseAn));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrio un error al cargar datos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const lastUpdateLabel = useMemo(() => {
    if (!lastUpdate) return 'Sin actualizacion';
    return formatLastUpdateLabel(lastUpdate);
  }, [lastUpdate]);

  const stats = useMemo<DashboardStats>(() => {
    // baseAn ya no se usa — los datos vienen de resumen y resultado directamente
    const cluesCapturadas = new Set<string>();
    const entidadesCapturadas = new Set<string>();
    const cluesConInternet = new Set<string>();

    for (const row of resumen) {
      const clues = toText(row.clues_imb);
      const entidad = toText(row.entidad);
      if (clues) cluesCapturadas.add(clues);
      if (entidad) entidadesCapturadas.add(entidad);

      const internet = toText(row.internet).toLowerCase();
      if (clues && (internet === 'true' || internet === '1' || internet === 'si')) cluesConInternet.add(clues);
    }

    const denominadorClues = baseMeta.cluesTotal > 0 ? baseMeta.cluesTotal : baseClues.length;
    const denominadorEntidades = baseMeta.entidadesEsperadas > 0 ? baseMeta.entidadesEsperadas : entidadesCapturadas.size;

    return {
      registrosBase: resumen.length,
      registrosUnidad: resumen.length,
      registrosRespuesta: resultado.length,
      baseCluesEsperadas: denominadorClues,
      baseEntidadesEsperadas: denominadorEntidades,
      cluesCapturadas: cluesCapturadas.size,
      entidadesCapturadas: entidadesCapturadas.size,
      unidadesInternet: cluesConInternet.size,
      consultoriosTotales: resumen.reduce((s, r) => s + toNumber(r.consultorio), 0),
      pctLlenado: (() => {
        const FIXED = new Set(['entidad', 'clues_imb', 'nombre_de_la_unidad', 'internet', 'consultorios_habilitados', 'consultorio', 'turno_consultorio', 'latitud', 'longitud']);
        let filled = 0, total = 0;
        for (const row of resultado) {
          for (const [key, value] of Object.entries(row)) {
            if (FIXED.has(key)) continue;
            total++;
            if (value !== null && value !== undefined && value !== '' && value !== 0 && value !== false) filled++;
          }
        }
        return total > 0 ? +(filled / total * 100).toFixed(1) : 0;
      })(),
    };
  }, [baseClues, baseMeta, resultado, resumen]);

  const topFaltantes = useMemo<TopFaltanteChart[]>(() => {
    const fixedCols = new Set([
      'entidad',
      'clues_imb',
      'nombre_de_la_unidad',
      'internet',
      'consultorios_habilitados',
      'consultorio',
      'turno_consultorio',
      'latitud',
      'longitud',
    ]);

    if (!resultado.length) return [];

    const consultoriosLlenados = resultado.filter((row) => toNumber(row.consultorio) > 0);
    const consultorioId = (row: DataRow) => {
      const clues = toText(row.clues_imb || row.clues) || 'Sin CLUES';
      const consultorio = toText(row.consultorio) || '-';
      return `${clues}::${consultorio}`;
    };

    const countsByItem = new Map<string, Set<string>>();

    for (const row of consultoriosLlenados) {
      const id = consultorioId(row);
      for (const [key, value] of Object.entries(row)) {
        if (fixedCols.has(key)) continue;
        if (isZeroValue(value)) {
          if (!countsByItem.has(key)) countsByItem.set(key, new Set<string>());
          countsByItem.get(key)?.add(id);
        }
      }
    }

    const total = consultoriosLlenados.length;

    const selectedKeyByLabel = new Map<string, string>();
    const sortedKeys = [...countsByItem.keys()].sort((a, b) => a.localeCompare(b, 'es'));

    for (const key of sortedKeys) {
      const label = key.replace(/_consultorio(_\d+)?$/i, '').replaceAll('_', ' ').trim();
      const normalized = normalizeInsumoLabel(label);
      if (!selectedKeyByLabel.has(normalized)) {
        selectedKeyByLabel.set(normalized, key);
      }
    }

    return [...selectedKeyByLabel.values()]
      .map((itemKey) => {
        const consultorios = countsByItem.get(itemKey) ?? new Set<string>();
        return {
          item: itemKey.replace(/_consultorio(_\d+)?$/i, '').replaceAll('_', ' ').trim(),
          faltantes: consultorios.size,
          pct: total > 0 ? (consultorios.size / total) * 100 : 0,
        };
      })
      .sort((a, b) => b.faltantes - a.faltantes)
      .slice(0, 20);
  }, [resultado]);

  const internetPie = useMemo<InternetPieItem[]>(() => {
    const conInternet = stats.unidadesInternet;
    // Referente a las unidades capturadas (506), no al total esperado
    const sinInternet = Math.max(0, stats.cluesCapturadas - conInternet);
    return [
      { name: 'Con Internet', value: conInternet },
      { name: 'Sin Internet', value: sinInternet },
    ];
  }, [stats]);

  const porEntidad = useMemo<EntidadChart[]>(() => {
    const FIXED_COLS = new Set(['entidad', 'clues_imb', 'nombre_de_la_unidad', 'internet', 'consultorios_habilitados', 'consultorio', 'turno_consultorio']);

    const map = new Map<string, EntidadChart & { _filledSum: number; _totalSum: number }>();

    for (const row of resumen) {
      const entidad = toText(row.entidad) || 'Sin entidad';
      if (!map.has(entidad)) {
        map.set(entidad, {
          entidad,
          unidades: 0,
          consultoriosHabilitados: 0,
          consultoriosLevantados: 0,
          pctLlenado: 0,
          _filledSum: 0,
          _totalSum: 0,
        });
      }

      const agg = map.get(entidad);
      if (!agg) continue;

      agg.unidades += 1;
      agg.consultoriosHabilitados += toNumber(row.consultorios_habilitados);
      agg.consultoriosLevantados += toNumber(row.consultorio);
    }

    for (const row of resultado) {
      const entidad = toText(row.entidad) || 'Sin entidad';
      const agg = map.get(entidad);
      if (!agg) continue;

      for (const [key, value] of Object.entries(row)) {
        if (FIXED_COLS.has(key)) continue;
        agg._totalSum += 1;
        if (value !== null && value !== undefined && value !== '' && value !== 0 && value !== false) {
          agg._filledSum += 1;
        }
      }
    }

    return [...map.values()]
      .map(({ _filledSum, _totalSum, ...rest }) => ({
        ...rest,
        pctLlenado: rest.entidad.trim().toUpperCase() === 'MEXICO'
          ? 100
          : (_totalSum > 0 ? +(_filledSum / _totalSum * 100).toFixed(1) : 0),
      }))
      .sort((a, b) => b.unidades - a.unidades);
  }, [resumen, resultado]);

  const tableColumns = (rows: DataRow[], includeFechaRegistro = true) => {
    if (!rows.length) return [];
    return Object.keys(rows[0])
      .filter((key) => includeFechaRegistro || key !== 'fecha_registro')
      .map((key) => ({
      key,
      label: key,
      render: (row: DataRow) => formatCellValue(row[key], key),
      }));
  };

  const handleLogoClick = () => {
    setLogoClickCount((prev) => {
      const next = prev + 1;
      if (next >= 6) {
        setCrudaUnlocked(true);
        setShowEceVideo(true);
        return 0;
      }
      return next;
    });
  };

  const allDataTabs: { key: DataTabKey; label: string; icon: typeof Database; count: number }[] = [
    { key: 'cruda', label: 'Base Cruda', icon: Database, count: baseAn.length },
    { key: 'clues', label: 'Por CLUES', icon: Building2, count: resultado.length },
    { key: 'estado', label: 'Por Estado', icon: Layers3, count: resumenEntidad.length },
    { key: 'faltantes', label: 'Faltantes', icon: AlertTriangle, count: faltantes.length },
    { key: 'tabla_avance', label: 'Tabla avance', icon: Gauge, count: tablaAvance.length },
    { key: 'tabla_entidades', label: 'Tabla entidades', icon: Building2, count: tablaEntidades.length },
    { key: 'tabla_unidades', label: 'Tabla unidades', icon: Layers3, count: tablaUnidadesAvance.length },
    { key: 'faltantes_por_estado', label: 'Faltantes por estados', icon: AlertTriangle, count: 0 },
    { key: 'tabla_faltantes_por_estado', label: 'Tabla faltantes por estados', icon: FileSearch, count: faltantes.length },
  ];

  const dataTabs = allDataTabs.filter(({ key }) => key !== 'cruda' || crudaUnlocked);

  const faltantesPorEstadoRows = useMemo<DataRow[]>(() => {
    const grouped = new Map<
      string,
      {
        entidad: string;
        filas: number;
        clues: Set<string>;
        consultorios: Set<string>;
      }
    >();

    for (const row of faltantes) {
      const entidad = toText(row.entidad) || 'Sin entidad';
      const key = normalizeKey(entidad);
      const clues = toText(row.clues || row.clues_imb);
      const consultorioId = `${clues}::${toText(row.consultorio)}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          entidad,
          filas: 0,
          clues: new Set<string>(),
          consultorios: new Set<string>(),
        });
      }

      const agg = grouped.get(key);
      if (!agg) continue;

      agg.filas += 1;
      if (clues) agg.clues.add(clues);
      if (consultorioId !== '::') agg.consultorios.add(consultorioId);
    }

    return Array.from(grouped.values())
      .map((item) => ({
        entidad: item.entidad,
        faltantes: item.filas,
        clues_unicas: item.clues.size,
        consultorios_unicos: item.consultorios.size,
      }))
      .sort((a, b) => toNumber(b.faltantes) - toNumber(a.faltantes));
  }, [faltantes]);

  const dataTabsWithCounts = useMemo(
    () => allDataTabs.map((tab) => (
      tab.key === 'faltantes_por_estado'
        ? { ...tab, count: faltantesPorEstadoRows.length }
        : tab
    )),
    [allDataTabs, faltantesPorEstadoRows.length],
  );

  const avanceRows = useMemo<DataRow[]>(() => {
    return porEntidad.map((row) => ({
      entidad: row.entidad,
      unidades: row.unidades,
      consultorios_habilitados: row.consultoriosHabilitados,
      consultorios_levantados: row.consultoriosLevantados,
      porcentaje_llenado: row.pctLlenado,
    }));
  }, [porEntidad]);

  const avancePorEntidad = useMemo(() => {
    if (tablaAvance.length > 0) {
      return tablaAvance
        .map((row) => ({
          entidad: toText(row.entidad),
          totalUnidades: toNumber(row.total_unidades),
          unidadesRespondieron: toNumber(row.unidades_respondieron),
          porcentaje: toNumber(row.porcentaje),
        }))
        .filter((row) => row.entidad)
        .sort((a, b) => b.porcentaje - a.porcentaje);
    }

    const esperadasByEntidad = new Map<string, { entidad: string; clues: Set<string> }>();
    const respondidasByEntidad = new Map<string, { entidad: string; clues: Set<string> }>();

    for (const row of baseAn) {
      const tipoRegistro = toText(row.tipo_registro).toLowerCase();
      if (tipoRegistro && tipoRegistro !== 'unidad') continue;

      const entidad = toText(row.entidad);
      const clues = toText(row.clues_imb || row.clues);
      if (!entidad || !clues) continue;

      const key = normalizeKey(entidad);
      if (!esperadasByEntidad.has(key)) {
        esperadasByEntidad.set(key, { entidad, clues: new Set<string>() });
      }
      esperadasByEntidad.get(key)?.clues.add(clues);
    }

    for (const row of resumen) {
      const entidad = toText(row.entidad);
      const clues = toText(row.clues_imb || row.clues);
      if (!entidad || !clues) continue;

      const key = normalizeKey(entidad);
      if (!respondidasByEntidad.has(key)) {
        respondidasByEntidad.set(key, { entidad, clues: new Set<string>() });
      }
      respondidasByEntidad.get(key)?.clues.add(clues);
    }

    const allKeys = new Set<string>([
      ...Array.from(esperadasByEntidad.keys()),
      ...Array.from(respondidasByEntidad.keys()),
    ]);

    return Array.from(allKeys).map((key) => {
      const expected = esperadasByEntidad.get(key);
      const captured = respondidasByEntidad.get(key);
      const totalUnidades = expected?.clues.size ?? 0;
      const unidadesRespondieronRaw = captured?.clues.size ?? 0;
      const unidadesRespondieron = Math.min(unidadesRespondieronRaw, totalUnidades || unidadesRespondieronRaw);

      return {
        entidad: captured?.entidad ?? expected?.entidad ?? key,
        totalUnidades,
        unidadesRespondieron,
        porcentaje: totalUnidades > 0
          ? +((unidadesRespondieron / totalUnidades) * 100).toFixed(1)
          : 0,
      };
    }).sort((a, b) => b.porcentaje - a.porcentaje);
  }, [baseAn, resumen, tablaAvance]);

  const avanceByIndicador = useMemo(() => {
    const buildFromDetalle = (payload: IndicadorCardsPayload | undefined) => {
      const detalle = payload?.detalle_clues ?? [];
      if (!detalle.length) return null;

      const byEntidad = new Map<string, {
        entidad: string;
        ece: number;
        sinba: number;
        ambas: number;
      }>();

      for (const row of detalle) {
        const entidad = toText(row.entidad) || 'SIN ENTIDAD';
        const ece = toBoolLike(row.reporta_ece_bool);
        const sinba = toBoolLike(row.reporta_sinba_bool);

        if (!byEntidad.has(entidad)) {
          byEntidad.set(entidad, { entidad, ece: 0, sinba: 0, ambas: 0 });
        }

        const agg = byEntidad.get(entidad);
        if (!agg) continue;

        if (ece && sinba) agg.ambas += 1;
        else if (ece) agg.ece += 1;
        else if (sinba) agg.sinba += 1;
      }

      const rows = Array.from(byEntidad.values())
        .map((item) => {
          const total = item.ece + item.sinba + item.ambas;
          return {
            entidad: item.entidad,
            ece: item.ece,
            sinba: item.sinba,
            ambas: item.ambas,
            total_clues: total,
            clues_evaluadas: total,
            pct_cobertura: total > 0 ? 100 : 0,
            delta_ece: 0,
            delta_sinba: 0,
            delta_ambas: 0,
          };
        })
        .sort((a, b) => b.total_clues - a.total_clues);

      return {
        fecha_corte: avanceCoberturaEntidad?.fecha_corte,
        fecha_corte_anterior: avanceCoberturaEntidad?.fecha_corte_anterior ?? null,
        rows,
      } as AvanceCoberturaEntidadPayload;
    };

    return {
      consultas: buildFromDetalle(infraCards?.consultas),
      procedimientos_quirurgicos: buildFromDetalle(infraCards?.procedimientos_quirurgicos) ?? avanceCoberturaEntidad,
      egresos_hospitalarios: buildFromDetalle(infraCards?.egresos_hospitalarios),
    } as Record<AvanceIndicadorKey, AvanceCoberturaEntidadPayload | null>;
  }, [infraCards, avanceCoberturaEntidad]);

  const activeAvanceCoberturaEntidad = useMemo(() => {
    return avanceByIndicador[avanceIndicadorTab] ?? null;
  }, [avanceByIndicador, avanceIndicadorTab]);

  const activeAvanceDetalleClues = useMemo(() => {
    if (avanceIndicadorTab === 'consultas') return infraCards?.consultas?.detalle_clues ?? [];
    if (avanceIndicadorTab === 'procedimientos_quirurgicos') return infraCards?.procedimientos_quirurgicos?.detalle_clues ?? [];
    return infraCards?.egresos_hospitalarios?.detalle_clues ?? [];
  }, [infraCards, avanceIndicadorTab]);

  const avanceEntidadOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of activeAvanceDetalleClues) {
      const entidad = toText(row.entidad);
      if (entidad) values.add(entidad);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'es'));
  }, [activeAvanceDetalleClues]);

  const avanceEntidadSuggestions = useMemo(() => {
    const term = toText(selectedAvanceEntidad).toLowerCase();
    if (!term) return [] as string[];

    return avanceEntidadOptions
      .map((entidad) => {
        const text = entidad.toLowerCase();
        let score = 0;
        if (text === term) score += 100;
        if (text.startsWith(term)) score += 70;
        if (text.includes(term)) score += 30;
        return { entidad, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.entidad.localeCompare(b.entidad, 'es'))
      .slice(0, 6)
      .map((item) => item.entidad);
  }, [avanceEntidadOptions, selectedAvanceEntidad]);

  const avanceSummary = useMemo(() => {
    const filtroEntidad = normalizeKey(selectedAvanceEntidad);

    if (filtroEntidad) {
      const detalleFiltrado = activeAvanceDetalleClues.filter(
        (row) => normalizeKey(row.entidad) === filtroEntidad,
      );

      const unidadesEce = detalleFiltrado.reduce((sum, row) => {
        const ece = toBoolLike(row.reporta_ece_bool);
        const sinba = toBoolLike(row.reporta_sinba_bool);
        return sum + (ece && !sinba ? 1 : 0);
      }, 0);

      const unidadesSinba = detalleFiltrado.reduce((sum, row) => {
        const ece = toBoolLike(row.reporta_ece_bool);
        const sinba = toBoolLike(row.reporta_sinba_bool);
        return sum + (!ece && sinba ? 1 : 0);
      }, 0);

      const unidadesAmbas = detalleFiltrado.reduce((sum, row) => {
        const ece = toBoolLike(row.reporta_ece_bool);
        const sinba = toBoolLike(row.reporta_sinba_bool);
        return sum + (ece && sinba ? 1 : 0);
      }, 0);

      return {
        unidadesEce,
        unidadesSinba,
        unidadesAmbas,
        unidadesMigradasSinbaAEce: 0,
        pctCambioSinbaAEce: 0,
        sinbaCorteAnterior: unidadesSinba,
      };
    }

    const rows = activeAvanceCoberturaEntidad?.rows ?? [];
    const unidadesEce = rows.reduce((sum, row) => sum + toNumber(row.ece), 0);
    const unidadesSinba = rows.reduce((sum, row) => sum + toNumber(row.sinba), 0);
    const unidadesAmbas = rows.reduce((sum, row) => sum + toNumber(row.ambas), 0);

    const deltaEceGlobal = rows.reduce((sum, row) => sum + toNumber(row.delta_ece), 0);
    const deltaSinbaGlobal = rows.reduce((sum, row) => sum + toNumber(row.delta_sinba), 0);

    // Aproxima migracion neta SINBA -> ECE con los cambios agregados entre cortes.
    const entradasEce = Math.max(deltaEceGlobal, 0);
    const salidasSinba = Math.max(-deltaSinbaGlobal, 0);
    const unidadesMigradasSinbaAEce = Math.min(entradasEce, salidasSinba);

    const sinbaCorteAnterior = Math.max(unidadesSinba - deltaSinbaGlobal, 0);
    const pctCambioSinbaAEce = sinbaCorteAnterior > 0
      ? (unidadesMigradasSinbaAEce / sinbaCorteAnterior) * 100
      : 0;

    return {
      unidadesEce,
      unidadesSinba,
      unidadesAmbas,
      unidadesMigradasSinbaAEce,
      pctCambioSinbaAEce,
      sinbaCorteAnterior,
    };
  }, [activeAvanceCoberturaEntidad, activeAvanceDetalleClues, selectedAvanceEntidad]);

  const avanceDetalleCluesFiltrado = useMemo(() => {
    const filtroEntidad = normalizeKey(selectedAvanceEntidad);
    if (!filtroEntidad) return activeAvanceDetalleClues;
    return activeAvanceDetalleClues.filter((row) => normalizeKey(row.entidad) === filtroEntidad);
  }, [activeAvanceDetalleClues, selectedAvanceEntidad]);

  const avanceCluesRows = useMemo<DataRow[]>(() => {
    return avanceDetalleCluesFiltrado.map((row) => {
      const ece = toBoolLike(row.reporta_ece_bool);
      const sinba = toBoolLike(row.reporta_sinba_bool);
      const categoria = ece && sinba
        ? 'Ambas'
        : ece
          ? 'ECE'
          : sinba
            ? 'SINBA'
            : 'Sin reporte';

      return {
        clues_imb: toText(row.clues_imb),
        nombre_de_la_unidad: toText(row.nombre_de_la_unidad),
        entidad: toText(row.entidad),
        categoria,
        reporta_ece_bool: ece,
        reporta_sinba_bool: sinba,
      };
    });
  }, [avanceDetalleCluesFiltrado]);

  const avanceEstadoRows = useMemo<DataRow[]>(() => {
    const rows = activeAvanceCoberturaEntidad?.rows ?? [];
    const filtroEntidad = normalizeKey(selectedAvanceEntidad);
    const filtered = filtroEntidad
      ? rows.filter((row) => normalizeKey(row.entidad) === filtroEntidad)
      : rows;

    return filtered.map((row) => ({
      entidad: toText(row.entidad),
      ece: toNumber(row.ece),
      sinba: toNumber(row.sinba),
      ambas: toNumber(row.ambas),
      total_clues: toNumber(row.total_clues),
      clues_evaluadas: toNumber(row.clues_evaluadas),
      pct_cobertura: toNumber(row.pct_cobertura),
      delta_ece: toNumber(row.delta_ece),
      delta_sinba: toNumber(row.delta_sinba),
      delta_ambas: toNumber(row.delta_ambas),
    }));
  }, [activeAvanceCoberturaEntidad, selectedAvanceEntidad]);

  const pendientesConsultasRows = useMemo<DataRow[]>(() => {
    const rows = avanceByIndicador.consultas?.rows ?? [];
    return rows.map((row) => ({
      entidad: toText(row.entidad),
      ece: toNumber(row.ece),
      sinba: toNumber(row.sinba),
      ambas: toNumber(row.ambas),
      total_clues: toNumber(row.total_clues),
    }));
  }, [avanceByIndicador]);

  const pendientesConsultasCluesRows = useMemo<DataRow[]>(() => {
    const rows = infraCards?.consultas?.detalle_clues ?? [];
    return rows.map((row) => {
      const ece = toBoolLike(row.reporta_ece_bool);
      const sinba = toBoolLike(row.reporta_sinba_bool);
      return {
        clues_imb: toText(row.clues_imb),
        nombre_de_la_unidad: toText(row.nombre_de_la_unidad),
        entidad: toText(row.entidad),
        ece: ece ? 'Si' : 'No',
        sinba: sinba ? 'Si' : 'No',
        ambas: ece && sinba ? 'Si' : 'No',
      };
    });
  }, [infraCards]);

  const pendientesConsultasStateColumns = useMemo(() => ([
    { key: 'entidad', label: 'entidad' },
    { key: 'ece', label: 'ece' },
    { key: 'sinba', label: 'sinba' },
    { key: 'ambas', label: 'ambas' },
    { key: 'total_clues', label: 'total_clues' },
  ]), []);

  const pendientesConsultasCluesColumns = useMemo(() => ([
    { key: 'clues_imb', label: 'clues_imb' },
    { key: 'nombre_de_la_unidad', label: 'nombre_de_la_unidad' },
    { key: 'entidad', label: 'entidad' },
    { key: 'ece', label: 'ece' },
    { key: 'sinba', label: 'sinba' },
    { key: 'ambas', label: 'ambas' },
  ]), []);

  const avanceTablaRows = useMemo<DataRow[]>(() => {
    const filtroEntidad = normalizeKey(selectedAvanceEntidad);
    return filtroEntidad ? avanceCluesRows : avanceEstadoRows;
  }, [avanceCluesRows, avanceEstadoRows, selectedAvanceEntidad]);

  const avanceTablaMeta = useMemo(() => {
    const indicadorLabel = avanceIndicadorTab === 'consultas'
      ? 'consultas'
      : avanceIndicadorTab === 'procedimientos_quirurgicos'
        ? 'procedimientos_quirurgicos'
        : 'egresos_hospitalarios';

    const modoClues = Boolean(normalizeKey(selectedAvanceEntidad));
    return {
      title: modoClues
        ? `Detalle por CLUES - ${indicadorLabel.replaceAll('_', ' ')}`
        : `Detalle por estado - ${indicadorLabel.replaceAll('_', ' ')}`,
      exportFileName: modoClues
        ? `avance_${indicadorLabel}_por_clues`
        : `avance_${indicadorLabel}_por_estado`,
      exportSheetName: modoClues
        ? `Avance ${indicadorLabel} CLUES`
        : `Avance ${indicadorLabel} Estado`,
    };
  }, [avanceIndicadorTab, selectedAvanceEntidad]);

  const pendingSummary = useMemo(() => {
    const cluesSet = new Set<string>();
    const entidadSet = new Set<string>();
    const consultorioSet = new Set<string>();

    for (const row of faltantes) {
      const clues = toText(row.clues || row.clues_imb);
      const entidad = toText(row.entidad);
      const consultorio = `${toText(row.clues || row.clues_imb)}::${toText(row.consultorio)}`;
      if (clues) cluesSet.add(clues);
      if (entidad) entidadSet.add(entidad);
      if (consultorio && consultorio !== '::') consultorioSet.add(consultorio);
    }

    return {
      cluesUnicas: cluesSet.size,
      entidades: entidadSet.size,
      consultorios: consultorioSet.size,
    };
  }, [faltantes]);

  const cluesFilterOptions = useMemo<CluesFilterOption[]>(() => {
    const sections = [
      infraCards?.consultas,
      infraCards?.procedimientos_quirurgicos,
      infraCards?.egresos_hospitalarios,
    ];

    const map = new Map<string, CluesFilterOption>();
    for (const section of sections) {
      for (const row of section?.detalle_clues ?? []) {
        const clues = toText(row.clues_imb);
        if (!clues) continue;
        const unidad = toText(row.nombre_de_la_unidad);
        const entidad = toText(row.entidad);
        if (!map.has(clues)) {
          map.set(clues, { clues, unidad, entidad });
        }
      }
    }

    if (map.size > 0) {
      return Array.from(map.values()).sort((a, b) => a.clues.localeCompare(b.clues, 'es'));
    }

    const fallback = new Map<string, CluesFilterOption>();
    for (const row of resumen) {
      const clues = toText(row.clues_imb || row.clues);
      if (!clues) continue;
      if (!fallback.has(clues)) {
        fallback.set(clues, {
          clues,
          unidad: toText(row.nombre_de_la_unidad),
          entidad: toText(row.entidad),
        });
      }
    }
    return Array.from(fallback.values()).sort((a, b) => a.clues.localeCompare(b.clues, 'es'));
  }, [infraCards, resumen]);

  const entidadFilterOptions = useMemo(() => {
    const values = new Set<string>();
    for (const option of cluesFilterOptions) {
      if (option.entidad) values.add(option.entidad);
    }
    if (values.size > 0) return Array.from(values).sort((a, b) => a.localeCompare(b, 'es'));

    for (const row of resumen) {
      const entidad = toText(row.entidad);
      if (entidad) values.add(entidad);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'es'));
  }, [cluesFilterOptions, resumen]);

  const entidadSuggestions = useMemo(() => {
    const term = toText(selectedEntidadFilter).toLowerCase();
    if (!term) return [] as string[];

    return entidadFilterOptions
      .map((entidad) => {
        const text = entidad.toLowerCase();
        let score = 0;
        if (text === term) score += 100;
        if (text.startsWith(term)) score += 70;
        if (text.includes(term)) score += 30;
        return { entidad, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.entidad.localeCompare(b.entidad, 'es'))
      .slice(0, 6)
      .map((item) => item.entidad);
  }, [entidadFilterOptions, selectedEntidadFilter]);

  const cluesFilterOptionsByEntidad = useMemo(() => {
    const filtroEntidad = normalizeKey(selectedEntidadFilter);
    if (!filtroEntidad) return cluesFilterOptions;
    return cluesFilterOptions.filter((option) => normalizeKey(option.entidad) === filtroEntidad);
  }, [cluesFilterOptions, selectedEntidadFilter]);

  const cluesSuggestions = useMemo(() => {
    const term = toText(selectedCluesFilter).toLowerCase();
    if (!term) return [] as CluesFilterOption[];

    const ranked = cluesFilterOptionsByEntidad
      .map((option) => {
        const clues = option.clues.toLowerCase();
        const unidad = option.unidad.toLowerCase();
        let score = 0;

        if (clues === term) score += 100;
        if (clues.startsWith(term)) score += 70;
        if (clues.includes(term)) score += 40;
        if (unidad.startsWith(term)) score += 30;
        if (unidad.includes(term)) score += 20;

        return { option, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.option.clues.localeCompare(b.option.clues, 'es'))
      .slice(0, 5)
      .map((item) => item.option);

    return ranked;
  }, [cluesFilterOptionsByEntidad, selectedCluesFilter]);

  const mainTabs: { key: MainTabKey; label: string; icon: typeof LayoutGrid }[] = [
    { key: 'infraestructura', label: 'Reporte ECE', icon: LayoutGrid },
    { key: 'avance', label: 'Tablero de avance', icon: Gauge },
    { key: 'pendientes', label: 'Informe de clues pendientes', icon: FileSearch },
  ];

  const avanceIndicadorTabs: { key: AvanceIndicadorKey; label: string; icon: typeof LayoutGrid }[] = [
    { key: 'consultas', label: 'Consultas', icon: Stethoscope },
    { key: 'procedimientos_quirurgicos', label: 'Procedimientos Quirurgicos', icon: Scissors },
    { key: 'egresos_hospitalarios', label: 'Egresos Hospitalarios', icon: LogOut },
  ];

  const pendientesTabs: { key: PendientesTabKey; label: string; icon: typeof LayoutGrid }[] = [
    { key: 'estado_consultas', label: 'Detalle por estado - consultas', icon: Layers3 },
    { key: 'clues_consultas', label: 'Detalle por CLUES - consultas', icon: Building2 },
  ];

  const headerContent = useMemo(() => {
    if (mainTab === 'avance') {
      return {
        eyebrow: 'Panel de Seguimiento',
        title: 'Tablero de Avance',
        subtitle: 'Visualiza indicadores, gráficas y tablas de avance por entidad y unidad.',
      };
    }

    if (mainTab === 'pendientes') {
      return {
        eyebrow: 'Panel de Seguimiento',
        title: 'Informe de CLUES Pendientes',
        subtitle: 'Consulta el seguimiento de unidades y registros pendientes por completar.',
      };
    }

    return {
      eyebrow: 'Panel Principal',
      title: 'Reporte ECE',
      subtitle: 'Fecha de corte: 07 de agosto, 2026. Estado',
    };
  }, [mainTab]);

  const portadaReporte = useMemo(() => {
    const buildSection = (
      payload: IndicadorCardsPayload | undefined,
      titulo: string,
      unidad: string,
      mostrarEtiquetas: boolean,
    ) => {
      const filtroClues = toText(selectedCluesFilter).toLowerCase();
      const filtroEntidad = normalizeKey(selectedEntidadFilter);
      const detalles = payload?.detalle_clues ?? [];

      const detallesFiltrados = detalles.filter((row) => {
        const clues = toText(row.clues_imb);
        const unidadRow = toText(row.nombre_de_la_unidad);
        const entidadRow = normalizeKey(row.entidad);
        const buscable = `${clues} ${unidadRow}`.toLowerCase();

        const matchClues = !filtroClues
          || buscable.includes(filtroClues);
        const matchEntidad = !filtroEntidad || entidadRow === filtroEntidad;
        return matchClues && matchEntidad;
      });

      const tieneDetalle = detalles.length > 0;

      let onlyEce = 0;
      let both = 0;
      let onlySinba = 0;
      let totalEvaluadas = 0;
      let totalMostrado = 0;
      let conectado = false;
      let resumenEce = 0;
      let resumenSinba = 0;
      let resumenTotal = 0;
      let resumenConectado = false;
      let deltaOnlyEce = 0;
      let deltaBoth = 0;
      let deltaOnlySinba = 0;
      const filtrosActivos = Boolean(toText(selectedCluesFilter) || toText(selectedEntidadFilter));

      if (tieneDetalle) {
        const rows = detallesFiltrados;
        conectado = true;
        totalEvaluadas = rows.reduce((acc, row) => acc + (toBoolLike(row.cuatro_columnas_en_cero) ? 0 : 1), 0);

        let bothFalse = 0;
        for (const row of rows) {
          const ece = toBoolLike(row.reporta_ece_bool);
          const sinba = toBoolLike(row.reporta_sinba_bool);
          if (ece && !sinba) onlyEce += 1;
          else if (ece && sinba) both += 1;
          else if (!ece && sinba) onlySinba += 1;
          else bothFalse += 1;

          resumenEce += toNumber(row.resumen_ece);
          resumenSinba += toNumber(row.resumen_sinba);
          resumenTotal += toNumber(row.resumen_total);
        }
        totalMostrado = rows.length - bothFalse;
        resumenConectado = rows.some((row) => (
          row.resumen_ece !== undefined
          || row.resumen_sinba !== undefined
          || row.resumen_total !== undefined
        ));

        // Agregar deltas: si filtros activos, sumar delta_clues de las filas filtradas; si no, usar delta global
        if (!filtrosActivos) {
          deltaOnlyEce = toNumber(payload?.metadata?.delta_cards_clues?.unicamente_en_ece);
          deltaBoth = toNumber(payload?.metadata?.delta_cards_clues?.ambos_sistemas);
          deltaOnlySinba = toNumber(payload?.metadata?.delta_cards_clues?.unicamente_en_sinba);
        } else {
          // Sumar delta_clues de cada CLUES filtrado
          deltaOnlyEce = rows.reduce((acc, row) => acc + toNumber(row.delta_clues_ece), 0);
          deltaBoth = rows.reduce((acc, row) => acc + toNumber(row.delta_clues_ambas), 0);
          deltaOnlySinba = rows.reduce((acc, row) => acc + toNumber(row.delta_clues_sinba), 0);
        }
      } else {
        onlyEce = toNumber(payload?.cards_clues?.unicamente_en_ece);
        both = toNumber(payload?.cards_clues?.ambos_sistemas);
        onlySinba = toNumber(payload?.cards_clues?.unicamente_en_sinba);
        totalEvaluadas = toNumber(payload?.metadata?.total_clues_evaluadas);
        const totalFromJson = toNumber(payload?.metadata?.no_reportaron);
        const totalFallback = onlyEce + both + onlySinba;
        totalMostrado = totalFromJson > 0 ? totalFromJson : totalFallback;
        conectado = totalEvaluadas > 0;

        resumenEce = toNumber(payload?.metadata?.resumen_sistema?.ece);
        resumenSinba = toNumber(payload?.metadata?.resumen_sistema?.sinba);
        resumenTotal = toNumber(payload?.metadata?.resumen_sistema?.total);
        resumenConectado = resumenEce > 0 || resumenSinba > 0 || resumenTotal > 0;

        if (!filtrosActivos) {
          deltaOnlyEce = toNumber(payload?.metadata?.delta_cards_clues?.unicamente_en_ece);
          deltaBoth = toNumber(payload?.metadata?.delta_cards_clues?.ambos_sistemas);
          deltaOnlySinba = toNumber(payload?.metadata?.delta_cards_clues?.unicamente_en_sinba);
        }
      }

      const tablaCambios = detallesFiltrados.flatMap((row) => {
        const clues = toText(row.clues_imb) || 'SIN CLUES';
        const entidad = toText(row.entidad) || 'SIN ENTIDAD';
        const unidadNombre = toText(row.nombre_de_la_unidad) || 'SIN NOMBRE';
        const cambios: Array<{ clues_imb: string; entidad: string; nombre_de_la_unidad: string; tipo: string; delta: number; cambio: 'sumó' | 'se eliminó'; }> = [];

        const pushCambio = (tipo: string, delta: number) => {
          if (delta === 0) return;
          cambios.push({
            clues_imb: clues,
            entidad,
            nombre_de_la_unidad: unidadNombre,
            tipo,
            delta: Math.abs(delta),
            cambio: delta > 0 ? 'sumó' : 'se eliminó',
          });
        };

        pushCambio('ECE', toNumber(row.delta_clues_ece));
        pushCambio('AMBOS', toNumber(row.delta_clues_ambas));
        pushCambio('SINBA', toNumber(row.delta_clues_sinba));

        return cambios;
      }).filter((item) => item.delta > 0)
        .sort((a, b) => b.delta - a.delta || a.clues_imb.localeCompare(b.clues_imb, 'es'));

      return {
        titulo,
        subtitulo: conectado
          ? `(${formatThousands(totalMostrado)} de ${formatThousands(totalEvaluadas)})`
          : '(Pendiente de conexion de datos)',
        unidad,
        mostrarEtiquetas,
        conectado,
        resumenConectado,
        clues: [
          { tipo: 'Unicamente en ECE', valor: onlyEce, variacion: conectado ? formatDeltaLabel(deltaOnlyEce) : 'Pendiente de conexion', delta: deltaOnlyEce, estado: 'ok' },
          { tipo: 'Ambos sistemas', valor: both, variacion: conectado ? formatDeltaLabel(deltaBoth) : 'Pendiente de conexion', delta: deltaBoth, estado: 'warn' },
          { tipo: 'Unicamente en SINBA', valor: onlySinba, variacion: conectado ? formatDeltaLabel(deltaOnlySinba) : 'Pendiente de conexion', delta: deltaOnlySinba, estado: 'bad' },
        ],
        tablaCambios,
        resumen: {
          ece: resumenEce,
          sinba: resumenSinba,
          total: resumenTotal,
        },
      };
    };

    return [
      buildSection(infraCards?.consultas, 'Consultas', 'consultas', true),
      buildSection(infraCards?.procedimientos_quirurgicos, 'Procedimientos Quirurgicos', 'procedimientos', false),
      buildSection(infraCards?.egresos_hospitalarios, 'Egresos Hospitalarios', 'egresos', false),
    ] as const;
  }, [infraCards, selectedCluesFilter, selectedEntidadFilter]);

  const pptTrendCharts = useMemo(() => {
    const buildTrendChart = (payload: IndicadorCardsPayload | undefined, title: string) => {
      const detalle = payload?.detalle_clues ?? [];
      const filtroClues = toText(selectedCluesFilter).toLowerCase();
      const filtroEntidad = normalizeKey(selectedEntidadFilter);

      const filtered = detalle.filter((row) => {
        const clues = toText(row.clues_imb);
        const unidad = toText(row.nombre_de_la_unidad);
        const entidadRow = normalizeKey(row.entidad);
        const buscable = `${clues} ${unidad}`.toLowerCase();

        const matchClues = !filtroClues || buscable.includes(filtroClues);
        const matchEntidad = !filtroEntidad || entidadRow === filtroEntidad;
        return matchClues && matchEntidad;
      });

      if (filtroEntidad) {
        return {
          title,
          categoryLabel: 'CLUES',
          points: filtered
            .map((row) => {
              const ece = toBoolLike(row.reporta_ece_bool);
              const sinba = toBoolLike(row.reporta_sinba_bool);
              return {
                label: toText(row.clues_imb) || 'SIN CLUES',
                ece: ece && !sinba ? 1 : 0,
                sinba: !ece && sinba ? 1 : 0,
                ambas: ece && sinba ? 1 : 0,
              };
            })
            .filter((row) => row.label)
            .sort((a, b) => (b.ece + b.sinba + b.ambas) - (a.ece + a.sinba + a.ambas)),
        };
      }

      const byEntidad = new Map<string, { label: string; ece: number; sinba: number; ambas: number }>();
      for (const row of filtered) {
        const entidad = toText(row.entidad) || 'SIN ENTIDAD';
        const ece = toBoolLike(row.reporta_ece_bool);
        const sinba = toBoolLike(row.reporta_sinba_bool);

        if (!byEntidad.has(entidad)) {
          byEntidad.set(entidad, { label: entidad, ece: 0, sinba: 0, ambas: 0 });
        }

        const agg = byEntidad.get(entidad);
        if (!agg) continue;
        if (ece && sinba) agg.ambas += 1;
        else if (ece) agg.ece += 1;
        else if (sinba) agg.sinba += 1;
      }

      return {
        title,
        categoryLabel: 'Entidad',
        points: Array.from(byEntidad.values()).sort((a, b) => (b.ece + b.sinba + b.ambas) - (a.ece + a.sinba + a.ambas)),
      };
    };

    return [
      buildTrendChart(infraCards?.consultas, 'Consultas'),
      buildTrendChart(infraCards?.procedimientos_quirurgicos, 'Procedimientos quirurgicos'),
      buildTrendChart(infraCards?.egresos_hospitalarios, 'Egresos hospitalarios'),
    ];
  }, [infraCards, selectedCluesFilter, selectedEntidadFilter]);

  const handleDownloadPpt = async () => {
    try {
      await descargarInformeTransicionDesdePlantilla({
        templateUrl: `${import.meta.env.BASE_URL}informe_transicion_actualizado.pptx`,
        sections: portadaReporte.map((section) => ({
          titulo: section.titulo,
          subtitulo: section.subtitulo,
          unidad: section.unidad,
          clues: section.clues.map((c) => ({
            tipo: c.tipo,
            valor: c.valor,
            delta: Number((c as { delta?: number }).delta ?? 0),
          })),
          resumen: section.resumen,
        })),
        selectedEntidad: selectedEntidadFilter,
        selectedClues: selectedCluesFilter,
        trendCharts: pptTrendCharts,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo generar el PowerPoint.';
      window.alert(message);
    }
  };

  const handleDownloadTablaResumen = () => {
    const rows = portadaReporte.flatMap((section) => section.tablaCambios.map((item) => ({
      Indicador: section.titulo,
      CLUES: item.clues_imb,
      Entidad: item.entidad,
      Unidad: item.nombre_de_la_unidad,
      Cambio: `${item.cambio} en ${item.tipo}`,
      Delta: item.delta,
    })));

    if (rows.length === 0) {
      window.alert('No hay CLUES con cambios reales para descargar.');
      return;
    }

    exportarExcel(rows, 'resumen_cambios_clues', 'Cambios por CLUES');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        onLogoClick={handleLogoClick}
        eyebrow={headerContent.eyebrow}
        title={headerContent.title}
        subtitle={headerContent.subtitle}
      />

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <div className="card p-10 text-center text-gray-500">Cargando script y construyendo tablas...</div>
        ) : error ? (
          <div className="card border-imss-wine/30 bg-imss-wine/5 p-8 text-imss-wine">Error: {error}</div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {mainTabs.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setMainTab(key)}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                      mainTab === key ? 'tab-active' : 'tab-inactive'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              {mainTab === 'infraestructura' && (
                <section className="space-y-6">
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleDownloadTablaResumen}
                      className="inline-flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 transition-colors hover:bg-violet-100"
                    >
                      <Download className="h-4 w-4" />
                      Descargar Tabla
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadPpt}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                    >
                      <Download className="h-4 w-4" />
                      Descargar PowerPoint
                    </button>
                  </div>
                  <div className="ece-wrapper">
                    <div className="ece-dashboard">
                      <header className="ece-header" />

                      {portadaReporte.map((bloque, index) => {
                        const totalCardStyles = [
                          {
                            card: 'border-emerald-300 bg-emerald-50',
                            iconWrap: 'bg-emerald-100 text-emerald-700',
                            divider: 'border-emerald-300',
                            icon: Stethoscope,
                          },
                          {
                            card: 'border-emerald-300 bg-emerald-50',
                            iconWrap: 'bg-emerald-100 text-emerald-700',
                            divider: 'border-emerald-300',
                            icon: Scissors,
                          },
                          {
                            card: 'border-emerald-300 bg-emerald-50',
                            iconWrap: 'bg-emerald-100 text-emerald-700',
                            divider: 'border-emerald-300',
                            icon: LogOut,
                          },
                        ] as const;

                        const totalStyle = totalCardStyles[index % totalCardStyles.length];
                        const activeSubTab = infraSubTabs[bloque.titulo] ?? 'resumen';

                        return (
                          <section key={bloque.titulo} className={`ece-section ${index === 0 ? 'first' : index === 1 ? 'second' : 'third'}`}>
                            {index === 0 ? (
                              <div className="ece-section-title-row">
                                <div className="ece-section-title">{bloque.titulo} {bloque.subtitulo}</div>
                                <div className="ece-inline-filters">
                                  <div className="ece-filter-group">
                                    <label className="ece-filter-label" htmlFor="filtro-entidad">Entidad</label>
                                    <div className="relative">
                                      <input
                                        id="filtro-entidad"
                                        value={selectedEntidadFilter}
                                        onChange={(e) => {
                                          const value = e.target.value.trim().toUpperCase() === 'TODAS' ? '' : e.target.value;
                                          setSelectedEntidadFilter(value);
                                        }}
                                        onFocus={() => setShowEntidadSuggestions(true)}
                                        onBlur={() => setTimeout(() => setShowEntidadSuggestions(false), 120)}
                                        className="ece-filter-select"
                                        placeholder="Buscar entidad..."
                                        autoComplete="off"
                                      />

                                      {showEntidadSuggestions && entidadSuggestions.length > 0 && toText(selectedEntidadFilter) && (
                                        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                                          {entidadSuggestions.map((entidad) => (
                                            <button
                                              key={entidad}
                                              type="button"
                                              onMouseDown={(e) => {
                                                e.preventDefault();
                                                setSelectedEntidadFilter(entidad);
                                                setShowEntidadSuggestions(false);
                                              }}
                                              className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                                            >
                                              {entidad}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="ece-filter-group">
                                    <label className="ece-filter-label" htmlFor="filtro-clues">CLUES</label>
                                    <div className="relative">
                                      <input
                                        id="filtro-clues"
                                        value={selectedCluesFilter}
                                        onChange={(e) => setSelectedCluesFilter(e.target.value)}
                                        onFocus={() => setShowCluesSuggestions(true)}
                                        onBlur={() => setTimeout(() => setShowCluesSuggestions(false), 120)}
                                        className="ece-filter-select"
                                        placeholder="Buscar CLUES o unidad..."
                                        autoComplete="off"
                                      />

                                      {showCluesSuggestions && cluesSuggestions.length > 0 && toText(selectedCluesFilter) && (
                                        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                                          {cluesSuggestions.map((option) => (
                                            <button
                                              key={`${option.clues}::${option.unidad}`}
                                              type="button"
                                              onMouseDown={(e) => {
                                                e.preventDefault();
                                                setSelectedCluesFilter(`${option.clues} ${option.unidad}`.trim());
                                                setShowCluesSuggestions(false);
                                              }}
                                              className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                                            >
                                              <span className="font-semibold">{option.clues}</span> - {option.unidad || 'Sin nombre'}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="ece-section-title">
                                {bloque.titulo} {bloque.subtitulo}
                              </div>
                            )}

                            <div className="mb-4 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setInfraSubTabs((prev) => ({ ...prev, [bloque.titulo]: 'resumen' }))}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                  activeSubTab === 'resumen'
                                    ? 'bg-imss-green text-white shadow-sm'
                                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                Resumen
                              </button>
                              <button
                                type="button"
                                disabled={bloque.tablaCambios.length === 0}
                                onClick={() => setInfraSubTabs((prev) => ({ ...prev, [bloque.titulo]: 'cambios' }))}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                  activeSubTab === 'cambios'
                                    ? 'bg-violet-600 text-white shadow-sm'
                                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                } ${bloque.tablaCambios.length === 0 ? 'cursor-not-allowed opacity-40' : ''}`}
                              >
                                Cambios por CLUES
                              </button>
                            </div>

                            {activeSubTab === 'resumen' ? (
                              <div className="ece-section-grid">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3">
                                  {bloque.clues.map((item) => {
                                    const color = !bloque.conectado
                                      ? { bg: '#6B7280' }
                                      : item.delta > 0
                                        ? { bg: '#047857' }
                                        : item.delta < 0
                                          ? { bg: '#B91C1C' }
                                          : { bg: '#A57F2C' };
                                    const badge = item.tipo.includes('ECE') ? 'ECE' : item.tipo.includes('Ambos') ? 'AMBOS' : 'SINBA';

                                    return (
                                      <div key={item.tipo}>
                                        {bloque.mostrarEtiquetas && <div className="ece-label-above">{item.tipo}</div>}
                                        <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-transparent hover:shadow-md">
                                          <div
                                            className="absolute left-0 right-0 top-0 h-1 rounded-t-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                                            style={{ background: color.bg }}
                                          />

                                          <div
                                            className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold transition-colors duration-200"
                                            style={{ background: '#F3F4F6', color: '#4B5563' }}
                                          >
                                            {badge}
                                          </div>

                                          {!bloque.mostrarEtiquetas && <div className="ece-inline-label">{item.tipo}</div>}
                                          <div className="ece-status-number">
                                            {bloque.conectado ? formatThousands(item.valor) : '--'}
                                          </div>
                                          <div className="ece-status-label">CLUES</div>
                                          <div className="ece-change">
                                            {bloque.conectado ? item.variacion : 'Pendiente de conexion'}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                <div className={`ece-total group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:scale-[1.03] hover:shadow-lg ${totalStyle.card}`}>
                                  <div className="absolute -right-4 -top-4 opacity-10 transition-transform duration-500 group-hover:scale-125 group-hover:opacity-20">
                                    <totalStyle.icon className="h-20 w-20" />
                                  </div>
                                  <div className="relative mb-3 flex items-start justify-between">
                                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110 ${totalStyle.iconWrap}`}>
                                      <totalStyle.icon className="h-5 w-5" strokeWidth={2.2} />
                                    </div>
                                  </div>
                                  <p className="relative mb-2 text-[10px] font-bold uppercase tracking-widest opacity-70">
                                    <span className="text-black">Resumen del sistema</span>
                                  </p>

                                  <div className="ece-total-row grid grid-cols-[92px_1fr] items-center gap-1 text-sm font-semibold text-gray-700">
                                    <span className="system text-black">ECE:</span>
                                    <span className="value text-black">{bloque.resumenConectado ? formatThousands(bloque.resumen.ece) : '--'} {bloque.unidad}</span>
                                  </div>
                                  <div className="ece-total-row grid grid-cols-[92px_1fr] items-center gap-1 text-sm font-semibold text-gray-700">
                                    <span className="system text-black">SINBA:</span>
                                    <span className="value text-black">{bloque.resumenConectado ? formatThousands(bloque.resumen.sinba) : '--'} {bloque.unidad}</span>
                                  </div>
                                  <div className={`ece-total-row final mt-1 border-t pt-1 grid grid-cols-[92px_1fr] items-center gap-1 text-sm font-semibold text-black ${totalStyle.divider}`}>
                                    <span className="system text-black">Total:</span>
                                    <span className="value text-black">{bloque.resumenConectado ? formatThousands(bloque.resumen.total) : '--'} (sin duplicados)</span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
                                  <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">CLUES con cambio real</p>
                                    <p className="text-sm text-gray-700">Solo se muestran registros con delta distinto de cero.</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => exportarExcel(
                                      bloque.tablaCambios.map((item) => ({
                                        Indicador: bloque.titulo,
                                        CLUES: item.clues_imb,
                                        Entidad: item.entidad,
                                        Unidad: item.nombre_de_la_unidad,
                                        Cambio: `${item.cambio} en ${item.tipo}`,
                                        Delta: item.delta,
                                      })),
                                      `tabla_cambios_${bloque.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
                                      'Cambios por CLUES'
                                    )}
                                    disabled={bloque.tablaCambios.length === 0}
                                    className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    Descargar tabla
                                  </button>
                                </div>

                                {bloque.tablaCambios.length === 0 ? (
                                  <div className="px-4 py-12 text-center text-sm text-gray-500">
                                    No hay CLUES con cambio real para este indicador.
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                      <thead className="bg-gray-50 text-gray-600">
                                        <tr>
                                          <th className="px-4 py-3 font-semibold">CLUES</th>
                                          <th className="px-4 py-3 font-semibold">Entidad</th>
                                          <th className="px-4 py-3 font-semibold">Unidad</th>
                                          <th className="px-4 py-3 font-semibold">Cambio</th>
                                          <th className="px-4 py-3 font-semibold text-right">Delta</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {bloque.tablaCambios.map((item, rowIndex) => (
                                          <tr key={`${item.clues_imb}-${item.tipo}-${rowIndex}`} className="border-t border-gray-100 hover:bg-gray-50/80">
                                            <td className="px-4 py-3 font-medium text-gray-800">{item.clues_imb}</td>
                                            <td className="px-4 py-3 text-gray-700">{item.entidad}</td>
                                            <td className="px-4 py-3 text-gray-700">{item.nombre_de_la_unidad}</td>
                                            <td className="px-4 py-3">
                                              <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${item.cambio === 'sumó' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                {item.cambio} en {item.tipo}
                                              </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-gray-800">{item.delta}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

              {mainTab === 'avance' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {avanceIndicadorTabs.map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        onClick={() => {
                          setAvanceIndicadorTab(key);
                          setSelectedAvanceEntidad('');
                        }}
                        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                          avanceIndicadorTab === key ? 'tab-active' : 'tab-inactive'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="ece-inline-filters">
                    <div className="ece-filter-group">
                      <label className="ece-filter-label" htmlFor="filtro-avance-entidad">Entidad</label>
                      <div className="relative">
                        <input
                          id="filtro-avance-entidad"
                          value={selectedAvanceEntidad}
                          onChange={(e) => {
                            const value = e.target.value.trim().toUpperCase() === 'TODAS' ? '' : e.target.value;
                            setSelectedAvanceEntidad(value);
                          }}
                          onFocus={() => setShowAvanceEntidadSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowAvanceEntidadSuggestions(false), 120)}
                          className="ece-filter-select"
                          placeholder="Buscar entidad para ver CLUES..."
                          autoComplete="off"
                        >
                        </input>

                        {showAvanceEntidadSuggestions && avanceEntidadSuggestions.length > 0 && toText(selectedAvanceEntidad) && (
                          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                            {avanceEntidadSuggestions.map((entidad) => (
                              <button
                                key={entidad}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setSelectedAvanceEntidad(entidad);
                                  setShowAvanceEntidadSuggestions(false);
                                }}
                                className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                              >
                                {entidad}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <AvanceSummaryCards summary={avanceSummary} />

                  <AvanceCharts
                    avanceCoberturaEntidad={activeAvanceCoberturaEntidad}
                    detalleClues={activeAvanceDetalleClues}
                    selectedEntidadFilter={selectedAvanceEntidad}
                  />

                  {avanceIndicadorTab === 'consultas' && (
                    <div className="space-y-3">
                      {!(!normalizeKey(selectedAvanceEntidad)) && (
                        <>
                          <h3 className="text-sm font-bold text-gray-700">{avanceTablaMeta.title}</h3>
                          <DataTable<DataRow>
                            exportFileName={avanceTablaMeta.exportFileName}
                            exportSheetName={avanceTablaMeta.exportSheetName}
                            data={avanceTablaRows}
                            columns={tableColumns(avanceTablaRows, true)}
                            exportColumns={tableColumns(avanceTablaRows, true)}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {mainTab === 'pendientes' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-2">
                    {pendientesTabs.map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        onClick={() => setPendientesTab(key)}
                        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                          pendientesTab === key ? 'tab-active' : 'tab-inactive'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {pendientesTab === 'estado_consultas' && (
                    <DataTable<DataRow>
                      exportFileName="pendientes_consultas_por_estado"
                      exportSheetName="Pendientes consultas estado"
                      data={pendientesConsultasRows}
                      columns={pendientesConsultasStateColumns}
                      exportColumns={pendientesConsultasStateColumns}
                    />
                  )}

                  {pendientesTab === 'clues_consultas' && (
                    <DataTable<DataRow>
                      exportFileName="pendientes_consultas_por_clues"
                      exportSheetName="Pendientes consultas clues"
                      data={pendientesConsultasCluesRows}
                      columns={pendientesConsultasCluesColumns}
                      exportColumns={pendientesConsultasCluesColumns}
                    />
                  )}
                </div>
              )}

              {showEceVideo && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
                  onClick={() => setShowEceVideo(false)}
                >
                  <div
                    className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-black shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setShowEceVideo(false)}
                      className="absolute right-2 top-2 z-10 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                      aria-label="Cerrar video"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="aspect-[9/16] w-full">
                      <iframe
                        className="h-full w-full"
                        src="https://www.youtube.com/embed/2R5aAE_hSbk?autoplay=1&mute=1&playsinline=1&rel=0&origin=http://localhost:5173"
                        title="Video sorpresa"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="origin"
                        allowFullScreen
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

          </>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-gray-400">
            IMSS Bienestar · Reporte Interno de Infraestructura de Materiales Hospitalarios · Documento de uso institucional
          </p>
        </div>
      </footer>
    </div>
  );
}
