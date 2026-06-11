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

export const matchesCourseModalidad = (course: Record<string, unknown>, modalidad: string): boolean => {
  const filter = modalidad.toUpperCase();
  const dbModalidad = String(course.modalidad || '').toLowerCase();
  const dbType = String(course.type || '').toUpperCase();
  const pilar = String(course.pilar || '');

  const checks: Record<string, () => boolean> = {
    ON_DEMAND: () => dbModalidad === 'on-demand' || dbType === 'ON_DEMAND',
    VIRTUAL: () => dbModalidad === 'virtual' || dbType === 'VIRTUAL',
    VIVO: () => dbType === 'VIVO' || pilar === 'liderazgo',
    ASYNC: () => dbType === 'ASYNC' || pilar === 'emprendimiento',
    EBOOK: () => dbType === 'EBOOK',
  };

  if (checks[filter]) return checks[filter]();
  return dbModalidad === modalidad.toLowerCase() || dbType === filter;
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
