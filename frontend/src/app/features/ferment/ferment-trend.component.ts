/** /ferment 发酵比重与双乙酰还原跟踪：趋势读数与超温标记 */
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
import {
  createEmptyFerment,
  DIACETYL_THRESHOLD,
  FERMENT_STATES,
  type Ferment
} from '../../core/models/ferment.model';
import {
  filtersToQueryParams,
  queryParamsToFilters,
  type FilterModel,
  type FilterSelectConfig
} from '../../core/models/filter.model';
import { FermentActions } from '../../core/state/ferment/ferment.actions';
import {
  selectAllFerments,
  selectBatchNumbers,
  selectCurrentBatchFerments,
  selectCurrentBatchMetrics,
  selectFermentFilter,
  selectSelectedBatchNo
} from '../../core/state/ferment/ferment.selectors';
import { selectAllRecipes, selectSelectedRecipeId } from '../../core/state/recipe/recipe.selectors';
import { RecipeActions } from '../../core/state/recipe/recipe.actions';

@Component({
  selector: 'app-ferment-trend',
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
          <h2 class="page__title">发酵比重与双乙酰还原跟踪</h2>
          <p class="page__subtitle">
            逐日录入比重、温度与双乙酰；超过 24 ℃ 标记超温，双乙酰低于 {{ diacetylThreshold }} ppm 提示还原完成。
          </p>
        </div>
        <button mat-flat-button color="primary" type="button" (click)="openCreate()" [disabled]="recipes().length === 0">
          <mat-icon>add</mat-icon>
          录入读数
        </button>
      </div>

      <div class="badge-row">
        <app-stat-badge label="批次数" [value]="batches().length" suffix="个" tone="primary" icon="inventory" />
        <app-stat-badge label="当前批次读数" [value]="metrics().points.length" suffix="条" tone="info" icon="timeline" />
        <app-stat-badge label="OG / FG" [value]="metrics().og + ' / ' + metrics().fg" tone="default" icon="water_drop" />
        <app-stat-badge label="表观发酵度" [value]="metrics().attenuation" suffix="%" tone="success" icon="percent" />
        <app-stat-badge label="估算 ABV" [value]="metrics().abv" suffix="%vol" tone="warning" icon="local_bar" />
        <app-stat-badge label="超温天数" [value]="metrics().overTempDays" suffix="天" tone="danger" icon="thermostat" />
      </div>

      <mat-card appearance="outlined">
        <mat-card-content>
          <div class="ferment-batch">
            <mat-form-field appearance="outline" class="ferment-batch__select">
              <mat-label>选择批次</mat-label>
              <mat-select [value]="selectedBatchNo()" (selectionChange)="selectBatch($event.value)">
                @for (batch of batches(); track batch) {
                  <mat-option [value]="batch">{{ batch }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (metrics().diacetylCleared) {
              <span class="hint hint--ok">双乙酰已低于阈值，可升温还原完成</span>
            } @else {
              <span class="hint">双乙酰尚未达标，继续保持还原温度</span>
            }
            @if (metrics().stuck) {
              <span class="hint hint--warn">疑似发酵停滞：末尾两次比重下降速率低于 0.002</span>
            }
          </div>
        </mat-card-content>
      </mat-card>

      <app-filter-bar
        [filters]="filter()"
        [selects]="selects"
        keywordPlaceholder="搜索批次号 / 阶段 / 日期…"
        (filtersChange)="onFilterChange($event)"
        (reset)="onResetFilter()"
      ></app-filter-bar>

      @if (currentReadings().length === 0) {
        <app-empty-panel
          title="该批次还没有读数"
          description="从接种当天开始逐日录入比重与温度，趋势条会实时更新。"
          createText="录入读数"
          (create)="openCreate()"
        ></app-empty-panel>
      } @else {
        <mat-card appearance="outlined">
          <mat-card-header><mat-card-title>比重趋势（条高按比重区间归一）</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="trend">
              @for (point of metrics().points; track point.date) {
                <div class="trend__item" [title]="point.date + ' · ' + point.gravity">
                  <div
                    class="trend__fill"
                    [class.trend__fill--over]="point.overTemp"
                    [style.height.%]="barHeight(point.gravity)"
                  ></div>
                  <span class="trend__label">{{ point.date.slice(5) }}</span>
                </div>
              }
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-header><mat-card-title>读数明细</mat-card-title></mat-card-header>
          <mat-card-content>
            <table class="data-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>比重</th>
                  <th>温度 ℃</th>
                  <th>双乙酰 ppm</th>
                  <th>下降速率 / 日</th>
                  <th>阶段</th>
                  <th>记录</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                @for (reading of currentReadings(); track reading.id) {
                  <tr>
                    <td>{{ reading.date }}</td>
                    <td>{{ reading.gravity }}</td>
                    <td [class.over-temp]="reading.tempC > 24">{{ reading.tempC }}</td>
                    <td>{{ reading.diacetylPpm }}</td>
                    <td>{{ declineOf(reading.date) }}</td>
                    <td><app-style-tag [value]="reading.state"></app-style-tag></td>
                    <td class="muted">{{ reading.batchNo }}</td>
                    <td>
                      <button mat-button type="button" (click)="edit(reading)">编辑</button>
                      <button mat-button color="warn" type="button" (click)="remove(reading)">删除</button>
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
          <mat-card-header><mat-card-title>{{ editingId ? '编辑读数' : '录入读数' }}</mat-card-title></mat-card-header>
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
                <mat-label>批次号</mat-label>
                <input matInput [(ngModel)]="form.batchNo" placeholder="如：B-2401" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>日期</mat-label>
                <input matInput type="date" [(ngModel)]="form.date" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>比重</mat-label>
                <input matInput type="number" step="0.001" [(ngModel)]="form.gravity" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>温度 ℃</mat-label>
                <input matInput type="number" step="0.1" [(ngModel)]="form.tempC" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>双乙酰 ppm</mat-label>
                <input matInput type="number" step="0.01" [(ngModel)]="form.diacetylPpm" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>阶段</mat-label>
                <mat-select [(ngModel)]="form.state">
                  @for (state of fermentStates; track state) {
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
      .ferment-batch {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
      }
      .ferment-batch__select {
        width: 220px;
      }
      .hint {
        font-size: 12px;
        color: #6f7a68;
        background: #f3f4ee;
        border-radius: 999px;
        padding: 3px 12px;
      }
      .hint--ok {
        background: #e2f0d9;
        color: #2f5a24;
      }
      .hint--warn {
        background: #fbe6c8;
        color: #7a4a12;
      }
      .trend {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        height: 150px;
        padding: 8px 4px;
      }
      .trend__item {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
        flex: 1 1 0;
        height: 100%;
      }
      .trend__fill {
        width: 100%;
        min-height: 4px;
        border-radius: 4px 4px 0 0;
        background: linear-gradient(180deg, #7fb069, #3f6b3a);
      }
      .trend__fill--over {
        background: linear-gradient(180deg, #e08a6b, #c0392b);
      }
      .trend__label {
        font-size: 11px;
        color: #8f9a88;
        white-space: nowrap;
      }
      .over-temp {
        color: #c0392b;
        font-weight: 700;
      }
    `
  ]
})
export class FermentTrendComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);

  readonly diacetylThreshold = DIACETYL_THRESHOLD;
  readonly fermentStates = FERMENT_STATES;
  readonly metrics = this.store.selectSignal(selectCurrentBatchMetrics);
  readonly batches = this.store.selectSignal(selectBatchNumbers);
  readonly selectedBatchNo = this.store.selectSignal(selectSelectedBatchNo);
  readonly filter = this.store.selectSignal(selectFermentFilter);
  readonly recipes = this.store.selectSignal(selectAllRecipes);
  readonly selectedRecipeId = this.store.selectSignal(selectSelectedRecipeId);
  readonly allFerments = this.store.selectSignal(selectAllFerments);

  readonly currentReadings = this.store.selectSignal(selectCurrentBatchFerments);

  readonly selects: FilterSelectConfig[] = [
    { key: 'states', label: '阶段', options: FERMENT_STATES.map((state) => ({ label: state, value: state })) }
  ];

  formVisible = false;
  editingId: string | null = null;
  form: Omit<Ferment, 'id'> = createEmptyFerment();

  ngOnInit(): void {
    this.store.dispatch(RecipeActions.reloadAll());
    this.store.dispatch(FermentActions.loadFerments());
    const params: Record<string, string | undefined> = {};
    this.route.snapshot.queryParamMap.keys.forEach((key) => {
      params[key] = this.route.snapshot.queryParamMap.get(key) ?? undefined;
    });
    this.store.dispatch(FermentActions.setFilter({ filter: queryParamsToFilters(params, ['states']) }));
    const batch = this.route.snapshot.queryParamMap.get('batchNo');
    if (batch) this.store.dispatch(FermentActions.selectBatch({ batchNo: batch }));
  }

  selectBatch(batchNo: string): void {
    this.store.dispatch(FermentActions.selectBatch({ batchNo }));
  }

  declineOf(date: string): number {
    const point = this.metrics().points.find((item) => item.date === date);
    return point ? point.declinePerDay : 0;
  }

  barHeight(gravity: number): number {
    const values = this.metrics().points.map((item) => item.gravity);
    if (values.length === 0) return 6;
    const min = Math.min(...values) - 0.005;
    const max = Math.max(...values) + 0.005;
    return Math.max(6, Math.min(100, Math.round(((gravity - min) / Math.max(0.001, max - min)) * 100)));
  }

  openCreate(): void {
    this.editingId = null;
    this.form = createEmptyFerment();
    this.form.recipeId = this.selectedRecipeId() ?? this.recipes()[0]?.id ?? '';
    this.form.batchNo = this.selectedBatchNo() ?? '';
    this.formVisible = true;
  }

  edit(reading: Ferment): void {
    this.editingId = reading.id;
    this.form = {
      batchNo: reading.batchNo,
      recipeId: reading.recipeId,
      date: reading.date,
      gravity: reading.gravity,
      tempC: reading.tempC,
      diacetylPpm: reading.diacetylPpm,
      state: reading.state
    };
    this.formVisible = true;
  }

  submit(): void {
    if (!this.form.batchNo.trim()) {
      this.snack.open('请填写批次号', '关闭', { duration: 2200 });
      return;
    }
    if (this.form.gravity <= 0.98 || this.form.gravity > 1.2) {
      this.snack.open('比重应在 0.98 – 1.2 之间', '关闭', { duration: 2200 });
      return;
    }
    if (this.editingId) {
      this.store.dispatch(FermentActions.updateFerment({ id: this.editingId, patch: { ...this.form } }));
    } else {
      this.store.dispatch(FermentActions.createFerment({ payload: { ...this.form } }));
    }
    this.formVisible = false;
    this.store.dispatch(FermentActions.selectBatch({ batchNo: this.form.batchNo }));
  }

  remove(reading: Ferment): void {
    if (!window.confirm(`删除 ${reading.date} 的读数？`)) return;
    this.store.dispatch(FermentActions.deleteFerment({ id: reading.id }));
  }

  onFilterChange(next: FilterModel): void {
    this.store.dispatch(FermentActions.setFilter({ filter: next }));
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: filtersToQueryParams(next),
      replaceUrl: true
    });
  }

  onResetFilter(): void {
    this.store.dispatch(FermentActions.resetFilter());
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }
}
