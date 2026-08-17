import type { CellValue, CluesGeoItem, DataRow, TablasFormulario } from './types';

async function fetchJson<T>(filename: string): Promise<T | null> {
  const ts = Date.now();
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${filename}?_cb=${ts}`);
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function fetchBaseClues(): Promise<string[]> {
  const payload = await fetchJson<unknown[]>('base_clues.json');
  if (!Array.isArray(payload)) return [];
  return [...new Set(
    payload.map((row) => {
      if (typeof row === 'string') return row.trim();
      if (row && typeof row === 'object' && 'clues_imb' in row)
        return String((row as { clues_imb: unknown }).clues_imb ?? '').trim();
      return '';
    }).filter(Boolean)
  )];
}

async function fetchCluesGeo(): Promise<CluesGeoItem[]> {
  const payload = await fetchJson<unknown[]>('clues_geo.json');
  if (!Array.isArray(payload)) return [];
  return payload.filter(
    (r) => r && typeof r === 'object' && typeof (r as Record<string, unknown>).lat === 'number' && typeof (r as Record<string, unknown>).lng === 'number' && (r as Record<string, unknown>).clues_imb,
  ) as CluesGeoItem[];
}

async function fetchTablaUnidades(): Promise<Set<string>> {
  const payload = await fetchJson<unknown[]>('tabla_unidades.json');
  if (!Array.isArray(payload)) return new Set();
  return new Set(payload.map((v) => String(v).trim()).filter(Boolean));
}

async function fetchBaseMeta(): Promise<{ cluesTotal: number; entidadesEsperadas: number; scriptLastRunAt?: string }> {
  const payload = await fetchJson<Record<string, unknown>>('base_meta.json');
  if (!payload) return { cluesTotal: 0, entidadesEsperadas: 0 };
  const cluesTotal = Number(payload?.clues_unicas ?? payload?.clues_total ?? 0);
  const entidadesEsperadas = Number(payload?.entidades_esperadas ?? 0);
  return {
    cluesTotal: Number.isFinite(cluesTotal) ? cluesTotal : 0,
    entidadesEsperadas: Number.isFinite(entidadesEsperadas) ? entidadesEsperadas : 0,
    scriptLastRunAt: typeof payload?.script_last_run_at === 'string' ? payload.script_last_run_at : undefined,
  };
}

async function fetchTableroAvanceTables(): Promise<{
  tablaAvance: DataRow[];
  tablaEntidades: DataRow[];
  tablaUnidadesAvance: DataRow[];
}> {
  const ts = Date.now();
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}informe--de-ang/data.js?_cb=${ts}`);
    if (!response.ok) return { tablaAvance: [], tablaEntidades: [], tablaUnidadesAvance: [] };

    const raw = (await response.text()).trim();
    const prefix = 'window.DASHBOARD_DATA =';
    if (!raw.startsWith(prefix)) return { tablaAvance: [], tablaEntidades: [], tablaUnidadesAvance: [] };

    const jsonText = raw.slice(prefix.length).trim().replace(/;\s*$/, '');
    const parsed = JSON.parse(jsonText) as {
      tables?: {
        tabla_avance?: { rows?: Record<string, unknown>[] };
        tabla_entidades?: { rows?: Record<string, unknown>[] };
        tabla_unidades?: { rows?: Record<string, unknown>[] };
      };
    };

    const toRows = (rows: unknown): DataRow[] => {
      if (!Array.isArray(rows)) return [];
      return rows.map((row) => {
        const normalized: DataRow = {};
        Object.entries((row as Record<string, unknown>) || {}).forEach(([key, value]) => {
          normalized[key] = toCellValue(value);
        });
        return normalized;
      });
    };

    return {
      tablaAvance: toRows(parsed?.tables?.tabla_avance?.rows),
      tablaEntidades: toRows(parsed?.tables?.tabla_entidades?.rows),
      tablaUnidadesAvance: toRows(parsed?.tables?.tabla_unidades?.rows),
    };
  } catch {
    return { tablaAvance: [], tablaEntidades: [], tablaUnidadesAvance: [] };
  }
}

function toCellValue(value: unknown): CellValue {
  if (typeof value === 'number' && Number.isNaN(value)) return 0;
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  const low = text.toLowerCase();
  if (low === 'true') return true;
  if (low === 'false') return false;
  if (low === 'nan') return 0;
  const asNumber = Number(text);
  if (!Number.isNaN(asNumber) && text !== '') return asNumber;
  return text;
}

async function fetchDataRows(filename: string): Promise<DataRow[]> {
  const payload = await fetchJson<Record<string, unknown>[]>(filename);
  if (!Array.isArray(payload)) return [];
  return payload.map((row) => {
    const normalized: DataRow = {};
    Object.entries(row).forEach(([key, value]) => {
      normalized[key] = toCellValue(value);
    });
    return normalized;
  });
}

export async function cargarTablasFormulario(): Promise<{ tablas: TablasFormulario; fetchedAt: Date }> {
  const [
    baseClues,
    baseMeta,
    cluesGeo,
    baseAn,
    resultado,
    resumen,
    resumenEntidad,
    tableroAvanceTables,
    faltantes,
  ] = await Promise.all([
    fetchBaseClues(),
    fetchBaseMeta(),
    fetchCluesGeo(),
    fetchDataRows('base_an.json'),
    fetchDataRows('resultado.json'),
    fetchDataRows('resumen.json'),
    fetchDataRows('resumen_entidad.json'),
    fetchTableroAvanceTables(),
    fetchDataRows('faltantes.json'),
  ]);

  const tablas: TablasFormulario = {
    baseClues,
    baseMeta,
    baseAn,
    resultado,
    resumen,
    resumenEntidad,
    tablaAvance: tableroAvanceTables.tablaAvance,
    tablaEntidades: tableroAvanceTables.tablaEntidades,
    tablaUnidadesAvance: tableroAvanceTables.tablaUnidadesAvance,
    cluesGeo,
    faltantes,
  };

  return { tablas, fetchedAt: new Date() };
}
