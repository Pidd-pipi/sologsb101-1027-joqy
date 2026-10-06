/** 糖化步状态 */
export type MashStepState = '未开始' | '进行中' | '已完成';

/** 糖化升温步 */
export interface MashStep {
  id: string;
  /** 所属配方 */
  recipeId: string;
  /** 顺序 */
  seq: number;
  /** 温度 ℃ */
  tempC: number;
  /** 时长 min */
  minutes: number;
  /** 水量 L */
  waterL: number;
  /** 状态 */
  state: MashStepState;
}

export const MASH_STATES: MashStepState[] = ['未开始', '进行中', '已完成'];

export function createEmptyMashStep(): Omit<MashStep, 'id' | 'seq'> {
  return { recipeId: '', tempC: 66, minutes: 60, waterL: 16, state: '未开始' };
}
