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

  async ngOnInit(): Promise<void> {
    await this.refreshStatus();
  }

  async refreshStatus(): Promise<void> {
    this.workflowState = await this.ownerWorkflowService.refresh();
    const route = this.ownerWorkflowService.getNextRoute(this.workflowState);
    if (route !== '/owner/pending') {
      await this.router.navigateByUrl(route);
    }
  }

  get waitingOnOwnerApproval(): boolean {
    return this.workflowState?.ownerStatus !== 'accepte';
  }

  get waitingOnParkingApproval(): boolean {
    return Boolean(
      this.workflowState?.ownerStatus === 'accepte' &&
      this.workflowState?.hasParking &&
      this.workflowState?.parkingStatus !== 'valide'
    );
  }

  get waitingOnParkingCreation(): boolean {
    return Boolean(this.workflowState?.ownerStatus === 'accepte' && !this.workflowState?.hasParking);
  }

  get pendingTitle(): string {
    if (this.waitingOnOwnerApproval && !this.workflowState?.hasParking) {
      return 'Compte en verification, parking a preparer';
    }

    if (this.waitingOnOwnerApproval) {
      return 'Validation du compte owner en attente';
    }

    if (this.waitingOnParkingCreation) {
      return 'Creation du premier parking requise';
    }

    if (this.waitingOnParkingApproval) {
      return 'Validation du parking en attente';
    }

    return 'Validation administrative en attente';
  }

  get pendingDescription(): string {
    if (this.waitingOnOwnerApproval && !this.workflowState?.hasParking) {
      return "Votre compte owner est en attente, mais vous pouvez deja enregistrer votre premier parking pour gagner du temps.";
    }

    if (this.waitingOnOwnerApproval) {
      return "Votre compte owner est en attente de validation. Votre parking restera bloque jusqu a la decision de l admin.";
    }

    if (this.waitingOnParkingCreation) {
      return "Votre compte owner est accepte. Vous pouvez maintenant creer votre premier parking depuis votre profil owner.";
    }

    if (this.waitingOnParkingApproval) {
      const parkingSuffix = this.workflowState?.parkingId
        ? ` Le parking concerne est le #${this.workflowState.parkingId}.`
        : '';
      return `Votre compte owner est accepte. Le parking cree est maintenant en attente de validation administrative avant le deblocage de l abonnement applicatif.${parkingSuffix}`;
    }

    return "Le dossier owner est encore en cours de verification administrative.";
  }

  get pendingParkingLabel(): string | null {
    if (!this.workflowState?.parkingId) {
      return null;
    }

    return `Parking #${this.workflowState.parkingId}`;
  }

  get primaryActionLabel(): string {
    if (this.waitingOnOwnerApproval && !this.workflowState?.hasParking) {
      return 'Ajouter mon parking';
    }

    if (this.waitingOnParkingCreation) {
      return 'Creer mon parking';
    }

    return 'Verifier a nouveau';
  }

  async handlePrimaryAction(): Promise<void> {
    if (this.waitingOnOwnerApproval && !this.workflowState?.hasParking) {
      await this.router.navigate(['/owner/profile']);
      return;
    }

    if (this.waitingOnParkingCreation) {
      await this.router.navigate(['/owner/profile']);
      return;
    }

    await this.refreshStatus();
  }
}
