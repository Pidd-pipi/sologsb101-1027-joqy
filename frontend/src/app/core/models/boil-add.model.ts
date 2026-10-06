/** 投加用途 */
export type BoilPurpose = '苦味' | '风味' | '香气' | '澄清';

/** 煮沸投加：按倒计时排序生成投花时间表 */
export interface BoilAdd {
  id: string;
  /** 所属配方 */
  recipeId: string;
  /** 投加时点（煮沸剩余分钟） */
  atMin: number;
  /** 物料 */
  material: string;
  /** 用量 g */
  amountG: number;
  /** 用途 */
  purpose: BoilPurpose;
}

export const BOIL_PURPOSES: BoilPurpose[] = ['苦味', '风味', '香气', '澄清'];
/** 煮沸总时长 min */
export const BOIL_TOTAL_MIN = 60;

export function createEmptyBoilAdd(): Omit<BoilAdd, 'id'> {
  return { recipeId: '', atMin: 60, material: '', amountG: 20, purpose: '苦味' };
}
