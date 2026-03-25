import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  // Module Owner (Parking Owner) - Directement pour le test
  {
    path: 'owner',
    loadChildren: () => import('./pages/owner/owner.module').then(m => m.OwnerModule)
  },
  
  // Redirection par défaut vers le dashboard owner
  {
    path: '',
    redirectTo: 'owner/dashboard',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }