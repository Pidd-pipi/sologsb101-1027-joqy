/** /boil 煮沸投花时间表：按投加时点倒计时排列并标记用途 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { FilterBarComponent } from '../../shared/components/filter-bar/filter-bar.component';
import { StatBadgeComponent } from '../../shared/components/stat-badge/stat-badge.component';
import { EmptyPanelComponent } from '../../shared/components/empty-panel/empty-panel.component';
import { BOIL_PURPOSES, BOIL_TOTAL_MIN, createEmptyBoilAdd, type BoilAdd } from '../../core/models/boil-add.model';
import {
  filtersToQueryParams,
  queryParamsToFilters,
  type FilterModel,
  type FilterSelectConfig
} from '../../core/models/filter.model';
import { BoilActions } from '../../core/state/boil/boil.actions';
import { selectAllBoilAdds, selectBoilFilter } from '../../core/state/boil/boil.selectors';
import { selectAllHops } from '../../core/state/ingredients/ingredients.selectors';
import { selectAllRecipes, selectSelectedRecipe, selectSelectedRecipeId } from '../../core/state/recipe/recipe.selectors';
import { RecipeActions } from '../../core/state/recipe/recipe.actions';
import { estimateIbu, purposeByAtMin } from '../../core/utils/brew';

@Component({
  selector: 'app-boil-timeline',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    FilterBarComponent,
    StatBadgeComponent,
    EmptyPanelComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page__head">
        <div>
          <h2 class="page__title">煮沸投花时间表</h2>
          <p class="page__subtitle">按投加时点倒计时排列，高亮下一投加点，并按 α 酸估算 IBU。</p>
        </div>
        <button mat-flat-button color="primary" type="button" (click)="openCreate()" [disabled]="recipes().length === 0">
          <mat-icon>add</mat-icon>
          新增投加
        </button>
      </div>

      <div class="badge-row">
        <app-stat-badge label="投加条目" [value]="adds().length" suffix="条" tone="primary" icon="add_circle" />
        <app-stat-badge label="估算 IBU 合计" [value]="totalIbu()" suffix="IBU" tone="warning" icon="bolt" />
        <app-stat-badge label="目标 IBU" [value]="selectedRecipe()?.targetIbu ?? 0" suffix="IBU" tone="info" icon="flag" />
        <app-stat-badge label="IBU 偏差" [value]="ibuDelta()" tone="danger" icon="compare_arrows" />
      </div>

      <mat-card appearance="outlined">
        <mat-card-content>
          <div class="boil-recipe">
            <span class="muted">当前配方：</span>
            <mat-form-field appearance="outline" class="boil-recipe__select">
              <mat-label>选择配方</mat-label>
              <mat-select [value]="selectedRecipeId()" (selectionChange)="selectRecipe($event.value)">
                @for (recipe of recipes(); track recipe.id) {
                  <mat-option [value]="recipe.id">{{ recipe.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <span class="muted">煮沸总时长 {{ boilTotalMin }} 分钟</span>
          </div>
        </mat-card-content>
      </mat-card>

      <app-filter-bar
        [filters]="filter()"
        [selects]="selects"
        keywordPlaceholder="搜索物料 / 用途…"
        (filtersChange)="onFilterChange($event)"
        (reset)="onResetFilter()"
      ></app-filter-bar>

      @if (adds().length === 0) {
        <app-empty-panel
          title="该配方还没有煮沸投加"
          description="添加 60 分钟苦味投放与 5 分钟香气投放，时间表会自动倒计时排序。"
          createText="新增投加"
          (create)="openCreate()"
        ></app-empty-panel>
      } @else {
        <mat-card appearance="outlined">
          <mat-card-header><mat-card-title>投加时间表（按倒计时排序）</mat-card-title></mat-card-header>
          <mat-card-content>
            <table class="data-table">
              <thead>
                <tr>
                  <th>倒计时</th>
                  <th>物料</th>
                  <th>用量 g</th>
                  <th>用途</th>
                  <th>估算 IBU</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                @for (add of adds(); track add.id) {
                  <tr [class.next-row]="add.id === nextAdd()?.id">
                    <td>
                      <strong>{{ countdown(add) }}</strong>
                      @if (add.id === nextAdd()?.id) {
                        <span class="next-flag">下一投加点</span>
                      }
                    </td>
                    <td>{{ add.material }}</td>
                    <td>{{ add.amountG }}</td>
                    <td>{{ add.purpose }}<span class="muted">（{{ suggestedPurpose(add) }}）</span></td>
                    <td>{{ ibuOf(add) }}</td>
                    <td>
                      <button mat-button type="button" (click)="edit(add)">编辑</button>
                      <button mat-button color="warn" type="button" (click)="remove(add)">删除</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </mat-card-content>
        </mat-card>
      }

      @if (formVisible) {
        <mat-card appearance="outlined">
          <mat-card-header><mat-card-title>{{ editingId ? '编辑投加' : '新增投加' }}</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>所属配方</mat-label>
                <mat-select [(ngModel)]="form.recipeId">
                  @for (recipe of recipes(); track recipe.id) {
                    <mat-option [value]="recipe.id">{{ recipe.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>投加时点（剩余分钟）</mat-label>
                <input matInput type="number" [(ngModel)]="form.atMin" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>物料</mat-label>
                <input matInput [(ngModel)]="form.material" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>用量 g</mat-label>
                <input matInput type="number" [(ngModel)]="form.amountG" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>用途</mat-label>
                <mat-select [(ngModel)]="form.purpose">
                  @for (purpose of boilPurposes; track purpose) {
                    <mat-option [value]="purpose">{{ purpose }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-button type="button" (click)="formVisible = false">取消</button>
            <button mat-flat-button color="primary" type="button" (click)="submit()">保存</button>
          </mat-card-actions>
        </mat-card>
      }
    </div>
  `,
  styles: [
    `
      .boil-recipe {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .boil-recipe__select {
        width: 260px;
      }
      .next-row {
        background: #fdf6dd;
      }
      .next-flag {
        margin-left: 6px;
        background: #d68910;
        color: #fff;
        border-radius: 999px;
        padding: 1px 8px;
        font-size: 11px;
      }
    `
  ]
})
export class BoilTimelineComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);

  readonly boilPurposes = BOIL_PURPOSES;
  readonly boilTotalMin = BOIL_TOTAL_MIN;
  readonly allAdds = this.store.selectSignal(selectAllBoilAdds);
  readonly hops = this.store.selectSignal(selectAllHops);
  readonly filter = this.store.selectSignal(selectBoilFilter);
  readonly recipes = this.store.selectSignal(selectAllRecipes);
  readonly selectedRecipeId = this.store.selectSignal(selectSelectedRecipeId);
  readonly selectedRecipe = this.store.selectSignal(selectSelectedRecipe);

  readonly selects: FilterSelectConfig[] = [
    { key: 'purposes', label: '用途', options: BOIL_PURPOSES.map((purpose) => ({ label: purpose, value: purpose })) }
  ];

  readonly adds = computed(() => {
    const recipeId = this.selectedRecipeId() ?? this.recipes()[0]?.id ?? '';
    const filter = this.filter();
    const keyword = String(filter['keyword'] ?? '').trim().toLowerCase();
    const purposes = Array.isArray(filter['purposes']) ? (filter['purposes'] as string[]) : [];
    return this.allAdds()
      .filter((add) => add.recipeId === recipeId)
      .filter((add) => {
        const label = `${add.material} ${add.purpose}`.toLowerCase();
        if (keyword && !label.includes(keyword)) return false;
        if (purposes.length > 0 && !purposes.includes(add.purpose)) return false;
        return true;
      })
      .sort((a, b) => b.atMin - a.atMin);
  });

  readonly nextAdd = computed(() => this.adds().find((add) => add.atMin > 0) ?? null);

  readonly totalIbu = computed(() => Number(this.adds().reduce((sum, add) => sum + this.ibuOf(add), 0).toFixed(1)));

  readonly ibuDelta = computed(() => {
    const target = this.selectedRecipe()?.targetIbu ?? 0;
    return Number((this.totalIbu() - target).toFixed(1));
  });

  formVisible = false;
  editingId: string | null = null;
  form: Omit<BoilAdd, 'id'> = createEmptyBoilAdd();

  ngOnInit(): void {
    this.store.dispatch(RecipeActions.reloadAll());
    const params: Record<string, string | undefined> = {};
    this.route.snapshot.queryParamMap.keys.forEach((key) => {
      params[key] = this.route.snapshot.queryParamMap.get(key) ?? undefined;
    });
    this.store.dispatch(BoilActions.setFilter({ filter: queryParamsToFilters(params, ['purposes']) }));
  }

  selectRecipe(recipeId: string): void {
    this.store.dispatch(RecipeActions.selectRecipe({ id: recipeId }));
  }

  countdown(add: BoilAdd): string {
    return `还剩 ${add.atMin} 分钟`;
  }

  suggestedPurpose(add: BoilAdd): string {
    return purposeByAtMin(add.atMin);
  }

  ibuOf(add: BoilAdd): number {
    const recipe = this.selectedRecipe();
    const hop = this.hops().find((item) => item.name === add.material);
    const alpha = hop?.alphaPct ?? 8;
    return estimateIbu(alpha, add.amountG, add.atMin, recipe?.batchSizeL ?? 20, recipe?.targetOg ?? 1.055);
  }

  openCreate(): void {
    this.editingId = null;
    this.form = createEmptyBoilAdd();
    this.form.recipeId = this.selectedRecipeId() ?? this.recipes()[0]?.id ?? '';
    this.formVisible = true;
  }

  edit(add: BoilAdd): void {
    this.editingId = add.id;
    this.form = {
      recipeId: add.recipeId,
      atMin: add.atMin,
      material: add.material,
      amountG: add.amountG,
      purpose: add.purpose
    };
    this.formVisible = true;
  }

  submit(): void {
    if (!this.form.recipeId || !this.form.material.trim()) {
      this.snack.open('请选择配方并填写物料', '关闭', { duration: 2200 });
      return;
    }
    if (this.editingId) {
      this.store.dispatch(BoilActions.updateBoilAdd({ id: this.editingId, patch: { ...this.form } }));
    } else {
      this.store.dispatch(BoilActions.createBoilAdd({ payload: { ...this.form } }));
    }
    this.formVisible = false;
  }

  remove(add: BoilAdd): void {
    if (!window.confirm(`删除「${add.material}」在剩余 ${add.atMin} 分钟的投加？`)) return;
    this.store.dispatch(BoilActions.deleteBoilAdd({ id: add.id }));
  }

  onFilterChange(next: FilterModel): void {
    this.store.dispatch(BoilActions.setFilter({ filter: next }));
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: filtersToQueryParams(next),
      replaceUrl: true
    });
  }

  onResetFilter(): void {
    this.store.dispatch(BoilActions.resetFilter());
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }
}
