import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
  owner_status_reason?: string | null;
  companyName?: string;
  avatar?: string;
}

export interface ParkingInfo {
  id_park: number;
  nom: string;
  adresse: string;
  ville: string;
  prix_heure: number;
  statut: 'actif' | 'inactif';
  validation_status?: string;
  validation_reason?: string | null;
  setup_status?: string;
  ai_setup_status?: string;
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

interface ParkingPortfolioHealth {
  pendingValidation: number;
  rejected: number;
  lowCapacity: number;
  maintenance: number;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: false,
})
export class ProfilePage implements OnInit, OnDestroy {
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
  parkingStatusFilter: 'all' | 'actif' | 'inactif' = 'all';

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
  private sourceBlobs = new Map<number, string>();
  private reanalyzingSourceIds = new Set<number>();
  private autoUpdatingCameraIds = new Set<number>();
  private selectedParkingPollingTimer: ReturnType<typeof setInterval> | null = null;

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
    private router: Router,
    private route: ActivatedRoute
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
        owner_status_reason: currentUser.owner_status_reason ?? this.owner.owner_status_reason ?? null,
      };
    }

    await this.loadOwnerParkings();
    await this.applyParkingSelectionFromRoute();
    this.workflowState = await this.ownerWorkflowService.refresh();
    try {
      this.workflowState = await this.ownerWorkflowService.refresh();
      this.owner.owner_status = this.workflowState.ownerStatus;
      this.owner.owner_status_reason = this.workflowState.ownerStatusReason ?? null;
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

  ngOnDestroy(): void {
    this.stopSelectedParkingPolling();
    this.clearSourceBlobs();
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

  get portfolioHealth(): ParkingPortfolioHealth {
    return {
      pendingValidation: this.parkings.filter((parking) => parking.validation_status === 'en_attente_validation').length,
      rejected: this.parkings.filter((parking) => parking.validation_status === 'rejete').length,
      lowCapacity: this.parkings.filter((parking) => parking.availableSpaces > 0 && parking.availableSpaces <= 5).length,
      maintenance: this.parkings.filter((parking) => parking.statut === 'inactif').length,
    };
  }

  get filteredParkings(): ParkingInfo[] {
    const search = this.parkingSearch.trim().toLowerCase();
    return this.parkings
      .filter((parking) => {
        const matchesStatus =
          this.parkingStatusFilter === 'all' || parking.statut === this.parkingStatusFilter;
        const matchesSearch =
          !search ||
          parking.nom.toLowerCase().includes(search) ||
          parking.adresse.toLowerCase().includes(search) ||
          parking.ville.toLowerCase().includes(search);

        return matchesStatus && matchesSearch;
      })
      .sort((left, right) => {
        const scoreDiff = this.getParkingPriorityScore(right) - this.getParkingPriorityScore(left);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        const occupancyDiff = this.getParkingOccupancy(right) - this.getParkingOccupancy(left);
        if (occupancyDiff !== 0) {
          return occupancyDiff;
        }

        return left.nom.localeCompare(right.nom, 'fr', { sensitivity: 'base' });
      });
  }

  get hasActiveParkingFilters(): boolean {
    return Boolean(this.parkingSearch.trim()) || this.parkingStatusFilter !== 'all';
  }

  get filteredParkingSummary(): string {
    const count = this.filteredParkings.length;
    if (!count) {
      return 'Aucun parking visible avec les filtres actuels.';
    }

    if (count === this.parkings.length && !this.hasActiveParkingFilters) {
      return `${count} parking(s) classes par priorite operationnelle.`;
    }

    return `${count} parking(s) correspondent a la recherche ou au filtre.`;
  }

  get notificationItems(): HeaderNotificationItem[] {
    const ownerApprovalNotifications =
      this.workflowState?.ownerStatus === 'accepte'
        ? [
            {
              title: 'Compte owner accepte',
              description: this.workflowState.hasParking
                ? 'Votre compte est valide. Vous pouvez maintenant suivre la validation du parking.'
                : 'Votre compte est valide. Ajoutez maintenant votre premier parking.',
              timestamp: 'Validation admin',
              icon: 'checkmark-done-outline',
              tone: 'success' as const,
            },
          ]
        : this.workflowState?.ownerStatus === 'refuse'
          ? [
              {
                title: 'Compte owner refuse',
                description: 'Le compte owner a ete refuse. Verifiez vos informations ou contactez l admin.',
                timestamp: 'Decision admin',
                icon: 'alert-circle-outline',
                tone: 'alert' as const,
              },
            ]
          : [];

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
      .filter((parking) => parking.statut === 'inactif')
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

    const parkingReviewNotifications = this.parkings
      .filter((parking) =>
        parking.validation_status === 'en_attente_validation' || parking.validation_status === 'rejete'
      )
      .slice(0, 2)
      .map((parking) => ({
        title:
          parking.validation_status === 'rejete'
            ? 'Parking a corriger'
            : 'Parking en attente de validation',
        description: `${parking.nom} - ${this.getParkingNextStep(parking)}`,
        timestamp: `Parking #${parking.id_park}`,
        icon:
          parking.validation_status === 'rejete'
            ? 'close-circle-outline'
            : 'time-outline',
        tone:
          parking.validation_status === 'rejete'
            ? 'alert' as const
            : 'warning' as const,
      }));

    return [
      ...ownerApprovalNotifications,
      ...parkingValidatedNotification,
      ...parkingReviewNotifications,
      ...maintenanceNotifications,
      ...lowCapacityNotifications,
    ].slice(0, 5);
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
    return this.workflowState?.ownerStatus === 'accepte' || this.owner.owner_status === 'accepte';
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
    if (this.workflowState?.ownerStatus !== 'accepte') {
      return 'La creation du parking sera disponible des que le compte owner sera accepte par l admin.';
    }

    if (this.pendingReviewParking) {
      return `Un dossier est deja en attente de validation admin pour ${this.pendingReviewParking.nom}. Vous pouvez ajouter un autre parking, mais il suivra le meme workflow.`;
    }

    return 'Apres creation, le parking passera en attente de validation admin, puis vous devrez activer l abonnement et terminer la configuration.';
  }

  get portfolioNextActionTitle(): string {
    if (this.workflowState?.ownerStatus !== 'accepte' && this.parkings.length === 0) {
      return 'Attendre la validation du compte owner';
    }
    if (this.workflowState?.ownerStatus !== 'accepte') {
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

  get profilePrimaryActionLabel(): string {
    if (this.workflowState?.ownerStatus !== 'accepte') {
      return 'Suivre la validation';
    }
    if (this.workflowState?.parkingStatus === 'valide' && this.workflowState?.subscriptionStatus !== 'actif') {
      return 'Activer l abonnement';
    }
    if (this.selectedParking) {
      if (this.canOpenAiSetup) {
        return 'Ouvrir l IA';
      }
      return 'Configurer ce parking';
    }
    if (this.parkings.length === 0) {
      return 'Ajouter un parking';
    }
    return 'Ouvrir le parking prioritaire';
  }

  async handleProfilePrimaryAction(): Promise<void> {
    if (this.workflowState?.ownerStatus !== 'accepte') {
      await this.router.navigate(['/owner/pending']);
      return;
    }

    if (this.workflowState?.parkingStatus === 'valide' && this.workflowState?.subscriptionStatus !== 'actif') {
      await this.router.navigate(['/owner/subscription']);
      return;
    }

    if (this.selectedParking) {
      if (this.canOpenAiSetup) {
        await this.openAiSetup();
        return;
      }

      await this.openParkingSetup();
      return;
    }

    if (this.parkings.length === 0) {
      this.openAddParking();
      return;
    }

    const topParking = this.filteredParkings[0] ?? this.parkings[0];
    if (topParking) {
      await this.selectParking(topParking);
    }
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
    this.clearSourceBlobs();
    this.isEditingParking = false;
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { parking: parking.id_park },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });

    try {
      this.selectedParkingSources = await this.parkingAiSourceService.getSources(parking.id_park);
      await this.loadBlobUrlsForSources();
      this.syncSelectedParkingPolling();
    } catch (error) {
      console.error('Erreur chargement sources IA parking', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible de charger les videos de ce parking.'), 'error');
    }
  }

  backToList(): void {
    this.selectedParking = null;
    this.selectedParkingSources = [];
    this.stopSelectedParkingPolling();
    this.previewErrorIds.clear();
    this.clearSourceBlobs();
    this.showAddParking = false;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { parking: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  async openAiSetup(parking?: ParkingInfo | null): Promise<void> {
    const targetParking = parking ?? this.selectedParking;
    if (!targetParking) {
      this.toastService.show('Vous ne pouvez pas acceder a la configuration IA pour le moment.', 'error');
      return;
    }
    if (targetParking.validation_status !== 'valide') {
      this.toastService.show('Le parking doit d abord etre valide par l admin avant la configuration IA.', 'error');
      return;
    }
    if (targetParking.setup_status !== 'terminee') {
      this.toastService.show('Terminez d abord la configuration parking avant d ouvrir le module IA.', 'error');
      return;
    }
    await this.router.navigate(['/owner/ai-setup'], {
      queryParams: { parking: targetParking.id_park },
    });
  }

  async openParkingSetup(parking?: ParkingInfo | null): Promise<void> {
    const targetParking = parking ?? this.selectedParking;
    if (!targetParking) {
      this.toastService.show('Vous ne pouvez pas acceder a la configuration du parking pour le moment.', 'error');
      return;
    }
    await this.router.navigate(['/owner/parking-setup'], {
      queryParams: { parking: targetParking.id_park },
    });
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
        this.workflowState?.parkingId === this.selectedParking.id_park &&
        this.workflowState?.parkingStatus === 'valide' &&
        this.workflowState?.parkingSetupStatus !== 'terminee'
          ? 'Parking mis a jour. Vous pouvez poursuivre la configuration du parking.'
          : 'Parking mis a jour. Toute modification structurelle repasse en validation admin.',
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
        'Le compte owner doit etre valide par l admin avant d ajouter un parking.',
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
        return parking.validation_reason
          ? `Le dossier a ete rejete. Motif admin: ${parking.validation_reason}`
          : 'Le dossier a ete rejete. Mettez a jour les informations avant une nouvelle soumission.';
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

  get canOpenParkingSetup(): boolean {
    return Boolean(this.selectedParking);
  }

  get parkingSetupHint(): string {
    if (!this.selectedParking) {
      return 'Selectionnez un parking pour ouvrir sa configuration.';
    }

    return `Ouvrir la configuration detaillee de ${this.selectedParking.nom} pour gerer zones, etages et places.`;
  }

  get canOpenAiSetup(): boolean {
    return Boolean(
      this.selectedParking &&
      this.selectedParking.validation_status === 'valide' &&
      this.selectedParking.setup_status === 'terminee'
    );
  }

  get aiSetupHint(): string {
    if (!this.selectedParking) {
      return 'Selectionnez un parking pour ouvrir sa configuration IA.';
    }
    if (this.selectedParking.validation_status !== 'valide') {
      return 'Le parking doit etre valide par l admin avant la configuration IA.';
    }
    if (this.selectedParking.setup_status !== 'terminee') {
      return 'Terminez d abord la configuration parking pour debloquer l IA.';
    }
    return `Ouvrir les sources IA de ${this.selectedParking.nom} pour images, videos, cameras et calibration.`;
  }

  setParkingStatusFilter(status: 'all' | 'actif' | 'inactif'): void {
    this.parkingStatusFilter = status;
  }

  clearParkingFilters(): void {
    this.parkingSearch = '';
    this.parkingStatusFilter = 'all';
  }

  trackByParking(_: number, parking: ParkingInfo): number {
    return parking.id_park;
  }

  showPreview(source: ParkingAISource): boolean {
    return !!this.getSourceMediaUrl(source) && !this.previewErrorIds.has(source.id_source);
  }

  async goToOwnerHome(): Promise<void> {
    await this.router.navigate(['/owner/dashboard']);
  }

  canManageSource(source: ParkingAISource): boolean {
    return source.source_type === 'image' || source.source_type === 'video' || source.source_type === 'camera';
  }

  isReanalyzingSource(sourceId: number): boolean {
    return this.reanalyzingSourceIds.has(sourceId);
  }

  isAutoUpdatingCamera(sourceId: number): boolean {
    return this.autoUpdatingCameraIds.has(sourceId);
  }

  getCameraStatusLabel(source: ParkingAISource): string {
    switch (source.camera_status) {
      case 'active':
        return 'Active';
      case 'offline':
        return 'Hors ligne';
      case 'error':
        return 'Erreur';
      default:
        return 'En attente';
    }
  }

  getCameraLastProcessedLabel(source: ParkingAISource): string | null {
    if (!source.last_processed_at) {
      return null;
    }

    const date = new Date(source.last_processed_at);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return `Dernier traitement: ${date.toLocaleString('fr-FR')}`;
  }

  openSourceExternal(source: ParkingAISource): void {
    const target =
      source.source_type === 'camera'
        ? source.stream_url || ''
        : this.getSourceMediaUrl(source);

    if (!target) {
      this.toastService.show('Aucun media disponible pour cette source.', 'error');
      return;
    }

    window.open(target, '_blank', 'noopener');
  }

  async reanalyzeSelectedSource(source: ParkingAISource): Promise<void> {
    if (!this.canManageSource(source) || this.reanalyzingSourceIds.has(source.id_source)) {
      return;
    }

    this.reanalyzingSourceIds.add(source.id_source);
    try {
      const updatedSource = await this.parkingAiSourceService.reanalyzeSource(source.id_source);
      this.selectedParkingSources = this.selectedParkingSources.map((item) =>
        item.id_source === updatedSource.id_source ? updatedSource : item
      );
      this.previewErrorIds.delete(source.id_source);
      this.clearSourceBlobForId(source.id_source);
      if (updatedSource.preview_url) {
        const blobUrl = await this.parkingAiSourceService.fetchProtectedMediaObjectUrl(updatedSource.id_source);
        if (blobUrl) {
          this.sourceBlobs.set(updatedSource.id_source, blobUrl);
        }
      }
      this.syncSelectedParkingPolling();
      this.toastService.show(
        updatedSource.source_type === 'camera'
          ? 'Capture du flux lancee avec succes.'
          : 'Retraitement lance avec succes.',
        'success'
      );
    } catch (error) {
      console.error('Erreur retraitement source parking', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible de retraiter cette source.'), 'error');
    } finally {
      this.reanalyzingSourceIds.delete(source.id_source);
    }
  }

  async deleteSelectedSource(source: ParkingAISource): Promise<void> {
    try {
      await this.parkingAiSourceService.deleteSource(source.id_source);
      this.clearSourceBlobForId(source.id_source);
      this.previewErrorIds.delete(source.id_source);
      this.selectedParkingSources = this.selectedParkingSources.filter((item) => item.id_source !== source.id_source);
      this.syncSelectedParkingPolling();
      this.toastService.show('Source supprimee avec succes.', 'success');
    } catch (error) {
      console.error('Erreur suppression source parking', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible de supprimer cette source.'), 'error');
    }
  }

  markPreviewError(source: ParkingAISource): void {
    this.previewErrorIds.add(source.id_source);
  }

  getSourceVideoUrl(source: ParkingAISource): string {
    return this.getSourceMediaUrl(source);
  }

  getSourceMediaUrl(source: ParkingAISource): string {
    return this.sourceBlobs.get(source.id_source) || source.preview_url || '';
  }

  async toggleCameraAutoProcessing(source: ParkingAISource): Promise<void> {
    if (!this.canManageSource(source) || source.source_type !== 'camera' || this.autoUpdatingCameraIds.has(source.id_source)) {
      return;
    }

    this.autoUpdatingCameraIds.add(source.id_source);
    try {
      const updatedSource = await this.parkingAiSourceService.updateCameraAutoProcessing(source.id_source, {
        enabled: !source.auto_processing_enabled,
        interval_seconds: source.auto_process_interval_seconds || 30,
      });
      this.selectedParkingSources = this.selectedParkingSources.map((item) =>
        item.id_source === updatedSource.id_source ? updatedSource : item
      );
      this.syncSelectedParkingPolling();
      this.toastService.show(
        updatedSource.auto_processing_enabled
          ? 'Suivi automatique active pour cette camera.'
          : 'Suivi automatique desactive pour cette camera.',
        'success'
      );
    } catch (error) {
      console.error('Erreur suivi auto camera', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible de modifier le suivi automatique.'), 'error');
    } finally {
      this.autoUpdatingCameraIds.delete(source.id_source);
    }
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
    const placesByParking = this.groupPlacesByParking(places);
    this.parkings = ownerParkings.map((parking) =>
      this.mapParking(parking, placesByParking.get(parking.id_park) ?? [])
    );

    const targetId = selectedParkingId ?? this.selectedParking?.id_park;
    this.selectedParking = targetId
      ? this.parkings.find((parking) => parking.id_park === targetId) ?? null
      : null;
  }

  private mapParking(parking: ParkingDto, parkingPlaces: PlaceDto[]): ParkingInfo {
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
      validation_reason: parking.validation_reason || null,
      setup_status: parking.setup_status || 'non_commencee',
      ai_setup_status: parking.ai_setup_status || 'non_configuree',
      totalSpaces: parking.capacite,
      availableSpaces,
      activeSubscriptions: 0,
    };
  }

  private async applyParkingSelectionFromRoute(): Promise<void> {
    const requestedParkingId = Number(this.route.snapshot.queryParamMap.get('parking'));
    if (!requestedParkingId) {
      return;
    }

    const parking = this.parkings.find((item) => item.id_park === requestedParkingId);
    if (!parking) {
      return;
    }

    await this.selectParking(parking);
  }

  private groupPlacesByParking(places: PlaceDto[]): Map<number, PlaceDto[]> {
    const grouped = new Map<number, PlaceDto[]>();

    places.forEach((place) => {
      const collection = grouped.get(place.parking_id) ?? [];
      collection.push(place);
      grouped.set(place.parking_id, collection);
    });

    return grouped;
  }

  private getParkingPriorityScore(parking: ParkingInfo): number {
    let score = 0;

    if (parking.validation_status === 'rejete') {
      score += 400;
    } else if (parking.validation_status === 'en_attente_validation') {
      score += 300;
    } else if (parking.validation_status === 'brouillon') {
      score += 180;
    }

    if (parking.statut === 'inactif') {
      score += 220;
    }

    if (parking.availableSpaces === 0) {
      score += 170;
    } else if (parking.availableSpaces <= 5) {
      score += 130;
    }

    score += this.getParkingOccupancy(parking);
    return score;
  }

  private async loadBlobUrlsForSources(): Promise<void> {
    for (const source of this.selectedParkingSources) {
      if ((source.source_type !== 'video' && source.source_type !== 'image') || !source.preview_url) {
        continue;
      }

      try {
        const blobUrl = await this.parkingAiSourceService.fetchProtectedMediaObjectUrl(source.id_source);
        if (blobUrl) {
          this.sourceBlobs.set(source.id_source, blobUrl);
        }
      } catch (error) {
        console.warn(`Erreur lors du chargement du blob pour la source ${source.id_source}:`, error);
      }
    }
  }

  private clearSourceBlobs(): void {
    this.sourceBlobs.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
    this.sourceBlobs.clear();
  }

  private clearSourceBlobForId(sourceId: number): void {
    const blobUrl = this.sourceBlobs.get(sourceId);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      this.sourceBlobs.delete(sourceId);
    }
  }

  private async refreshSelectedParkingSourcesSilently(): Promise<void> {
    if (!this.selectedParking) {
      return;
    }

    try {
      this.selectedParkingSources = await this.parkingAiSourceService.getSources(this.selectedParking.id_park);
      await this.loadBlobUrlsForSources();
      this.syncSelectedParkingPolling();
    } catch (error) {
      console.warn('Refresh silencieux des sources camera impossible.', error);
    }
  }

  private syncSelectedParkingPolling(): void {
    const shouldPoll = this.selectedParkingSources.some(
      (source) =>
        source.source_type === 'camera' && !!source.auto_processing_enabled
    );

    if (shouldPoll && !this.selectedParkingPollingTimer) {
      this.selectedParkingPollingTimer = setInterval(() => {
        void this.refreshSelectedParkingSourcesSilently();
      }, 10000);
      return;
    }

    if (!shouldPoll) {
      this.stopSelectedParkingPolling();
    }
  }

  private stopSelectedParkingPolling(): void {
    if (!this.selectedParkingPollingTimer) {
      return;
    }

    clearInterval(this.selectedParkingPollingTimer);
    this.selectedParkingPollingTimer = null;
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

  private toBackendParkingStatus(status?: string | null): 'actif' | 'inactif' {
    return String(status || '').trim().toLowerCase() === 'inactif' ? 'inactif' : 'actif';
  }

  private toFrontendParkingStatus(status?: string | null): 'actif' | 'inactif' {
    return this.toBackendParkingStatus(status);
  }

  private getNewParkingValidationMessage(): string | null {
    if (!this.canCreateParking) {
      return 'Le compte owner doit etre valide par l admin avant de creer un parking.';
    }

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
