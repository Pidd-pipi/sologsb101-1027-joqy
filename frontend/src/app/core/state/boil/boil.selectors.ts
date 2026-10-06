/** 煮沸投加 feature selectors */
import { createFeatureSelector, createSelector } from '@ngrx/store';
import { BoilState } from './boil.reducer';

export const selectBoilState = createFeatureSelector<BoilState>('boil');

export const selectAllBoilAdds = createSelector(selectBoilState, (state) => state.adds);
export const selectBoilFilter = createSelector(selectBoilState, (state) => state.filter);

/** 按投加时点倒计时排序（atMin 大 → 小） */
export const selectBoilAddsByRecipe = (recipeId: string) =>
  createSelector(selectAllBoilAdds, selectBoilFilter, (adds, filter) => {
    const keyword = String(filter['keyword'] ?? '').trim().toLowerCase();
    const purposes = Array.isArray(filter['purposes']) ? (filter['purposes'] as string[]) : [];
    return adds
      .filter((add) => add.recipeId === recipeId)
      .filter((add) => {
        const label = `${add.material} ${add.purpose}`.toLowerCase();
        if (keyword && !label.includes(keyword)) return false;
        if (purposes.length > 0 && !purposes.includes(add.purpose)) return false;
        return true;
      })
      .sort((a, b) => b.atMin - a.atMin);
  });

/** 下一个投加点（时点最大且尚未到 0 的那一条） */
export const selectNextBoilAddByRecipe = (recipeId: string) =>
  createSelector(selectAllBoilAdds, (adds) => {
    const own = adds.filter((item) => item.recipeId === recipeId).sort((a, b) => b.atMin - a.atMin);
    return own.find((item) => item.atMin > 0) ?? null;
  });
