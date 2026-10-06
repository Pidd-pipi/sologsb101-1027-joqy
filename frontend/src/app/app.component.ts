/** 应用外壳：左侧导航 + 顶部概览 + 路由出口 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Store } from '@ngrx/store';
import { NAV_ITEMS } from './app.routes';
import { RecipeActions } from './core/state/recipe/recipe.actions';
import { FermentActions } from './core/state/ferment/ferment.actions';
import { selectRecipeError } from './core/state/recipe/recipe.selectors';
import { selectAllRecipes } from './core/state/recipe/recipe.selectors';
import { selectAllFerments } from './core/state/ferment/ferment.selectors';
import { selectAllPackagings } from './core/state/packaging/packaging.selectors';
import { selectAllMalts, selectAllHops } from './core/state/ingredients/ingredients.selectors';
import { countAll, DB_NAME, DB_SCHEMA_VERSION, initDatabase } from './core/utils/db';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav mode="side" opened class="shell__sidenav">
        <div class="brand">
          <span class="brand__mark">🍺</span>
          <div>
            <div class="brand__title">精酿糖化配方</div>
            <div class="brand__sub">gbbrewhouse · 发酵比重台</div>
          </div>
        </div>

        <mat-nav-list>
          @for (item of navItems; track item.path) {
            <a
              mat-list-item
              [routerLink]="item.path"
              routerLinkActive="active-link"
              [routerLinkActiveOptions]="{ exact: false }"
            >
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
              <span matListItemLine class="muted">{{ item.hint }}</span>
            </a>
          }
        </mat-nav-list>

        <div class="shell__foot">
          <div>本地库 {{ dbName }} · v{{ schemaVersion }}</div>
          <div>配方 {{ recipeCount() }} · 麦芽 {{ maltCount() }} · 酒花 {{ hopCount() }}</div>
          <div>发酵读数 {{ fermentCount() }} · 罐装 {{ packagingCount() }}</div>
          <div>{{ dbReady() ? '本地库已就绪' : '正在打开本地库…' }}</div>
        </div>
      </mat-sidenav>

      <mat-sidenav-content class="shell__content">
        <mat-toolbar class="shell__toolbar">
          <span>精酿糖化配方与发酵比重台</span>
          <span class="shell__spacer"></span>
          <span class="muted">数据仅保存在本机浏览器（IndexedDB / Dexie），无后端服务</span>
        </mat-toolbar>

        @if (error()) {
          <div class="shell__error">本地数据异常：{{ error() }}</div>
        }

        <div class="shell__main">
          <router-outlet></router-outlet>
        </div>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [
    `
      .shell {
        height: 100vh;
        background: var(--brew-bg);
      }
      .shell__sidenav {
        width: 236px;
        background: #1f3d2b;
        color: #eef3ea;
        display: flex;
        flex-direction: column;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 18px 16px 10px;
      }
      .brand__mark {
        font-size: 26px;
      }
      .brand__title {
        font-size: 15px;
        font-weight: 700;
      }
      .brand__sub {
        font-size: 11px;
        color: rgba(238, 243, 234, 0.6);
      }
      .shell__foot {
        margin-top: auto;
        padding: 12px 16px 18px;
        font-size: 11px;
        line-height: 1.9;
        color: rgba(238, 243, 234, 0.6);
      }
      .shell__content {
        background: var(--brew-bg);
      }
      .shell__toolbar {
        background: #ffffff;
        border-bottom: 1px solid var(--brew-border);
        font-weight: 600;
      }
      .shell__spacer {
        flex: 1;
      }
      .shell__error {
        margin: 12px 20px 0;
        background: #fdecea;
        color: #a5281b;
        border-radius: 8px;
        padding: 8px 14px;
        font-size: 13px;
      }
      .shell__main {
        padding: 18px 20px 32px;
      }
      :host ::ng-deep .active-link {
        background: rgba(217, 164, 65, 0.22) !important;
      }
      :host ::ng-deep .mat-mdc-list-item-title,
      :host ::ng-deep .mat-mdc-list-item .muted {
        color: #eef3ea;
      }
    `
  ]
})
export class AppComponent implements OnInit {
  private readonly store = inject(Store);

  readonly navItems = NAV_ITEMS;
  readonly dbName = DB_NAME;
  readonly schemaVersion = DB_SCHEMA_VERSION;

  readonly dbReady = signal(false);
  readonly error = this.store.selectSignal(selectRecipeError);
  readonly recipeCount = computed(() => this.store.selectSignal(selectAllRecipes)());
  readonly maltCount = computed(() => this.store.selectSignal(selectAllMalts)());
  readonly hopCount = computed(() => this.store.selectSignal(selectAllHops)());
  readonly fermentCount = computed(() => this.store.selectSignal(selectAllFerments)());
  readonly packagingCount = computed(() => this.store.selectSignal(selectAllPackagings)());

  ngOnInit(): void {
    void (async () => {
      try {
        await initDatabase();
        this.dbReady.set(true);
        await countAll();
        this.store.dispatch(RecipeActions.reloadAll());
        this.store.dispatch(FermentActions.loadFerments());
      } catch (error) {
        // 本地库不可用时页面内会给出可读的错误提示
        console.error('本地数据库初始化失败', error);
      }
    })();
  }
}
