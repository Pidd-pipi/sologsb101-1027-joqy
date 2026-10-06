/** 酒花形态 */
export type HopForm = '颗粒' | '整花' | '浸膏';

/** 酒花：按 α 酸与投放时点估算 IBU */
export interface Hop {
  id: string;
  /** 所属配方 */
  recipeId: string;
  /** 名称 */
  name: string;
  /** α 酸 % */
  alphaPct: number;
  /** 产地 */
  origin: string;
  /** 形态 */
  form: HopForm;
  /** 用量 g */
  amountG: number;
}

export const HOP_FORMS: HopForm[] = ['颗粒', '整花', '浸膏'];

export function createEmptyHop(): Omit<Hop, 'id'> {
  return { recipeId: '', name: '', alphaPct: 12, origin: '', form: '颗粒', amountG: 30 };
}
