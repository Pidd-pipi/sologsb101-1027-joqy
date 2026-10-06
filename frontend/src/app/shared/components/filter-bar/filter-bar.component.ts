/**
 * FilterBar：关键字 + 风格 / 麦芽 / 酒花多选过滤，并把筛选条件回写到路由 query params。
 * 被配方台账、辅料库、煮沸页与发酵页消费。
 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { FilterModel, FilterSelectConfig } from '../../../core/models/filter.model';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filter-bar">
      <div class="filter-bar__main">
        <mat-form-field appearance="outline" class="filter-bar__keyword">
          <mat-label>{{ keywordPlaceholder }}</mat-label>
          <input matInput [ngModel]="keyword" (ngModelChange)="onKeyword($event)" />
          <mat-icon matPrefix>search</mat-icon>
        </mat-form-field>

        @for (select of selects; track select.key) {
          <div class="filter-bar__group">
            <span class="filter-bar__label">{{ select.label }}</span>
            <mat-chip-listbox multiple (change)="onToggle(select.key, $event.value)">
              @for (option of select.options; track option.value) {
                <mat-chip-option [value]="option.value" [selected]="isSelected(select.key, option.value)">
                  {{ option.label }}
                </mat-chip-option>
              }
            </mat-chip-listbox>
          </div>
        }

        @if (switchLabel) {
          <mat-slide-toggle [checked]="switchValue" (change)="onSwitch($event.checked)">
            {{ switchLabel }}
          </mat-slide-toggle>
        }
      </div>

      <div class="filter-bar__side">
        @if (activeCount > 0) {
          <span class="filter-bar__count">{{ activeCount }} 项条件</span>
        }
        <button mat-button color="primary" type="button" (click)="reset.emit()">
          <mat-icon>refresh</mat-icon>
          重置
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .filter-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        background: #ffffff;
        border: 1px solid var(--brew-border);
        border-radius: 12px;
      }
      .filter-bar__main {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 16px;
        flex: 1 1 520px;
      }
      .filter-bar__keyword {
        width: 220px;
      }
      .filter-bar__group {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .filter-bar__label {
        font-size: 13px;
        color: #6f7a68;
      }
      .filter-bar__side {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .filter-bar__count {
        background: #fdf1cf;
        color: #7a5a12;
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 12px;
      }
    `
  ]
})
export class FilterBarComponent {
  @Input({ required: true }) filters: FilterModel = { keyword: '' };
  @Input() selects: FilterSelectConfig[] = [];
  @Input() keywordPlaceholder = '搜索关键字…';
  @Input() switchLabel = '';
  @Input() switchValue = false;

  @Output() readonly filtersChange = new EventEmitter<FilterModel>();
  @Output() readonly reset = new EventEmitter<void>();

  get keyword(): string {
    return String(this.filters['keyword'] ?? '');
  }

  get activeCount(): number {
    return Object.entries(this.filters)
      .filter(([key]) => key !== 'keyword')
      .reduce((sum, [, value]) => {
        if (Array.isArray(value)) return sum + value.length;
        if (typeof value === 'string' && value.length > 0) return sum + 1;
        if (typeof value === 'boolean' && value) return sum + 1;
        return sum;
      }, 0);
  }

  isSelected(key: string, value: string): boolean {
    const current = this.filters[key];
    return Array.isArray(current) && current.includes(value);
  }

  onKeyword(value: string): void {
    this.filtersChange.emit({ ...this.filters, keyword: value });
  }

  onToggle(key: string, values: string[]): void {
    this.filtersChange.emit({ ...this.filters, [key]: values });
  }

  onSwitch(value: boolean): void {
    this.filtersChange.emit({ ...this.filters, switch: value });
  }
}
