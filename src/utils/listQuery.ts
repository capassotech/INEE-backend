import { normalizeText } from './utils';

export type SortOrder = 'asc' | 'desc';

export const parseLimit = (
  value: string | undefined,
  defaultValue = 20,
  max = 100
): number => {
  const parsed = parseInt(value || String(defaultValue), 10);
  if (Number.isNaN(parsed) || parsed < 1) return defaultValue;
  return Math.min(parsed, max);
};

export const parsePage = (value: string | undefined, defaultValue = 1): number =>
  Math.max(parseInt(value || String(defaultValue), 10) || defaultValue, 1);

export const parseSortOrder = (value?: string, defaultOrder: SortOrder = 'desc'): SortOrder =>
  value === 'asc' ? 'asc' : value === 'desc' ? 'desc' : defaultOrder;

export const toJsDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const converted = (value as { toDate: () => Date }).toDate();
    return converted instanceof Date ? converted : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

export const matchesSearch = (
  search: string | undefined,
  fields: Array<string | undefined | null>
): boolean => {
  if (!search?.trim()) return true;
  const normalized = normalizeText(search);
  return fields.some((field) => normalizeText(field || '').includes(normalized));
};

export const sortByComparator = <T>(
  items: T[],
  sortBy: string | undefined,
  sortOrder: SortOrder,
  comparators: Record<string, (a: T, b: T) => number>,
  defaultComparator?: (a: T, b: T) => number
): T[] => {
  const sorted = [...items];
  const comparator =
    (sortBy && comparators[sortBy]) || defaultComparator || (() => 0);
  sorted.sort((a, b) => {
    const result = comparator(a, b);
    return sortOrder === 'asc' ? result : -result;
  });
  return sorted;
};

export const paginateByCursor = <T extends { id: string }>(
  items: T[],
  limit: number,
  lastId?: string
): { items: T[]; hasMore: boolean; lastId: string | null } => {
  let startIndex = 0;
  if (lastId) {
    const index = items.findIndex((item) => item.id === lastId);
    startIndex = index >= 0 ? index + 1 : 0;
  }

  const pageItems = items.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < items.length;

  return {
    items: pageItems,
    hasMore,
    lastId: pageItems.length > 0 ? pageItems[pageItems.length - 1].id : null,
  };
};

export const paginateByPage = <T>(
  items: T[],
  page: number,
  limit: number
): {
  items: T[];
  total: number;
  totalPages: number;
  hasMore: boolean;
} => {
  const total = items.length;
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const offset = (page - 1) * limit;
  const pageItems = items.slice(offset, offset + limit);

  return {
    items: pageItems,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
};

export type ListFilterOption = { value: string; label: string };

/** Normaliza filtros legacy (ON_DEMAND/ASYNC/VIVO) al valor real de `modalidad` en DB. */
export const normalizeCourseModalidadFilter = (modalidad: string): string => {
  const raw = modalidad.trim().toLowerCase().replace(/_/g, '-');
  const aliases: Record<string, string> = {
    'on-demand': 'on-demand',
    ondemand: 'on-demand',
    virtual: 'virtual',
    async: 'virtual',
    asincronica: 'virtual',
    'asincrónica': 'virtual',
    presencial: 'presencial',
    vivo: 'presencial',
    'en-vivo': 'presencial',
  };
  return aliases[raw] ?? raw;
};

const COURSE_MODALIDAD_LABELS: Record<string, string> = {
  virtual: 'Virtual',
  presencial: 'Presencial',
  'on-demand': 'On-Demand',
};

const COURSE_ESTADO_LABELS: Record<string, string> = {
  activo: 'Activos',
  inactivo: 'Inactivos',
};

const EVENT_TIPO_LABELS: Record<string, string> = {
  presencial: 'Presencial',
  virtual: 'Virtual',
  hibrida: 'Híbrido',
  hibrido: 'Híbrido',
};

const EVENT_ESTADO_LABELS: Record<string, string> = {
  activo: 'Activos',
  inactivo: 'Inactivos',
};

/** Normaliza modalidad/tipo de evento a valor canónico de DB (`hibrida`). */
export const normalizeEventTipoFilter = (tipo: string): string => {
  const raw = tipo.trim().toLowerCase();
  if (raw === 'hibrido' || raw === 'híbrido' || raw === 'hibrida') return 'hibrida';
  if (raw === 'online') return 'virtual';
  return raw;
};

export const matchesCourseModalidad = (
  course: Record<string, unknown>,
  modalidad: string
): boolean => {
  const filter = normalizeCourseModalidadFilter(modalidad);
  const dbModalidad = normalizeCourseModalidadFilter(String(course.modalidad || ''));
  return Boolean(filter) && dbModalidad === filter;
};

export const buildCourseFilterOptions = (
  docs: Array<{ modalidad?: unknown; estado?: unknown }>
): { types: ListFilterOption[]; statuses: ListFilterOption[] } => {
  const modalidades = new Set<string>();
  const estados = new Set<string>();

  for (const doc of docs) {
    if (doc.modalidad) {
      modalidades.add(normalizeCourseModalidadFilter(String(doc.modalidad)));
    }
    if (doc.estado) {
      estados.add(String(doc.estado).toLowerCase());
    }
  }

  return {
    types: Array.from(modalidades)
      .filter(Boolean)
      .sort()
      .map((value) => ({
        value,
        label: COURSE_MODALIDAD_LABELS[value] || value,
      })),
    statuses: Array.from(estados)
      .filter(Boolean)
      .sort()
      .map((value) => ({
        value,
        label: COURSE_ESTADO_LABELS[value] || value,
      })),
  };
};

export const buildEventFilterOptions = (
  docs: Array<{ modalidad?: unknown; tipo?: unknown; estado?: unknown }>
): { types: ListFilterOption[]; statuses: ListFilterOption[] } => {
  const tipos = new Set<string>();
  const estados = new Set<string>();

  for (const doc of docs) {
    const raw = doc.modalidad ?? doc.tipo;
    if (raw) {
      tipos.add(normalizeEventTipoFilter(String(raw)));
    }
    if (doc.estado) {
      estados.add(String(doc.estado).toLowerCase());
    }
  }

  return {
    types: Array.from(tipos)
      .filter(Boolean)
      .sort()
      .map((value) => ({
        value,
        label: EVENT_TIPO_LABELS[value] || value,
      })),
    statuses: Array.from(estados)
      .filter(Boolean)
      .sort()
      .map((value) => ({
        value,
        label: EVENT_ESTADO_LABELS[value] || value,
      })),
  };
};

export const getEventDateTime = (event: Record<string, unknown>): Date | null => {
  const baseDate = toJsDate(event.fecha ?? event.date);
  if (!baseDate) return null;

  const hora = String(event.hora || '00:00');
  const [hours, minutes] = hora.split(':').map((part) => parseInt(part, 10) || 0);
  const result = new Date(baseDate);
  result.setHours(hours, minutes, 0, 0);
  return result;
};

export const mapPilarToProductType = (pilar: string): string => {
  const mapping: Record<string, string> = {
    'consultoria-estrategica': 'ON_DEMAND',
    liderazgo: 'VIVO',
    emprendimiento: 'ASYNC',
  };
  return mapping[pilar] ?? 'ON_DEMAND';
};
