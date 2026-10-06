/** 煮沸投加 feature reducer */
import { createReducer, on } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { BoilAddRow } from '../../utils/db';
import { BoilActions } from './boil.actions';

export interface BoilState {
  adds: BoilAddRow[];
  filter: FilterModel;
}

export const initialBoilState: BoilState = {
  adds: [],
  filter: { keyword: '', purposes: [] }
};

export const boilReducer = createReducer(
  initialBoilState,
  on(BoilActions.loadBoilAddsSuccess, (state, { adds }) => ({ ...state, adds })),
  on(BoilActions.setFilter, (state, { filter }) => ({ ...state, filter })),
  on(BoilActions.resetFilter, (state) => ({ ...state, filter: { keyword: '', purposes: [] } }))
);
