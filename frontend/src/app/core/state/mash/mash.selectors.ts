/** 糖化步 feature selectors */
import { createFeatureSelector, createSelector } from '@ngrx/store';
import { MashState } from './mash.reducer';

export const selectMashState = createFeatureSelector<MashState>('mash');

export const selectAllMashSteps = createSelector(selectMashState, (state) => state.steps);
export const selectMashFilter = createSelector(selectMashState, (state) => state.filter);

export const selectMashStepsByRecipe = (recipeId: string) =>
  createSelector(selectAllMashSteps, selectMashFilter, (steps, filter) => {
    const keyword = String(filter['keyword'] ?? '').trim().toLowerCase();
    const states = Array.isArray(filter['states']) ? (filter['states'] as string[]) : [];
    return steps
      .filter((step) => step.recipeId === recipeId)
      .filter((step) => {
        const label = `${step.tempC} ${step.state}`.toLowerCase();
        if (keyword && !label.includes(keyword)) return false;
        if (states.length > 0 && !states.includes(step.state)) return false;
        return true;
      })
      .sort((a, b) => a.seq - b.seq);
  });

/** 某配方的糖化总时长（min） */
export const selectMashMinutesByRecipe = (recipeId: string) =>
  createSelector(selectAllMashSteps, (steps) =>
    steps.filter((item) => item.recipeId === recipeId).reduce((sum, item) => sum + item.minutes, 0)
  );

/** 某配方是否全部糖化步已完成 */
export const selectMashCompletedByRecipe = (recipeId: string) =>
  createSelector(selectAllMashSteps, (steps) => {
    const own = steps.filter((item) => item.recipeId === recipeId);
    return own.length > 0 && own.every((item) => item.state === '已完成');
  });
