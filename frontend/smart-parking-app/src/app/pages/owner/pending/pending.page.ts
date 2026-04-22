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
    if (this.waitingOnOwnerApproval) {
      if (this.workflowState?.ownerStatus === 'refuse' && this.workflowState?.ownerStatusReason) {
        return `Votre compte owner a ete refuse. Motif admin: ${this.workflowState.ownerStatusReason}`;
      }

      if (this.workflowState?.ownerStatus === 'suspendu' && this.workflowState?.ownerStatusReason) {
        return `Votre compte owner est suspendu. Motif admin: ${this.workflowState.ownerStatusReason}`;
      }

      return "Votre compte owner est en attente de validation. La creation d un parking sera debloquee apres la decision de l admin.";
    }

    if (this.waitingOnParkingCreation) {
      return "Votre compte owner est accepte. Vous pouvez maintenant creer votre premier parking depuis votre profil owner.";
    }

    if (this.waitingOnParkingApproval) {
      if (this.workflowState?.parkingStatus === 'rejete' && this.workflowState?.parkingStatusReason) {
        return `Le parking a ete rejete par l admin. Motif: ${this.workflowState.parkingStatusReason}`;
      }

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
    if (this.waitingOnParkingCreation) {
      return 'Creer mon parking';
    }

    return 'Verifier a nouveau';
  }

  async handlePrimaryAction(): Promise<void> {
    if (this.waitingOnParkingCreation) {
      await this.router.navigate(['/owner/profile']);
      return;
    }

    await this.refreshStatus();
  }
}
