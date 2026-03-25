import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'dashboard',
    loadChildren: () => import('./dashboard/dashboard.module').then(m => m.DashboardPageModule)
  },
  {
    path: 'profile',
    loadChildren: () => import('./profile/profile.module').then(m => m.ProfilePageModule)
  },
  // Pour l'instant, commente les pages en construction
  // {
  //   path: 'parkings',
  //   loadChildren: () => import('./parkings/parkings.module').then(m => m.ParkingsPageModule)
  // },
  // {
  //   path: 'reservations',
  //   loadChildren: () => import('./reservations/reservations.module').then(m => m.ReservationsPageModule)
  // },
  // {
  //   path: 'subscriptions',
  //   loadChildren: () => import('./subscriptions/subscriptions.module').then(m => m.SubscriptionsPageModule)
  // },
  // {
  //   path: 'feedbacks',
  //   loadChildren: () => import('./feedbacks/feedbacks.module').then(m => m.FeedbacksPageModule)
  // },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class OwnerRoutingModule { }