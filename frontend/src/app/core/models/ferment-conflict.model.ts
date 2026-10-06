import type { Ferment } from './ferment.model';

/**
 * 冲突的一侧：某个来源（标签页）对同一批次同一天读数提交的值。
 * value 为 null 表示该来源删除了这条读数。
 */
export interface FermentConflictSide {
  /** 来源标签页标识 */
  source: string;
  /** 该来源提交 / 库中保留的时间（毫秒时间戳） */
  at: number;
  /** 该来源的读数值；null 表示删除 */
  value: Omit<Ferment, 'id'> | null;
}

export type FermentConflictState = '待处理' | '已解决';

/**
 * 发酵读数合并冲突：两个标签页同时改动同一批次同一天的读数时产生。
 * 双方值与来源都完整保留，直到酿酒师在发酵页选择保留哪一侧。
 */
export interface FermentConflict {
  id: string;
  /** 批次号（与发酵读数、罐装批次同一实绩键） */
  batchNo: string;
  /** 所属配方 */
  recipeId: string;
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 库中当前保留的一侧 */
  kept: FermentConflictSide;
  /** 后到的、未能自动合并的一侧 */
  incoming: FermentConflictSide;
  /** 处理状态 */
  state: FermentConflictState;
  /** 解决时选择了哪一侧 */
  resolvedChoice?: 'kept' | 'incoming';
}

export function formatConflictSideValue(value: Omit<Ferment, 'id'> | null): string {
  if (!value) return '该来源删除了此读数';
  return `比重 ${value.gravity} · ${value.tempC}℃ · 双乙酰 ${value.diacetylPpm}ppm · ${value.state}`;
}
