import { Component } from '@angular/core';
import { Router } from '@angular/router';

import { OwnerWorkflowService } from '../../../services/owner-workflow.service';

@Component({
  selector: 'app-owner-ai-setup',
  templateUrl: './ai-setup.page.html',
  styleUrls: ['./ai-setup.page.scss'],
  standalone: false,
})
export class AiSetupPage {
  aiTasks = [
    'Associer les cameras au parking',
    'Definir les zones de detection des vehicules',
    'Mapper les places pour la detection d occupation',
    'Executer un test de calibration',
  ];

  constructor(
    private ownerWorkflowService: OwnerWorkflowService,
    private router: Router
  ) {}

  async activateAi(): Promise<void> {
    this.ownerWorkflowService.activateAiSetup();
    await this.router.navigateByUrl(this.ownerWorkflowService.getNextRoute());
  }
}
