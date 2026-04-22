import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { OwnerWorkflowState } from '../../../models/owner-workflow.model';
import { EtageDto, EtageService } from '../../../services/etage.service';
import { OwnerWorkflowService } from '../../../services/owner-workflow.service';
import { ParkingDto, ParkingService } from '../../../services/parking.service';
import { PlaceDto, PlaceService } from '../../../services/place.service';
import { ToastService } from '../../../services/toast.service';

interface ParkingStructureZoneDraft {
  id: string;
  name: string;
  placeCount: number;
}

interface ParkingStructureFloorDraft {
  id: string;
  label: string;
  zones: ParkingStructureZoneDraft[];
}

interface StructurePreviewZone {
  floorLabel: string;
  zoneName: string;
  spots: Array<{ num_place: number; label: string }>;
}

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
  isGeneratingStructure = false;
  parking: ParkingDto | null = null;
  etages: EtageDto[] = [];
  places: PlaceDto[] = [];
  parkingDraft = {
    nom: '',
    adresse: '',
    capacite: 1,
    prix_heure: 0,
  };
  structureDraft: ParkingStructureFloorDraft[] = [];

  constructor(
    private etageService: EtageService,
    private ownerWorkflowService: OwnerWorkflowService,
    private parkingService: ParkingService,
    private placeService: PlaceService,
    private route: ActivatedRoute,
    private router: Router,
    private toastService: ToastService
  ) {}

  async ngOnInit(): Promise<void> {
    this.workflowState = await this.ownerWorkflowService.refresh();
    await this.loadParking();
    await this.loadEtages();
    await this.loadPlaces();
    this.initializeStructureDraft();
  }

  async refreshStatus(): Promise<void> {
    this.workflowState = await this.ownerWorkflowService.refresh();
    await this.loadParking();
    await this.loadEtages();
    await this.loadPlaces();
    this.initializeStructureDraft();
    if (this.hasRouteParkingSelection) {
      return;
    }
    const route = this.ownerWorkflowService.getNextRoute(this.workflowState);
    if (route !== '/owner/parking-setup') {
      await this.router.navigateByUrl(route);
    }
  }

  async saveParkingDetails(): Promise<void> {
    if (!this.activeParkingId) {
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
    if (!this.activeParkingId) {
      this.toastService.show('Aucun parking owner n a ete trouve.', 'error');
      return;
    }

    if (!this.isDraftValid()) {
      this.toastService.show('Completez correctement les informations du parking avant de continuer.', 'error');
      return;
    }

    if (this.places.length === 0) {
      this.toastService.show('Generez d abord la structure des places avant de terminer cette etape.', 'error');
      return;
    }

    this.isSubmitting = true;

    try {
      await this.persistParkingDraft();
      this.workflowState = await this.ownerWorkflowService.updateParkingSetupStatus(
        this.activeParkingId,
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

  async handlePrimaryAction(): Promise<void> {
    if (this.places.length === 0) {
      await this.generateParkingStructure();
      return;
    }

    await this.completeSetup();
  }

  addFloor(): void {
    this.structureDraft = [
      ...this.structureDraft,
      this.createFloorDraft(`Etage ${this.structureDraft.length + 1}`),
    ];
  }

  removeFloor(floorId: string): void {
    if (this.structureDraft.length === 1) {
      this.toastService.show('Gardez au moins un etage dans la structure.', 'error');
      return;
    }

    this.structureDraft = this.structureDraft.filter((floor) => floor.id !== floorId);
  }

  addZone(floorId: string): void {
    this.structureDraft = this.structureDraft.map((floor) =>
      floor.id === floorId
        ? {
            ...floor,
            zones: [
              ...floor.zones,
              this.createZoneDraft(`Zone ${String.fromCharCode(65 + floor.zones.length)}`),
            ],
          }
        : floor
    );
  }

  removeZone(floorId: string, zoneId: string): void {
    this.structureDraft = this.structureDraft.map((floor) => {
      if (floor.id !== floorId) {
        return floor;
      }

      if (floor.zones.length === 1) {
        this.toastService.show('Gardez au moins une zone par etage.', 'error');
        return floor;
      }

      return {
        ...floor,
        zones: floor.zones.filter((zone) => zone.id !== zoneId),
      };
    });
  }

  async generateParkingStructure(): Promise<void> {
    if (!this.activeParkingId) {
      this.toastService.show('Aucun parking owner n a ete trouve.', 'error');
      return;
    }

    if (!this.isDraftValid()) {
      this.toastService.show('Completez les informations du parking avant de generer la structure.', 'error');
      return;
    }

    const structureError = this.getStructureValidationError();
    if (structureError) {
      this.toastService.show(structureError, 'error');
      return;
    }

    this.isGeneratingStructure = true;

    try {
      await this.persistParkingDraft();
      await this.replaceParkingPlacesWithGeneratedStructure();
      this.toastService.show('Structure du parking generee avec succes.', 'success');
    } catch (error) {
      console.error('Erreur generation structure parking', error);
      this.toastService.show('Impossible de generer la structure du parking.', 'error');
    } finally {
      this.isGeneratingStructure = false;
    }
  }

  private async loadParking(): Promise<void> {
    if (!this.activeParkingId) {
      this.isLoadingParking = false;
      this.parking = null;
      return;
    }

    this.isLoadingParking = true;

    try {
      this.parking = await firstValueFrom(this.parkingService.getParking(this.activeParkingId));
      this.syncDraftFromParking(this.parking);
    } catch (error) {
      console.error('Erreur chargement parking owner', error);
      this.toastService.show('Impossible de charger le parking owner.', 'error');
      this.parking = null;
    } finally {
      this.isLoadingParking = false;
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
    if (!this.activeParkingId) {
      return;
    }

    const response = await firstValueFrom(
      this.parkingService.updateParking(this.activeParkingId, {
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
    return Math.max(Number(this.parkingDraft.capacite || 0) - this.generatedCapacity, 0);
  }

  get primaryActionLabel(): string {
    if (this.isGeneratingStructure) {
      return 'Generation...';
    }

    if (this.isSubmitting) {
      return 'Enregistrement...';
    }

    return this.places.length === 0 ? 'Generer les places' : 'Terminer et continuer';
  }

  get isPrimaryActionDisabled(): boolean {
    return this.isLoadingParking || !this.parking || this.isGeneratingStructure || this.isSubmitting;
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

  get generatedCapacity(): number {
    return this.structureDraft.reduce(
      (total, floor) =>
        total +
        floor.zones.reduce((floorTotal, zone) => floorTotal + Math.max(Number(zone.placeCount || 0), 0), 0),
      0
    );
  }

  get structurePreviewZones(): StructurePreviewZone[] {
    const preview: StructurePreviewZone[] = [];
    let currentNumber = 1;

    this.structureDraft.forEach((floor) => {
      floor.zones.forEach((zone) => {
        const count = Math.max(Number(zone.placeCount || 0), 0);
        const spots = Array.from({ length: count }, () => {
          const numPlace = currentNumber++;
          return {
            num_place: numPlace,
            label: `${zone.name.trim() || 'Zone'}-${numPlace}`,
          };
        });

        preview.push({
          floorLabel: floor.label.trim() || 'RDC',
          zoneName: zone.name.trim() || 'Zone',
          spots,
        });
      });
    });

    return preview;
  }

  get floorSummaries(): Array<{ name: string; ordre: number }> {
    return this.etages
      .map((etage) => ({ name: etage.nom, ordre: etage.ordre }))
      .sort((a, b) => a.ordre - b.ordre);
  }

  private async loadPlaces(): Promise<void> {
    if (!this.activeParkingId) {
      this.isLoadingPlaces = false;
      this.places = [];
      return;
    }

    this.isLoadingPlaces = true;

    try {
      const places = await firstValueFrom(this.placeService.getPlaces(this.activeParkingId));
      this.places = [...places].sort((a, b) => a.num_place - b.num_place);
    } catch (error) {
      console.error('Erreur chargement places owner', error);
      this.toastService.show('Impossible de charger les places du parking.', 'error');
      this.places = [];
    } finally {
      this.isLoadingPlaces = false;
    }
  }

  private async loadEtages(): Promise<void> {
    if (!this.workflowState?.parkingId) {
      this.etages = [];
      return;
    }

    try {
      const etages = await firstValueFrom(this.etageService.getEtages(this.workflowState.parkingId));
      this.etages = [...etages].sort((a, b) => a.ordre - b.ordre);
    } catch (error) {
      console.error('Erreur chargement etages owner', error);
      this.toastService.show('Impossible de charger les etages du parking.', 'error');
      this.etages = [];
    }
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

  private initializeStructureDraft(): void {
    if (this.etages.length > 0 || this.places.length > 0) {
      this.structureDraft = this.buildDraftFromPlaces(this.places);
    } else if (this.structureDraft.length === 0) {
      this.structureDraft = [this.createFloorDraft('RDC')];
    }
  }

  private buildDraftFromPlaces(places: PlaceDto[]): ParkingStructureFloorDraft[] {
    if (this.etages.length > 0) {
      const floorDrafts = this.etages.map((etage) => {
        const floorPlaces = places.filter((place) => place.etage_id === etage.id_etage || place.etage === etage.nom);
        const zonesMap = new Map<string, number>();

        floorPlaces.forEach((place) => {
          const zoneName = (place.zone || 'A').trim() || 'A';
          zonesMap.set(zoneName, (zonesMap.get(zoneName) || 0) + 1);
        });

        return {
          id: String(etage.id_etage),
          label: etage.nom,
          zones:
            zonesMap.size > 0
              ? Array.from(zonesMap.entries()).map(([zoneName, placeCount]) => ({
                  id: this.generateLocalId(),
                  name: zoneName,
                  placeCount,
                }))
              : [this.createZoneDraft('Zone A')],
        };
      });

      if (floorDrafts.length > 0) {
        return floorDrafts;
      }
    }

    const floorsMap = new Map<string, Map<string, number>>();

    places.forEach((place) => {
      const floorLabel = (place.etage || 'RDC').trim() || 'RDC';
      const zoneName = (place.zone || 'A').trim() || 'A';
      const floorZones = floorsMap.get(floorLabel) ?? new Map<string, number>();
      floorZones.set(zoneName, (floorZones.get(zoneName) || 0) + 1);
      floorsMap.set(floorLabel, floorZones);
    });

    return Array.from(floorsMap.entries()).map(([floorLabel, zones]) => ({
      id: this.generateLocalId(),
      label: floorLabel,
      zones: Array.from(zones.entries()).map(([zoneName, placeCount]) => ({
        id: this.generateLocalId(),
        name: zoneName,
        placeCount,
      })),
    }));
  }

  private createFloorDraft(label: string): ParkingStructureFloorDraft {
    return {
      id: this.generateLocalId(),
      label,
      zones: [this.createZoneDraft('Zone A')],
    };
  }

  private createZoneDraft(name: string): ParkingStructureZoneDraft {
    return {
      id: this.generateLocalId(),
      name,
      placeCount: 1,
    };
  }

  private generateLocalId(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  private getStructureValidationError(): string | null {
    if (this.structureDraft.length === 0) {
      return 'Ajoutez au moins un etage pour construire le parking.';
    }

    for (const floor of this.structureDraft) {
      if (!floor.label.trim()) {
        return 'Chaque etage doit avoir un nom ou un libelle.';
      }

      if (floor.zones.length === 0) {
        return `Ajoutez au moins une zone pour l etage ${floor.label}.`;
      }

      for (const zone of floor.zones) {
        if (!zone.name.trim()) {
          return `Chaque zone de l etage ${floor.label} doit avoir un nom.`;
        }

        if (Number(zone.placeCount) <= 0) {
          return `Le nombre de places de ${zone.name} doit etre superieur a zero.`;
        }
      }
    }

    return null;
  }

  private async replaceParkingPlacesWithGeneratedStructure(): Promise<void> {
    if (!this.activeParkingId) {
      return;
    }

    const existingPlaces = [...this.places];
    for (const place of existingPlaces) {
      await firstValueFrom(this.placeService.deletePlace(place.id_place));
    }

    const existingEtages = [...this.etages];
    for (const etage of existingEtages) {
      await firstValueFrom(this.etageService.deleteEtage(etage.id_etage));
    }

    const generatedPlaces: PlaceDto[] = [];
    const createdEtages: EtageDto[] = [];
    let currentNumber = 1;

    for (const [floorIndex, floor] of this.structureDraft.entries()) {
      const createdEtage = await firstValueFrom(
        this.etageService.createEtage({
          parking_id: this.activeParkingId,
          nom: floor.label.trim(),
          ordre: floorIndex,
        })
      );
      createdEtages.push(createdEtage);

      for (const zone of floor.zones) {
        const zoneCount = Number(zone.placeCount);
        for (let index = 0; index < zoneCount; index += 1) {
          const createdPlace = await firstValueFrom(
            this.placeService.createPlace({
              parking_id: this.activeParkingId,
              etage_id: createdEtage.id_etage,
              num_place: currentNumber,
              etat: 'libre',
              zone: zone.name.trim(),
              etage: floor.label.trim(),
            })
          );
          generatedPlaces.push(createdPlace);
          currentNumber += 1;
        }
      }
    }

    this.etages = createdEtages.sort((a, b) => a.ordre - b.ordre);
    this.places = generatedPlaces.sort((a, b) => a.num_place - b.num_place);
    this.parkingDraft.capacite = generatedPlaces.length;
    await this.persistParkingDraft();
  }

  get activeParkingId(): number | null {
    const routeParkingId = Number(this.route.snapshot.queryParamMap.get('parking'));
    if (routeParkingId) {
      return routeParkingId;
    }
    return this.workflowState?.parkingId ?? null;
  }

  get hasRouteParkingSelection(): boolean {
    return Boolean(Number(this.route.snapshot.queryParamMap.get('parking')));
  }
}
