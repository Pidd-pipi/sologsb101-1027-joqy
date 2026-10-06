/**
 * 路由表：/recipes、/ingredients、/mash、/boil、/ferment、/packaging
 * 页面按路由懒加载，构建时自动分包。
 */
import { Routes } from '@angular/router';

export const APP_ROUTES = {
  recipes: '/recipes',
  ingredients: '/ingredients',
  mash: '/mash',
  boil: '/boil',
  ferment: '/ferment',
  packaging: '/packaging'
} as const;

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  hint: string;
}

/** 侧边导航配置（与路由一一对应） */
export const NAV_ITEMS: NavItem[] = [
  { path: APP_ROUTES.recipes, label: '配方与风格', icon: 'menu_book', hint: '目标 OG / FG / IBU' },
  { path: APP_ROUTES.ingredients, label: '麦芽与酒花', icon: 'grass', hint: '辅料库与色度' },
  { path: APP_ROUTES.mash, label: '糖化升温步', icon: 'thermostat', hint: '拖拽调序与洗糟' },
  { path: APP_ROUTES.boil, label: '煮沸投花', icon: 'bolt', hint: '投加时点与 IBU' },
  { path: APP_ROUTES.ferment, label: '发酵比重', icon: 'timeline', hint: '比重与双乙酰' },
  { path: APP_ROUTES.packaging, label: '罐装与档案', icon: 'inventory_2', hint: '罐装登记与导出' }
];

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: APP_ROUTES.recipes },
  {
    path: 'recipes',
    title: '配方与风格台账',
    loadComponent: () => import('./features/recipes/recipe-list.component').then((m) => m.RecipeListComponent)
  },
  {
    path: 'ingredients',
    title: '麦芽与酒花辅料库',
    loadComponent: () =>
      import('./features/ingredients/ingredient-library.component').then((m) => m.IngredientLibraryComponent)
  },
  {
    path: 'mash',
    title: '糖化升温步编排',
    loadComponent: () => import('./features/mash/mash-plan.component').then((m) => m.MashPlanComponent)
  },
  {
    path: 'boil',
    title: '煮沸投花时间表',
    loadComponent: () => import('./features/boil/boil-timeline.component').then((m) => m.BoilTimelineComponent)
  },
  {
    path: 'ferment',
    title: '发酵比重与双乙酰还原',
    loadComponent: () => import('./features/ferment/ferment-trend.component').then((m) => m.FermentTrendComponent)
  },
  {
    path: 'packaging',
    title: '罐装批次登记与结构版本导出',
    loadComponent: () => import('./features/packaging/packaging-list.component').then((m) => m.PackagingListComponent)
  },
  { path: '**', redirectTo: APP_ROUTES.recipes }
];
