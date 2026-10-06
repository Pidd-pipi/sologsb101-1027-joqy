/** 麦芽与酒花（辅料库）feature 的 NgRx actions */
import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { Malt } from '../../models/malt.model';
import type { Hop } from '../../models/hop.model';
import type { HopRow, MaltRow } from '../../utils/db';

export const IngredientsActions = createActionGroup({
  source: 'Ingredients',
  events: {
    'Load Ingredients': emptyProps(),
    'Load Ingredients Success': props<{ malts: MaltRow[]; hops: HopRow[] }>(),
    'Set Filter': props<{ filter: FilterModel }>(),
    'Reset Filter': emptyProps(),
    'Create Malt': props<{ payload: Omit<Malt, 'id'> }>(),
    'Update Malt': props<{ id: string; patch: Partial<Malt> }>(),
    'Delete Malt': props<{ id: string }>(),
    'Create Hop': props<{ payload: Omit<Hop, 'id'> }>(),
    'Update Hop': props<{ id: string; patch: Partial<Hop> }>(),
    'Delete Hop': props<{ id: string }>()
  }
});
