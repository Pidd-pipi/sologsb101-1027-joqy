/** 配方 feature 的 NgRx actions */
import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { Recipe } from '../../models/recipe.model';
import type { FilterModel } from '../../models/filter.model';
import type { RecipeRow } from '../../utils/db';

export const RecipeActions = createActionGroup({
  source: 'Recipe',
  events: {
    'Load Recipes': emptyProps(),
    'Load Recipes Success': props<{ recipes: RecipeRow[] }>(),
    'Load Failure': props<{ error: string }>(),
    'Reload All': emptyProps(),
    'Select Recipe': props<{ id: string | null }>(),
    'Set Filter': props<{ filter: FilterModel }>(),
    'Reset Filter': emptyProps(),
    'Create Recipe': props<{ payload: Omit<Recipe, 'id'> }>(),
    'Update Recipe': props<{ id: string; patch: Partial<Recipe> }>(),
    'Delete Recipe': props<{ id: string }>()
  }
});
