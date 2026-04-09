import { Component, OnInit } from '@angular/core';

import { AuthService } from '../../../services/auth.service';
import {
  AdminParkingRecord,
  AdminUserRecord,
  AdminWorkflowService,
} from '../../../services/admin-workflow.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class AdminDashboardPage implements OnInit {
  stats = {
    totalUsers: 0,
    totalDrivers: 0,
    totalOwners: 0,
    totalParkings: 0,
    activeParkings: 0,
    pendingParkings: 0,
    totalReservations: 0,
    totalRevenue: 0,
  };

  users: AdminUserRecord[] = [];
  parkings: AdminParkingRecord[] = [];
  isLoading = false;

  userSearchTerm = '';
  userRoleFilter: 'all' | 'conducteur' | 'owner' | 'admin' = 'all';

  parkingSearchTerm = '';
  parkingStatusFilter: 'all' | 'en_attente_validation' | 'valide' | 'rejete' = 'all';

  constructor(
    private authService: AuthService,
    private adminWorkflowService: AdminWorkflowService,
    private toastService: ToastService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadDashboardData();
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

  async approveOwner(userId: number): Promise<void> {
    try {
      const updatedUser = await this.adminWorkflowService.updateOwnerStatus(userId, 'accepte');
      this.users = this.users.map((user) => (user.id_compte === userId ? updatedUser : user));
      this.updateStats();
      this.toastService.show('Compte owner approuve avec succes.', 'success');
    } catch (error) {
      console.error('Erreur approbation owner', error);
      this.toastService.show('Impossible d approuver ce compte owner.', 'error');
    }
  }

  async rejectOwner(userId: number): Promise<void> {
    try {
      const updatedUser = await this.adminWorkflowService.updateOwnerStatus(userId, 'refuse');
      this.users = this.users.map((user) => (user.id_compte === userId ? updatedUser : user));
      this.updateStats();
      this.toastService.show('Compte owner rejete.', 'info');
    } catch (error) {
      console.error('Erreur rejet owner', error);
      this.toastService.show('Impossible de rejeter ce compte owner.', 'error');
    }
  }

  async deleteUser(userId: number): Promise<void> {
    if (!confirm('Etes-vous sur de vouloir supprimer cet utilisateur ?')) {
      return;
    }

    try {
      await this.adminWorkflowService.deleteUser(userId);
      this.users = this.users.filter((user) => user.id_compte !== userId);
      this.parkings = this.parkings.filter((parking) => parking.owner_id !== userId);
      this.updateStats();
      this.toastService.show('Utilisateur supprime avec succes.', 'success');
    } catch (error) {
      console.error('Erreur suppression utilisateur', error);
      this.toastService.show('Impossible de supprimer cet utilisateur.', 'error');
    }
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
      this.toastService.show('Impossible d approuver ce parking.', 'error');
    }
  }

  async rejectParking(parkingId: number): Promise<void> {
    try {
      const updatedParking = await this.adminWorkflowService.updateParkingValidationStatus(
        parkingId,
        'rejete'
      );
      this.parkings = this.parkings.map((parking) =>
        parking.id_park === parkingId ? updatedParking : parking
      );
      this.updateStats();
      this.toastService.show('Parking rejete.', 'info');
    } catch (error) {
      console.error('Erreur rejet parking', error);
      this.toastService.show('Impossible de rejeter ce parking.', 'error');
    }
  }

  async deleteParking(parkingId: number): Promise<void> {
    if (!confirm('Etes-vous sur de vouloir supprimer ce parking ?')) {
      return;
    }

    try {
      await this.adminWorkflowService.deleteParking(parkingId);
      this.parkings = this.parkings.filter((parking) => parking.id_park !== parkingId);
      this.updateStats();
      this.toastService.show('Parking supprime avec succes.', 'success');
    } catch (error) {
      console.error('Erreur suppression parking', error);
      this.toastService.show('Impossible de supprimer ce parking.', 'error');
    }
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

  getOwnerStatusLabel(status?: string): string {
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

  getOwnerStatusBadgeClass(status?: string): string {
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

  async reloadData(): Promise<void> {
    await this.loadDashboardData();
  }

  logout(): void {
    this.authService.logout();
    this.toastService.show('Deconnexion reussie', 'success');
  }

  private async loadDashboardData(): Promise<void> {
    this.isLoading = true;

    try {
      const [users, parkings] = await Promise.all([
        this.adminWorkflowService.getUsers(),
        this.adminWorkflowService.getParkings(),
      ]);

      this.users = users;
      this.parkings = parkings;
      this.updateStats();
    } catch (error) {
      console.error('Erreur chargement dashboard admin', error);
      this.toastService.show('Impossible de charger les donnees admin.', 'error');
    } finally {
      this.isLoading = false;
    }
  }
}
