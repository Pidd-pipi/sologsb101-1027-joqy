/**
 * StyleTag：按风格与发酵阶段渲染底色与图标。
 * 被配方台账、糖化编排页、发酵跟踪页消费。
 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

interface TagStyle {
  background: string;
  color: string;
  icon: string;
  label: string;
}

const STYLES: Record<string, TagStyle> = {
  IPA: { background: '#f6d9b0', color: '#7a4a12', icon: 'local_drink', label: 'IPA' },
  小麦: { background: '#fdf3c8', color: '#7a6a12', icon: 'wb_sunny', label: '小麦' },
  世涛: { background: '#d9c6ba', color: '#3b2318', icon: 'nightlight', label: '世涛' },
  拉格: { background: '#d7e8c8', color: '#2f5a24', icon: 'ac_unit', label: '拉格' },
  酸啤: { background: '#f3d0e0', color: '#7a1f4a', icon: 'science', label: '酸啤' },
  主发酵: { background: '#f7d9a0', color: '#7a4a12', icon: 'bubble_chart', label: '主发酵' },
  双乙酰还原: { background: '#d6e4f7', color: '#1f3f7a', icon: 'thermostat', label: '双乙酰还原' },
  已结束: { background: '#d7e8c8', color: '#2f5a24', icon: 'check_circle', label: '已结束' },
  未开始: { background: '#e6e6e6', color: '#555555', icon: 'schedule', label: '未开始' },
  进行中: { background: '#f7e2b8', color: '#7a5a12', icon: 'play_circle', label: '进行中' },
  已完成: { background: '#d7e8c8', color: '#2f5a24', icon: 'check_circle', label: '已完成' },
  计划: { background: '#e6e6e6', color: '#555555', icon: 'event', label: '计划' }
};

@Component({
  selector: 'app-style-tag',
  standalone: true,
  imports: [CommonModule, MatChipsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="style-tag" [style.background]="style.background" [style.color]="style.color">
      <mat-icon inline>{{ style.icon }}</mat-icon>
      <span>{{ value || style.label }}</span>
    </span>
  `,
  styles: [
    `
      .style-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
      }
      .style-tag mat-icon {
        font-size: 14px;
        height: 14px;
        width: 14px;
      }
    `
  ]
})
export class StyleTagComponent {
  @Input() value = '';

  get style(): TagStyle {
    return STYLES[this.value] ?? { background: '#eeeeee', color: '#444444', icon: 'label', label: this.value };
  }
}
