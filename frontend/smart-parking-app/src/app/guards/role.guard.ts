import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService } from '../services/auth';

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
      this.router.navigate(['/auth/signin']);
      return false;
    }

    if (user.role !== expectedRole) {
      // Rediriger vers la page appropriée selon le rôle
      if (user.role === 'driver') {
        this.router.navigate(['/driver/home']);
      } else if (user.role === 'owner') {
        this.router.navigate(['/owner/dashboard']);
      } else {
        this.router.navigate(['/auth/signin']);
      }
      return false;
    }

    return true;
  }
}