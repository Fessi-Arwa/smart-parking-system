import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';

import { OwnerWorkflowService } from '../services/owner-workflow.service';

@Injectable({
  providedIn: 'root',
})
export class OwnerWorkflowGuard implements CanActivate {
  constructor(
    private ownerWorkflowService: OwnerWorkflowService,
    private router: Router
  ) {}

  async canActivate(): Promise<boolean> {
    try {
      const state = await this.ownerWorkflowService.refresh();
      const nextRoute = this.ownerWorkflowService.getNextRoute(state);

      if (nextRoute === '/owner/overview') {
        return true;
      }

      await this.router.navigateByUrl(nextRoute);
      return false;
    } catch {
      await this.router.navigateByUrl('/owner/pending');
      return false;
    }
  }
}
