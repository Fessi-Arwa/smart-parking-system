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
  hasAttemptedSubmit = false;
  selectedPlan: 'mensuel' | 'annuel' = 'mensuel';
  paymentMode: 'en_ligne' | 'sur_place' = 'en_ligne';
  readonly expiryMonths = Array.from({ length: 12 }, (_, index) =>
    String(index + 1).padStart(2, '0')
  );
  readonly expiryYears = Array.from({ length: 12 }, (_, index) => String(26 + index));
  paymentData = {
    cardHolder: '',
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
  };

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
    this.hasAttemptedSubmit = true;

    const paymentValidationError = this.getPaymentValidationError();
    if (paymentValidationError) {
      this.toastService.show(paymentValidationError, 'error');
      return;
    }

    this.isSubmitting = true;

    try {
      this.workflowState = await this.ownerWorkflowService.activateAppSubscriptionRequest({
        parking_id: this.workflowState.parkingId,
        type: this.selectedPlan,
        payment_mode: this.paymentMode,
      });
      this.toastService.show(
        'Abonnement soumis avec succes. L admin doit maintenant le valider.',
        'success'
      );

      const route = this.ownerWorkflowService.getNextRoute(this.workflowState);
      await this.router.navigateByUrl(route);
    } catch (error) {
      console.error('Erreur activation abonnement app', error);
      this.toastService.show('Impossible d activer l abonnement pour le moment.', 'error');
    } finally {
      this.isSubmitting = false;
    }
  }

  get selectedPlanPrice(): number {
    return this.selectedPlan === 'annuel' ? 490 : 49;
  }

  get selectedPlanLabel(): string {
    return this.selectedPlan === 'annuel' ? 'Annuel' : 'Mensuel';
  }

  sanitizeCardNumber(): void {
    const digitsOnly = this.paymentData.cardNumber.replace(/\D+/g, '').slice(0, 19);
    this.paymentData.cardNumber = digitsOnly;
  }

  sanitizeCvv(): void {
    this.paymentData.cvv = this.paymentData.cvv.replace(/\D+/g, '').slice(0, 4);
  }

  isFieldInvalid(field: 'cardHolder' | 'cardNumber' | 'expiryMonth' | 'expiryYear' | 'cvv'): boolean {
    return this.hasAttemptedSubmit && !this.getFieldValue(field);
  }

  private getPaymentValidationError(): string | null {
    if (this.paymentMode !== 'en_ligne') {
      return null;
    }

    if (!this.paymentData.cardHolder.trim()) {
      return 'Saisissez le nom du porteur.';
    }

    const normalizedCardNumber = this.paymentData.cardNumber.replace(/\D+/g, '');
    if (!normalizedCardNumber) {
      return 'Saisissez le numero de carte.';
    }
    if (!/^\d{12,19}$/.test(normalizedCardNumber)) {
      return 'Le numero de carte doit contenir entre 12 et 19 chiffres.';
    }

    if (!this.paymentData.expiryMonth.trim()) {
      return 'Choisissez le mois d expiration.';
    }
    if (!this.paymentData.expiryYear.trim()) {
      return 'Choisissez l annee d expiration.';
    }

    if (!this.paymentData.cvv.trim()) {
      return 'Saisissez le code de securite.';
    }
    if (!/^\d{3,4}$/.test(this.paymentData.cvv.trim())) {
      return 'Le code de securite doit contenir 3 ou 4 chiffres.';
    }

    return null;
  }

  private getFieldValue(
    field: 'cardHolder' | 'cardNumber' | 'expiryMonth' | 'expiryYear' | 'cvv'
  ): string {
    return (this.paymentData[field] || '').trim();
  }
}
