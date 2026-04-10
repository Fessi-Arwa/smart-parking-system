import { Injectable } from '@angular/core';
import { CanActivate, Router, RouterStateSnapshot } from '@angular/router';

import { OwnerWorkflowService } from '../services/owner-workflow.service';

@Injectable({
  providedIn: 'root',
})
export class OwnerWorkflowGuard implements CanActivate {
  constructor(
    private ownerWorkflowService: OwnerWorkflowService,
    private router: Router
  ) {}

  async canActivate(_: never, state: RouterStateSnapshot): Promise<boolean> {
    try {
      const workflowState = await this.ownerWorkflowService.refresh();
      const nextRoute = this.ownerWorkflowService.getNextRoute(workflowState);

      if (state.url === nextRoute) {
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
