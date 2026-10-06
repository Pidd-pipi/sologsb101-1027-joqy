/** /recipes 配方与风格台账：维护目标 OG/FG/IBU/EBC 并显示与实绩的偏差 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
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
import { StyleTagComponent } from '../../shared/components/style-tag/style-tag.component';
import { BEER_STYLES, createEmptyRecipe, type Recipe } from '../../core/models/recipe.model';
import { filtersToQueryParams, queryParamsToFilters, type FilterModel, type FilterSelectConfig } from '../../core/models/filter.model';
import { RecipeActions } from '../../core/state/recipe/recipe.actions';
import {
  selectFilteredRecipes,
  selectRecipeError,
  selectRecipeFilter,
  selectRecipeLoading,
  selectSelectedRecipe
} from '../../core/state/recipe/recipe.selectors';
import { selectAllMalts } from '../../core/state/ingredients/ingredients.selectors';
import { selectAllFerments } from '../../core/state/ferment/ferment.selectors';
import { selectAllPackagings } from '../../core/state/packaging/packaging.selectors';
import { abvFromGravity, apparentAttenuation, ebcDeviation, totalGrainKg } from '../../core/utils/brew';

@Component({
  selector: 'app-recipe-list',
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
    EmptyPanelComponent,
    StyleTagComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page__head">
        <div>
          <h2 class="page__title">配方与风格台账</h2>
          <p class="page__subtitle">维护目标 OG / FG / IBU / EBC，并按实际发酵读数实时回算偏差。</p>
        </div>
        <button mat-flat-button color="primary" type="button" (click)="openCreate()">
          <mat-icon>add</mat-icon>
          新建配方
        </button>
      </div>

      <div class="badge-row">
        <app-stat-badge label="配方数" [value]="recipes().length" suffix="个" tone="primary" icon="menu_book" />
        <app-stat-badge label="平均目标 IBU" [value]="avgTargetIbu()" suffix="IBU" tone="warning" icon="bolt" />
        <app-stat-badge label="平均目标 OG" [value]="avgTargetOg()" tone="info" icon="water_drop" />
        <app-stat-badge label="已罐装配方" [value]="packagedRecipeCount()" suffix="个" tone="success" icon="inventory_2" />
      </div>

      <app-filter-bar
        [filters]="filter()"
        [selects]="selects"
        keywordPlaceholder="搜索配方名称 / 风格…"
        (filtersChange)="onFilterChange($event)"
        (reset)="onResetFilter()"
      ></app-filter-bar>

      @if (error()) {
        <mat-card appearance="outlined"><mat-card-content>{{ error() }}</mat-card-content></mat-card>
      }

      @if (loading()) {
        <mat-card appearance="outlined"><mat-card-content>正在读取本地配方库…</mat-card-content></mat-card>
      }

      @if (recipes().length === 0) {
        <app-empty-panel
          title="还没有匹配的配方"
          description="新建一个糖化配方，再为它配置麦芽、酒花与糖化升温步。"
          createText="新建配方"
          (create)="openCreate()"
        ></app-empty-panel>
      } @else {
        <div class="grid-cards">
          @for (recipe of recipes(); track recipe.id) {
            <mat-card appearance="outlined" [style.border-color]="recipe.id === selected()?.id ? '#3f6b3a' : null">
              <mat-card-header>
                <mat-card-title>{{ recipe.name }}</mat-card-title>
                <mat-card-subtitle>
                  <app-style-tag [value]="recipe.style"></app-style-tag>
                  <span class="muted">批次 {{ recipe.batchSizeL }} L</span>
                </mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>
                <table class="data-table">
                  <tbody>
                    <tr>
                      <th>目标 OG / FG</th>
                      <td>{{ recipe.targetOg }} / {{ recipe.targetFg }}</td>
                    </tr>
                    <tr>
                      <th>目标 IBU / EBC</th>
                      <td>{{ recipe.targetIbu }} / {{ recipe.targetEbc }}</td>
                    </tr>
                    <tr>
                      <th>实绩 OG / FG</th>
                      <td>{{ realizedOg(recipe.id) }} / {{ realizedFg(recipe.id) }}</td>
                    </tr>
                    <tr>
                      <th>实绩 ABV / 发酵度</th>
                      <td>{{ realizedAbv(recipe.id) }} %vol / {{ realizedAttenuation(recipe.id) }} %</td>
                    </tr>
                    <tr>
                      <th>色度偏差</th>
                      <td [style.color]="ebcDelta(recipe) < 0 ? '#c0392b' : '#1e8449'">
                        {{ ebcDelta(recipe) > 0 ? '+' : '' }}{{ ebcDelta(recipe) }} EBC
                      </td>
                    </tr>
                    <tr>
                      <th>投料量</th>
                      <td>{{ grainKg(recipe) }} kg · 麦芽 {{ maltCount(recipe.id) }} 条</td>
                    </tr>
                  </tbody>
                </table>
              </mat-card-content>
              <mat-card-actions align="end">
                <button mat-button type="button" (click)="select(recipe.id)">设为当前</button>
                <button mat-button type="button" (click)="edit(recipe)">编辑</button>
                <button mat-button color="warn" type="button" (click)="remove(recipe)">删除</button>
              </mat-card-actions>
            </mat-card>
          }
        </div>
      }

      @if (formVisible) {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ editingId ? '编辑配方' : '新建配方' }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>配方名称</mat-label>
                <input matInput [(ngModel)]="form.name" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>风格</mat-label>
                <mat-select [(ngModel)]="form.style">
                  @for (style of beerStyles; track style) {
                    <mat-option [value]="style">{{ style }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>目标 OG</mat-label>
                <input matInput type="number" step="0.001" [(ngModel)]="form.targetOg" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>目标 FG</mat-label>
                <input matInput type="number" step="0.001" [(ngModel)]="form.targetFg" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>目标 IBU</mat-label>
                <input matInput type="number" [(ngModel)]="form.targetIbu" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>目标 EBC</mat-label>
                <input matInput type="number" [(ngModel)]="form.targetEbc" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>批次体积 L</mat-label>
                <input matInput type="number" [(ngModel)]="form.batchSizeL" />
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
  `
})
export class RecipeListComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);

  readonly beerStyles = BEER_STYLES;
  readonly recipes = this.store.selectSignal(selectFilteredRecipes);
  readonly filter = this.store.selectSignal(selectRecipeFilter);
  readonly selected = this.store.selectSignal(selectSelectedRecipe);
  readonly loading = this.store.selectSignal(selectRecipeLoading);
  readonly error = this.store.selectSignal(selectRecipeError);

  private readonly allMalts = this.store.selectSignal(selectAllMalts);
  private readonly allFerments = this.store.selectSignal(selectAllFerments);
  private readonly allPackagings = this.store.selectSignal(selectAllPackagings);

  formVisible = false;
  editingId: string | null = null;
  form: Omit<Recipe, 'id'> = createEmptyRecipe();

  readonly selects: FilterSelectConfig[] = [
    { key: 'styles', label: '风格', options: BEER_STYLES.map((style) => ({ label: style, value: style })) }
  ];

  readonly avgTargetIbu = computed(() => {
    const list = this.recipes();
    return list.length === 0 ? 0 : Math.round(list.reduce((sum, item) => sum + item.targetIbu, 0) / list.length);
  });

  readonly avgTargetOg = computed(() => {
    const list = this.recipes();
    return list.length === 0 ? 0 : Number((list.reduce((sum, item) => sum + item.targetOg, 0) / list.length).toFixed(3));
  });

  readonly packagedRecipeCount = computed(
    () => new Set(this.allPackagings().map((item) => item.recipeId)).size
  );

  ngOnInit(): void {
    this.store.dispatch(RecipeActions.reloadAll());
    this.store.dispatch(RecipeActions.selectRecipe({ id: this.route.snapshot.queryParamMap.get('recipeId') }));
    const params: Record<string, string | undefined> = {};
    this.route.snapshot.queryParamMap.keys.forEach((key) => {
      params[key] = this.route.snapshot.queryParamMap.get(key) ?? undefined;
    });
    this.store.dispatch(RecipeActions.setFilter({ filter: queryParamsToFilters(params, ['styles']) }));
  }

  /** 实际发酵首末读数 */
  private realized(recipeId: string): { og: number; fg: number } {
    const rows = this.allFerments()
      .filter((item) => item.recipeId === recipeId)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length === 0) return { og: 0, fg: 0 };
    return { og: rows[0].gravity, fg: rows[rows.length - 1].gravity };
  }

  realizedOg(recipeId: string): number {
    return this.realized(recipeId).og;
  }

  realizedFg(recipeId: string): number {
    return this.realized(recipeId).fg;
  }

  realizedAbv(recipeId: string): number {
    const { og, fg } = this.realized(recipeId);
    return abvFromGravity(og, fg);
  }

  realizedAttenuation(recipeId: string): number {
    const { og, fg } = this.realized(recipeId);
    return apparentAttenuation(og, fg);
  }

  maltCount(recipeId: string): number {
    return this.allMalts().filter((item) => item.recipeId === recipeId).length;
  }

  grainKg(recipe: Recipe): number {
    return totalGrainKg(recipe.batchSizeL, recipe.targetOg);
  }

  ebcDelta(recipe: Recipe): number {
    const malts = this.allMalts().filter((item) => item.recipeId === recipe.id);
    if (malts.length === 0) return 0;
    return ebcDeviation(malts, recipe.targetEbc);
  }

  select(id: string): void {
    this.store.dispatch(RecipeActions.selectRecipe({ id }));
  }

  openCreate(): void {
    this.editingId = null;
    this.form = createEmptyRecipe();
    this.formVisible = true;
  }

  edit(recipe: Recipe): void {
    this.editingId = recipe.id;
    this.form = {
      name: recipe.name,
      style: recipe.style,
      targetOg: recipe.targetOg,
      targetFg: recipe.targetFg,
      targetIbu: recipe.targetIbu,
      targetEbc: recipe.targetEbc,
      batchSizeL: recipe.batchSizeL
    };
    this.formVisible = true;
  }

  submit(): void {
    if (!this.form.name.trim()) {
      this.snack.open('请填写配方名称', '关闭', { duration: 2500 });
      return;
    }
    if (this.editingId) {
      this.store.dispatch(RecipeActions.updateRecipe({ id: this.editingId, patch: { ...this.form } }));
    } else {
      this.store.dispatch(RecipeActions.createRecipe({ payload: { ...this.form } }));
    }
    this.formVisible = false;
    this.snack.open('配方已保存', '关闭', { duration: 2000 });
  }

  remove(recipe: Recipe): void {
    if (!window.confirm(`删除配方「${recipe.name}」会级联删除其麦芽、酒花、糖化步、煮沸投加、发酵读数与罐装批次，是否继续？`)) {
      return;
    }
    this.store.dispatch(RecipeActions.deleteRecipe({ id: recipe.id }));
    this.snack.open('配方及其从属数据已删除', '关闭', { duration: 2500 });
  }

  onFilterChange(next: FilterModel): void {
    this.store.dispatch(RecipeActions.setFilter({ filter: next }));
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: filtersToQueryParams(next),
      replaceUrl: true
    });
  }

  onResetFilter(): void {
    this.store.dispatch(RecipeActions.resetFilter());
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }
}
