import type { Ferment } from './ferment.model';

/** 发酵写入操作类型 */
export type FermentMutationKind = 'create' | 'update' | 'delete';

/**
 * 一次发酵读数写入意图：合并器按「批次号 + 日期」把它并入当前库，
 * 基准 updatedAt 用于识别另一标签页是否已抢先改过同一行。
 */
export interface FermentMutation {
  kind: FermentMutationKind;
  /** update / delete 的目标行 id；create 为 null */
  rowId: string | null;
  /** create / update 的目标值；delete 时为该标签页看到的行快照（仅用于草稿展示与级联） */
  payload: Omit<Ferment, 'id'> | null;
  /** 该标签页看到的行 updatedAt（并发检测基准）；create 为 null */
  baseUpdatedAt: number | null;
  /** 来源标签页标识 */
  source: string;
}

/**
 * 写入失败草稿：整组写入回滚后把操作意图完整落库，
 * 关掉页面再打开仍可继续合并。
 */
export interface FermentDraft extends FermentMutation {
  id: string;
  /** 批次号（冗余自 payload，便于展示与级联删除） */
  batchNo: string;
  /** 所属配方（冗余，便于级联删除） */
  recipeId: string;
  /** 日期 YYYY-MM-DD（冗余自 payload，便于展示） */
  date: string;
  /** 失败原因 */
  error: string;
  /** 草稿状态 */
  state: '待合并';
}

export const FERMENT_MUTATION_KIND_LABELS: Record<FermentMutationKind, string> = {
  create: '新增',
  update: '修改',
  delete: '删除'
};
