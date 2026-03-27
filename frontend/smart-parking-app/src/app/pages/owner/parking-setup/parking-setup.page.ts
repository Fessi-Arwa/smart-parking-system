import { Component } from '@angular/core';
import { Router } from '@angular/router';

import { OwnerWorkflowService } from '../../../services/owner-workflow.service';

@Component({
  selector: 'app-owner-parking-setup',
  templateUrl: './parking-setup.page.html',
  styleUrls: ['./parking-setup.page.scss'],
  standalone: false,
})
export class ParkingSetupPage {
  setupChecklist = [
    'Definir la capacite et les zones',
    'Renseigner les etages et les types de places',
    'Preparer le plan logique du parking',
    'Completer les regles d acces et d exploitation',
  ];

  constructor(
    private ownerWorkflowService: OwnerWorkflowService,
    private router: Router
  ) {}

  async completeSetup(): Promise<void> {
    this.ownerWorkflowService.completeParkingSetup();
    await this.router.navigateByUrl(this.ownerWorkflowService.getNextRoute());
  }
}
