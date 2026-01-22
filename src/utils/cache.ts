/**
 * Sistema de caché en memoria con TTL (Time To Live)
 * 
 * Estrategia:
 * - Caché en memoria usando Map
 * - TTL por defecto: 5 minutos (300 segundos)
 * - Invalidación automática cuando expira
 * - Invalidación manual cuando se actualizan datos
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private cache: Map<string, CacheEntry<any>>;
  private defaultTTL: number; // en segundos

  constructor(defaultTTL: number = 300) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    
    // Limpiar entradas expiradas cada minuto
    setInterval(() => this.cleanExpired(), 60000);
  }

  /**
   * Genera una clave de caché única basada en los parámetros
   */
  generateKey(prefix: string, params: Record<string, any>): string {
    // Ordenar las claves para que el mismo objeto genere la misma clave
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    return `${prefix}:${sortedParams}`;
  }

  /**
   * Obtiene un valor del caché
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Verificar si expiró
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Guarda un valor en el caché
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.defaultTTL) * 1000;
    this.cache.set(key, { data, expiresAt });
  }

  /**
   * Obtiene o calcula un valor (patrón cache-aside)
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Intentar obtener del caché
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Si no está en caché, obtener de la fuente
    const data = await fetcher();
    
    // Guardar en caché
    this.set(key, data, ttl);
    
    return data;
  }

  /**
   * Invalida una entrada específica
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalida todas las entradas que empiezan con un prefijo
   */
  invalidatePattern(pattern: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Limpia todas las entradas expiradas
   */
  private cleanExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    
    if (keysToDelete.length > 0) {
    }
  }

  /**
   * Limpia todo el caché
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Obtiene estadísticas del caché
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Instancia singleton del caché
export const cache = new MemoryCache(300); // 5 minutos por defecto

// Prefijos para diferentes tipos de datos
export const CACHE_KEYS = {
  COURSES: 'courses',
  EVENTS: 'events',
  EBOOKS: 'ebooks',
  PROFESSORS: 'professors',
  ORDERS: 'orders',
} as const;

