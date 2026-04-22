import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { OwnerWorkflowService } from '../services/owner-workflow.service';

@Injectable({
  providedIn: 'root'
})
export class GuestGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private ownerWorkflowService: OwnerWorkflowService,
    private router: Router
  ) {}

  async canActivate(): Promise<boolean> {
    if (!this.authService.isAuthenticated()) {
      return true;
    }

    const user = this.authService.getCurrentUser();
    if (user?.role === 'admin') {
      await this.router.navigate(['/admin']);
    } else if (user?.role === 'owner') {
      const route = await this.ownerWorkflowService.resolveEntryRoute();
      await this.router.navigateByUrl(route);
    } else {
      await this.router.navigate(['/dashboard']);
    }

    return false;
  }
}
