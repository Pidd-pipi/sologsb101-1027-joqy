/** 生成本地唯一 id（纯前端可用，不依赖后端） */
export function createId(prefix = 'row'): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

/** 当前时间的 ISO 字符串 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 今天 YYYY-MM-DD */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const SOURCE_KEY = 'gbbrewhouse-source-id';
let cachedSourceId: string | null = null;

/**
 * 当前标签页的来源标识：sessionStorage 按标签页隔离，
 * 同一标签页刷新后保持不变，两个标签页各自不同，用于合并冲突时标注双方来源。
 */
export function clientId(): string {
  if (cachedSourceId) return cachedSourceId;
  try {
    const existing = window.sessionStorage.getItem(SOURCE_KEY);
    if (existing) {
      cachedSourceId = existing;
      return existing;
    }
    const created = `标签页-${Math.random().toString(36).slice(2, 6)}`;
    window.sessionStorage.setItem(SOURCE_KEY, created);
    cachedSourceId = created;
    return created;
  } catch {
    cachedSourceId = `标签页-${Math.random().toString(36).slice(2, 6)}`;
    return cachedSourceId;
  }
}
