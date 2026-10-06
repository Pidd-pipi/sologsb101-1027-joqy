/** 辅料库 feature selectors */
import { createFeatureSelector, createSelector } from '@ngrx/store';
import { weightedEbc } from '../../utils/brew';
import { IngredientsState } from './ingredients.reducer';

export const selectIngredientsState = createFeatureSelector<IngredientsState>('ingredients');

export const selectAllMalts = createSelector(selectIngredientsState, (state) => state.malts);
export const selectAllHops = createSelector(selectIngredientsState, (state) => state.hops);
export const selectIngredientsFilter = createSelector(selectIngredientsState, (state) => state.filter);

export const selectFilteredMalts = createSelector(selectAllMalts, selectIngredientsFilter, (malts, filter) => {
  const keyword = String(filter['keyword'] ?? '').trim().toLowerCase();
  const types = Array.isArray(filter['types']) ? (filter['types'] as string[]) : [];
  const origins = Array.isArray(filter['origins']) ? (filter['origins'] as string[]) : [];
  return malts.filter((malt) => {
    const label = `${malt.name} ${malt.origin} ${malt.type}`.toLowerCase();
    if (keyword && !label.includes(keyword)) return false;
    if (types.length > 0 && !types.includes(malt.type)) return false;
    if (origins.length > 0 && !origins.includes(malt.origin)) return false;
    return true;
  });
});

export const selectFilteredHops = createSelector(selectAllHops, selectIngredientsFilter, (hops, filter) => {
  const keyword = String(filter['keyword'] ?? '').trim().toLowerCase();
  const forms = Array.isArray(filter['forms']) ? (filter['forms'] as string[]) : [];
  const origins = Array.isArray(filter['origins']) ? (filter['origins'] as string[]) : [];
  return hops.filter((hop) => {
    const label = `${hop.name} ${hop.origin} ${hop.form}`.toLowerCase();
    if (keyword && !label.includes(keyword)) return false;
    if (forms.length > 0 && !forms.includes(hop.form)) return false;
    if (origins.length > 0 && !origins.includes(hop.origin)) return false;
    return true;
  });
});

/** 指定配方的加权平均色度 */
export const selectEbcByRecipe = (recipeId: string) =>
  createSelector(selectAllMalts, (malts) => weightedEbc(malts.filter((item) => item.recipeId === recipeId)));

/** 指定配方的酒花投放量合计 */
export const selectHopAmountByRecipe = (recipeId: string) =>
  createSelector(selectAllHops, (hops) =>
    hops.filter((item) => item.recipeId === recipeId).reduce((sum, item) => sum + item.amountG, 0)
  );
