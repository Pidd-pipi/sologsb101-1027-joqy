/** 辅料库 feature reducer */
import { createReducer, on } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { HopRow, MaltRow } from '../../utils/db';
import { IngredientsActions } from './ingredients.actions';

export interface IngredientsState {
  malts: MaltRow[];
  hops: HopRow[];
  filter: FilterModel;
}

export const initialIngredientsState: IngredientsState = {
  malts: [],
  hops: [],
  filter: { keyword: '', types: [], forms: [], origins: [] }
};

export const ingredientsReducer = createReducer(
  initialIngredientsState,
  on(IngredientsActions.loadIngredientsSuccess, (state, { malts, hops }) => ({ ...state, malts, hops })),
  on(IngredientsActions.setFilter, (state, { filter }) => ({ ...state, filter })),
  on(IngredientsActions.resetFilter, (state) => ({
    ...state,
    filter: { keyword: '', types: [], forms: [], origins: [] }
  }))
);
