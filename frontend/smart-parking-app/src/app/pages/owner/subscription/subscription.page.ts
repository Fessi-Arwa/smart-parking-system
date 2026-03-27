import { Component } from '@angular/core';
import { Router } from '@angular/router';

import { OwnerWorkflowService } from '../../../services/owner-workflow.service';

@Component({
  selector: 'app-owner-subscription',
  templateUrl: './subscription.page.html',
  styleUrls: ['./subscription.page.scss'],
  standalone: false,
})
export class SubscriptionPage {
  constructor(
    private ownerWorkflowService: OwnerWorkflowService,
    private router: Router
  ) {}

  async activateSubscription(): Promise<void> {
    this.ownerWorkflowService.activateSubscription();
    await this.router.navigateByUrl(this.ownerWorkflowService.getNextRoute());
  }
}
