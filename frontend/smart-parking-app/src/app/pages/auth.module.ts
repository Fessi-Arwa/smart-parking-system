import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { GuestGuard } from '../guards/guest.guard';

import { CarAnimationComponent } from './auth/car-animation/car-animation.component';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './auth/reset-password/reset-password.component';
import { SigninIntroComponent } from './auth/signin-intro/signin-intro.component';
import { SigninComponent } from './auth/signin/signin.component';
import { SignupComponent } from './auth/signup/signup.component';
import { DriverOnboardingComponent } from './auth/driver-onboarding/driver-onboarding.component';
import { OwnerOnboardingComponent } from './auth/owner-onboarding/owner-onboarding.component';

const routes: Routes = [
  { path: 'signin', redirectTo: 'signin/intro', pathMatch: 'full' },
  { path: 'signin/intro', component: SigninIntroComponent, canActivate: [GuestGuard] },
  { path: 'signin/form', component: SigninComponent, canActivate: [GuestGuard] },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'signup', component: SignupComponent, canActivate: [GuestGuard] },
  { path: 'onboarding/driver', component: DriverOnboardingComponent },
  { path: 'onboarding/owner', component: OwnerOnboardingComponent },
  { path: '', redirectTo: 'signin', pathMatch: 'full' }
];

@NgModule({
  declarations: [
    CarAnimationComponent,
    ForgotPasswordComponent,
    ResetPasswordComponent,
    SigninIntroComponent,
    SigninComponent,
    SignupComponent,
    DriverOnboardingComponent,
    OwnerOnboardingComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forChild(routes)
  ]
})
export class AuthModule { }
