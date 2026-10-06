/** 糖化步 feature reducer */
import { createReducer, on } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { MashStepRow } from '../../utils/db';
import { MashActions } from './mash.actions';

export interface MashState {
  steps: MashStepRow[];
  filter: FilterModel;
}

export const initialMashState: MashState = {
  steps: [],
  filter: { keyword: '', states: [] }
};

export const mashReducer = createReducer(
  initialMashState,
  on(MashActions.loadMashStepsSuccess, (state, { steps }) => ({ ...state, steps })),
  on(MashActions.setFilter, (state, { filter }) => ({ ...state, filter })),
  on(MashActions.resetFilter, (state) => ({ ...state, filter: { keyword: '', states: [] } }))
);
