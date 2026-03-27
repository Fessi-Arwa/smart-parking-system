import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { OwnerWorkflowState } from '../../../models/owner-workflow.model';
import { OwnerWorkflowService } from '../../../services/owner-workflow.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-owner-subscription',
  templateUrl: './subscription.page.html',
  styleUrls: ['./subscription.page.scss'],
  standalone: false,
})
export class SubscriptionPage implements OnInit {
  workflowState!: OwnerWorkflowState;
  isSubmitting = false;

  constructor(
    private ownerWorkflowService: OwnerWorkflowService,
    private router: Router,
    private toastService: ToastService
  ) {}

  async ngOnInit(): Promise<void> {
    this.workflowState = await this.ownerWorkflowService.refresh();
  }

  async refreshStatus(): Promise<void> {
    this.workflowState = await this.ownerWorkflowService.refresh();
    const route = this.ownerWorkflowService.getNextRoute(this.workflowState);
    if (route !== '/owner/subscription') {
      await this.router.navigateByUrl(route);
    }
  }

  async activateSubscription(): Promise<void> {
    this.isSubmitting = true;

    try {
      this.workflowState = await this.ownerWorkflowService.activateAppSubscription();
      this.toastService.show('Abonnement applicatif active avec succes.', 'success');

      const route = this.ownerWorkflowService.getNextRoute(this.workflowState);
      await this.router.navigateByUrl(route);
    } catch (error) {
      console.error('Erreur activation abonnement app', error);
      this.toastService.show('Impossible d activer l abonnement pour le moment.', 'error');
    } finally {
      this.isSubmitting = false;
    }
  }
}
