/** EmptyPanel：空数据引导与新建入口，被全部列表页消费 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-empty-panel',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-panel">
      <mat-icon class="empty-panel__icon">sports_bar</mat-icon>
      <h3 class="empty-panel__title">{{ title }}</h3>
      <p class="empty-panel__desc">{{ description }}</p>
      @if (showCreate) {
        <button mat-flat-button color="primary" type="button" (click)="create.emit()">
          <mat-icon>add</mat-icon>
          {{ createText }}
        </button>
      }
      <ng-content></ng-content>
    </div>
  `,
  styles: [
    `
      .empty-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 40px 16px;
        background: #fdfdf8;
        border: 1px dashed #cdd6c4;
        border-radius: 12px;
        text-align: center;
      }
      .empty-panel__icon {
        font-size: 32px;
        height: 32px;
        width: 32px;
        color: #9aa88f;
      }
      .empty-panel__title {
        margin: 0;
        font-size: 16px;
        color: #22301f;
      }
      .empty-panel__desc {
        margin: 0;
        font-size: 13px;
        color: #8f9a88;
      }
    `
  ]
})
export class EmptyPanelComponent {
  @Input() title = '暂无数据';
  @Input() description = '先新建一条记录，或调整筛选条件后再试。';
  @Input() showCreate = true;
  @Input() createText = '新建';

  @Output() readonly create = new EventEmitter<void>();
}
