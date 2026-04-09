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
  ParkingAiSourceService,
} from '../../../services/parking-ai-source.service';
import { ToastService } from '../../../services/toast.service';
import { HeaderNotificationItem } from '../../../shared/components/header/header.component';

export interface OwnerProfile {
  id_compte: number;
  nom: string;
  email: string;
  telephone: string;
  role: string;
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
    private toastService: ToastService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.owner = {
        ...this.owner,
        id_compte: currentUser.id,
        nom: currentUser.nom || this.owner.nom,
        email: currentUser.email || this.owner.email,
        telephone: currentUser.telephone || this.owner.telephone,
      };
    }

    await this.loadOwnerParkings();
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
        this.parkingStatusFilter === 'all' || parking.statut === this.parkingStatusFilter;
      const matchesSearch =
        !search ||
        parking.nom.toLowerCase().includes(search) ||
        parking.adresse.toLowerCase().includes(search) ||
        parking.ville.toLowerCase().includes(search);

      return matchesStatus && matchesSearch;
    });
  }

  get notificationItems(): HeaderNotificationItem[] {
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

    return [...maintenanceNotifications, ...lowCapacityNotifications].slice(0, 5);
  }

  get notificationsCount(): number {
    return this.notificationItems.length;
  }

  get selectedParkingVideos(): ParkingAISource[] {
    return this.selectedParkingSources.filter((source) => source.source_type === 'video');
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
      this.toastService.show('Impossible de charger les videos de ce parking.', 'error');
    }
  }

  backToList(): void {
    this.selectedParking = null;
    this.selectedParkingSources = [];
    this.previewErrorIds.clear();
    this.showAddParking = false;
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

    const payload: UpdateParkingPayload = {
      nom: this.editParkingData.nom,
      adresse: this.editParkingData.adresse,
      capacite: this.editParkingData.totalSpaces,
      prix_heure: this.editParkingData.prix_heure,
    };

    await firstValueFrom(this.parkingService.updateParking(this.selectedParking.id_park, payload));
    await this.loadOwnerParkings(this.selectedParking.id_park);
    this.isEditingParking = false;
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
      await firstValueFrom(this.parkingService.deleteParking(this.parkingToDelete.id_park));
      this.showDeleteConfirm = false;
      this.parkingToDelete = null;
      this.selectedParking = null;
      await this.loadOwnerParkings();
      return;
    }

    this.showDeleteConfirm = false;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.parkingToDelete = null;
  }

  openAddParking(): void {
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
    if (!this.newParkingData.nom || !this.newParkingData.adresse) {
      return;
    }

    const payload: CreateParkingPayload = {
      nom: this.newParkingData.nom,
      adresse: this.buildAddress(this.newParkingData.adresse, this.newParkingData.ville),
      capacite: this.newParkingData.totalSpaces || 20,
      prix_heure: this.newParkingData.prix_heure || 2.5,
    };

    await firstValueFrom(this.parkingService.createParking(payload));
    this.showAddParking = false;
    this.toastService.show('Parking ajoute. Il devra etre valide par l admin puis configure.', 'success');
    await this.router.navigate(['/owner/dashboard']);
  }

  getStatusColor(status: string): string {
    return status === 'actif' ? 'success' : 'warning';
  }

  getStatusLabel(status: string): string {
    return status === 'actif' ? 'Actif' : 'Maintenance';
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
    const ownerId = this.owner.id_compte;
    const [parkings, places] = await Promise.all([
      firstValueFrom(this.parkingService.getParkings()),
      firstValueFrom(this.placeService.getPlaces()),
    ]);

    const ownerParkings = parkings.filter((parking) => parking.owner_id === ownerId);
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
      statut: parking.statut,
      totalSpaces: parking.capacite,
      availableSpaces,
      activeSubscriptions: 0,
    };
  }

  private extractCity(address: string): string {
    const segments = address
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean);
    return segments[segments.length - 1] || 'Ville';
  }

  private buildAddress(address: string, city?: string): string {
    const trimmedAddress = address.trim();
    const trimmedCity = (city || '').trim();
    return trimmedCity ? `${trimmedAddress}, ${trimmedCity}` : trimmedAddress;
  }
}
