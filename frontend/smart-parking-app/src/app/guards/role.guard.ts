import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const expectedRole = route.data['role'];
    const user = this.authService.getCurrentUser();

    if (!user) {
      this.router.navigate(['/pages/auth/signin/form']);
      return false;
    }

    if (user.role !== expectedRole) {
      if (user.role === 'conducteur') {
        this.router.navigate(['/dashboard']);
      } else if (user.role === 'owner') {
        this.router.navigate(['/owner/dashboard']);
      } else {
        this.router.navigate(['/pages/auth/signin/form']);
      }
      return false;
    }

    return true;
  }
}
