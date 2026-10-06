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
