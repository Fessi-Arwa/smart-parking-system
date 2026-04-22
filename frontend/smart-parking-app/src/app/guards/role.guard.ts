import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { OwnerWorkflowService } from '../services/owner-workflow.service';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private ownerWorkflowService: OwnerWorkflowService,
    private router: Router
  ) {}

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean> {
    const expectedRole = route.data['role'];
    const user = this.authService.getCurrentUser();

    if (!user) {
      await this.router.navigate(['/pages/auth/signin/form']);
      return false;
    }

    if (user.role !== expectedRole) {
      if (user.role === 'conducteur') {
        await this.router.navigate(['/dashboard']);
      } else if (user.role === 'owner') {
        const ownerRoute = await this.ownerWorkflowService.resolveEntryRoute();
        await this.router.navigateByUrl(ownerRoute);
      } else if (user.role === 'admin') {
        await this.router.navigate(['/admin']);
      } else {
        await this.router.navigate(['/pages/auth/signin/form']);
      }
      return false;
    }

    return true;
  }
}
