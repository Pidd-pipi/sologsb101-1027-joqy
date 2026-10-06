/** 糖化步 feature 的 NgRx actions */
import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { MashStep } from '../../models/mash-step.model';
import type { MashStepRow } from '../../utils/db';

export const MashActions = createActionGroup({
  source: 'Mash',
  events: {
    'Load Mash Steps': emptyProps(),
    'Load Mash Steps Success': props<{ steps: MashStepRow[] }>(),
    'Set Filter': props<{ filter: FilterModel }>(),
    'Reset Filter': emptyProps(),
    'Create Mash Step': props<{ payload: Omit<MashStep, 'id' | 'seq'> }>(),
    'Update Mash Step': props<{ id: string; patch: Partial<MashStep> }>(),
    'Delete Mash Step': props<{ id: string }>(),
    'Reorder Mash Steps': props<{ orderedIds: string[] }>()
  }
});
