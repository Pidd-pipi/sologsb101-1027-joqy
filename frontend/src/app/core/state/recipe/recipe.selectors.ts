/** 配方 feature selectors */
import { createFeatureSelector, createSelector } from '@ngrx/store';
import { RecipeState } from './recipe.reducer';

export const selectRecipeState = createFeatureSelector<RecipeState>('recipe');

export const selectAllRecipes = createSelector(selectRecipeState, (state) => state.recipes);
export const selectRecipeFilter = createSelector(selectRecipeState, (state) => state.filter);
export const selectSelectedRecipeId = createSelector(selectRecipeState, (state) => state.selectedId);
export const selectRecipeLoading = createSelector(selectRecipeState, (state) => state.loading);
export const selectRecipeError = createSelector(selectRecipeState, (state) => state.error);

export const selectFilteredRecipes = createSelector(selectAllRecipes, selectRecipeFilter, (recipes, filter) => {
  const keyword = String(filter['keyword'] ?? '').trim().toLowerCase();
  const styles = Array.isArray(filter['styles']) ? (filter['styles'] as string[]) : [];
  return recipes.filter((recipe) => {
    const label = `${recipe.name} ${recipe.style}`.toLowerCase();
    if (keyword && !label.includes(keyword)) return false;
    if (styles.length > 0 && !styles.includes(recipe.style)) return false;
    return true;
  });
});

export const selectSelectedRecipe = createSelector(
  selectAllRecipes,
  selectSelectedRecipeId,
  (recipes, id) => recipes.find((item) => item.id === id) ?? null
);

export const selectRecipeCount = createSelector(selectAllRecipes, (recipes) => recipes.length);
