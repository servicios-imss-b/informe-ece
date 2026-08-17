import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
  ComposedChart,
  Line,
  ReferenceLine,
} from 'recharts';
import { Layers3, Building2, Globe, ClipboardList, AlertTriangle, X, MapPin, Download, type LucideIcon } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import type { DashboardStats, CluesGeoItem, DataRow, EntidadChart, InternetPieItem, TopFaltanteChart } from '../types';
import { exportarExcel } from '../exportExcel';

interface ChartsProps {
  stats: DashboardStats;
  internetPie: InternetPieItem[];
  porEntidad: EntidadChart[];
  topFaltantes: TopFaltanteChart[];
  cluesGeo?: CluesGeoItem[];
  resultado?: DataRow[];
}

const PIE_COLORS = ['#1A6B5E', '#A57F2C'];
const AVANCE_BAR_COLORS = ['#064E3B', '#065F46', '#047857', '#059669', '#10B981', '#34D399', '#6EE7B7'];
const FIXED_COLUMNS = new Set([
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

const tooltipStyle = {
  borderRadius: '10px',
  border: '1px solid #E5E7EB',
  background: '#FFFFFF',
  fontSize: '13px',
  color: '#111827',
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
};

function formatTooltipNumber(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value ?? 0);
  if (Number.isNaN(num)) return '0';
  return num.toLocaleString('es-MX');
}

function getSteppedGreenColor(rank: number, total: number): string {
  const t = total > 1 ? rank / (total - 1) : 0;
  const idx = Math.floor(t * (AVANCE_BAR_COLORS.length - 1));
  return AVANCE_BAR_COLORS[Math.min(idx, AVANCE_BAR_COLORS.length - 1)];
}

function isZeroLike(value: unknown): boolean {
  if (value === null || value === undefined || value === '' || value === false) return true;
  if (typeof value === 'number') return value <= 0;

  const text = String(value).trim().toLowerCase();
  if (text === '' || text === '0' || text === '0.0') return true;
  return text === 'false' || text === 'no' || text === 'nan';
}

function formatInsumoName(key: string): string {
  return key
    .replace(/_consultorio(_\d+)?$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

type StatKey =
  | 'insumosConRegistro'
  | 'entidadesCapturadas'
  | 'promedioCerosPorConsultorio'
  | 'registrosSinInsumos';

interface StatCardDef {
  icon: LucideIcon;
  label: string;
  key: StatKey;
  bg: string;
  iconBg: string;
  iconColor: string;
  valueColor: string;
  border: string;
  isPercent?: boolean;
}

const STAT_CARDS: StatCardDef[] = [
  {
    icon: Layers3,
    label: 'COBERTURA DE CONSULTORIOS',
    key: 'insumosConRegistro',
    bg: 'bg-emerald-50',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    valueColor: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  {
    icon: Building2,
    label: 'COBERTURA ENTIDADES',
    key: 'entidadesCapturadas',
    bg: 'bg-amber-50',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    valueColor: 'text-amber-700',
    border: 'border-amber-200',
  },
  {
    icon: Globe,
    label: 'PROMEDIO DE INSUMOS EN 0',
    key: 'promedioCerosPorConsultorio',
    bg: 'bg-rose-50',
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
    valueColor: 'text-rose-700',
    border: 'border-rose-200',
  },
  {
    icon: AlertTriangle,
    label: 'REGISTROS SIN INSUMOS',
    key: 'registrosSinInsumos',
    bg: 'bg-teal-50',
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-600',
    valueColor: 'text-teal-700',
    border: 'border-teal-200',
  },
];

function pct2Digits(value: number): string {
  const rounded = Math.round(Number(value) || 0);
  if (rounded >= 100) return `${rounded}%`;
  return `${String(rounded).padStart(2, '0')}%`;
}

function pctLabel(actual: number, expected: number): string {
  if (expected <= 0) return '0.0%';
  return `${((actual / expected) * 100).toFixed(1)}%`;
}

function StatCard({
  def,
  value,
  expected,
  helper,
}: {
  def: StatCardDef;
  value: number;
  expected?: number;
  helper?: string;
}) {
  const { icon: Icon, label, bg, iconBg, iconColor, valueColor, border, isPercent } = def;
  const displayValue = isPercent
    ? `${value.toFixed(1)}%`
    : (typeof expected === 'number' ? pctLabel(value, expected) : value.toLocaleString('es-MX'));
  return (
    <div className={`group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:scale-[1.03] hover:shadow-lg ${border} ${bg}`}>
      <div className="absolute -right-4 -top-4 opacity-10 transition-transform duration-500 group-hover:scale-125 group-hover:opacity-20">
        <Icon className="h-20 w-20" />
      </div>
      <div className="relative mb-3 flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110 ${iconBg} ${iconColor}`}>
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </div>
      </div>
      <p className="relative mb-1 text-[10px] font-bold uppercase tracking-widest opacity-70">
        <span className={valueColor === 'text-white' ? 'text-white/70' : 'text-gray-500'}>{label}</span>
      </p>
      <p className={`relative text-3xl font-black tabular-nums ${valueColor}`}>{displayValue}</p>
      {!isPercent && typeof expected === 'number' ? (
        <p className="mt-1 text-xs font-medium text-gray-500">
          {value.toLocaleString('es-MX')} de {expected.toLocaleString('es-MX')}
        </p>
      ) : null}
      {isPercent ? <p className="mt-1 text-xs font-medium text-gray-500">de campos respondidos</p> : null}
      {helper ? <p className="mt-1 text-xs text-gray-500">{helper}</p> : null}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card p-6 ${className}`}>
      <div className="mb-5">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

/* ─── Gráficas por card ─── */

function CluesChart({ porEntidad }: { porEntidad: EntidadChart[] }) {
  const sorted = [...porEntidad].sort((a, b) => b.unidades - a.unidades);
  const totalUnidades = sorted.reduce((s, e) => s + e.unidades, 0);
  const avgUnidades = sorted.length ? Math.round(totalUnidades / sorted.length) : 0;

  const CLUES_COLORS = ['#064E3B', '#065F46', '#047857', '#059669', '#10B981', '#34D399', '#6EE7B7'];
  const getBarColor = (rank: number, total: number) => {
    const t = total > 1 ? rank / (total - 1) : 0;
    return CLUES_COLORS[Math.min(Math.floor(t * (CLUES_COLORS.length - 1)), CLUES_COLORS.length - 1)];
  };

  const data = sorted.map((e, i) => ({
    entidad: e.entidad.length > 12 ? e.entidad.slice(0, 12) + '.' : e.entidad,
    entidadFull: e.entidad,
    unidades: e.unidades,
    pct: e.pctLlenado,
    rank: i,
  }));

  return (
    <div className="space-y-4">
      <div className="flex gap-8 border-b border-gray-100 pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total unidades</p>
          <p className="text-2xl font-black text-emerald-700">{totalUnidades.toLocaleString('es-MX')}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Promedio por estado</p>
          <p className="text-2xl font-black text-amber-600">{avgUnidades.toLocaleString('es-MX')}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Estados</p>
          <p className="text-2xl font-black text-gray-700">{sorted.length}</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 4, right: 40, left: 0, bottom: 55 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="entidad" angle={-35} textAnchor="end" tick={{ fontSize: 10, fill: '#9CA3AF' }} height={65} />
          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#9CA3AF' }} domain={[0, 100]} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(_label, payload) =>
              (payload?.[0] as { payload?: { entidadFull?: string } } | undefined)?.payload?.entidadFull ?? _label
            }
            formatter={(v: unknown, name: string) => [
              name === 'pct' ? `${v}%` : formatTooltipNumber(v),
              name === 'pct' ? '% llenado' : 'Unidades capturadas',
            ]}
            cursor={{ fill: '#F0FDF4' }}
          />
          <Legend
            verticalAlign="top"
            iconType="circle"
            wrapperStyle={{ fontSize: '11px', paddingBottom: '8px', color: '#6B7280' }}
            formatter={(value) => value === 'pct' ? '% llenado del formulario' : 'Unidades capturadas'}
          />
          <Bar yAxisId="left" dataKey="unidades" name="unidades" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={getBarColor(i, data.length)} />
            ))}
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey="pct" name="pct"
            stroke="#A57F2C" strokeWidth={2.5}
            dot={{ fill: '#A57F2C', r: 3.5 }} activeDot={{ r: 6 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function EstadosMenosInsumos({ resultado = [] }: { resultado?: DataRow[] }) {
  const isMexicoEntidad = (value: string) => {
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
    return normalized === 'MEXICO';
  };

  const data = useMemo(() => {
    const byEntidad = new Map<string, { entidad: string; cero: number; total: number }>();

    for (const row of resultado) {
      const consultorio = Number(row.consultorio ?? 0);
      if (Number.isNaN(consultorio) || consultorio <= 0) continue;

      const entidad = String(row.entidad ?? 'Sin entidad').trim() || 'Sin entidad';
      if (isMexicoEntidad(entidad)) continue;
      if (!byEntidad.has(entidad)) {
        byEntidad.set(entidad, { entidad, cero: 0, total: 0 });
      }

      const agg = byEntidad.get(entidad);
      if (!agg) continue;

      for (const [key, value] of Object.entries(row)) {
        if (FIXED_COLUMNS.has(key)) continue;
        agg.total += 1;
        if (isZeroLike(value)) agg.cero += 1;
      }
    }

    return Array.from(byEntidad.values())
      .map((item, i) => ({
        entidad: item.entidad.length > 18 ? item.entidad.slice(0, 18) + '.' : item.entidad,
        entidadFull: item.entidad,
        cero: item.cero,
        pctCero: item.total > 0 ? (item.cero / item.total) * 100 : 0,
        fill: ['#7F1D1D', '#991B1B', '#B91C1C', '#DC2626', '#EF4444', '#F97316', '#FB923C', '#F59E0B', '#FBBF24', '#FCD34D'][Math.min(i, 9)],
      }))
      .sort((a, b) => (b.pctCero - a.pctCero) || (b.cero - a.cero))
      .slice(0, 10);
  }, [resultado]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">Estados con menos insumos (ordenados de menor a mayor cobertura)</p>
      <ResponsiveContainer width="100%" height={290}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 72, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
          <YAxis type="category" dataKey="entidad" tick={{ fontSize: 10, fill: '#6B7280' }} width={120} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(_label, payload) =>
              (payload?.[0] as { payload?: { entidadFull?: string } } | undefined)?.payload?.entidadFull ?? _label
            }
            formatter={(v: unknown, _name: unknown, item: unknown) => {
              const payload = (item as { payload?: { pctCero?: number } } | undefined)?.payload;
              const pct = Number(payload?.pctCero ?? 0).toFixed(1);
              return [`${formatTooltipNumber(v)} (${pct}%)`, 'Insumos en 0'];
            }}
            cursor={{ fill: '#FEF2F2' }}
          />
          <Bar dataKey="cero" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
            <LabelList
              dataKey="pctCero"
              position="right"
              formatter={(value: number) => `${Number(value || 0).toFixed(1)}%`}
              style={{ fill: '#7F1D1D', fontSize: 11, fontWeight: 700 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EstadosMenosInsumosTable({ porEntidad }: { porEntidad: EntidadChart[] }) {
  const rows = useMemo(() => {
    return [...porEntidad]
      .sort((a, b) => a.pctLlenado - b.pctLlenado)
      .slice(0, 10)
      .map((item) => ({
        entidad: item.entidad,
        pctLlenado: item.pctLlenado,
        unidades: item.unidades,
        consultoriosLevantados: item.consultoriosLevantados,
      }));
  }, [porEntidad]);

  if (!rows.length) {
    return <p className="text-sm text-gray-500">Sin datos para mostrar.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <div className="max-h-[420px] overflow-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">Estado</th>
              <th className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-gray-500">% insumos llenados</th>
              <th className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-gray-500">Unidades</th>
              <th className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-gray-500">Consultorios levantados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rows.map((row) => (
              <tr key={row.entidad} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-semibold text-gray-800">{row.entidad}</td>
                <td className="px-3 py-2 text-right font-bold text-amber-700">{row.pctLlenado.toFixed(1)}%</td>
                <td className="px-3 py-2 text-right text-gray-700">{row.unidades.toLocaleString('es-MX')}</td>
                <td className="px-3 py-2 text-right text-gray-700">{row.consultoriosLevantados.toLocaleString('es-MX')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InternetChart({ internetPie }: { internetPie: InternetPieItem[] }) {
  const pieWithPct = useMemo(() => {
    const total = internetPie.reduce((sum, item) => sum + item.value, 0);
    return internetPie.map((item) => {
      const pct = total > 0 ? (item.value / total) * 100 : 0;
      return {
        ...item,
        pct,
      };
    });
  }, [internetPie]);

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={pieWithPct}
            cx="50%"
            cy="45%"
            outerRadius={110}
            innerRadius={60}
            dataKey="value"
            paddingAngle={2}
            stroke="none"
            labelLine={false}
            label={({ percent }) => `${(((percent ?? 0) as number) * 100).toFixed(1)}%`}
          >
            {pieWithPct.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v, _name, item) => {
              const pct = Number((item?.payload as { pct?: number } | undefined)?.pct ?? 0);
              return [`${formatTooltipNumber(v)} (${pct.toFixed(1)}%)`, 'Unidades'];
            }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ fontSize: '12px', color: '#6B7280' }}
            formatter={(_value, _entry, index) => {
              const item = pieWithPct[index] as { name: string; pct: number } | undefined;
              if (!item) return _value;
              return `${item.name} (${item.pct.toFixed(1)}%)`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-2 text-xs">
        {pieWithPct.map((item) => (
          <span key={item.name} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
            {item.name}: <strong>{item.pct.toFixed(1)}%</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function ConsultoriosChart({ porEntidad }: { porEntidad: EntidadChart[] }) {
  const data = porEntidad.map((e) => ({
    entidad: e.entidad.length > 10 ? e.entidad.slice(0, 10) + '.' : e.entidad,
    habilitados: e.consultoriosHabilitados,
    levantados: e.consultoriosLevantados,
    pct: e.consultoriosHabilitados > 0
      ? +((e.consultoriosLevantados / e.consultoriosHabilitados) * 100).toFixed(1)
      : 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 50 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis dataKey="entidad" angle={-35} textAnchor="end" tick={{ fontSize: 10, fill: '#9CA3AF' }} height={60} />
        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
        <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [
          name === 'pct' ? `${v}%` : formatTooltipNumber(v),
          name === 'pct' ? '% levantado' : name === 'habilitados' ? 'Habilitados' : 'Levantados',
        ]} cursor={{ fill: '#F0FDFA' }} />
        <Bar yAxisId="left" dataKey="habilitados" name="habilitados" fill="#99F6E4" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="left" dataKey="levantados" name="levantados" fill="#0D9488" radius={[4, 4, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="pct" name="pct" stroke="#A57F2C" strokeWidth={2} dot={{ fill: '#A57F2C', r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function PctLlenadoChart({ porEntidad, globalPct }: { porEntidad: EntidadChart[]; globalPct: number }) {
  const normalized = porEntidad.map((e) => ({
    ...e,
    pctLlenado: e.entidad.trim().toUpperCase() === 'MEXICO' ? 100 : e.pctLlenado,
  }));
  const sorted = [...normalized].sort((a, b) => b.pctLlenado - a.pctLlenado);
  const avg = sorted.length ? +(sorted.reduce((s, e) => s + e.pctLlenado, 0) / sorted.length).toFixed(1) : 0;

  const PCT_COLORS = ['#064E3B', '#065F46', '#047857', '#059669', '#10B981', '#34D399', '#6EE7B7'];
  const getColor = (rank: number, total: number) => {
    const t = total > 1 ? rank / (total - 1) : 0;
    return PCT_COLORS[Math.min(Math.floor(t * (PCT_COLORS.length - 1)), PCT_COLORS.length - 1)];
  };

  const data = sorted.map((e, i) => ({
    entidad: e.entidad.length > 12 ? e.entidad.slice(0, 12) + '.' : e.entidad,
    entidadFull: e.entidad,
    pct: e.pctLlenado,
    rank: i,
  }));

  return (
    <div className="space-y-4">
      <div className="flex gap-8 border-b border-gray-100 pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Global</p>
          <p className="text-2xl font-black text-teal-700">{globalPct.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Promedio por estado</p>
          <p className="text-2xl font-black text-amber-600">{avg}%</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Mayor llenado</p>
          <p className="text-2xl font-black text-emerald-700">{sorted[0]?.pctLlenado.toFixed(1) ?? '—'}%</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Menor llenado</p>
          <p className="text-2xl font-black text-rose-600">{sorted[sorted.length - 1]?.pctLlenado.toFixed(1) ?? '—'}%</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={290}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 55 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="entidad" angle={-35} textAnchor="end" tick={{ fontSize: 10, fill: '#9CA3AF' }} height={65} />
          <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#9CA3AF' }} domain={[0, 100]} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(_label, payload) =>
              (payload?.[0] as { payload?: { entidadFull?: string } } | undefined)?.payload?.entidadFull ?? _label
            }
            formatter={(v: unknown) => [`${v}%`, '% llenado']}
            cursor={{ fill: '#F0FDFA' }}
          />
          <Bar dataKey="pct" name="% llenado" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={getColor(i, data.length)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Modal ─── */

function CardModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-800">{title}</h3>
            <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── Mapa Modal ─── */

function buildPopupHTML(clues: string, nombre: string, entidad: string, consultorios: number, pct: number) {
  return `<div style="font-family:system-ui;padding:4px 0;min-width:200px">
    <div style="font-size:11px;font-weight:700;color:#065f46;margin-bottom:3px">${clues}</div>
    <div style="font-size:12px;font-weight:600;color:#111827;margin-bottom:2px;line-height:1.3">${nombre}</div>
    <div style="font-size:11px;color:#6b7280;margin-bottom:6px">${entidad}</div>
    <div style="display:flex;gap:12px;margin-bottom:4px">
      <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af">% Llenado</div>
        <div style="font-size:16px;font-weight:900;color:#065f46">${pct}%</div></div>
      <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af">Consultorios</div>
        <div style="font-size:16px;font-weight:900;color:#374151">${consultorios}</div></div>
    </div>
  </div>`;
}

function MapModal({ onClose, porEntidad, cluesGeo = [] }: {
  onClose: () => void;
  porEntidad: EntidadChart[];
  cluesGeo?: CluesGeoItem[];
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [entidadQuery, setEntidadQuery] = useState('');
  const [cluesQuery, setCluesQuery] = useState('');

  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const entidadesDisponibles = useMemo(() => {
    const setEntidades = new Set<string>();
    cluesGeo.forEach((item) => {
      const entidad = String(item.entidad ?? '').trim();
      if (entidad) setEntidades.add(entidad);
    });
    return [...setEntidades].sort((a, b) => a.localeCompare(b, 'es'));
  }, [cluesGeo]);

  const cluesDisponibles = useMemo(() => {
    const setClues = new Set<string>();
    cluesGeo.forEach((item) => {
      const clues = String(item.clues_imb ?? '').trim();
      if (clues) setClues.add(clues);
    });
    return [...setClues].sort((a, b) => a.localeCompare(b, 'es'));
  }, [cluesGeo]);

  const suggestedEntidades = useMemo(() => {
    const clues = normalize(cluesQuery);
    const entidad = normalize(entidadQuery);

    let base = cluesGeo;
    if (clues) {
      const cluesExacta = cluesDisponibles.find((item) => normalize(item) === clues);
      if (cluesExacta) {
        const cluesExactaNormalizada = normalize(cluesExacta);
        base = base.filter((item) => normalize(item.clues_imb) === cluesExactaNormalizada);
      } else {
        base = base.filter((item) => normalize(item.clues_imb).includes(clues));
      }
    }

    const setEntidades = new Set<string>();
    base.forEach((item) => {
      const ent = String(item.entidad ?? '').trim();
      if (!ent) return;
      if (!entidad || normalize(ent).includes(entidad)) setEntidades.add(ent);
    });

    return [...setEntidades].sort((a, b) => a.localeCompare(b, 'es')).slice(0, 30);
  }, [cluesGeo, cluesQuery, entidadQuery, cluesDisponibles]);

  const suggestedClues = useMemo(() => {
    const entidad = normalize(entidadQuery);
    const clues = normalize(cluesQuery);

    let base = cluesGeo;
    if (entidad) {
      const entidadExacta = entidadesDisponibles.find((item) => normalize(item) === entidad);
      if (entidadExacta) {
        const exactaNormalizada = normalize(entidadExacta);
        base = base.filter((item) => normalize(item.entidad) === exactaNormalizada);
      } else {
        base = base.filter((item) => normalize(item.entidad).includes(entidad));
      }
    }

    const setClues = new Set<string>();
    base.forEach((item) => {
      const clue = String(item.clues_imb ?? '').trim();
      if (!clue) return;
      if (!clues || normalize(clue).includes(clues)) setClues.add(clue);
    });

    return [...setClues].sort((a, b) => a.localeCompare(b, 'es')).slice(0, 30);
  }, [cluesGeo, entidadQuery, cluesQuery, entidadesDisponibles]);

  const filteredCluesGeo = useMemo(() => {
    const entidad = normalize(entidadQuery);
    const clues = normalize(cluesQuery);

    let result = cluesGeo;

    if (entidad) {
      const entidadExacta = entidadesDisponibles.find((item) => normalize(item) === entidad);

      // Si hay match exacto, evita mezclar entidades como "MEXICO" con "CIUDAD DE MEXICO".
      if (entidadExacta) {
        const exactaNormalizada = normalize(entidadExacta);
        result = result.filter((item) => normalize(item.entidad) === exactaNormalizada);
      } else {
        result = result.filter((item) => normalize(item.entidad).includes(entidad));
      }
    }

    if (clues) {
      const cluesExacta = cluesDisponibles.find((item) => normalize(item) === clues);
      if (cluesExacta) {
        const cluesExactaNormalizada = normalize(cluesExacta);
        result = result.filter((item) => normalize(item.clues_imb) === cluesExactaNormalizada);
      } else {
        result = result.filter((item) => normalize(item.clues_imb).includes(clues));
      }
    }

    return result;
  }, [cluesGeo, entidadQuery, cluesQuery, entidadesDisponibles, cluesDisponibles]);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [-102, 23.5],
      zoom: 4.8,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    if (filteredCluesGeo.length > 0) {
      const data = filteredCluesGeo;
      const addLayers = () => {
        if (map.getSource('clues')) return;
        map.addSource('clues', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: data.map((u) => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [u.lng, u.lat] },
              properties: {
                clues_imb: u.clues_imb,
                nombre: u.nombre_de_la_unidad,
                entidad: u.entidad,
                consultorios: Math.round(u.consultorios ?? 0),
                pct_llenado: u.pct_llenado ?? 0,
              },
            })),
          },
        });

        map.addLayer({ id: 'clues-halo', type: 'circle', source: 'clues', paint: {
          'circle-radius': 9,
          'circle-color': '#2563eb',
          'circle-opacity': 0.18, 'circle-stroke-width': 0,
        }});
        map.addLayer({ id: 'clues-circles', type: 'circle', source: 'clues', paint: {
          'circle-radius': 5,
          'circle-color': '#1d4ed8',
          'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff', 'circle-opacity': 0.95,
        }});

        if (data.length === 1) {
          map.jumpTo({ center: [data[0].lng, data[0].lat], zoom: 8.5 });
        } else {
          const bounds = new maplibregl.LngLatBounds();
          data.forEach((u) => bounds.extend([u.lng, u.lat]));
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 40, maxZoom: 9 });
          }
        }

        const popup = new maplibregl.Popup({ closeButton: false, offset: 10, maxWidth: '280px' });
        map.on('mouseenter', 'clues-circles', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const feat = e.features?.[0];
          if (!feat) return;
          const p = feat.properties as Record<string, unknown>;
          popup.setLngLat(e.lngLat)
            .setHTML(buildPopupHTML(
              String(p['clues_imb']), String(p['nombre']), String(p['entidad']),
              Number(p['consultorios']), Number(p['pct_llenado'])
            ))
            .addTo(map);
        });
        map.on('mouseleave', 'clues-circles', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
      };

      if (map.isStyleLoaded()) addLayers();
      else map.on('load', addLayers);
    }

    // Quitar etiquetas de ciudades/pueblos del estilo base
    const removeCityLabels = () => {
      const style = map.getStyle();
      if (!style?.layers) return;
      style.layers
        .filter((l) => /city|town|village|suburb|place|hamlet/i.test(l.id))
        .forEach((l) => { try { map.removeLayer(l.id); } catch { /* ya no existe */ } });
    };
    if (map.isStyleLoaded()) removeCityLabels();
    else map.on('load', removeCityLabels);

    return () => map.remove();
  }, [filteredCluesGeo]);

  const total = porEntidad.reduce((s, e) => s + e.unidades, 0);
  const totalFiltrado = filteredCluesGeo.length;
  const avg = porEntidad.length ? Math.round(total / porEntidad.length) : 0;
  const topEstado = [...porEntidad].sort((a, b) => b.unidades - a.unidades)[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" style={{ height: '84vh' }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <MapPin className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-800">Cobertura CLUES — Mapa Nacional</h3>
              <p className="mt-0.5 text-xs text-gray-400">Unidades de salud IMSS Bienestar distribuidas por entidad federativa</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mr-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">Total unidades</p>
              <p className="text-lg font-black text-emerald-700">{total.toLocaleString('es-MX')}</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-500">Prom. por estado</p>
              <p className="text-lg font-black text-amber-700">{avg.toLocaleString('es-MX')}</p>
            </div>
            {topEstado && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-right">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Mayor cobertura</p>
                <p className="text-sm font-black text-gray-700 leading-tight">{topEstado.entidad.length > 14 ? topEstado.entidad.slice(0, 14) + '.' : topEstado.entidad}</p>
              </div>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filtro */}
        <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-6 py-3">
          <label htmlFor="filtro-entidad-mapa" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Filtrar entidad
          </label>
          <input
            id="filtro-entidad-mapa"
            type="text"
            value={entidadQuery}
            onChange={(e) => setEntidadQuery(e.target.value)}
            list="entidades-mapa-list"
            placeholder="Ej. MEXICO, CHIAPAS, OAXACA..."
            className="w-full max-w-md rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
          <datalist id="entidades-mapa-list">
            {suggestedEntidades.map((ent) => (
              <option key={ent} value={ent} />
            ))}
          </datalist>

          <label htmlFor="filtro-clues-mapa" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Filtrar CLUES
          </label>
          <input
            id="filtro-clues-mapa"
            type="text"
            value={cluesQuery}
            onChange={(e) => setCluesQuery(e.target.value)}
            list="clues-mapa-list"
            placeholder="Ej. MCIMB001713"
            className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
          <datalist id="clues-mapa-list">
            {suggestedClues.map((clue) => (
              <option key={clue} value={clue} />
            ))}
          </datalist>

          <button
            type="button"
            onClick={() => {
              setEntidadQuery('');
              setCluesQuery('');
            }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
          >
            Limpiar
          </button>
          <span className="ml-auto text-xs font-semibold text-gray-500">
            Mostrando {totalFiltrado.toLocaleString('es-MX')} unidades
          </span>
        </div>

        {/* Mapa */}
        <div className="relative flex-1 overflow-hidden">
          <div ref={mapContainerRef} className="absolute inset-0" />
        </div>

        {/* Footer */}
        <div className="flex items-center gap-5 border-t border-gray-100 bg-gray-50 px-6 py-2.5 text-xs text-gray-500">
          <span className="font-semibold text-gray-600">Leyenda:</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />Unidad de salud</span>
          <span className="ml-auto text-gray-400">Pasa el cursor sobre un punto para ver detalles</span>
        </div>
      </div>
    </div>
  );
}

function InsumoZeroFinder({ resultado = [] }: { resultado?: DataRow[] }) {
  const [query, setQuery] = useState('');
  const [selectedEntidad, setSelectedEntidad] = useState('');

  const getCluesId = (row: DataRow): string => {
    const clues = String(row.clues_imb || row.clues || '').trim();
    return clues || 'Sin CLUES';
  };

  const getConsultorioId = (row: DataRow): string => {
    const clues = getCluesId(row);
    const rawConsultorio = row.consultorio;
    const numericConsultorio = Number(rawConsultorio);
    const consultorio = Number.isNaN(numericConsultorio)
      ? String(rawConsultorio ?? '').trim() || '-'
      : String(numericConsultorio);

    return `${clues}::${consultorio}`;
  };

  const isConsultorioLlenado = (row: DataRow): boolean => {
    const value = Number(row.consultorio ?? 0);
    return !Number.isNaN(value) && value > 0;
  };

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const insumoKeys = useMemo(() => {
    if (!resultado.length) return [];

    const keys = new Set<string>();
    for (const row of resultado) {
      Object.keys(row).forEach((key) => {
        if (!FIXED_COLUMNS.has(key)) keys.add(key);
      });
    }
    return [...keys].sort((a, b) => a.localeCompare(b, 'es'));
  }, [resultado]);

  const selectedInsumoKey = useMemo(() => {
    const text = normalizeText(query);
    if (!text) return '';

    const exact = insumoKeys.find((k) => normalizeText(k) === text);
    if (exact) return exact;

    return insumoKeys.find((k) => normalizeText(formatInsumoName(k)) === text) ?? '';
  }, [query, insumoKeys]);

  const entidades = useMemo(() => {
    const setEntidades = new Set<string>();
    for (const row of resultado) {
      const entidad = String(row.entidad ?? '').trim();
      if (entidad) setEntidades.add(entidad);
    }
    return [...setEntidades].sort((a, b) => a.localeCompare(b, 'es'));
  }, [resultado]);

  const unidadesConCero = useMemo(() => {
    if (!selectedInsumoKey) return [] as Array<{
      entidad: string;
      clues: string;
      unidad: string;
      consultorio: string;
    }>;

    const rows: Array<{ entidad: string; clues: string; unidad: string; consultorio: string }> = [];
    const seen = new Set<string>();

    for (const row of resultado) {
      if (!isConsultorioLlenado(row)) continue;

      const entidad = String(row.entidad ?? 'Sin entidad').trim() || 'Sin entidad';
      if (selectedEntidad && entidad !== selectedEntidad) continue;
      if (!isZeroLike(row[selectedInsumoKey])) continue;

      const clues = getCluesId(row);
      const unidad = String(row.nombre_de_la_unidad ?? '').trim() || 'Sin nombre';
      const consultorio = String(row.consultorio ?? '').trim() || '-';
      const id = getConsultorioId(row);

      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({ entidad, clues, unidad, consultorio });
    }

    return rows;
  }, [resultado, selectedEntidad, selectedInsumoKey]);

  const donutCoverage = useMemo(() => {
    if (!selectedInsumoKey) {
      return {
        totalConsultorios: 0,
        consultoriosConInsumo: 0,
        consultoriosSinInsumo: 0,
        pctConInsumo: 0,
        pctSinInsumo: 0,
        data: [] as Array<{ name: string; value: number; color: string }>,
      };
    }

    const consultorioFlags = new Map<string, { hasZero: boolean }>();

    for (const row of resultado) {
      if (!isConsultorioLlenado(row)) continue;

      const entidad = String(row.entidad ?? 'Sin entidad').trim() || 'Sin entidad';
      if (selectedEntidad && entidad !== selectedEntidad) continue;

      const clues = getCluesId(row);
      const consultorioId = getConsultorioId(row);

      const hasZero = isZeroLike(row[selectedInsumoKey]);
      const prev = consultorioFlags.get(consultorioId) ?? { hasZero: false };
      consultorioFlags.set(consultorioId, { hasZero: prev.hasZero || hasZero });
    }

    const totalConsultorios = consultorioFlags.size;
    let consultoriosSinInsumo = 0;
    consultorioFlags.forEach((flags) => {
      if (flags.hasZero) consultoriosSinInsumo += 1;
    });
    const consultoriosConInsumo = Math.max(0, totalConsultorios - consultoriosSinInsumo);
    const pctConInsumo = totalConsultorios > 0 ? (consultoriosConInsumo / totalConsultorios) * 100 : 0;
    const pctSinInsumo = totalConsultorios > 0 ? (consultoriosSinInsumo / totalConsultorios) * 100 : 0;

    return {
      totalConsultorios,
      consultoriosConInsumo,
      consultoriosSinInsumo,
      pctConInsumo,
      pctSinInsumo,
      data: [
        { name: 'Consultorios que si tienen', value: consultoriosConInsumo, color: '#1A6B5E' },
        { name: 'Consultorios que no tienen', value: consultoriosSinInsumo, color: '#A57F2C' },
      ],
    };
  }, [resultado, selectedEntidad, selectedInsumoKey]);

  const handleExport = () => {
    if (!selectedInsumoKey || unidadesConCero.length === 0) return;

    const out = unidadesConCero.map((row) => ({
      Entidad: row.entidad,
      CLUES: row.clues,
      Unidad: row.unidad,
      Consultorio: row.consultorio,
      Insumo: formatInsumoName(selectedInsumoKey),
      Valor: 0,
    }));

    const entidadSlug = (selectedEntidad || 'todas')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    const insumoSlug = formatInsumoName(selectedInsumoKey)
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 40);

    exportarExcel(out, `insumos_en_cero_${entidadSlug}_${insumoSlug}`, 'Insumos en cero');
  };

  return (
    <div className="card p-6">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-gray-800">Buscador de insumo en cero</h3>
        <p className="mt-0.5 text-xs text-gray-400">Escribe el insumo y se listan las unidades donde su valor es 0</p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            list="insumos-list"
            placeholder="Ejemplo: bascula electronica con estadimetro"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
          <select
            value={selectedEntidad}
            onChange={(e) => setSelectedEntidad(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">Todas las entidades</option>
            {entidades.map((entidad) => (
              <option key={entidad} value={entidad}>{entidad}</option>
            ))}
          </select>
        </div>
        <datalist id="insumos-list">
          {insumoKeys.map((key) => (
            <option key={key} value={formatInsumoName(key)} />
          ))}
        </datalist>

        {!query.trim() ? (
          <p className="text-xs text-gray-500">Hay {insumoKeys.length.toLocaleString('es-MX')} insumos disponibles para buscar.</p>
        ) : !selectedInsumoKey ? (
          <p className="text-xs font-medium text-rose-600">No encontré ese insumo. Prueba con una opción del autocompletado.</p>
        ) : (
          <p className="text-xs text-gray-600">
            Insumo: <span className="font-semibold text-gray-800">{formatInsumoName(selectedInsumoKey)}</span> ·
            entidad: <span className="font-semibold text-gray-800">{selectedEntidad || 'Todas'}</span> ·
            consultorio sin insumo: <span className="font-semibold text-rose-700">{donutCoverage.consultoriosSinInsumo.toLocaleString('es-MX')}</span>
          </p>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          disabled={!selectedInsumoKey || unidadesConCero.length === 0}
          className="flex items-center gap-2 rounded-lg bg-imss-green px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors enabled:hover:bg-imss-green-mid disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          Descargar Excel
        </button>
      </div>

      {selectedInsumoKey ? (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4">
          <div className="mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Cobertura CLUES-consultorio por insumo y estado</p>
            <p className="text-sm font-bold text-gray-800">
              {formatInsumoName(selectedInsumoKey)} · {selectedEntidad || 'Todas las entidades'}
            </p>
          </div>

          {donutCoverage.totalConsultorios === 0 ? (
            <p className="text-xs text-gray-500">No hay consultorios para el filtro seleccionado.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-center">
              <div className="relative h-72 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutCoverage.data}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={84}
                      outerRadius={130}
                      paddingAngle={2}
                      labelLine={false}
                      label={({ percent }) => `${(((percent ?? 0) as number) * 100).toFixed(1)}%`}
                    >
                      {donutCoverage.data.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [formatTooltipNumber(v), 'Consultorios']} />
                    <Legend verticalAlign="bottom" height={26} wrapperStyle={{ fontSize: '11px', color: '#6B7280' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-6">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Cobertura</p>
                  <p className="text-2xl font-black text-emerald-700">{donutCoverage.pctConInsumo.toFixed(1)}%</p>
                  <p className="text-[11px] text-gray-500">con insumo</p>
                </div>
              </div>

              <div className="space-y-4">
                <article className="group relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-5 transition-all duration-300 hover:scale-[1.03] hover:shadow-lg">
                  <div className="absolute -right-4 -top-4 opacity-10 transition-transform duration-500 group-hover:scale-125 group-hover:opacity-20">
                    <Layers3 className="h-20 w-20" />
                  </div>
                  <div className="relative mb-3 flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110">
                      <Layers3 className="h-5 w-5" strokeWidth={2.2} />
                    </div>
                  </div>
                  <p className="relative mb-1 text-[10px] font-bold uppercase tracking-widest opacity-70">
                    <span className="text-gray-500">CONSULTORIOS QUE SI TIENEN</span>
                  </p>
                  <p className="relative text-3xl font-black tabular-nums text-emerald-700">{donutCoverage.consultoriosConInsumo.toLocaleString('es-MX')}</p>
                  <p className="mt-1 text-xs font-medium text-gray-500">
                    {donutCoverage.consultoriosConInsumo.toLocaleString('es-MX')} de {donutCoverage.totalConsultorios.toLocaleString('es-MX')}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-emerald-700">{donutCoverage.pctConInsumo.toFixed(1)}%</p>
                </article>

                <article className="group relative overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-5 transition-all duration-300 hover:scale-[1.03] hover:shadow-lg">
                  <div className="absolute -right-4 -top-4 opacity-10 transition-transform duration-500 group-hover:scale-125 group-hover:opacity-20">
                    <Building2 className="h-20 w-20" />
                  </div>
                  <div className="relative mb-3 flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110">
                      <Building2 className="h-5 w-5" strokeWidth={2.2} />
                    </div>
                  </div>
                  <p className="relative mb-1 text-[10px] font-bold uppercase tracking-widest opacity-70">
                    <span className="text-gray-500">CONSULTORIOS QUE NO TIENEN</span>
                  </p>
                  <p className="relative text-3xl font-black tabular-nums text-amber-700">{donutCoverage.consultoriosSinInsumo.toLocaleString('es-MX')}</p>
                  <p className="mt-1 text-xs font-medium text-gray-500">
                    {donutCoverage.consultoriosSinInsumo.toLocaleString('es-MX')} de {donutCoverage.totalConsultorios.toLocaleString('es-MX')}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-amber-700">{donutCoverage.pctSinInsumo.toFixed(1)}%</p>
                </article>

                <p className="text-xs text-gray-500">
                  Total consultorios considerados: <span className="font-semibold text-gray-700">{donutCoverage.totalConsultorios.toLocaleString('es-MX')}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}

    </div>
  );
}

export function StatCards({
  stats,
  internetPie,
  porEntidad,
  cluesGeo = [],
  topFaltantes = [],
  resultado = [],
}: ChartsProps) {
  const [showMap, setShowMap] = useState(false);

  const infraestructuraMetrics = useMemo(() => {
    const consultorios = new Map<string, { hasZero: boolean; hasRegistro: boolean }>();
    let totalCeros = 0;
    let totalCamposInsumo = 0;
    let camposConRegistro = 0;

    for (const row of resultado) {
      const consultorioNum = Number(row.consultorio ?? 0);
      if (Number.isNaN(consultorioNum) || consultorioNum <= 0) continue;

      const clues = String(row.clues_imb ?? row.clues ?? '').trim() || 'Sin CLUES';
      const consultorioId = `${clues}::${consultorioNum}`;
      const previo = consultorios.get(consultorioId) ?? { hasZero: false, hasRegistro: false };

      let hasZero = previo.hasZero;
      let hasRegistro = previo.hasRegistro;
      for (const [key, value] of Object.entries(row)) {
        if (FIXED_COLUMNS.has(key)) continue;
        totalCamposInsumo += 1;

        if (!isZeroLike(value)) {
          camposConRegistro += 1;
          hasRegistro = true;
          continue;
        }

        totalCeros += 1;
        hasZero = true;
      }

      consultorios.set(consultorioId, { hasZero, hasRegistro });
    }

    const totalConsultorios = consultorios.size;
    const consultoriosConRegistro = Array.from(consultorios.values()).filter((item) => item.hasRegistro).length;
    const consultoriosSinInsumo = Array.from(consultorios.values()).filter((item) => item.hasZero).length;
    const pctConsultoriosSinInsumo = totalConsultorios > 0
      ? (consultoriosSinInsumo / totalConsultorios) * 100
      : 0;
    const pctConsultoriosConRegistro = totalConsultorios > 0
      ? (consultoriosConRegistro / totalConsultorios) * 100
      : 0;
    const promedioCerosPorConsultorio = totalConsultorios > 0 ? totalCeros / totalConsultorios : 0;
    const pctInsumosConRegistro = totalCamposInsumo > 0
      ? (camposConRegistro / totalCamposInsumo) * 100
      : 0;

    return {
      totalConsultorios,
      consultoriosConRegistro,
      consultoriosSinInsumo,
      pctConsultoriosSinInsumo,
      pctConsultoriosConRegistro,
      totalCeros,
      promedioCerosPorConsultorio,
      totalCamposInsumo,
      camposConRegistro,
      pctInsumosConRegistro,
    };
  }, [resultado]);

  const values: Record<StatKey, { value: number; expected?: number; helper?: string }> = {
    insumosConRegistro: {
      value: stats.consultoriosTotales,
      helper: 'Total de consultorios',
    },
    entidadesCapturadas: { value: stats.entidadesCapturadas, expected: stats.baseEntidadesEsperadas },
    promedioCerosPorConsultorio: {
      value: Number(infraestructuraMetrics.promedioCerosPorConsultorio.toFixed(1)),
      helper: `${infraestructuraMetrics.totalCeros.toLocaleString('es-MX')} registros sin insumos`,
    },
    registrosSinInsumos: {
      value: infraestructuraMetrics.totalCeros,
      expected: infraestructuraMetrics.totalCamposInsumo,
      helper: `${(100 - infraestructuraMetrics.pctInsumosConRegistro).toFixed(1)}% de registros sin insumos`,
    },
  };

  return (
    <>
      {/* Cards de métricas */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STAT_CARDS.map((def) => (
          <StatCard
            key={def.key}
            def={def}
            value={values[def.key].value}
            expected={values[def.key].expected}
            helper={values[def.key].helper}
          />
        ))}
      </div>

      {/* Botón Explorar en Mapa */}
      <button
        onClick={() => setShowMap(true)}
        className="group mt-1 w-full cursor-pointer overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-5 text-left transition-all hover:scale-[1.01] hover:shadow-lg active:scale-[0.99]"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110">
            <MapPin className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Geolocalización</p>
            <p className="text-xl font-black text-emerald-700">Explorar en Mapa</p>
            <p className="text-xs text-gray-500">Visualiza las unidades CLUES distribuidas en el territorio nacional</p>
          </div>
          <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
            Abrir mapa →
          </span>
        </div>
      </button>

      {/* Gráficas siempre visibles */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Top 20 insumos más frecuentes que faltan" subtitle="Frecuencia de faltantes por equipo/material en consultorios levantados (por consultorio)">
          <ResponsiveContainer width="100%" height={520}>
            <BarChart data={topFaltantes} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
              <YAxis type="category" dataKey="item" tick={{ fontSize: 10, fill: '#6B7280' }} width={180} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: unknown, name: string) =>
                  name === 'pct' ? [`${formatTooltipNumber(v)}%`, '%'] : [formatTooltipNumber(v), 'Faltantes']
                }
                cursor={{ fill: '#F9FAFB' }}
              />
              <Bar dataKey="faltantes" fill="#A57F2C" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Estados con menos insumos" subtitle="Top estados con menor cobertura de insumos en consultorios levantados">
          <EstadosMenosInsumos resultado={resultado} />
        </ChartCard>
      </div>

      <InsumoZeroFinder resultado={resultado} />

      {showMap && <MapModal onClose={() => setShowMap(false)} porEntidad={porEntidad} cluesGeo={cluesGeo} />}
    </>
  );
}

export function AvanceSummaryCards({
  summary,
}: {
  summary: {
    unidadesEce: number;
    unidadesSinba: number;
    unidadesAmbas: number;
    unidadesMigradasSinbaAEce: number;
    pctCambioSinbaAEce: number;
    sinbaCorteAnterior: number;
  };
}) {
  const cards = [
    {
      icon: Layers3,
      label: 'Unidades en ECE',
      value: summary.unidadesEce.toLocaleString('es-MX'),
      detail: 'Total general actual en ECE',
      bg: 'bg-emerald-50',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      valueColor: 'text-emerald-700',
      border: 'border-emerald-200',
    },
    {
      icon: Building2,
      label: 'Unidades en SINBA',
      value: summary.unidadesSinba.toLocaleString('es-MX'),
      detail: 'Total general actual en SINBA',
      bg: 'bg-amber-50',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      valueColor: 'text-amber-700',
      border: 'border-amber-200',
    },
    {
      icon: Globe,
      label: 'Unidades en ambos sistemas',
      value: summary.unidadesAmbas.toLocaleString('es-MX'),
      detail: 'Unidades que reportan en ECE y SINBA',
      bg: 'bg-rose-50',
      iconBg: 'bg-rose-100',
      iconColor: 'text-rose-600',
      valueColor: 'text-rose-700',
      border: 'border-rose-200',
    },
    {
      icon: ClipboardList,
      label: 'Cambio SINBA a ECE',
      value: `${summary.pctCambioSinbaAEce.toFixed(1)}%`,
      detail: `${summary.unidadesMigradasSinbaAEce.toLocaleString('es-MX')} unidades migradas de ${summary.sinbaCorteAnterior.toLocaleString('es-MX')} en SINBA (corte anterior)`,
      bg: 'bg-teal-50',
      iconBg: 'bg-teal-100',
      iconColor: 'text-teal-600',
      valueColor: 'text-teal-700',
      border: 'border-teal-200',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <article
          key={card.label}
          className={`group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:scale-[1.03] hover:shadow-lg ${card.border} ${card.bg}`}
        >
          <div className="absolute -right-4 -top-4 opacity-10 transition-transform duration-500 group-hover:scale-125 group-hover:opacity-20">
            <card.icon className="h-20 w-20" />
          </div>
          <div className="relative mb-3 flex items-start justify-between">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110 ${card.iconBg} ${card.iconColor}`}
            >
              <card.icon className="h-5 w-5" strokeWidth={2.2} />
            </div>
          </div>
          <p className="relative mb-1 text-[10px] font-bold uppercase tracking-widest opacity-70">
            <span className="text-gray-500">{card.label}</span>
          </p>
          <p className={`relative text-3xl font-black tabular-nums ${card.valueColor}`}>{card.value}</p>
          <p className="mt-1 text-xs text-gray-500">{card.detail}</p>
        </article>
      ))}
    </div>
  );
}

export function AvanceCharts({
  avanceCoberturaEntidad,
  detalleClues,
  selectedEntidadFilter,
}: {
  avanceCoberturaEntidad: {
    fecha_corte?: string;
    fecha_corte_anterior?: string | null;
    rows?: Array<{
      entidad?: string;
      ece?: number;
      sinba?: number;
      ambas?: number;
      delta_ece?: number;
      delta_sinba?: number;
      delta_ambas?: number;
    }>;
  } | null;
  detalleClues?: Array<{
    clues_imb?: string;
    entidad?: string;
    reporta_ece_bool?: boolean | string | number;
    reporta_sinba_bool?: boolean | string | number;
  }>;
  selectedEntidadFilter?: string;
}) {
  const toText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  };

  const normalizeKey = (value: unknown): string => toText(value).toUpperCase();

  const toBoolLike = (value: unknown): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    const text = toText(value).toLowerCase();
    return text === 'true' || text === '1' || text === 'si' || text === 'yes';
  };

  const rows = (avanceCoberturaEntidad?.rows ?? [])
    .map((row) => ({
      entidad: String(row.entidad ?? '').trim(),
      ece: Number(row.ece ?? 0),
      sinba: Number(row.sinba ?? 0),
      ambas: Number(row.ambas ?? 0),
      delta_ece: Number(row.delta_ece ?? 0),
      delta_sinba: Number(row.delta_sinba ?? 0),
      delta_ambas: Number(row.delta_ambas ?? 0),
    }))
    .filter((row) => row.entidad);

  const filteredEntidad = normalizeKey(selectedEntidadFilter);
  const cluesMode = Boolean(filteredEntidad);

  const cluesRows = cluesMode
    ? (detalleClues ?? [])
      .filter((row) => normalizeKey(row.entidad) === filteredEntidad)
      .map((row) => {
        const clue = toText(row.clues_imb);
        const ece = toBoolLike(row.reporta_ece_bool);
        const sinba = toBoolLike(row.reporta_sinba_bool);

        return {
          entidad: clue || 'SIN CLUES',
          ece: ece && !sinba ? 1 : 0,
          sinba: !ece && sinba ? 1 : 0,
          ambas: ece && sinba ? 1 : 0,
          delta_ece: 0,
          delta_sinba: 0,
          delta_ambas: 0,
        };
      })
      .filter((row) => row.entidad)
    : [];

  const sourceRows = cluesMode ? cluesRows : rows;

  const formatDeltaLabel = (delta: number) => {
    if (delta > 0) return `▲ +${formatTooltipNumber(delta)} vs corte anterior (historico)`;
    if (delta < 0) return `▼ ${formatTooltipNumber(delta)} vs corte anterior (historico)`;
    return '● 0 vs corte anterior (historico)';
  };

  const data = [...sourceRows]
    .map((row) => ({
      eje: row.entidad.length > 18 ? `${row.entidad.slice(0, 18)}.` : row.entidad,
      ejeFull: row.entidad,
      ece: Number(row.ece ?? 0),
      sinba: Number(row.sinba ?? 0),
      ambas: Number(row.ambas ?? 0),
      deltaEce: Number(row.delta_ece ?? 0),
      deltaSinba: Number(row.delta_sinba ?? 0),
      deltaAmbas: Number(row.delta_ambas ?? 0),
    }))
    .sort((a, b) => (b.ece + b.sinba + b.ambas) - (a.ece + a.sinba + a.ambas));

  const yMax = cluesMode ? 15 : 80;
  const yTicks = cluesMode
    ? Array.from({ length: 16 }, (_, index) => index)
    : Array.from({ length: 17 }, (_, index) => index * 5);
  const needsHorizontalScroll = cluesMode && data.length > 25;
  const chartWidth = needsHorizontalScroll ? Math.max(1400, data.length * 72) : undefined;

  const deltaEce = data.reduce((sum, row) => sum + row.deltaEce, 0);
  const deltaSinba = data.reduce((sum, row) => sum + row.deltaSinba, 0);
  const deltaAmbas = data.reduce((sum, row) => sum + row.deltaAmbas, 0);

  const totalStatus = sourceRows.reduce((sum, row) => sum + row.ece + row.sinba + row.ambas, 0);
  const percentSummary = [
    { name: 'ECE', value: totalStatus > 0 ? (sourceRows.reduce((sum, row) => sum + row.ece, 0) / totalStatus) * 100 : 0, fill: '#047857' },
    { name: 'SINBA', value: totalStatus > 0 ? (sourceRows.reduce((sum, row) => sum + row.sinba, 0) / totalStatus) * 100 : 0, fill: '#B45309' },
    { name: 'AMBAS', value: totalStatus > 0 ? (sourceRows.reduce((sum, row) => sum + row.ambas, 0) / totalStatus) * 100 : 0, fill: '#334155' },
  ];

  const subtitle = cluesMode
    ? `Tendencia por CLUES | ECE ${formatDeltaLabel(deltaEce)} | SINBA ${formatDeltaLabel(deltaSinba)} | AMBAS ${formatDeltaLabel(deltaAmbas)}`
    : `Tendencia por entidad | ECE ${formatDeltaLabel(deltaEce)} | SINBA ${formatDeltaLabel(deltaSinba)} | AMBAS ${formatDeltaLabel(deltaAmbas)}`;

  if (!data.length) {
    return (
      <ChartCard
        title={cluesMode ? 'Tendencias de transicion por CLUES' : 'Tendencias de transicion por entidad'}
        subtitle={subtitle}
        className="h-full"
      >
        <p className="text-sm text-gray-500">Sin datos de cobertura para mostrar tendencia.</p>
      </ChartCard>
    );
  }

  return (
    <div className="space-y-6">
      <ChartCard
        title={cluesMode ? 'Participación por tipo de registro (%)' : 'Participación por tipo de registro (%)'}
        subtitle={cluesMode ? 'Distribución del total de registros en el filtro actual.' : 'Distribución del total de registros en el consolidado actual.'}
        className="h-full"
      >
        <div style={{ height: '220px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={percentSummary} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11, fill: '#6B7280' }} width={42} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: unknown) => [`${Number(value ?? 0).toFixed(1)}%`, 'Participación']}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {percentSummary.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
              <LabelList dataKey="value" position="top" formatter={(value: unknown) => `${Number(value ?? 0).toFixed(1)}%`} style={{ fill: '#374151', fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title={cluesMode ? 'Tendencias de transicion por CLUES' : 'Tendencias de transicion por entidad'}
        subtitle={subtitle}
        className="h-full"
      >
        <div className={needsHorizontalScroll ? 'overflow-x-auto pb-2' : ''}>
          <div style={chartWidth ? { width: `${chartWidth}px`, minWidth: `${chartWidth}px`, height: '560px' } : { height: '560px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 22, left: 0, bottom: 86 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="eje"
                  angle={-90}
                  textAnchor="end"
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  height={96}
                  interval={0}
                  minTickGap={cluesMode ? 8 : 0}
                />
                <YAxis
                  domain={[0, yMax]}
                  ticks={yTicks}
                  interval={0}
                  width={36}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(_label, payload) =>
                    (payload?.[0] as { payload?: { ejeFull?: string } } | undefined)?.payload?.ejeFull ?? _label
                  }
                  formatter={(v: unknown, name: string) => [formatTooltipNumber(v), name.toUpperCase()]}
                  cursor={{ stroke: '#CBD5E1', strokeDasharray: '4 4' }}
                />
                <Legend verticalAlign="top" iconType="plainline" wrapperStyle={{ fontSize: '11px', color: '#6B7280', paddingBottom: '8px' }} />
                <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="ece" name="ece" stroke="#047857" strokeWidth={3} dot={{ r: 2.6, fill: '#047857' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="sinba" name="sinba" stroke="#B45309" strokeWidth={3} dot={{ r: 2.6, fill: '#B45309' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="ambas" name="ambas" stroke="#334155" strokeWidth={3} dot={{ r: 2.6, fill: '#334155' }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        {needsHorizontalScroll ? (
          <p className="mt-2 text-xs text-gray-500">
            {cluesMode
              ? 'Desplaza horizontalmente para ver todas las CLUES del estado seleccionado.'
              : 'Desplaza horizontalmente para ver todas las entidades del consolidado general.'}
          </p>
        ) : null}
      </ChartCard>
    </div>
  );
}

export function InfraEceSinbaDonut({
  ece,
  sinba,
  selectedEntidad,
  selectedClues,
}: {
  ece: number;
  sinba: number;
  selectedEntidad?: string;
  selectedClues?: string;
}) {
  const total = Math.max(0, ece) + Math.max(0, sinba);
  const pctEce = total > 0 ? (Math.max(0, ece) / total) * 100 : 0;

  const contextoEntidad = (selectedEntidad ?? '').trim();
  const contextoClues = (selectedClues ?? '').trim();
  const subtitulo = contextoEntidad || contextoClues
    ? `Filtro activo: ${contextoEntidad || 'Todas las entidades'} | ${contextoClues || 'Todos los CLUES'}`
    : 'Vista general consolidada';

  const data = [
    { name: 'ECE', value: Math.max(0, ece), color: '#047857' },
    { name: 'SINBA', value: Math.max(0, sinba), color: '#B45309' },
  ];

  return (
    <ChartCard
      title="Transicion ECE vs SINBA"
      subtitle={subtitulo}
      className="h-full"
    >
      <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="48%"
              outerRadius={110}
              innerRadius={68}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((slice) => (
                <Cell key={slice.name} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatTooltipNumber(v), 'Registros']} />
            <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#6B7280' }} />
          </PieChart>
        </ResponsiveContainer>

        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700/80">ECE</p>
            <p className="mt-1 text-2xl font-black text-emerald-700">{formatTooltipNumber(ece)}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700/80">SINBA</p>
            <p className="mt-1 text-2xl font-black text-amber-700">{formatTooltipNumber(sinba)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Participacion ECE</p>
            <p className="mt-1 text-2xl font-black text-slate-800">{pctEce.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-slate-500">Total analizado: {formatTooltipNumber(total)}</p>
          </div>
        </div>
      </div>
    </ChartCard>
  );
}

export function Charts({
  internetPie,
  porEntidad,
  topFaltantes,
}: ChartsProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Top 10 cosas mas frecuentes que no tienen" subtitle="Frecuencia de faltantes por pregunta en consultorios levantados">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topFaltantes} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
              <YAxis type="category" dataKey="item" tick={{ fontSize: 10, fill: '#6B7280' }} width={180} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v, name, item) => {
                  if (name === 'pct') return [`${formatTooltipNumber(v)}%`, '%'];
                  return [formatTooltipNumber(v), 'Faltantes'];
                }}
                cursor={{ fill: '#F9FAFB' }}
              />
              <Bar dataKey="faltantes" fill="#A57F2C" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Unidades con y sin internet" subtitle="Distribucion desde columna internet en resumen">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={internetPie} cx="50%" cy="45%" outerRadius={100} innerRadius={55} dataKey="value" paddingAngle={2} stroke="none">
                {internetPie.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatTooltipNumber(v), 'Unidades']} />
              <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#6B7280' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Resumen por entidad" subtitle="Unidades, consultorios habilitados y consultorios levantados">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={porEntidad} margin={{ top: 0, right: 10, left: 0, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis dataKey="entidad" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 10, fill: '#9CA3AF' }} height={70} />
            <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatTooltipNumber(v)} cursor={{ fill: '#F9FAFB' }} />
            <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ fontSize: '11px', paddingBottom: '8px', color: '#6B7280' }} />
            <Bar dataKey="unidades" name="Unidades" fill="#002F2A" />
            <Bar dataKey="consultoriosHabilitados" name="Consultorios Habilitados" fill="#A57F2C" />
            <Bar dataKey="consultoriosLevantados" name="Consultorios Levantados" fill="#1A6B5E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
