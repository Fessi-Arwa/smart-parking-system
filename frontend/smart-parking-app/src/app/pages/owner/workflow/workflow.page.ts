import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { OwnerWorkflowService } from '../../../services/owner-workflow.service';

@Component({
  selector: 'app-owner-workflow',
  templateUrl: './workflow.page.html',
  styleUrls: ['./workflow.page.scss'],
  standalone: false,
})
export class WorkflowPage implements OnInit {
  constructor(
    private ownerWorkflowService: OwnerWorkflowService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const state = await this.ownerWorkflowService.refresh();
      await this.router.navigateByUrl(this.ownerWorkflowService.getNextRoute(state));
    } catch {
      await this.router.navigateByUrl('/owner/pending');
    }
  }
}
