/**
 * 发酵 feature effects：加载发酵读数与罐装批次，并把增删改写回 IndexedDB。
 */
import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import type { Action } from '@ngrx/store';
import { catchError, exhaustMap, forkJoin, from, map, of, switchMap } from 'rxjs';
import { RecipeService } from '../../services/recipe.service';
import { PackagingActions } from '../packaging/packaging.actions';
import { RecipeActions } from '../recipe/recipe.actions';
import { FermentActions } from './ferment.actions';

@Injectable()
export class FermentEffects {
  private readonly actions$ = inject(Actions);
  private readonly service = inject(RecipeService);

  /** 配方页广播 Reload All 时也一并刷新发酵与罐装数据 */
  reload$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FermentActions.loadFerments, RecipeActions.reloadAll),
      switchMap(() =>
        forkJoin({
          ferments: from(this.service.listFerments()),
          packagings: from(this.service.listPackagings())
        }).pipe(
          switchMap((data) => [
            FermentActions.loadFermentsSuccess({ ferments: data.ferments }),
            PackagingActions.loadPackagingsSuccess({ packagings: data.packagings })
          ]),
          catchError((error: unknown) =>
            of(
              FermentActions.loadFermentsFailure({
                error: error instanceof Error ? error.message : '本地数据读取失败'
              })
            )
          )
        )
      )
    )
  );

  /** 发酵读数与罐装批次的增删改 */
  mutation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        FermentActions.createFerment,
        FermentActions.updateFerment,
        FermentActions.deleteFerment,
        PackagingActions.createPackaging,
        PackagingActions.updatePackaging,
        PackagingActions.deletePackaging
      ),
      exhaustMap((action) =>
        from(this.persist(action)).pipe(
          map(() => FermentActions.loadFerments()),
          catchError((error: unknown) =>
            of(
              FermentActions.loadFermentsFailure({
                error: error instanceof Error ? error.message : '保存失败'
              })
            )
          )
        )
      )
    )
  );

  private persist(action: Action): Promise<unknown> {
    const payload = action as unknown as Record<string, unknown>;
    switch (action.type) {
      case FermentActions.createFerment.type:
        return this.service.createFerment(payload['payload'] as never);
      case FermentActions.updateFerment.type:
        return this.service.updateFerment(payload['id'] as string, payload['patch'] as never);
      case FermentActions.deleteFerment.type:
        return this.service.deleteFerment(payload['id'] as string);
      case PackagingActions.createPackaging.type:
        return this.service.createPackaging(payload['payload'] as never);
      case PackagingActions.updatePackaging.type:
        return this.service.updatePackaging(payload['id'] as string, payload['patch'] as never);
      default:
        return this.service.deletePackaging(payload['id'] as string);
    }
  }
}
