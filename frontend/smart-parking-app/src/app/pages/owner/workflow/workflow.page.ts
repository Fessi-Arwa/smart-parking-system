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
    const route = this.ownerWorkflowService.getNextRoute(this.ownerWorkflowService.refresh());
    await this.router.navigateByUrl(route);
  }
}
