/** 配方 feature reducer */
import { createReducer, on } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { RecipeRow } from '../../utils/db';
import { RecipeActions } from './recipe.actions';

export interface RecipeState {
  recipes: RecipeRow[];
  selectedId: string | null;
  filter: FilterModel;
  loading: boolean;
  error: string | null;
}

export const initialRecipeState: RecipeState = {
  recipes: [],
  selectedId: null,
  filter: { keyword: '', styles: [] },
  loading: false,
  error: null
};

export const recipeReducer = createReducer(
  initialRecipeState,
  on(RecipeActions.loadRecipes, (state) => ({ ...state, loading: true, error: null })),
  on(RecipeActions.loadRecipesSuccess, (state, { recipes }) => ({
    ...state,
    recipes,
    loading: false,
    selectedId: state.selectedId ?? recipes[0]?.id ?? null
  })),
  on(RecipeActions.loadFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(RecipeActions.selectRecipe, (state, { id }) => ({ ...state, selectedId: id })),
  on(RecipeActions.setFilter, (state, { filter }) => ({ ...state, filter })),
  on(RecipeActions.resetFilter, (state) => ({ ...state, filter: { keyword: '', styles: [] } })),
  on(RecipeActions.deleteRecipe, (state, { id }) => ({
    ...state,
    recipes: state.recipes.filter((item) => item.id !== id),
    selectedId: state.selectedId === id ? null : state.selectedId
  }))
);
