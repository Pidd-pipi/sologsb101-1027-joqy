/** 麦芽类型 */
export type MaltType = '基础麦芽' | '特种麦芽' | '烤制麦芽';

/** 麦芽：配方中的糖化投料 */
export interface Malt {
  id: string;
  /** 所属配方 */
  recipeId: string;
  /** 名称 */
  name: string;
  /** 色度 EBC */
  ebc: number;
  /** 产地 */
  origin: string;
  /** 用量占比 % */
  ratioPct: number;
  /** 类型 */
  type: MaltType;
}

export const MALT_TYPES: MaltType[] = ['基础麦芽', '特种麦芽', '烤制麦芽'];

export function createEmptyMalt(): Omit<Malt, 'id'> {
  return { recipeId: '', name: '', ebc: 4, origin: '', ratioPct: 80, type: '基础麦芽' };
}
