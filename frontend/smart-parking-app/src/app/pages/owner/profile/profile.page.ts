import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../services/auth.service';
import {
  CreateParkingPayload,
  ParkingDto,
  ParkingService,
  UpdateParkingPayload,
} from '../../../services/parking.service';
import { PlaceDto, PlaceService } from '../../../services/place.service';
import {
  ParkingAISource,
  ParkingAiAuthError,
  ParkingAiSourceService,
} from '../../../services/parking-ai-source.service';
import { OwnerWorkflowState } from '../../../models/owner-workflow.model';
import { OwnerWorkflowService } from '../../../services/owner-workflow.service';
import { ToastService } from '../../../services/toast.service';
import { HeaderNotificationItem } from '../../../shared/components/header/header.component';

export interface OwnerProfile {
  id_compte: number;
  nom: string;
  email: string;
  telephone: string;
  role: string;
  owner_status?: 'en_attente' | 'accepte' | 'refuse' | 'suspendu' | null;
  companyName?: string;
  avatar?: string;
}

export interface ParkingInfo {
  id_park: number;
  nom: string;
  adresse: string;
  ville: string;
  prix_heure: number;
  statut: string;
  validation_status?: string;
  totalSpaces: number;
  availableSpaces: number;
  activeSubscriptions: number;
}

interface OwnerPortfolioStats {
  totalParkings: number;
  totalSpaces: number;
  availableSpaces: number;
  occupancyRate: number;
  activeParkings: number;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: false,
})
export class ProfilePage implements OnInit {
  owner: OwnerProfile = {
    id_compte: 1,
    nom: 'Ahmed Ben Ali',
    email: 'owner@smartparking.com',
    telephone: '+216 12 345 678',
    role: 'owner',
    companyName: 'Parking Express',
    avatar: 'assets/default-avatar.png',
  };

  parkings: ParkingInfo[] = [];
  parkingSearch = '';
  parkingStatusFilter: 'all' | 'actif' | 'maintenance' = 'all';

  isEditingProfile = false;
  showAddParking = false;
  selectedParking: ParkingInfo | null = null;
  selectedParkingSources: ParkingAISource[] = [];
  isEditingParking = false;
  showDeleteConfirm = false;
  parkingToDelete: ParkingInfo | null = null;
  isSavingProfile = false;
  isCreatingParking = false;
  workflowState: OwnerWorkflowState | null = null;
  private previewErrorIds = new Set<number>();

  editProfileData = {
    nom: '',
    email: '',
    telephone: '',
  };

  newParkingData: Partial<ParkingInfo> = {
    nom: '',
    adresse: '',
    ville: '',
    prix_heure: 2.5,
    statut: 'actif',
    totalSpaces: 20,
    availableSpaces: 20,
  };

  editParkingData: ParkingInfo = {
    id_park: 0,
    nom: '',
    adresse: '',
    ville: '',
    prix_heure: 0,
    statut: 'actif',
    totalSpaces: 0,
    availableSpaces: 0,
    activeSubscriptions: 0,
  };

  constructor(
    private authService: AuthService,
    private parkingService: ParkingService,
    private placeService: PlaceService,
    private parkingAiSourceService: ParkingAiSourceService,
    private ownerWorkflowService: OwnerWorkflowService,
    private toastService: ToastService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    const currentUser = this.authService.getCurrentUser() as (OwnerProfile & { id?: number | string; id_compte?: number | string }) | null;
    if (currentUser) {
      const normalizedOwnerId = Number(currentUser.id ?? currentUser.id_compte ?? this.owner.id_compte);
      this.owner = {
        ...this.owner,
        id_compte: normalizedOwnerId,
        nom: currentUser.nom || this.owner.nom,
        email: currentUser.email || this.owner.email,
        telephone: currentUser.telephone || this.owner.telephone,
        owner_status: currentUser.owner_status ?? this.owner.owner_status ?? null,
      };
    }

    await this.loadOwnerParkings();
    try {
      this.workflowState = await this.ownerWorkflowService.refresh();
      this.owner.owner_status = this.workflowState.ownerStatus;
    } catch (error) {
      console.warn('Workflow owner indisponible, fallback sur les donnees locales du profil.', error);
      this.workflowState = this.owner.owner_status
        ? {
            ownerStatus: this.owner.owner_status,
            parkingStatus: 'en_attente_validation',
            subscriptionStatus: 'non_souscrit',
            parkingSetupStatus: 'non_commencee',
            aiSetupStatus: 'non_configuree',
            hasParking: this.parkings.length > 0,
            parkingId: this.parkings[0]?.id_park ?? null,
            parkingName: this.parkings[0]?.nom ?? null,
          }
        : null;
    }
  }

  get ownerInitials(): string {
    const source = (this.owner.nom || this.owner.companyName || '').trim();
    const parts = source.split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join('') || 'OW';
  }

  get portfolioStats(): OwnerPortfolioStats {
    const totalParkings = this.parkings.length;
    const totalSpaces = this.parkings.reduce((sum, parking) => sum + parking.totalSpaces, 0);
    const availableSpaces = this.parkings.reduce((sum, parking) => sum + parking.availableSpaces, 0);
    const activeParkings = this.parkings.filter((parking) => parking.statut === 'actif').length;
    const occupiedSpaces = Math.max(totalSpaces - availableSpaces, 0);

    return {
      totalParkings,
      totalSpaces,
      availableSpaces,
      occupancyRate: totalSpaces > 0 ? Math.round((occupiedSpaces / totalSpaces) * 100) : 0,
      activeParkings,
    };
  }

  get filteredParkings(): ParkingInfo[] {
    const search = this.parkingSearch.trim().toLowerCase();
    return this.parkings.filter((parking) => {
      const matchesStatus =
        this.parkingStatusFilter === 'all' ||
        this.matchesParkingFilter(parking.statut, this.parkingStatusFilter);
      const matchesSearch =
        !search ||
        parking.nom.toLowerCase().includes(search) ||
        parking.adresse.toLowerCase().includes(search) ||
        parking.ville.toLowerCase().includes(search);

      return matchesStatus && matchesSearch;
    });
  }

  get notificationItems(): HeaderNotificationItem[] {
    const parkingValidatedNotification =
      this.workflowState?.ownerStatus === 'accepte' &&
      this.workflowState?.parkingStatus === 'valide' &&
      this.workflowState?.subscriptionStatus !== 'actif'
        ? [
            {
              title: 'Parking valide par l admin',
              description: 'Votre parking est valide. Activez maintenant l abonnement pour poursuivre le workflow.',
              timestamp: this.workflowState?.parkingId ? `Parking #${this.workflowState.parkingId}` : 'Mise a jour recente',
              icon: 'checkmark-circle-outline',
              tone: 'success' as const,
            },
          ]
        : [];

    const maintenanceNotifications = this.parkings
      .filter((parking) => parking.statut === 'maintenance')
      .map((parking) => ({
        title: 'Parking en maintenance',
        description: `${parking.nom} est actuellement indisponible`,
        timestamp: 'Mise a jour recente',
        icon: 'construct-outline',
        tone: 'warning' as const,
      }));

    const lowCapacityNotifications = this.parkings
      .filter((parking) => parking.availableSpaces > 0 && parking.availableSpaces <= 5)
      .map((parking) => ({
        title: 'Faible disponibilite',
        description: `${parking.nom} n a plus que ${parking.availableSpaces} places libres`,
        timestamp: 'Aujourd hui',
        icon: 'alert-circle-outline',
        tone: 'alert' as const,
      }));

    return [...parkingValidatedNotification, ...maintenanceNotifications, ...lowCapacityNotifications].slice(0, 5);
  }

  get notificationsCount(): number {
    return this.notificationItems.length;
  }

  get selectedParkingVideos(): ParkingAISource[] {
    return this.selectedParkingSources.filter((source) => source.source_type === 'video');
  }

  get selectedParkingImages(): ParkingAISource[] {
    return this.selectedParkingSources.filter((source) => source.source_type === 'image');
  }

  get selectedParkingCameras(): ParkingAISource[] {
    return this.selectedParkingSources.filter((source) => source.source_type === 'camera');
  }

  get canCreateParking(): boolean {
    if (this.workflowState?.ownerStatus === 'accepte') {
      return true;
    }
    if (this.owner.owner_status === 'accepte') {
      return true;
    }
    return this.workflowState == null;
  }

  get pendingReviewParking(): ParkingInfo | null {
    return (
      [...this.parkings]
        .reverse()
        .find((parking) => parking.validation_status === 'en_attente_validation') ?? null
    );
  }

  get rejectedParking(): ParkingInfo | null {
    return (
      [...this.parkings]
        .reverse()
        .find((parking) => parking.validation_status === 'rejete') ?? null
    );
  }

  get canSubmitNewParking(): boolean {
    return !this.getNewParkingValidationMessage();
  }

  get newParkingWorkflowHint(): string {
    if (!this.canCreateParking) {
      return 'Le compte owner doit etre valide avant toute creation de parking.';
    }

    if (this.pendingReviewParking) {
      return `Un dossier est deja en attente de validation admin pour ${this.pendingReviewParking.nom}. Vous pouvez ajouter un autre parking, mais il suivra le meme workflow.`;
    }

    return 'Apres creation, le parking passera en attente de validation admin, puis vous devrez activer l abonnement et terminer la configuration.';
  }

  get portfolioNextActionTitle(): string {
    if (!this.canCreateParking) {
      return 'Attendre la validation du compte owner';
    }
    if (this.pendingReviewParking) {
      return `Suivre la validation admin de ${this.pendingReviewParking.nom}`;
    }
    if (this.rejectedParking) {
      return `Corriger ou mettre a jour ${this.rejectedParking.nom}`;
    }
    if (this.workflowState?.parkingStatus === 'valide' && this.workflowState?.subscriptionStatus !== 'actif') {
      return 'Activer l abonnement du parking valide';
    }
    if (this.canCreateParking && this.parkings.length === 0) {
      return 'Creer le premier parking';
    }
    return 'Completer la configuration du portefeuille';
  }

  logout(): void {
    this.authService.logout();
  }

  startEditProfile(): void {
    this.editProfileData = {
      nom: this.owner.nom,
      email: this.owner.email,
      telephone: this.owner.telephone,
    };
    this.isEditingProfile = true;
  }

  async saveProfile(): Promise<void> {
    this.isSavingProfile = true;
    try {
      const updatedUser = await firstValueFrom(
        this.authService.updateProfile({
          nom: this.editProfileData.nom,
          email: this.editProfileData.email,
          telephone: this.editProfileData.telephone,
        })
      );

      this.owner = {
        ...this.owner,
        id_compte: updatedUser.id,
        nom: updatedUser.nom,
        email: updatedUser.email,
        telephone: updatedUser.telephone || '',
      };
      this.isEditingProfile = false;
      this.toastService.show('Profil mis a jour avec succes', 'success');
    } catch (error: any) {
      this.toastService.show(
        error?.error?.msg || error?.error?.error || 'Impossible de mettre a jour le profil',
        'error'
      );
    } finally {
      this.isSavingProfile = false;
    }
  }

  cancelEditProfile(): void {
    this.isEditingProfile = false;
  }

  async selectParking(parking: ParkingInfo): Promise<void> {
    this.selectedParking = parking;
    this.selectedParkingSources = [];
    this.previewErrorIds.clear();
    this.isEditingParking = false;

    try {
      this.selectedParkingSources = await this.parkingAiSourceService.getSources(parking.id_park);
    } catch (error) {
      console.error('Erreur chargement sources IA parking', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible de charger les videos de ce parking.'), 'error');
    }
  }

  backToList(): void {
    this.selectedParking = null;
    this.selectedParkingSources = [];
    this.previewErrorIds.clear();
    this.showAddParking = false;
  }

  async openAiSetup(): Promise<void> {
    await this.router.navigateByUrl('/owner/ai-setup');
  }

  startEditParking(): void {
    if (this.selectedParking) {
      this.editParkingData = { ...this.selectedParking };
      this.isEditingParking = true;
    }
  }

  async saveParking(): Promise<void> {
    if (!this.selectedParking) {
      return;
    }

    const validationMessage = this.getEditParkingValidationMessage();
    if (validationMessage) {
      this.toastService.show(validationMessage, 'error');
      return;
    }

    const payload: UpdateParkingPayload = {
      nom: this.editParkingData.nom.trim(),
      adresse: this.buildAddress(this.editParkingData.adresse, this.editParkingData.ville),
      capacite: this.editParkingData.totalSpaces,
      prix_heure: this.editParkingData.prix_heure,
      statut: this.toBackendParkingStatus(this.editParkingData.statut),
    };

    try {
      await firstValueFrom(this.parkingService.updateParking(this.selectedParking.id_park, payload));
      await this.loadOwnerParkings(this.selectedParking.id_park);
      this.workflowState = await this.ownerWorkflowService.refresh();
      this.isEditingParking = false;
      this.toastService.show(
        'Parking mis a jour. Toute modification structurelle repasse en validation admin.',
        'success'
      );
    } catch (error: any) {
      this.toastService.show(
        error?.error?.msg || error?.error?.error || 'Impossible de mettre a jour ce parking.',
        'error'
      );
    }
  }

  cancelEditParking(): void {
    this.isEditingParking = false;
  }

  confirmDelete(parking: ParkingInfo): void {
    this.parkingToDelete = parking;
    this.showDeleteConfirm = true;
  }

  async deleteParking(): Promise<void> {
    if (this.parkingToDelete) {
      try {
        await firstValueFrom(this.parkingService.deleteParking(this.parkingToDelete.id_park));
        this.showDeleteConfirm = false;
        this.parkingToDelete = null;
        this.selectedParking = null;
        await this.loadOwnerParkings();
        this.toastService.show('Parking supprime avec succes.', 'success');
      } catch (error: any) {
        this.toastService.show(
          error?.error?.msg || error?.error?.error || 'Impossible de supprimer ce parking.',
          'error'
        );
      }
      return;
    }

    this.showDeleteConfirm = false;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.parkingToDelete = null;
  }

  openAddParking(): void {
    if (!this.canCreateParking) {
      this.toastService.show(
        'Le compte owner doit etre accepte avant de creer un parking.',
        'error'
      );
      return;
    }

    this.showAddParking = true;
    this.selectedParking = null;
    this.newParkingData = {
      nom: '',
      adresse: '',
      ville: '',
      prix_heure: 2.5,
      statut: 'actif',
      totalSpaces: 20,
      availableSpaces: 20,
    };
  }

  async addParking(): Promise<void> {
    if (!this.canCreateParking) {
      this.toastService.show(
        'Le compte owner doit etre accepte avant de creer un parking.',
        'error'
      );
      return;
    }

    const validationMessage = this.getNewParkingValidationMessage();
    if (validationMessage) {
      this.toastService.show(validationMessage, 'error');
      return;
    }

    const payload: CreateParkingPayload = {
      nom: this.newParkingData.nom!.trim(),
      adresse: this.buildAddress(this.newParkingData.adresse, this.newParkingData.ville),
      capacite: this.newParkingData.totalSpaces || 20,
      prix_heure: this.newParkingData.prix_heure || 2.5,
      statut: this.toBackendParkingStatus(this.newParkingData.statut || 'actif'),
    };

    try {
      this.isCreatingParking = true;
      const response = await firstValueFrom(this.parkingService.createParking(payload));
      this.showAddParking = false;
      this.selectedParking = null;
      await this.loadOwnerParkings(response.parking.id_park);
      this.workflowState = await this.ownerWorkflowService.refresh();
      this.toastService.show('Parking ajoute. Il devra etre valide par l admin puis configure.', 'success');
      await this.router.navigateByUrl(this.ownerWorkflowService.getNextRoute(this.workflowState));
    } catch (error: any) {
      console.error('Erreur creation parking', error);
      this.toastService.show(
        error?.error?.msg || error?.error?.error || 'Impossible de creer ce parking.',
        'error'
      );
    } finally {
      this.isCreatingParking = false;
    }
  }

  getStatusColor(status: string): string {
    return this.toBackendParkingStatus(status) === 'actif' ? 'success' : 'warning';
  }

  getStatusLabel(status: string): string {
    return this.toBackendParkingStatus(status) === 'actif' ? 'Actif' : 'Maintenance';
  }

  getValidationStatusLabel(status?: string): string {
    switch (status) {
      case 'en_attente_validation':
        return 'En attente';
      case 'valide':
        return 'Valide';
      case 'rejete':
        return 'Rejete';
      case 'brouillon':
        return 'Brouillon';
      default:
        return status || 'Inconnu';
    }
  }

  getParkingNextStep(parking: ParkingInfo): string {
    switch (parking.validation_status) {
      case 'en_attente_validation':
        return 'En attente de revue admin avant abonnement.';
      case 'valide':
        if (
          this.workflowState?.parkingId === parking.id_park &&
          this.workflowState?.subscriptionStatus !== 'actif'
        ) {
          return 'Parking valide. Passez a l abonnement.';
        }
        return 'Parking valide. La configuration peut continuer.';
      case 'rejete':
        return 'Le dossier a ete rejete. Mettez a jour les informations avant une nouvelle soumission.';
      default:
        return 'Completez les informations pour lancer le workflow.';
    }
  }

  getParkingOccupancy(parking: ParkingInfo): number {
    if (parking.totalSpaces <= 0) {
      return 0;
    }

    return Math.round(((parking.totalSpaces - parking.availableSpaces) / parking.totalSpaces) * 100);
  }

  setParkingStatusFilter(status: 'all' | 'actif' | 'maintenance'): void {
    this.parkingStatusFilter = status;
  }

  showPreview(source: ParkingAISource): boolean {
    return !!source.preview_url && !this.previewErrorIds.has(source.id_source);
  }

  markPreviewError(source: ParkingAISource): void {
    this.previewErrorIds.add(source.id_source);
  }

  private async loadOwnerParkings(selectedParkingId?: number): Promise<void> {
    const ownerId = Number(this.owner.id_compte);
    let parkings: ParkingDto[] = [];
    let places: PlaceDto[] = [];

    try {
      parkings = await firstValueFrom(this.parkingService.getParkings());
    } catch (error: any) {
      this.parkings = [];
      this.selectedParking = null;
      this.toastService.show(
        error?.error?.msg || error?.error?.error || 'Impossible de charger les parkings owner.',
        'error'
      );
      return;
    }

    try {
      places = await firstValueFrom(this.placeService.getPlaces());
    } catch (error) {
      console.warn('Chargement des places indisponible, utilisation de la capacite parking.', error);
      places = [];
    }

    const ownerParkings = parkings.filter((parking) => Number(parking.owner_id) === ownerId);
    this.parkings = ownerParkings.map((parking) => this.mapParking(parking, places));

    const targetId = selectedParkingId ?? this.selectedParking?.id_park;
    this.selectedParking = targetId
      ? this.parkings.find((parking) => parking.id_park === targetId) ?? null
      : null;
  }

  private mapParking(parking: ParkingDto, places: PlaceDto[]): ParkingInfo {
    const parkingPlaces = places.filter((place) => place.parking_id === parking.id_park);
    const availableSpaces = parkingPlaces.length
      ? parkingPlaces.filter((place) => place.etat === 'libre').length
      : parking.capacite;

    return {
      id_park: parking.id_park,
      nom: parking.nom,
      adresse: parking.adresse,
      ville: this.extractCity(parking.adresse),
      prix_heure: Number(parking.prix_heure),
      statut: this.toFrontendParkingStatus(parking.statut),
      validation_status: parking.validation_status || 'brouillon',
      totalSpaces: parking.capacite,
      availableSpaces,
      activeSubscriptions: 0,
    };
  }

  private matchesParkingFilter(status: string, filter: 'all' | 'actif' | 'maintenance'): boolean {
    const normalizedStatus = this.toFrontendParkingStatus(status);
    if (filter === 'maintenance') {
      return normalizedStatus !== 'actif';
    }
    return normalizedStatus === filter;
  }

  private toFrontendParkingStatus(status: string): 'actif' | 'maintenance' {
    return this.toBackendParkingStatus(status) === 'actif' ? 'actif' : 'maintenance';
  }

  private toBackendParkingStatus(status: string): 'actif' | 'inactif' {
    return status === 'actif' ? 'actif' : 'inactif';
  }

  private extractCity(address: string): string {
    const segments = address
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean);
    return segments[segments.length - 1] || 'Ville';
  }

  private buildAddress(address?: string, city?: string): string {
    const trimmedAddress = (address || '').trim();
    const trimmedCity = (city || '').trim();
    return trimmedCity ? `${trimmedAddress}, ${trimmedCity}` : trimmedAddress;
  }

  private getNewParkingValidationMessage(): string | null {
    const nom = this.newParkingData.nom?.trim() || '';
    const adresse = this.newParkingData.adresse?.trim() || '';

    if (!nom || !adresse) {
      return 'Le nom et l adresse du parking sont obligatoires.';
    }

    if (!this.newParkingData.totalSpaces || this.newParkingData.totalSpaces <= 0) {
      return 'Le parking doit contenir au moins une place.';
    }

    if (this.newParkingData.prix_heure == null || this.newParkingData.prix_heure < 0) {
      return 'Le prix horaire doit etre positif ou nul.';
    }

    return null;
  }

  private getEditParkingValidationMessage(): string | null {
    const nom = this.editParkingData.nom?.trim() || '';
    const adresse = this.editParkingData.adresse?.trim() || '';

    if (!nom || !adresse) {
      return 'Le nom et l adresse du parking sont obligatoires.';
    }

    if (!this.editParkingData.totalSpaces || this.editParkingData.totalSpaces <= 0) {
      return 'Le parking doit contenir au moins une place.';
    }

    if (this.editParkingData.prix_heure == null || this.editParkingData.prix_heure < 0) {
      return 'Le prix horaire doit etre positif ou nul.';
    }

    return null;
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof ParkingAiAuthError) {
      return error.message;
    }

    const payload = (error as { error?: { msg?: string; error?: string } })?.error;
    return payload?.msg || payload?.error || fallback;
  }
}
