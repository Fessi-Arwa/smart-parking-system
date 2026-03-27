import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'pages/auth',
    loadChildren: () => import('./pages/auth.module').then(m => m.AuthModule)
  },
  {
    path: 'signin',
    redirectTo: 'pages/auth/signin',
    pathMatch: 'full'
  },
  {
    path: 'signup',
    redirectTo: 'pages/auth/signup',
    pathMatch: 'full'
  },
  {
    path: 'forgot-password',
    redirectTo: 'pages/auth/forgot-password',
    pathMatch: 'full'
  },
  {
    path: 'reset-password',
    redirectTo: 'pages/auth/reset-password',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    redirectTo: 'driver',
    pathMatch: 'full'
  },
  {
    path: 'owner',
    loadChildren: () => import('./pages/owner/owner.module').then(m => m.OwnerModule)
  },
  {
    path: 'driver',
    loadChildren: () => import('./pages/driver/driver.module').then(m => m.DriverModule)
  },
  {
    path: 'admin',
    loadChildren: () => import('./pages/admin/admin.module').then(m => m.AdminModule)
  },
  {
    path: '',
    redirectTo: 'pages/auth/signin',
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
