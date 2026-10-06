/** 应用级 providers：路由、动画、NgRx Store / Effects / Devtools */
import { ApplicationConfig, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { routes } from './app.routes';
import { recipeReducer } from './core/state/recipe/recipe.reducer';
import { RecipeEffects } from './core/state/recipe/recipe.effects';
import { fermentReducer } from './core/state/ferment/ferment.reducer';
import { FermentEffects } from './core/state/ferment/ferment.effects';
import { ingredientsReducer } from './core/state/ingredients/ingredients.reducer';
import { mashReducer } from './core/state/mash/mash.reducer';
import { boilReducer } from './core/state/boil/boil.reducer';
import { packagingReducer } from './core/state/packaging/packaging.reducer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideAnimationsAsync(),
    provideStore({
      recipe: recipeReducer,
      ferment: fermentReducer,
      ingredients: ingredientsReducer,
      mash: mashReducer,
      boil: boilReducer,
      packaging: packagingReducer
    }),
    provideEffects([RecipeEffects, FermentEffects]),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() })
  ]
};
