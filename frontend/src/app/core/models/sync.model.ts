/**
 * 跨标签页协同模型：来源身份、读数冲突变体、配方实绩快照与可续合并草稿。
 * 发酵读数按「批次号 + 日期」作为自然键守住同一份实绩：
 * 同一自然键被两个标签页改成不同值时，双方的值与来源都保留在 variants 中。
 */
import type { Ferment, FermentState } from './ferment.model';
import type { Packaging } from './packaging.model';

/** 读数 / 罐装批次的录入来源（一个浏览器标签页一个身份，关闭后随草稿留存） */
export interface SyncSource {
  sourceId: string;
  sourceLabel: string;
}

/** 某个来源对一条读数保存的值（冲突时双方各留一条） */
export interface FermentVariant {
  sourceId: string;
  sourceLabel: string;
  gravity: number;
  tempC: number;
  diacetylPpm: number;
  state: FermentState;
  savedAt: number;
}

/** 进入编辑时的基线：用于读数组做三方合并 */
export interface FermentBase {
  /** 打开编辑表单时行的修订号 */
  revision: number;
  /** 当时的四个可冲突字段 */
  snapshot: Pick<Ferment, 'gravity' | 'tempC' | 'diacetylPpm' | 'state'>;
}

/** 一组原子提交的读数改动（全部成功或整组回滚） */
export interface FermentChange {
  op: 'upsert' | 'delete';
  /** 更新既有行时带上；按自然键合并时也用于兜底查找 */
  id?: string;
  payload?: Omit<Ferment, 'id'>;
  base?: FermentBase;
}

/** 配方实绩快照（发酵读数变动后立即失效并重算） */
export interface RecipeActuals {
  recipeId: string;
  og: number;
  fg: number;
  abv: number;
  attenuation: number;
  fermentCount: number;
  /** true 表示读数刚变动、新实绩尚未重新装载到当前页 */
  stale: boolean;
  updatedAt: number;
}

/** 罐装批次 upsert 载体 */
export interface PackagingUpsert {
  id?: string;
  payload: Omit<Packaging, 'id'>;
}

/**
 * 保存失败后留下的可继续处理草稿：
 * 整组改动随来源持久化到 mergeDrafts 表，关掉页面再打开仍可重新合并。
 */
export interface MergeDraft {
  id: string;
  kind: 'ferment' | 'packaging';
  source: SyncSource;
  changes?: FermentChange[];
  packaging?: PackagingUpsert;
  /** 给酿酒师看的内容摘要 */
  summary: string;
  lastError: string;
  attempts: number;
  createdAt: number;
  updatedAt: number;
}
