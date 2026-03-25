import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'pages/auth',
    loadChildren: () => import('./pages/auth.module').then((m) => m.AuthModule)
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./pages/dashboard/dashboard.module').then((m) => m.DashboardPageModule)
  },
  {
    path: 'owner',
    loadChildren: () => import('./pages/owner/owner.module').then((m) => m.OwnerModule)
  },
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
export class AppRoutingModule {}
