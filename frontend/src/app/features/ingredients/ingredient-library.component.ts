/** /ingredients 麦芽与酒花辅料库：按色度、α酸、产地筛选并统计总投料 */
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
import { createEmptyHop, HOP_FORMS, type Hop } from '../../core/models/hop.model';
import { createEmptyMalt, MALT_TYPES, type Malt } from '../../core/models/malt.model';
import { filtersToQueryParams, queryParamsToFilters, type FilterModel, type FilterSelectConfig } from '../../core/models/filter.model';
import { RecipeActions } from '../../core/state/recipe/recipe.actions';
import { selectFilteredHops, selectFilteredMalts, selectIngredientsFilter } from '../../core/state/ingredients/ingredients.selectors';
import { IngredientsActions } from '../../core/state/ingredients/ingredients.actions';
import { selectAllRecipes, selectSelectedRecipeId } from '../../core/state/recipe/recipe.selectors';
import { ebcColor as brewEbcColor, totalGrainKg, weightedEbc } from '../../core/utils/brew';

@Component({
  selector: 'app-ingredient-library',
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
          <h2 class="page__title">麦芽与酒花辅料库</h2>
          <p class="page__subtitle">按色度、α 酸与产地筛选；调整配比后自动重算加权平均色度与总投料量。</p>
        </div>
        <div>
          <button mat-stroked-button type="button" (click)="openMalt()">+ 麦芽</button>
          <button mat-flat-button color="primary" type="button" (click)="openHop()">+ 酒花</button>
        </div>
      </div>

      <div class="badge-row">
        <app-stat-badge label="麦芽条目" [value]="malts().length" suffix="条" tone="primary" icon="grass" />
        <app-stat-badge label="酒花条目" [value]="hops().length" suffix="条" tone="warning" icon="local_florist" />
        <app-stat-badge label="加权平均色度" [value]="avgEbc()" suffix="EBC" tone="info" icon="palette" />
        <app-stat-badge label="总投料量" [value]="grainKg()" suffix="kg" tone="success" icon="scale" />
        <app-stat-badge label="酒花用量合计" [value]="hopGram()" suffix="g" tone="danger" icon="bolt" />
      </div>

      <app-filter-bar
        [filters]="filter()"
        [selects]="selects"
        keywordPlaceholder="搜索麦芽 / 酒花 / 产地…"
        (filtersChange)="onFilterChange($event)"
        (reset)="onResetFilter()"
      ></app-filter-bar>

      @if (malts().length === 0 && hops().length === 0) {
        <app-empty-panel
          title="辅料库还是空的"
          description="为当前配方添加麦芽与酒花，系统会自动回算色度与用量。"
          createText="新增麦芽"
          (create)="openMalt()"
        ></app-empty-panel>
      } @else {
        <mat-card appearance="outlined">
          <mat-card-header><mat-card-title>麦芽（{{ malts().length }}）</mat-card-title></mat-card-header>
          <mat-card-content>
            <table class="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>色度 EBC</th>
                  <th>产地</th>
                  <th>占比 %</th>
                  <th>投料量 kg</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                @for (malt of malts(); track malt.id) {
                  <tr>
                    <td>{{ malt.name }}</td>
                    <td>{{ malt.type }}</td>
                    <td>
                      <span class="swatch" [style.background]="ebcColor(malt.ebc)"></span>
                      {{ malt.ebc }}
                    </td>
                    <td>{{ malt.origin }}</td>
                    <td>{{ malt.ratioPct }}</td>
                    <td>{{ maltKg(malt) }}</td>
                    <td>
                      <button mat-button type="button" (click)="editMalt(malt)">编辑</button>
                      <button mat-button color="warn" type="button" (click)="removeMalt(malt)">删除</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-header><mat-card-title>酒花（{{ hops().length }}）</mat-card-title></mat-card-header>
          <mat-card-content>
            <table class="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>形态</th>
                  <th>α 酸 %</th>
                  <th>产地</th>
                  <th>用量 g</th>
                  <th>用途倾向</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                @for (hop of hops(); track hop.id) {
                  <tr>
                    <td>{{ hop.name }}</td>
                    <td>{{ hop.form }}</td>
                    <td>{{ hop.alphaPct }}</td>
                    <td>{{ hop.origin }}</td>
                    <td>{{ hop.amountG }}</td>
                    <td>{{ hop.alphaPct >= 10 ? '苦味 / 双用' : '香气' }}</td>
                    <td>
                      <button mat-button type="button" (click)="editHop(hop)">编辑</button>
                      <button mat-button color="warn" type="button" (click)="removeHop(hop)">删除</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </mat-card-content>
        </mat-card>
      }

      @if (maltFormVisible) {
        <mat-card appearance="outlined">
          <mat-card-header><mat-card-title>{{ editingMaltId ? '编辑麦芽' : '新增麦芽' }}</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>所属配方</mat-label>
                <mat-select [(ngModel)]="maltForm.recipeId">
                  @for (recipe of recipes(); track recipe.id) {
                    <mat-option [value]="recipe.id">{{ recipe.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>名称</mat-label>
                <input matInput [(ngModel)]="maltForm.name" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>色度 EBC</mat-label>
                <input matInput type="number" [(ngModel)]="maltForm.ebc" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>产地</mat-label>
                <input matInput [(ngModel)]="maltForm.origin" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>用量占比 %</mat-label>
                <input matInput type="number" [(ngModel)]="maltForm.ratioPct" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>类型</mat-label>
                <mat-select [(ngModel)]="maltForm.type">
                  @for (type of maltTypes; track type) {
                    <mat-option [value]="type">{{ type }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-button type="button" (click)="maltFormVisible = false">取消</button>
            <button mat-flat-button color="primary" type="button" (click)="submitMalt()">保存</button>
          </mat-card-actions>
        </mat-card>
      }

      @if (hopFormVisible) {
        <mat-card appearance="outlined">
          <mat-card-header><mat-card-title>{{ editingHopId ? '编辑酒花' : '新增酒花' }}</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>所属配方</mat-label>
                <mat-select [(ngModel)]="hopForm.recipeId">
                  @for (recipe of recipes(); track recipe.id) {
                    <mat-option [value]="recipe.id">{{ recipe.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>名称</mat-label>
                <input matInput [(ngModel)]="hopForm.name" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>α 酸 %</mat-label>
                <input matInput type="number" step="0.1" [(ngModel)]="hopForm.alphaPct" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>产地</mat-label>
                <input matInput [(ngModel)]="hopForm.origin" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>形态</mat-label>
                <mat-select [(ngModel)]="hopForm.form">
                  @for (form of hopForms; track form) {
                    <mat-option [value]="form">{{ form }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>用量 g</mat-label>
                <input matInput type="number" [(ngModel)]="hopForm.amountG" />
              </mat-form-field>
            </div>
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-button type="button" (click)="hopFormVisible = false">取消</button>
            <button mat-flat-button color="primary" type="button" (click)="submitHop()">保存</button>
          </mat-card-actions>
        </mat-card>
      }
    </div>
  `,
  styles: [
    `
      .swatch {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 3px;
        margin-right: 6px;
        vertical-align: middle;
        border: 1px solid #ddd;
      }
    `
  ]
})
export class IngredientLibraryComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);

  readonly maltTypes = MALT_TYPES;
  readonly hopForms = HOP_FORMS;

  readonly malts = this.store.selectSignal(selectFilteredMalts);
  readonly hops = this.store.selectSignal(selectFilteredHops);
  readonly filter = this.store.selectSignal(selectIngredientsFilter);
  readonly recipes = this.store.selectSignal(selectAllRecipes);
  readonly selectedRecipeId = this.store.selectSignal(selectSelectedRecipeId);

  readonly selects: FilterSelectConfig[] = [
    { key: 'types', label: '麦芽类型', options: MALT_TYPES.map((type) => ({ label: type, value: type })) },
    { key: 'forms', label: '酒花形态', options: HOP_FORMS.map((form) => ({ label: form, value: form })) },
    {
      key: 'origins',
      label: '产地',
      options: ['德国', '英国', '美国', '捷克', '新西兰'].map((origin) => ({ label: origin, value: origin }))
    }
  ];

  readonly avgEbc = computed(() => {
    const list = this.malts();
    return list.length === 0 ? 0 : weightedEbc(list);
  });

  readonly grainKg = computed(() => {
    const recipe = this.recipes().find((item) => item.id === this.selectedRecipeId()) ?? this.recipes()[0];
    if (!recipe) return 0;
    return totalGrainKg(recipe.batchSizeL, recipe.targetOg);
  });

  readonly hopGram = computed(() => this.hops().reduce((sum, item) => sum + item.amountG, 0));

  maltFormVisible = false;
  hopFormVisible = false;
  editingMaltId: string | null = null;
  editingHopId: string | null = null;
  maltForm: Omit<Malt, 'id'> = createEmptyMalt();
  hopForm: Omit<Hop, 'id'> = createEmptyHop();

  ngOnInit(): void {
    this.store.dispatch(RecipeActions.reloadAll());
    const params: Record<string, string | undefined> = {};
    this.route.snapshot.queryParamMap.keys.forEach((key) => {
      params[key] = this.route.snapshot.queryParamMap.get(key) ?? undefined;
    });
    this.store.dispatch(
      IngredientsActions.setFilter({ filter: queryParamsToFilters(params, ['types', 'forms', 'origins']) })
    );
  }

  ebcColor(ebc: number): string {
    return brewEbcColor(ebc);
  }

  maltKg(malt: Malt): number {
    return Number(((this.grainKg() * malt.ratioPct) / 100).toFixed(2));
  }

  openMalt(): void {
    this.editingMaltId = null;
    this.maltForm = createEmptyMalt();
    this.maltForm.recipeId = this.selectedRecipeId() ?? this.recipes()[0]?.id ?? '';
    this.maltFormVisible = true;
  }

  editMalt(malt: Malt): void {
    this.editingMaltId = malt.id;
    this.maltForm = {
      recipeId: malt.recipeId,
      name: malt.name,
      ebc: malt.ebc,
      origin: malt.origin,
      ratioPct: malt.ratioPct,
      type: malt.type
    };
    this.maltFormVisible = true;
  }

  submitMalt(): void {
    if (!this.maltForm.recipeId || !this.maltForm.name.trim()) {
      this.snack.open('请选择配方并填写麦芽名称', '关闭', { duration: 2500 });
      return;
    }
    if (this.editingMaltId) {
      this.store.dispatch(IngredientsActions.updateMalt({ id: this.editingMaltId, patch: { ...this.maltForm } }));
    } else {
      this.store.dispatch(IngredientsActions.createMalt({ payload: { ...this.maltForm } }));
    }
    this.maltFormVisible = false;
    this.snack.open('麦芽已保存，色度与投料量已重算', '关闭', { duration: 2500 });
  }

  removeMalt(malt: Malt): void {
    if (!window.confirm(`删除麦芽「${malt.name}」？`)) return;
    this.store.dispatch(IngredientsActions.deleteMalt({ id: malt.id }));
  }

  openHop(): void {
    this.editingHopId = null;
    this.hopForm = createEmptyHop();
    this.hopForm.recipeId = this.selectedRecipeId() ?? this.recipes()[0]?.id ?? '';
    this.hopFormVisible = true;
  }

  editHop(hop: Hop): void {
    this.editingHopId = hop.id;
    this.hopForm = {
      recipeId: hop.recipeId,
      name: hop.name,
      alphaPct: hop.alphaPct,
      origin: hop.origin,
      form: hop.form,
      amountG: hop.amountG
    };
    this.hopFormVisible = true;
  }

  submitHop(): void {
    if (!this.hopForm.recipeId || !this.hopForm.name.trim()) {
      this.snack.open('请选择配方并填写酒花名称', '关闭', { duration: 2500 });
      return;
    }
    if (this.editingHopId) {
      this.store.dispatch(IngredientsActions.updateHop({ id: this.editingHopId, patch: { ...this.hopForm } }));
    } else {
      this.store.dispatch(IngredientsActions.createHop({ payload: { ...this.hopForm } }));
    }
    this.hopFormVisible = false;
  }

  removeHop(hop: Hop): void {
    if (!window.confirm(`删除酒花「${hop.name}」？`)) return;
    this.store.dispatch(IngredientsActions.deleteHop({ id: hop.id }));
  }

  onFilterChange(next: FilterModel): void {
    this.store.dispatch(IngredientsActions.setFilter({ filter: next }));
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: filtersToQueryParams(next),
      replaceUrl: true
    });
  }

  onResetFilter(): void {
    this.store.dispatch(IngredientsActions.resetFilter());
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }
}
