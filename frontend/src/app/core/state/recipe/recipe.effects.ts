/**
 * 配方 feature effects：把 NgRx actions 转成 Dexie 读写。
 * 所有变更动作完成后统一广播 Reload All，保证跨表数据一致。
 */
import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import type { Action } from '@ngrx/store';
import { catchError, exhaustMap, forkJoin, from, map, of, switchMap } from 'rxjs';
import { RecipeService } from '../../services/recipe.service';
import { IngredientsActions } from '../ingredients/ingredients.actions';
import { MashActions } from '../mash/mash.actions';
import { BoilActions } from '../boil/boil.actions';
import { RecipeActions } from './recipe.actions';

@Injectable()
export class RecipeEffects {
  private readonly actions$ = inject(Actions);
  private readonly service = inject(RecipeService);

  /** 一次性加载配方主表 + 全部从属表 */
  reloadAll$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RecipeActions.reloadAll),
      switchMap(() =>
        forkJoin({
          recipes: from(this.service.listRecipes()),
          malts: from(this.service.listMalts()),
          hops: from(this.service.listHops()),
          mashSteps: from(this.service.listMashSteps()),
          boilAdds: from(this.service.listBoilAdds())
        }).pipe(
          switchMap((data) => [
            RecipeActions.loadRecipesSuccess({ recipes: data.recipes }),
            IngredientsActions.loadIngredientsSuccess({ malts: data.malts, hops: data.hops }),
            MashActions.loadMashStepsSuccess({ steps: data.mashSteps }),
            BoilActions.loadBoilAddsSuccess({ adds: data.boilAdds })
          ]),
          catchError((error: unknown) =>
            of(RecipeActions.loadFailure({ error: error instanceof Error ? error.message : '本地数据读取失败' }))
          )
        )
      )
    )
  );

  /** 配方增删改 */
  recipeMutation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RecipeActions.createRecipe, RecipeActions.updateRecipe, RecipeActions.deleteRecipe),
      exhaustMap((action) => {
        const task = (): Promise<unknown> => {
          switch (action.type) {
            case RecipeActions.createRecipe.type:
              return this.service.createRecipe(action.payload);
            case RecipeActions.updateRecipe.type:
              return this.service.updateRecipe(action.id, action.patch);
            default:
              return this.service.deleteRecipe((action as { id: string }).id);
          }
        };
        return from(task()).pipe(
          map(() => RecipeActions.reloadAll()),
          catchError((error: unknown) =>
            of(RecipeActions.loadFailure({ error: error instanceof Error ? error.message : '保存失败' }))
          )
        );
      })
    )
  );

  /** 麦芽 / 酒花 / 糖化步 / 煮沸投加的增删改 */
  ingredientMutation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        IngredientsActions.createMalt,
        IngredientsActions.updateMalt,
        IngredientsActions.deleteMalt,
        IngredientsActions.createHop,
        IngredientsActions.updateHop,
        IngredientsActions.deleteHop,
        MashActions.createMashStep,
        MashActions.updateMashStep,
        MashActions.deleteMashStep,
        MashActions.reorderMashSteps,
        BoilActions.createBoilAdd,
        BoilActions.updateBoilAdd,
        BoilActions.deleteBoilAdd
      ),
      exhaustMap((action) =>
        from(this.persistIngredient(action)).pipe(
          map(() => RecipeActions.reloadAll()),
          catchError((error: unknown) =>
            of(RecipeActions.loadFailure({ error: error instanceof Error ? error.message : '保存失败' }))
          )
        )
      )
    )
  );

  private persistIngredient(action: Action): Promise<unknown> {
    const payload = action as unknown as Record<string, unknown>;
    switch (action.type) {
      case IngredientsActions.createMalt.type:
        return this.service.createMalt(payload['payload'] as never);
      case IngredientsActions.updateMalt.type:
        return this.service.updateMalt(payload['id'] as string, payload['patch'] as never);
      case IngredientsActions.deleteMalt.type:
        return this.service.deleteMalt(payload['id'] as string);
      case IngredientsActions.createHop.type:
        return this.service.createHop(payload['payload'] as never);
      case IngredientsActions.updateHop.type:
        return this.service.updateHop(payload['id'] as string, payload['patch'] as never);
      case IngredientsActions.deleteHop.type:
        return this.service.deleteHop(payload['id'] as string);
      case MashActions.createMashStep.type:
        return this.service.createMashStep(payload['payload'] as never);
      case MashActions.updateMashStep.type:
        return this.service.updateMashStep(payload['id'] as string, payload['patch'] as never);
      case MashActions.deleteMashStep.type:
        return this.service.deleteMashStep(payload['id'] as string);
      case MashActions.reorderMashSteps.type:
        return this.service.reorderMashSteps(payload['orderedIds'] as string[]);
      case BoilActions.createBoilAdd.type:
        return this.service.createBoilAdd(payload['payload'] as never);
      case BoilActions.updateBoilAdd.type:
        return this.service.updateBoilAdd(payload['id'] as string, payload['patch'] as never);
      default:
        return this.service.deleteBoilAdd(payload['id'] as string);
    }
  }
}
