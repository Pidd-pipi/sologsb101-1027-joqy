/** StatBadge：OG / FG / IBU / ABV 等指标徽标与占比，被配方台账、发酵页、罐装页消费 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

type BadgeTone = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<BadgeTone, string> = {
  default: '#6f7a68',
  primary: '#3f6b3a',
  success: '#1e8449',
  warning: '#d68910',
  danger: '#c0392b',
  info: '#4a6fa5'
};

@Component({
  selector: 'app-stat-badge',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stat-badge" [style.border-left-color]="color">
      <div class="stat-badge__head" [style.color]="color">
        <mat-icon inline>{{ icon }}</mat-icon>
        <span>{{ label }}</span>
      </div>
      <div class="stat-badge__body">
        <span class="stat-badge__value">{{ showPercent && percent !== undefined ? percent + '%' : value }}</span>
        @if (suffix) {
          <span class="stat-badge__suffix">{{ suffix }}</span>
        }
      </div>
      @if (percent !== undefined) {
        <mat-progress-bar mode="determinate" [value]="percent" [color]="progressColor"></mat-progress-bar>
      }
    </div>
  `,
  styles: [
    `
      .stat-badge {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 140px;
        padding: 12px 14px;
        background: #ffffff;
        border: 1px solid var(--brew-border);
        border-left: 4px solid #6f7a68;
        border-radius: 12px;
      }
      .stat-badge__head {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
      }
      .stat-badge__head mat-icon {
        font-size: 15px;
        height: 15px;
        width: 15px;
      }
      .stat-badge__body {
        display: flex;
        align-items: baseline;
        gap: 4px;
      }
      .stat-badge__value {
        font-size: 22px;
        font-weight: 700;
        color: #22301f;
      }
      .stat-badge__suffix {
        font-size: 12px;
        color: #8f9a88;
      }
    `
  ]
})
export class StatBadgeComponent {
  @Input({ required: true }) label = '';
  @Input({ required: true }) value: number | string = 0;
  @Input() suffix = '';
  @Input() percent?: number;
  @Input() tone: BadgeTone = 'default';
  @Input() icon = 'insights';
  @Input() showPercent = false;

  get color(): string {
    return TONES[this.tone];
  }

  get progressColor(): 'primary' | 'accent' | 'warn' {
    if (this.tone === 'danger') return 'warn';
    if (this.tone === 'success') return 'accent';
    return 'primary';
  }
}
