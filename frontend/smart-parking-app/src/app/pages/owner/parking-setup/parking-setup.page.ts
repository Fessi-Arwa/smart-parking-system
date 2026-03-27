import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { OwnerWorkflowState } from '../../../models/owner-workflow.model';
import { OwnerWorkflowService } from '../../../services/owner-workflow.service';
import { ParkingDto, ParkingService } from '../../../services/parking.service';
import { PlaceDto, PlaceService } from '../../../services/place.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-owner-parking-setup',
  templateUrl: './parking-setup.page.html',
  styleUrls: ['./parking-setup.page.scss'],
  standalone: false,
})
export class ParkingSetupPage implements OnInit {
  workflowState!: OwnerWorkflowState;
  isSubmitting = false;
  isSavingParking = false;
  isLoadingParking = true;
  isLoadingPlaces = true;
  isAddingPlace = false;
  parking: ParkingDto | null = null;
  places: PlaceDto[] = [];
  parkingDraft = {
    nom: '',
    adresse: '',
    capacite: 1,
    prix_heure: 0,
  };
  placeDraft = {
    num_place: null as number | null,
    zone: '',
    etage: '',
  };
  setupChecklist = [
    'Verifier les informations saisies pendant l onboarding',
    'Ajuster la capacite selon la realite du site',
    'Preparer la structuration des zones et des places',
    'Valider cette etape avant le parametrage IA',
  ];

  constructor(
    private ownerWorkflowService: OwnerWorkflowService,
    private parkingService: ParkingService,
    private placeService: PlaceService,
    private router: Router,
    private toastService: ToastService
  ) {}

  async ngOnInit(): Promise<void> {
    this.workflowState = await this.ownerWorkflowService.refresh();
    await this.loadParking();
    await this.loadPlaces();
  }

  async refreshStatus(): Promise<void> {
    this.workflowState = await this.ownerWorkflowService.refresh();
    await this.loadParking();
    await this.loadPlaces();
    const route = this.ownerWorkflowService.getNextRoute(this.workflowState);
    if (route !== '/owner/parking-setup') {
      await this.router.navigateByUrl(route);
    }
  }

  async saveParkingDetails(): Promise<void> {
    if (!this.workflowState.parkingId) {
      this.toastService.show('Aucun parking owner n a ete trouve.', 'error');
      return;
    }

    if (!this.isDraftValid()) {
      this.toastService.show('Completez correctement nom, adresse, capacite et prix horaire.', 'error');
      return;
    }

    this.isSavingParking = true;

    try {
      await this.persistParkingDraft();
      this.toastService.show('Informations du parking mises a jour.', 'success');
    } catch (error) {
      console.error('Erreur mise a jour parking', error);
      this.toastService.show('Impossible de sauvegarder ce parking.', 'error');
    } finally {
      this.isSavingParking = false;
    }
  }

  async completeSetup(): Promise<void> {
    if (!this.workflowState.parkingId) {
      this.toastService.show('Aucun parking owner n a ete trouve.', 'error');
      return;
    }

    if (!this.isDraftValid()) {
      this.toastService.show('Completez correctement les informations du parking avant de continuer.', 'error');
      return;
    }

    if (this.places.length === 0) {
      this.toastService.show('Ajoutez au moins une place avant de terminer cette etape.', 'error');
      return;
    }

    this.isSubmitting = true;

    try {
      await this.persistParkingDraft();
      this.workflowState = await this.ownerWorkflowService.updateParkingSetupStatus(
        this.workflowState.parkingId,
        'terminee'
      );
      this.toastService.show('Configuration parking marquee comme terminee.', 'success');

      const route = this.ownerWorkflowService.getNextRoute(this.workflowState);
      await this.router.navigateByUrl(route);
    } catch (error) {
      console.error('Erreur mise a jour configuration parking', error);
      this.toastService.show('Impossible d enregistrer cette etape.', 'error');
    } finally {
      this.isSubmitting = false;
    }
  }

  private async loadParking(): Promise<void> {
    if (!this.workflowState?.parkingId) {
      this.isLoadingParking = false;
      this.parking = null;
      return;
    }

    this.isLoadingParking = true;

    try {
      this.parking = await firstValueFrom(this.parkingService.getParking(this.workflowState.parkingId));
      this.syncDraftFromParking(this.parking);
    } catch (error) {
      console.error('Erreur chargement parking owner', error);
      this.toastService.show('Impossible de charger le parking owner.', 'error');
      this.parking = null;
    } finally {
      this.isLoadingParking = false;
    }
  }

  async addPlace(): Promise<void> {
    if (!this.workflowState.parkingId) {
      this.toastService.show('Aucun parking owner n a ete trouve.', 'error');
      return;
    }

    if (!this.isPlaceDraftValid()) {
      this.toastService.show('Renseignez au minimum un numero de place valide.', 'error');
      return;
    }

    if (this.parking && this.places.length >= Number(this.parkingDraft.capacite)) {
      this.toastService.show('La capacite du parking est deja atteinte.', 'error');
      return;
    }

    this.isAddingPlace = true;

    try {
      const createdPlace = await firstValueFrom(
        this.placeService.createPlace({
          parking_id: this.workflowState.parkingId,
          num_place: Number(this.placeDraft.num_place),
          etat: 'libre',
          zone: this.placeDraft.zone.trim() || undefined,
          etage: this.placeDraft.etage.trim() || undefined,
        })
      );

      this.places = [...this.places, createdPlace].sort((a, b) => a.num_place - b.num_place);
      this.placeDraft = { num_place: null, zone: '', etage: '' };
      this.toastService.show('Place ajoutee avec succes.', 'success');
    } catch (error) {
      console.error('Erreur ajout place', error);
      this.toastService.show('Impossible d ajouter cette place. Verifiez le numero choisi.', 'error');
    } finally {
      this.isAddingPlace = false;
    }
  }

  async removePlace(placeId: number): Promise<void> {
    try {
      await firstValueFrom(this.placeService.deletePlace(placeId));
      this.places = this.places.filter((place) => place.id_place !== placeId);
      this.toastService.show('Place supprimee avec succes.', 'success');
    } catch (error) {
      console.error('Erreur suppression place', error);
      this.toastService.show('Impossible de supprimer cette place.', 'error');
    }
  }

  private async persistParkingDraft(): Promise<void> {
    if (!this.workflowState.parkingId) {
      return;
    }

    const response = await firstValueFrom(
      this.parkingService.updateParking(this.workflowState.parkingId, {
        nom: this.parkingDraft.nom.trim(),
        adresse: this.parkingDraft.adresse.trim(),
        capacite: Number(this.parkingDraft.capacite),
        prix_heure: Number(this.parkingDraft.prix_heure),
      })
    );

    this.parking = response.parking ?? response;
    this.syncDraftFromParking(this.parking);
  }

  private syncDraftFromParking(parking: ParkingDto | null): void {
    this.parkingDraft = {
      nom: parking?.nom || '',
      adresse: parking?.adresse || '',
      capacite: Number(parking?.capacite ?? 1),
      prix_heure: Number(parking?.prix_heure ?? 0),
    };
  }

  private isDraftValid(): boolean {
    return Boolean(
      this.parkingDraft.nom.trim() &&
      this.parkingDraft.adresse.trim() &&
      Number(this.parkingDraft.capacite) > 0 &&
      Number(this.parkingDraft.prix_heure) >= 0
    );
  }

  get remainingPlaces(): number {
    return Math.max(Number(this.parkingDraft.capacite || 0) - this.places.length, 0);
  }

  get zoneSummaries(): Array<{ zone: string; count: number }> {
    const counts = new Map<string, number>();

    this.places.forEach((place) => {
      const zone = (place.zone || 'Sans zone').trim();
      counts.set(zone, (counts.get(zone) || 0) + 1);
    });

    if (counts.size === 0) {
      return [];
    }

    return Array.from(counts.entries())
      .map(([zone, count]) => ({ zone, count }))
      .sort((a, b) => a.zone.localeCompare(b.zone));
  }

  get leftColumnPlaces(): PlaceDto[] {
    return this.buildColumns().left;
  }

  get rightColumnPlaces(): PlaceDto[] {
    return this.buildColumns().right;
  }

  getPlaceLabel(place: PlaceDto): string {
    const zonePrefix = (place.zone || 'P').trim().charAt(0).toUpperCase() || 'P';
    return `${zonePrefix}${place.num_place}`;
  }

  private async loadPlaces(): Promise<void> {
    if (!this.workflowState?.parkingId) {
      this.isLoadingPlaces = false;
      this.places = [];
      return;
    }

    this.isLoadingPlaces = true;

    try {
      const places = await firstValueFrom(this.placeService.getPlaces(this.workflowState.parkingId));
      this.places = [...places].sort((a, b) => a.num_place - b.num_place);
    } catch (error) {
      console.error('Erreur chargement places owner', error);
      this.toastService.show('Impossible de charger les places du parking.', 'error');
      this.places = [];
    } finally {
      this.isLoadingPlaces = false;
    }
  }

  private isPlaceDraftValid(): boolean {
    return Number(this.placeDraft.num_place) > 0;
  }

  private buildColumns(): { left: PlaceDto[]; right: PlaceDto[] } {
    const sortedPlaces = [...this.places].sort((a, b) => a.num_place - b.num_place);
    const zones = this.zoneSummaries;

    if (zones.length >= 2) {
      const [leftZone, rightZone] = zones;
      const left = sortedPlaces.filter((place) => (place.zone || 'Sans zone').trim() === leftZone.zone);
      const right = sortedPlaces.filter((place) => (place.zone || 'Sans zone').trim() === rightZone.zone);
      const remaining = sortedPlaces.filter(
        (place) => !left.includes(place) && !right.includes(place)
      );

      remaining.forEach((place, index) => {
        if (index % 2 === 0) {
          left.push(place);
        } else {
          right.push(place);
        }
      });

      return { left, right };
    }

    return {
      left: sortedPlaces.filter((_, index) => index % 2 === 0),
      right: sortedPlaces.filter((_, index) => index % 2 === 1),
    };
  }
}
