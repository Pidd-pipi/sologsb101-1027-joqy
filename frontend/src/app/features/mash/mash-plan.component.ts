/** /mash 糖化升温步编排与洗糟记录：拖拽调序、逐条签署完成 */
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
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
import { StyleTagComponent } from '../../shared/components/style-tag/style-tag.component';
import { createEmptyMashStep, MASH_STATES, type MashStep } from '../../core/models/mash-step.model';
import {
  filtersToQueryParams,
  queryParamsToFilters,
  type FilterModel,
  type FilterSelectConfig
} from '../../core/models/filter.model';
import { MashActions } from '../../core/state/mash/mash.actions';
import { selectAllMashSteps, selectMashFilter } from '../../core/state/mash/mash.selectors';
import { selectAllRecipes, selectSelectedRecipeId } from '../../core/state/recipe/recipe.selectors';
import { RecipeActions } from '../../core/state/recipe/recipe.actions';

@Component({
  selector: 'app-mash-plan',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
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
          <h2 class="page__title">糖化升温步编排与洗糟记录</h2>
          <p class="page__subtitle">拖拽卡片或用上下移按钮调整升温步先后，全部完成即回写配方最近糖化时间。</p>
        </div>
        <button mat-flat-button color="primary" type="button" (click)="openCreate()" [disabled]="recipes().length === 0">
          <mat-icon>add</mat-icon>
          新增升温步
        </button>
      </div>

      <mat-card appearance="outlined">
        <mat-card-content>
          <div class="badge-row">
            <app-stat-badge label="升温步" [value]="steps().length" suffix="步" tone="primary" icon="thermostat" />
            <app-stat-badge label="总时长" [value]="totalMinutes()" suffix="min" tone="warning" icon="schedule" />
            <app-stat-badge label="总水量" [value]="totalWater()" suffix="L" tone="info" icon="water_drop" />
            <app-stat-badge label="完成进度" [value]="doneRatio()" [percent]="doneRatio()" [showPercent]="true" tone="success" icon="task_alt" />
          </div>
          <div class="mash-recipe">
            <span class="muted">当前配方：</span>
            <mat-form-field appearance="outline" class="mash-recipe__select">
              <mat-label>选择配方</mat-label>
              <mat-select [value]="selectedRecipeId()" (selectionChange)="selectRecipe($event.value)">
                @for (recipe of recipes(); track recipe.id) {
                  <mat-option [value]="recipe.id">{{ recipe.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
        </mat-card-content>
      </mat-card>

      <app-filter-bar
        [filters]="filter()"
        [selects]="selects"
        keywordPlaceholder="搜索温度 / 状态…"
        (filtersChange)="onFilterChange($event)"
        (reset)="onResetFilter()"
      ></app-filter-bar>

      @if (steps().length === 0) {
        <app-empty-panel
          title="该配方还没有糖化步"
          description="添加 52 ℃ 蛋白休止、66 ℃ 糖化休止与 76 ℃ 洗糟等升温步，并拖拽排出顺序。"
          createText="新增升温步"
          (create)="openCreate()"
        ></app-empty-panel>
      } @else {
        <div cdkDropList class="mash-list" (cdkDropListDropped)="drop($event)">
          @for (step of steps(); track step.id; let index = $index) {
            <mat-card appearance="outlined" cdkDrag class="mash-item">
              <mat-card-content class="mash-item__content">
                <mat-icon class="drag-handle" cdkDragHandle>drag_indicator</mat-icon>
                <div class="mash-item__seq">#{{ step.seq }}</div>
                <div class="mash-item__body">
                  <div class="mash-item__title">
                    <strong>{{ step.tempC }} ℃</strong>
                    <app-style-tag [value]="step.state"></app-style-tag>
                    <span class="muted">{{ step.minutes }} min · 水量 {{ step.waterL }} L</span>
                  </div>
                  <div class="muted">温度 {{ step.tempC }} ℃ 保温 {{ step.minutes }} 分钟，洗糟用水 {{ step.waterL }} L</div>
                </div>
                <div class="mash-item__actions">
                  <button mat-button type="button" [disabled]="index === 0" (click)="move(index, -1)">上移</button>
                  <button mat-button type="button" [disabled]="index === steps().length - 1" (click)="move(index, 1)">
                    下移
                  </button>
                  @if (step.state !== '已完成') {
                    <button mat-button color="primary" type="button" (click)="complete(step)">签署完成</button>
                  }
                  <button mat-button type="button" (click)="edit(step)">编辑</button>
                  <button mat-button color="warn" type="button" (click)="remove(step)">删除</button>
                </div>
              </mat-card-content>
            </mat-card>
          }
        </div>
      }

      @if (formVisible) {
        <mat-card appearance="outlined">
          <mat-card-header><mat-card-title>{{ editingId ? '编辑升温步' : '新增升温步' }}</mat-card-title></mat-card-header>
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
                <mat-label>温度 ℃</mat-label>
                <input matInput type="number" [(ngModel)]="form.tempC" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>时长 min</mat-label>
                <input matInput type="number" [(ngModel)]="form.minutes" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>水量 L</mat-label>
                <input matInput type="number" [(ngModel)]="form.waterL" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>状态</mat-label>
                <mat-select [(ngModel)]="form.state">
                  @for (state of mashStates; track state) {
                    <mat-option [value]="state">{{ state }}</mat-option>
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
      .mash-recipe {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
      }
      .mash-recipe__select {
        width: 260px;
      }
      .mash-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .mash-item__content {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .mash-item__seq {
        width: 38px;
        font-weight: 700;
        color: #3f6b3a;
      }
      .mash-item__body {
        flex: 1;
      }
      .mash-item__title {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .mash-item__actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
    `
  ]
})
export class MashPlanComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);

  readonly mashStates = MASH_STATES;
  readonly allSteps = this.store.selectSignal(selectAllMashSteps);
  readonly filter = this.store.selectSignal(selectMashFilter);
  readonly recipes = this.store.selectSignal(selectAllRecipes);
  readonly selectedRecipeId = this.store.selectSignal(selectSelectedRecipeId);

  readonly selects: FilterSelectConfig[] = [
    { key: 'states', label: '状态', options: MASH_STATES.map((state) => ({ label: state, value: state })) }
  ];

  readonly steps = computed(() => {
    const recipeId = this.selectedRecipeId() ?? this.recipes()[0]?.id ?? '';
    const filter = this.filter();
    const keyword = String(filter['keyword'] ?? '').trim().toLowerCase();
    const states = Array.isArray(filter['states']) ? (filter['states'] as string[]) : [];
    return this.allSteps()
      .filter((step) => step.recipeId === recipeId)
      .filter((step) => {
        const label = `${step.tempC} ${step.state}`.toLowerCase();
        if (keyword && !label.includes(keyword)) return false;
        if (states.length > 0 && !states.includes(step.state)) return false;
        return true;
      })
      .sort((a, b) => a.seq - b.seq);
  });

  readonly totalMinutes = computed(() => this.steps().reduce((sum, item) => sum + item.minutes, 0));
  readonly totalWater = computed(() => this.steps().reduce((sum, item) => sum + item.waterL, 0));
  readonly doneRatio = computed(() => {
    const list = this.steps();
    if (list.length === 0) return 0;
    return Math.round((list.filter((item) => item.state === '已完成').length / list.length) * 100);
  });

  formVisible = false;
  editingId: string | null = null;
  form: Omit<MashStep, 'id' | 'seq'> = createEmptyMashStep();

  ngOnInit(): void {
    this.store.dispatch(RecipeActions.reloadAll());
    const params: Record<string, string | undefined> = {};
    this.route.snapshot.queryParamMap.keys.forEach((key) => {
      params[key] = this.route.snapshot.queryParamMap.get(key) ?? undefined;
    });
    this.store.dispatch(MashActions.setFilter({ filter: queryParamsToFilters(params, ['states']) }));
  }

  selectRecipe(recipeId: string): void {
    this.store.dispatch(RecipeActions.selectRecipe({ id: recipeId }));
  }

  drop(event: CdkDragDrop<unknown>): void {
    if (event.previousIndex === event.currentIndex) return;
    const ids = this.steps().map((item) => item.id);
    moveItemInArray(ids, event.previousIndex, event.currentIndex);
    this.store.dispatch(MashActions.reorderMashSteps({ orderedIds: ids }));
    this.snack.open('糖化顺序已更新并写回本地库', '关闭', { duration: 2000 });
  }

  move(index: number, offset: number): void {
    const ids = this.steps().map((item) => item.id);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    moveItemInArray(ids, index, target);
    this.store.dispatch(MashActions.reorderMashSteps({ orderedIds: ids }));
  }

  complete(step: MashStep): void {
    this.store.dispatch(MashActions.updateMashStep({ id: step.id, patch: { state: '已完成' } }));
    this.snack.open('已签署完成', '关闭', { duration: 1800 });
  }

  openCreate(): void {
    this.editingId = null;
    this.form = createEmptyMashStep();
    this.form.recipeId = this.selectedRecipeId() ?? this.recipes()[0]?.id ?? '';
    this.formVisible = true;
  }

  edit(step: MashStep): void {
    this.editingId = step.id;
    this.form = {
      recipeId: step.recipeId,
      tempC: step.tempC,
      minutes: step.minutes,
      waterL: step.waterL,
      state: step.state
    };
    this.formVisible = true;
  }

  submit(): void {
    if (!this.form.recipeId) {
      this.snack.open('请选择配方', '关闭', { duration: 2000 });
      return;
    }
    if (this.editingId) {
      this.store.dispatch(MashActions.updateMashStep({ id: this.editingId, patch: { ...this.form } }));
    } else {
      this.store.dispatch(MashActions.createMashStep({ payload: { ...this.form } }));
    }
    this.formVisible = false;
  }

  remove(step: MashStep): void {
    if (!window.confirm(`删除第 ${step.seq} 步（${step.tempC} ℃）？`)) return;
    this.store.dispatch(MashActions.deleteMashStep({ id: step.id }));
  }

  onFilterChange(next: FilterModel): void {
    this.store.dispatch(MashActions.setFilter({ filter: next }));
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: filtersToQueryParams(next),
      replaceUrl: true
    });
  }

  onResetFilter(): void {
    this.store.dispatch(MashActions.resetFilter());
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }
}
