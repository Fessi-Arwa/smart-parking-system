import { Component, OnInit } from '@angular/core';

import { AuthService } from '../../../services/auth.service';
import {
  AdminAppSubscriptionRecord,
  AdminParkingRecord,
  AdminUserRecord,
  AdminWorkflowService,
} from '../../../services/admin-workflow.service';
import { ToastService } from '../../../services/toast.service';
import { HeaderNotificationItem } from '../../../shared/components/header/header.component';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class AdminDashboardPage implements OnInit {
  activeSection: 'users' | 'parkings' | 'subscriptions' = 'users';
  stats = {
    totalUsers: 0,
    totalDrivers: 0,
    totalOwners: 0,
    totalParkings: 0,
    activeParkings: 0,
    pendingParkings: 0,
    pendingSubscriptions: 0,
    activeSubscriptions: 0,
    totalReservations: 0,
    totalRevenue: 0,
  };

  users: AdminUserRecord[] = [];
  parkings: AdminParkingRecord[] = [];
  subscriptions: AdminAppSubscriptionRecord[] = [];
  isLoading = false;

  userSearchTerm = '';
  userRoleFilter: 'all' | 'conducteur' | 'owner' | 'admin' = 'all';

  parkingSearchTerm = '';
  parkingStatusFilter: 'all' | 'en_attente_validation' | 'valide' | 'rejete' = 'all';
  subscriptionSearchTerm = '';
  subscriptionStatusFilter: 'all' | 'en_attente' | 'actif' | 'suspendu' | 'expire' = 'all';
  decisionModalOpen = false;
  decisionReason = '';
  decisionModalTitle = '';
  decisionModalDescription = '';
  decisionRequiresReason = true;
  decisionConfirmLabel = 'Confirmer';
  private pendingDecisionAction: (() => Promise<void>) | null = null;

  constructor(
    private authService: AuthService,
    private adminWorkflowService: AdminWorkflowService,
    private toastService: ToastService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadDashboardData();
  }

  get notificationItems(): HeaderNotificationItem[] {
    const items: HeaderNotificationItem[] = [];

    if (this.pendingOwnerApprovalsCount > 0) {
      items.push({
        title: 'Owners en attente',
        description: `${this.pendingOwnerApprovalsCount} compte(s) owner attendent une validation admin.`,
        timestamp: 'A traiter',
        icon: 'people-outline',
        tone: 'warning',
      });
    }

    if (this.pendingParkingReviews.length > 0) {
      items.push({
        title: 'Parkings a revoir',
        description: `${this.pendingParkingReviews.length} parking(s) attendent une revue administrative.`,
        timestamp: 'File de revue',
        icon: 'business-outline',
        tone: 'alert',
      });
    }

    if (this.stats.pendingSubscriptions > 0) {
      items.push({
        title: 'Abonnements parking',
        description: `${this.stats.pendingSubscriptions} abonnement(s) sont encore en attente.`,
        timestamp: 'Suivi plateforme',
        icon: 'card-outline',
        tone: 'info',
      });
    }

    if (!items.length) {
      items.push({
        title: 'Aucune alerte critique',
        description: 'Les validations prioritaires admin sont a jour.',
        timestamp: 'Etat actuel',
        icon: 'checkmark-circle-outline',
        tone: 'success',
      });
    }

    return items.slice(0, 4);
  }

  get notificationsCount(): number {
    const actionableCount =
      this.pendingOwnerApprovalsCount +
      this.pendingParkingReviews.length +
      this.stats.pendingSubscriptions;

    return actionableCount > 0 ? actionableCount : this.notificationItems.length;
  }

  get filteredUsers(): AdminUserRecord[] {
    let filtered = this.users;

    if (this.userRoleFilter !== 'all') {
      filtered = filtered.filter((user) => user.role === this.userRoleFilter);
    }

    if (this.userSearchTerm.trim()) {
      const term = this.userSearchTerm.toLowerCase();
      filtered = filtered.filter((user) =>
        user.nom.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        (user.telephone || '').includes(term)
      );
    }

    return filtered;
  }

  get filteredParkings(): AdminParkingRecord[] {
    let filtered = this.parkings;

    if (this.parkingStatusFilter !== 'all') {
      filtered = filtered.filter((parking) => parking.validation_status === this.parkingStatusFilter);
    }

    if (this.parkingSearchTerm.trim()) {
      const term = this.parkingSearchTerm.toLowerCase();
      filtered = filtered.filter((parking) =>
        parking.nom.toLowerCase().includes(term) ||
        parking.adresse.toLowerCase().includes(term) ||
        this.getParkingOwnerName(parking.owner_id).toLowerCase().includes(term)
      );
    }

    return filtered;
  }

  get pendingOwnerApprovalsCount(): number {
    return this.users.filter((user) => user.role === 'owner' && user.owner_status === 'en_attente').length;
  }

  get pendingParkingReviews(): AdminParkingRecord[] {
    return this.parkings.filter((parking) => parking.validation_status === 'en_attente_validation');
  }

  get blockedPendingParkingReviewsCount(): number {
    return this.pendingParkingReviews.filter((parking) => parking.owner_status !== 'accepte').length;
  }

  get nextAdminActionTitle(): string {
    if (this.pendingOwnerApprovalsCount > 0) {
      return 'Traiter les comptes owner en attente';
    }
    if (this.pendingParkingReviews.length > 0) {
      return `Revoir ${this.pendingParkingReviews[0].nom}`;
    }
    return 'Toutes les validations sont a jour';
  }

  get nextAdminActionDescription(): string {
    if (this.pendingOwnerApprovalsCount > 0) {
      return 'Commencez par accepter les comptes owner pour debloquer la validation de leurs parkings.';
    }
    if (this.pendingParkingReviews.length > 0) {
      return 'Le prochain dossier parking peut etre valide ou rejete directement depuis la file de revue.';
    }
    return 'Utilisez Actualiser pour verifier les nouvelles demandes.';
  }

  get filteredSubscriptions(): AdminAppSubscriptionRecord[] {
    let filtered = this.subscriptions;

    if (this.subscriptionStatusFilter !== 'all') {
      filtered = filtered.filter((subscription) => subscription.statut === this.subscriptionStatusFilter);
    }

    if (this.subscriptionSearchTerm.trim()) {
      const term = this.subscriptionSearchTerm.toLowerCase();
      filtered = filtered.filter((subscription) =>
        (subscription.parking?.nom || '').toLowerCase().includes(term) ||
        (subscription.owner?.nom || '').toLowerCase().includes(term) ||
        String(subscription.id_abon).includes(term)
      );
    }

    return filtered;
  }

  async approveOwner(userId: number): Promise<void> {
    try {
      const updatedUser = await this.adminWorkflowService.updateOwnerStatus(userId, 'accepte');
      this.users = this.users.map((user) => (user.id_compte === userId ? updatedUser : user));
      this.updateStats();
      this.toastService.show('Compte owner approuve avec succes.', 'success');
    } catch (error) {
      console.error('Erreur approbation owner', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible d approuver ce compte owner.'), 'error');
    }
  }

  async rejectOwner(userId: number): Promise<void> {
    this.openDecisionModal(
      'Motif du rejet du compte owner',
      'Expliquez clairement pourquoi ce compte owner est rejete.',
      async (reason) => {
        const updatedUser = await this.adminWorkflowService.updateOwnerStatus(userId, 'refuse', reason);
        this.users = this.users.map((user) => (user.id_compte === userId ? updatedUser : user));
        this.updateStats();
        this.toastService.show('Compte owner rejete.', 'info');
      }
    );
  }

  async deleteUser(userId: number): Promise<void> {
    this.openConfirmationModal(
      'Supprimer cet utilisateur',
      'Cette suppression est irreversible et retirera aussi les donnees reliees a cet utilisateur.',
      async () => {
        await this.adminWorkflowService.deleteUser(userId);
        this.users = this.users.filter((user) => user.id_compte !== userId);
        this.parkings = this.parkings.filter((parking) => parking.owner_id !== userId);
        this.updateStats();
        this.toastService.show('Utilisateur supprime avec succes.', 'success');
      }
    );
  }

  async approveParking(parkingId: number): Promise<void> {
    try {
      const updatedParking = await this.adminWorkflowService.updateParkingValidationStatus(
        parkingId,
        'valide'
      );
      this.parkings = this.parkings.map((parking) =>
        parking.id_park === parkingId ? updatedParking : parking
      );
      this.updateStats();
      this.toastService.show('Parking approuve avec succes.', 'success');
    } catch (error) {
      console.error('Erreur approbation parking', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible d approuver ce parking.'), 'error');
    }
  }

  async rejectParking(parkingId: number): Promise<void> {
    this.openDecisionModal(
      'Motif du rejet du parking',
      'Precisez ce que le proprietaire doit corriger avant une nouvelle soumission.',
      async (reason) => {
        const updatedParking = await this.adminWorkflowService.updateParkingValidationStatus(
          parkingId,
          'rejete',
          reason
        );
        this.parkings = this.parkings.map((parking) =>
          parking.id_park === parkingId ? updatedParking : parking
        );
        this.updateStats();
        this.toastService.show('Parking rejete.', 'info');
      }
    );
  }

  async deleteParking(parkingId: number): Promise<void> {
    this.openConfirmationModal(
      'Supprimer ce parking',
      'Cette suppression est irreversible. Verifiez qu aucun dossier ou traitement ne doit etre conserve.',
      async () => {
        await this.adminWorkflowService.deleteParking(parkingId);
        this.parkings = this.parkings.filter((parking) => parking.id_park !== parkingId);
        this.updateStats();
        this.toastService.show('Parking supprime avec succes.', 'success');
      }
    );
  }

  async activateSubscription(abonnementId: number): Promise<void> {
    try {
      const updated = await this.adminWorkflowService.updateAppSubscriptionStatus(abonnementId, 'actif');
      this.replaceSubscription(updated);
      this.toastService.show('Abonnement parking active avec succes.', 'success');
    } catch (error) {
      console.error('Erreur activation abonnement parking', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible d activer cet abonnement.'), 'error');
    }
  }

  async suspendSubscription(abonnementId: number): Promise<void> {
    this.openDecisionModal(
      'Motif de la suspension de l abonnement',
      'Indiquez pourquoi cet abonnement est suspendu.',
      async (reason) => {
        const updated = await this.adminWorkflowService.updateAppSubscriptionStatus(
          abonnementId,
          'suspendu',
          reason
        );
        this.replaceSubscription(updated);
        this.toastService.show('Abonnement suspendu.', 'info');
      }
    );
  }

  updateStats(): void {
    this.stats.totalUsers = this.users.filter((user) => user.role !== 'admin').length;
    this.stats.totalDrivers = this.users.filter((user) => user.role === 'conducteur').length;
    this.stats.totalOwners = this.users.filter((user) => user.role === 'owner').length;
    this.stats.totalParkings = this.parkings.length;
    this.stats.activeParkings = this.parkings.filter((parking) => parking.statut === 'actif').length;
    this.stats.pendingParkings = this.parkings.filter(
      (parking) => parking.validation_status === 'en_attente_validation'
    ).length;
    this.stats.pendingSubscriptions = this.subscriptions.filter(
      (subscription) => subscription.statut === 'en_attente'
    ).length;
    this.stats.activeSubscriptions = this.subscriptions.filter(
      (subscription) => subscription.statut === 'actif'
    ).length;
    this.stats.totalRevenue = this.subscriptions
      .filter((subscription) => subscription.statut === 'actif')
      .reduce((sum, subscription) => sum + Number(subscription.tarif || 0), 0);
  }

  getRoleLabel(role: string): string {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'owner':
        return 'Proprietaire';
      case 'conducteur':
        return 'Conducteur';
      default:
        return role;
    }
  }

  getValidationLabel(status: string): string {
    switch (status) {
      case 'valide':
        return 'Valide';
      case 'en_attente_validation':
        return 'En attente';
      case 'rejete':
        return 'Rejete';
      case 'brouillon':
        return 'Brouillon';
      default:
        return status;
    }
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'admin':
        return 'badge-danger';
      case 'owner':
        return 'badge-primary';
      case 'conducteur':
        return 'badge-success';
      default:
        return 'badge-secondary';
    }
  }

  getValidationBadgeClass(status: string): string {
    switch (status) {
      case 'valide':
        return 'badge-success';
      case 'en_attente_validation':
        return 'badge-warning';
      case 'rejete':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  }

  getSubscriptionBadgeClass(status: string): string {
    switch (status) {
      case 'actif':
        return 'badge-success';
      case 'en_attente':
        return 'badge-warning';
      case 'suspendu':
        return 'badge-danger';
      case 'expire':
        return 'badge-secondary';
      default:
        return 'badge-secondary';
    }
  }

  getSubscriptionStatusLabel(status: string): string {
    switch (status) {
      case 'actif':
        return 'Actif';
      case 'en_attente':
        return 'En attente admin';
      case 'suspendu':
        return 'Suspendu';
      case 'expire':
        return 'Expire';
      default:
        return status;
    }
  }

  getOwnerStatusLabel(status?: string | null): string {
    switch (status) {
      case 'accepte':
        return 'Accepte';
      case 'refuse':
        return 'Refuse';
      case 'suspendu':
        return 'Suspendu';
      case 'en_attente':
        return 'En attente';
      default:
        return 'N/A';
    }
  }

  getOwnerStatusBadgeClass(status?: string | null): string {
    switch (status) {
      case 'accepte':
        return 'badge-success';
      case 'refuse':
        return 'badge-danger';
      case 'suspendu':
        return 'badge-secondary';
      case 'en_attente':
        return 'badge-warning';
      default:
        return 'badge-secondary';
    }
  }

  getParkingOwnerName(ownerId: number): string {
    return this.users.find((user) => user.id_compte === ownerId)?.nom || `Owner #${ownerId}`;
  }

  canApproveParking(parking: AdminParkingRecord): boolean {
    return parking.owner_status === 'accepte';
  }

  getParkingApprovalHint(parking: AdminParkingRecord): string | null {
    if (parking.validation_status !== 'en_attente_validation') {
      if (
        parking.validation_status === 'valide' &&
        (parking.setup_status === 'en_cours' || parking.setup_status === 'terminee')
      ) {
        return 'Parking deja valide. Toute desactivation devra tenir compte de la configuration et des abonnements lies.';
      }
      return null;
    }

    if (parking.owner_status !== 'accepte') {
      return 'Le compte owner doit etre accepte avant validation du parking.';
    }

    return 'Verifier les informations avant approbation.';
  }

  getOwnerDecisionHint(user: AdminUserRecord): string | null {
    if (user.role !== 'owner') {
      return null;
    }

    return user.owner_status_reason || null;
  }

  getParkingReviewStepLabel(parking: AdminParkingRecord): string {
    if (parking.validation_status === 'valide') {
      return 'Validation admin terminee';
    }
    if (parking.validation_status === 'rejete') {
      return 'Dossier retourne au proprietaire';
    }
    if (parking.owner_status !== 'accepte') {
      return 'En attente de validation du compte owner';
    }
    return 'Pret pour revue admin du parking';
  }

  getSetupStatusLabel(status?: string): string {
    switch (status) {
      case 'terminee':
        return 'Parking setup termine';
      case 'en_cours':
        return 'Parking setup en cours';
      default:
        return 'Parking setup non commence';
    }
  }

  getAiSetupStatusLabel(status?: string): string {
    switch (status) {
      case 'active':
        return 'IA active';
      case 'testee':
        return 'IA testee';
      case 'en_cours':
        return 'IA en cours';
      default:
        return 'IA non configuree';
    }
  }

  canActivateSubscription(subscription: AdminAppSubscriptionRecord): boolean {
    return subscription.owner?.owner_status === 'accepte' && subscription.parking?.validation_status === 'valide';
  }

  getSubscriptionActionHint(subscription: AdminAppSubscriptionRecord): string | null {
    if (subscription.admin_status_reason) {
      return subscription.admin_status_reason;
    }

    if (subscription.statut === 'actif') {
      return 'Suspendre l abonnement si le parking ou le compte owner doit etre bloque.';
    }

    if (subscription.owner?.owner_status !== 'accepte') {
      return 'Le compte owner doit etre accepte avant activation de cet abonnement.';
    }

    if (subscription.parking?.validation_status !== 'valide') {
      return 'Le parking doit etre valide avant activation de cet abonnement.';
    }

    return 'Abonnement pret pour activation admin.';
  }

  async reloadData(): Promise<void> {
    await this.loadDashboardData();
  }

  setActiveSection(section: 'users' | 'parkings' | 'subscriptions'): void {
    this.activeSection = section;
  }

  onSectionTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0]?.clientX ?? null;
  }

  onSectionTouchEnd(event: TouchEvent): void {
    if (this.touchStartX == null) {
      return;
    }

    const endX = event.changedTouches[0]?.clientX ?? this.touchStartX;
    const deltaX = endX - this.touchStartX;
    this.touchStartX = null;

    if (Math.abs(deltaX) < 50) {
      return;
    }

    const sections: Array<'users' | 'parkings' | 'subscriptions'> = ['users', 'parkings', 'subscriptions'];
    const currentIndex = sections.indexOf(this.activeSection);
    const nextIndex = deltaX < 0 ? Math.min(currentIndex + 1, sections.length - 1) : Math.max(currentIndex - 1, 0);
    this.activeSection = sections[nextIndex];
  }

  logout(): void {
    this.authService.logout();
    this.toastService.show('Deconnexion reussie', 'success');
  }

  private touchStartX: number | null = null;

  private async loadDashboardData(): Promise<void> {
    this.isLoading = true;

    try {
      const [users, parkings, subscriptions] = await Promise.all([
        this.adminWorkflowService.getUsers(),
        this.adminWorkflowService.getParkings(),
        this.adminWorkflowService.getAppSubscriptions(),
      ]);

      this.users = users;
      this.parkings = parkings;
      this.subscriptions = subscriptions;
      this.updateStats();
    } catch (error) {
      console.error('Erreur chargement dashboard admin', error);
      this.toastService.show('Impossible de charger les donnees admin.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  private replaceSubscription(updated: AdminAppSubscriptionRecord): void {
    this.subscriptions = this.subscriptions.map((subscription) =>
      subscription.id_abon === updated.id_abon
        ? {
            ...subscription,
            ...updated,
          }
        : subscription
    );
    this.updateStats();
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    const payload = (error as { error?: { msg?: string; error?: string } })?.error;
    return payload?.msg || payload?.error || fallback;
  }

  closeDecisionModal(): void {
    this.decisionModalOpen = false;
    this.decisionReason = '';
    this.decisionModalTitle = '';
    this.decisionModalDescription = '';
    this.decisionRequiresReason = true;
    this.decisionConfirmLabel = 'Confirmer';
    this.pendingDecisionAction = null;
  }

  async confirmDecisionModal(): Promise<void> {
    const reason = this.decisionReason.trim();
    if (this.decisionRequiresReason && !reason) {
      this.toastService.show('Le motif est obligatoire pour cette action.', 'error');
      return;
    }

    const action = this.pendingDecisionAction;
    if (!action) {
      this.closeDecisionModal();
      return;
    }

    try {
      await action();
      this.closeDecisionModal();
    } catch (error) {
      console.error('Erreur lors de l execution de la decision admin', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible de finaliser cette action.'), 'error');
    }
  }

  private openDecisionModal(
    title: string,
    description: string,
    actionFactory: (reason: string) => Promise<void>
  ): void {
    this.decisionModalTitle = title;
    this.decisionModalDescription = description;
    this.decisionRequiresReason = true;
    this.decisionConfirmLabel = 'Confirmer';
    this.decisionReason = '';
    this.pendingDecisionAction = async () => actionFactory(this.decisionReason.trim());
    this.decisionModalOpen = true;
  }

  private openConfirmationModal(
    title: string,
    description: string,
    action: () => Promise<void>
  ): void {
    this.decisionModalTitle = title;
    this.decisionModalDescription = description;
    this.decisionRequiresReason = false;
    this.decisionConfirmLabel = 'Supprimer';
    this.decisionReason = '';
    this.pendingDecisionAction = action;
    this.decisionModalOpen = true;
  }
}
