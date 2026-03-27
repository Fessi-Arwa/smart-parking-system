import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { OwnerWorkflowState } from '../../../models/owner-workflow.model';
import { OwnerWorkflowService } from '../../../services/owner-workflow.service';

@Component({
  selector: 'app-owner-pending',
  templateUrl: './pending.page.html',
  styleUrls: ['./pending.page.scss'],
  standalone: false,
})
export class PendingPage implements OnInit {
  workflowState!: OwnerWorkflowState;

  constructor(
    private ownerWorkflowService: OwnerWorkflowService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.workflowState = this.ownerWorkflowService.refresh();
  }

  async refreshStatus(): Promise<void> {
    this.workflowState = this.ownerWorkflowService.refresh();
    const route = this.ownerWorkflowService.getNextRoute(this.workflowState);
    if (route !== '/owner/pending') {
      await this.router.navigateByUrl(route);
    }
  }

  async simulateApproval(): Promise<void> {
    this.ownerWorkflowService.approveOwner();
    await this.refreshStatus();
  }
}
