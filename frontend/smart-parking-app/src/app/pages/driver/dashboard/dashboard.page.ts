import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../services/auth.service';
import { ParkingDto, ParkingService } from '../../../services/parking.service';
import { PaymentService } from '../../../services/payment.service';
import { PlaceDto, PlaceService } from '../../../services/place.service';
import { ReservationHistoryDto, ReservationService } from '../../../services/reservation';
import { CreateSubscriptionPayload, SubscriptionDto, SubscriptionService } from '../../../services/subscription.service';
import { ToastService } from '../../../services/toast.service';
import { VehicleDto, VehicleService } from '../../../services/vehicle.service';
import { HeaderNotificationItem } from '../../../shared/components/header/header.component';
import { MapComponent, MapParking } from '../../../shared/components/map/map.component';

type DriverTab = 'home' | 'historique' | 'profil';
type PaymentMode = 'en_ligne' | 'sur_place';
type ParkingListFilter = 'closest' | 'available' | 'budget';

interface DriverProfile {
  nom: string;
  email: string;
  telephone: string;
  avatar: string;
}

interface Vehicle {
  id: number;
  matricule: string;
  marque: string;
  type: string;
  isDefault: boolean;
}

interface ParkingSpot {
  id_place: number;
  parking_id: number;
  num_place: number;
  etat: 'libre' | 'reservee' | 'occupee';
  zone: string;
  etage: string;
}

interface ParkingCard {
  id_park: number;
  nom: string;
  adresse: string;
  ville: string;
  latitude: number;
  longitude: number;
  prix_heure: number;
  frequent: boolean;
  distanceKm: number;
  availablePlaces: number;
}

interface ReservationItem {
  id_res: number;
  parkingId: number | null;
  parkingNom: string;
  placeLabel: string;
  date_debut: string;
  date_fin: string;
  statut: 'en_attente' | 'confirmee' | 'annulee' | 'terminee';
  prix_total: number;
  paymentMode: PaymentMode;
  vehiculeLabel: string;
}

interface SubscriptionItem {
  id_abon: number;
  parkingId: number | null;
  parkingNom: string;
  placeLabel: string;
  type: 'mensuel' | 'trimestriel' | 'annuel';
  date_debut: string;
  date_fin: string;
  statut: 'actif' | 'expire' | 'suspendu' | 'en_attente';
  tarif: number;
  cancelled_at?: string | null;
  canCancel: boolean;
}

interface ParkingStructureSection {
  etage: string;
  zones: Array<{
    name: string;
    spots: ParkingSpot[];
  }>;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class DashboardPage implements OnInit, OnDestroy {
  @ViewChild(MapComponent) private mapComponent?: MapComponent;

  private readonly subscriptionAlertWindowDays = 3;
  private readonly liveParkingRefreshIntervalMs = 5000;
  private readonly notifiedSubscriptionIds = new Set<number>();
  activeTab: DriverTab = 'home';
  activeParkingFilter: ParkingListFilter = 'closest';
  searchTerm = '';
  isDriverLocationFocused = false;
  isReservationSubmitting = false;
  isLoadingParkings = false;
  isLoadingVehicles = false;
  isVehicleSubmitting = false;
  isLoadingReservations = false;
  isLoadingSubscriptions = false;
  isSubscriptionSubmitting = false;
  cancellingSubscriptionId: number | null = null;
  isProfileSubmitting = false;
  gpsStatus: 'waiting' | 'active' | 'error' = 'waiting';
  isReservationModalOpen = false;
  isVehicleModalOpen = false;
  isSubscriptionModalOpen = false;
  isProfileModalOpen = false;

  selectedParking: ParkingCard | null = null;
  private locationWatchId: number | null = null;
  private reservationRefreshIntervalId: number | null = null;

  driverProfile: DriverProfile = {
    nom: 'Nadia Benali',
    email: 'nadia.benali@parkini.com',
    telephone: '+213 555 20 10 15',
    avatar: 'NB',
  };

  driverPosition = {
  latitude: 36.8065,   // Latitude de Tunis Centre
  longitude: 10.1815,  // Longitude de Tunis Centre
};
  vehicles: Vehicle[] = [];

  parkings: ParkingCard[] = [
    {
      id_park: 1,
      nom: 'Parking Centre Ville',
      adresse: '12 rue Didouche Mourad',
      ville: 'Alger',
      latitude: 36.7564,
      longitude: 3.0489,
      prix_heure: 150,
      frequent: true,
      distanceKm: 0.8,
      availablePlaces: 12,
    },
    {
      id_park: 2,
      nom: 'Parking Business Bay',
      adresse: 'Boulevard Krim Belkacem',
      ville: 'Alger',
      latitude: 36.7451,
      longitude: 3.0615,
      prix_heure: 180,
      frequent: true,
      distanceKm: 1.1,
      availablePlaces: 6,
    },
    {
      id_park: 3,
      nom: 'Parking Hydra Premium',
      adresse: '17 chemin Abdelkader Gadouche',
      ville: 'Hydra',
      latitude: 36.7442,
      longitude: 3.0403,
      prix_heure: 220,
      frequent: false,
      distanceKm: 2.6,
      availablePlaces: 4,
    },
    {
      id_park: 4,
      nom: 'Parking Aeroport',
      adresse: 'Terminal Ouest, Dar El Beida',
      ville: 'Alger',
      latitude: 36.6945,
      longitude: 3.2144,
      prix_heure: 250,
      frequent: false,
      distanceKm: 13.8,
      availablePlaces: 25,
    },
  ];

  spots: ParkingSpot[] = [
    { id_place: 101, parking_id: 1, num_place: 14, etat: 'libre', zone: 'A', etage: 'RDC' },
    { id_place: 102, parking_id: 1, num_place: 19, etat: 'libre', zone: 'A', etage: 'RDC' },
    { id_place: 201, parking_id: 2, num_place: 7, etat: 'libre', zone: 'B', etage: '1' },
    { id_place: 202, parking_id: 2, num_place: 11, etat: 'reservee', zone: 'B', etage: '1' },
    { id_place: 301, parking_id: 3, num_place: 3, etat: 'libre', zone: 'VIP', etage: 'RDC' },
    { id_place: 401, parking_id: 4, num_place: 22, etat: 'libre', zone: 'C', etage: '2' },
  ];

  reservations: ReservationItem[] = [
    {
      id_res: 8701,
      parkingId: 1,
      parkingNom: 'Parking Centre Ville',
      placeLabel: 'Place A-14',
      date_debut: '2026-03-24T08:30',
      date_fin: '2026-03-24T12:30',
      statut: 'terminee',
      prix_total: 600,
      paymentMode: 'en_ligne',
      vehiculeLabel: 'Mercedes Classe C',
    },
    {
      id_res: 8702,
      parkingId: 2,
      parkingNom: 'Parking Business Bay',
      placeLabel: 'Place B-07',
      date_debut: '2026-03-26T09:00',
      date_fin: '2026-03-26T18:00',
      statut: 'confirmee',
      prix_total: 1620,
      paymentMode: 'sur_place',
      vehiculeLabel: 'Mercedes Classe C',
    },
  ];

  subscriptions: SubscriptionItem[] = [
    {
      id_abon: 5001,
      parkingId: 1,
      parkingNom: 'Parking Centre Ville',
      placeLabel: 'Place A-19',
      type: 'mensuel',
      date_debut: '2026-03-01',
      date_fin: '2026-03-31',
      statut: 'actif',
      tarif: 12000,
      cancelled_at: null,
      canCancel: true,
    },
  ];

  profileForm: FormGroup;
  reservationForm: FormGroup;
  vehicleForm: FormGroup;
  subscriptionForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private parkingService: ParkingService,
    private paymentService: PaymentService,
    private placeService: PlaceService,
    private reservationService: ReservationService,
    private subscriptionService: SubscriptionService,
    private toastService: ToastService,
    private vehicleService: VehicleService
  ) {
    this.profileForm = this.fb.group({
      nom: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      telephone: ['', Validators.required],
    });

    this.reservationForm = this.fb.group({
      parking_id: ['', Validators.required],
      vehicule_id: ['', Validators.required],
      place_id: ['', Validators.required],
      date_debut: ['', Validators.required],
      date_fin: ['', Validators.required],
      payment_mode: ['en_ligne', Validators.required],
      payment_method: ['carte_bancaire'],
      card_holder: [''],
      card_number: [''],
      card_expiry: [''],
      card_cvv: [''],
    });

    this.vehicleForm = this.fb.group({
      matricule: ['', Validators.required],
      marque: ['', Validators.required],
      type: ['', Validators.required],
    });

    this.subscriptionForm = this.fb.group({
      parking_id: ['', Validators.required],
      place_id: ['', Validators.required],
      type: ['mensuel', Validators.required],
      date_debut: ['', Validators.required],
    });
  }

  async ngOnInit(): Promise<void> {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.driverProfile = {
        ...this.driverProfile,
        nom: currentUser.nom || this.driverProfile.nom,
        email: currentUser.email || this.driverProfile.email,
        telephone: currentUser.telephone || this.driverProfile.telephone,
        avatar: this.buildAvatar(currentUser.nom || this.driverProfile.nom),
      };
    }

    this.profileForm.patchValue(this.driverProfile);
    await Promise.all([
      this.loadParkingsAndPlaces(),
      this.loadVehicles(),
      this.loadReservations(),
      this.loadSubscriptions(),
    ]);
    this.startLocationTracking();
  }

  ngOnDestroy(): void {
    if (this.locationWatchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(this.locationWatchId);
    }
    this.stopReservationLiveRefresh();
  }

  logout(): void {
    this.authService.logout();
  }

  setActiveTab(tab: DriverTab): void {
    this.activeTab = tab;
  }

  setActiveParkingFilter(filter: ParkingListFilter): void {
    this.activeParkingFilter = filter;
  }

  get filteredParkings(): ParkingCard[] {
    const parkings = [...this.parkings];

    if (this.activeParkingFilter === 'available') {
      return parkings
        .filter((parking) => parking.availablePlaces > 0)
        .sort((first, second) => {
          if (second.availablePlaces === first.availablePlaces) {
            return first.distanceKm - second.distanceKm;
          }

          return second.availablePlaces - first.availablePlaces;
        });
    }

    if (this.activeParkingFilter === 'budget') {
      return parkings.sort((first, second) => {
        if (first.prix_heure === second.prix_heure) {
          return first.distanceKm - second.distanceKm;
        }

        return first.prix_heure - second.prix_heure;
      });
    }

    return parkings.sort((first, second) => {
      if (first.distanceKm === second.distanceKm) {
        return second.availablePlaces - first.availablePlaces;
      }

      return first.distanceKm - second.distanceKm;
    });
  }

  get nearbyParkings(): ParkingCard[] {
    return [...this.parkings]
      .sort((first, second) => {
        if (first.distanceKm === second.distanceKm) {
          return second.availablePlaces - first.availablePlaces;
        }

        return first.distanceKm - second.distanceKm;
      })
      .slice(0, 4);
  }

  get highlightedNearbyParking(): ParkingCard | null {
    return this.nearbyParkings[0] ?? null;
  }

  get searchedParkings(): ParkingCard[] {
    const term = this.searchTerm.trim();
    if (!term) {
      return [];
    }

    return this.parkings.filter((parking) => this.matchesParkingSearch(parking, term)).slice(0, 5);
  }

  get displayedMapParkings(): ParkingCard[] {
    const term = this.searchTerm.trim();
    if (!term) {
      return this.parkings;
    }

    return this.parkings.filter((parking) => this.matchesParkingSearch(parking, term));
  }

  get recentParkingActivities(): Array<{
    parking: ParkingCard;
    type: 'reservation' | 'abonnement';
    date: string;
  }> {
    const activities = [
      ...this.reservations.map((reservation) => ({
        parkingId: reservation.parkingId,
        type: 'reservation' as const,
        date: reservation.date_debut,
      })),
      ...this.subscriptions.map((subscription) => ({
        parkingId: subscription.parkingId,
        type: 'abonnement' as const,
        date: subscription.date_debut,
      })),
    ]
      .filter((activity) => activity.parkingId !== null)
      .map((activity) => ({
        ...activity,
        parking: this.parkings.find((parking) => parking.id_park === activity.parkingId) ?? null,
      }))
      .filter((activity): activity is { parkingId: number; parking: ParkingCard; type: 'reservation' | 'abonnement'; date: string } => Boolean(activity.parking))
      .sort((first, second) => this.getActivityTimestamp(second.date) - this.getActivityTimestamp(first.date));

    const seenParkingIds = new Set<number>();
    return activities.filter((activity) => {
      if (seenParkingIds.has(activity.parking.id_park)) {
        return false;
      }

      seenParkingIds.add(activity.parking.id_park);
      return true;
    }).slice(0, 3);
  }

  get defaultVehicle(): Vehicle | undefined {
    return this.vehicles.find((vehicle) => vehicle.isDefault);
  }

  get subscriptionHistory(): SubscriptionItem[] {
    return this.subscriptions;
  }

  get managedSubscriptions(): SubscriptionItem[] {
    return this.subscriptions.filter(
      (subscription) => subscription.statut !== 'suspendu' && !subscription.cancelled_at
    );
  }

  get completedReservationsCount(): number {
    return this.reservations.filter((reservation) => reservation.statut === 'terminee').length;
  }

  get activeSubscriptionsCount(): number {
    return this.subscriptions.filter((subscription) => subscription.statut === 'actif' && !subscription.cancelled_at).length;
  }

  get latestHistoryItem(): { type: 'reservation' | 'abonnement'; title: string; subtitle: string; date: string } | null {
    const reservationItems = this.reservations.map((reservation) => ({
      type: 'reservation' as const,
      title: reservation.parkingNom,
      subtitle: `${reservation.placeLabel} - ${this.getStatusLabel(reservation.statut)}`,
      date: reservation.date_debut,
    }));

    const subscriptionItems = this.subscriptions.map((subscription) => ({
      type: 'abonnement' as const,
      title: subscription.parkingNom,
      subtitle: `${subscription.placeLabel} - ${this.getStatusLabel(subscription.statut)}`,
      date: subscription.date_debut,
    }));

    return [...reservationItems, ...subscriptionItems]
      .sort((first, second) => this.getActivityTimestamp(second.date) - this.getActivityTimestamp(first.date))[0] ?? null;
  }

  get notificationItems(): HeaderNotificationItem[] {
    const subscriptionAlerts = this.subscriptions
      .map((subscription) => this.buildSubscriptionExpiryNotification(subscription))
      .filter((item): item is HeaderNotificationItem => item !== null)
      .slice(0, 3);

    const reservationNotifications = this.reservations
      .filter((reservation) => reservation.statut === 'en_attente' || reservation.statut === 'confirmee')
      .slice(0, 4)
      .map((reservation) => ({
        title: `Reservation ${this.getStatusLabel(reservation.statut)}`,
        description: `${reservation.parkingNom} • ${reservation.placeLabel}`,
        timestamp: this.formatNotificationTimestamp(reservation.date_debut),
      }));

    const subscriptionNotifications = this.subscriptions
      .filter((subscription) => subscription.statut === 'en_attente')
      .slice(0, 2)
      .map((subscription) => ({
        title: `Abonnement ${this.getStatusLabel(subscription.statut)}`,
        description: `${subscription.parkingNom} • ${subscription.type}`,
        timestamp: this.formatNotificationTimestamp(subscription.date_debut),
        icon: 'card-outline',
        tone: 'info' as const,
      }));

    return [...subscriptionAlerts, ...reservationNotifications, ...subscriptionNotifications].slice(0, 6);
  }

  get notificationsCount(): number {
    return this.notificationItems.length;
  }

  get totalAvailablePlaces(): number {
    return this.parkings.reduce((total, parking) => total + parking.availablePlaces, 0);
  }

  get selectedReservationParking(): ParkingCard | undefined {
    const parkingId = Number(this.reservationForm.get('parking_id')?.value);
    return this.parkings.find((parking) => parking.id_park === parkingId);
  }

  get selectedReservationStructure(): ParkingStructureSection[] {
    const parkingId = Number(this.reservationForm.get('parking_id')?.value);
    const parkingSpots = this.spots
      .filter((spot) => spot.parking_id === parkingId)
      .sort((a, b) => a.num_place - b.num_place);

    const floors = new Map<string, Map<string, ParkingSpot[]>>();

    parkingSpots.forEach((spot) => {
      const floorKey = (spot.etage || 'RDC').trim() || 'RDC';
      const zoneKey = (spot.zone || 'A').trim() || 'A';
      const floorZones = floors.get(floorKey) ?? new Map<string, ParkingSpot[]>();
      const zoneSpots = floorZones.get(zoneKey) ?? [];
      zoneSpots.push(spot);
      floorZones.set(zoneKey, zoneSpots);
      floors.set(floorKey, floorZones);
    });

    return Array.from(floors.entries()).map(([etage, zones]) => ({
      etage,
      zones: Array.from(zones.entries()).map(([name, spots]) => ({
        name,
        spots,
      })),
    }));
  }

  get reservationDurationHours(): number | null {
    const startValue = this.reservationForm.get('date_debut')?.value;
    const endValue = this.reservationForm.get('date_fin')?.value;

    if (!startValue || !endValue) {
      return null;
    }

    const start = new Date(startValue);
    const end = new Date(endValue);
    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    if (Number.isNaN(duration) || duration <= 0) {
      return null;
    }

    return Math.round(duration * 100) / 100;
  }

  get reservationEstimatedTotal(): number | null {
    const parking = this.selectedReservationParking;
    const duration = this.reservationDurationHours;

    if (!parking || duration === null) {
      return null;
    }

    return Math.round(duration * parking.prix_heure);
  }

  get isOnlinePaymentSelected(): boolean {
    return this.reservationForm.get('payment_mode')?.value === 'en_ligne';
  }

  get reservationSubmitLabel(): string {
    if (this.isReservationSubmitting) {
      return this.isOnlinePaymentSelected ? 'Paiement en cours...' : 'Confirmation...';
    }

    return this.isOnlinePaymentSelected ? 'Payer et confirmer' : 'Confirmer la réservation';
  }

  private async loadParkingsAndPlaces(): Promise<void> {
    this.isLoadingParkings = true;
    try {
      const parkingDtos = await firstValueFrom(this.parkingService.getParkings());
      const activeParkings = parkingDtos.filter((parking) => parking.statut === 'actif');
      const parkingsToUse = activeParkings.length ? activeParkings : parkingDtos;

      const placeResponses = await Promise.all(
        parkingsToUse.map((parking) => firstValueFrom(this.placeService.getPlaces(parking.id_park)))
      );

      const allPlaces = placeResponses.reduce(
        (accumulator: PlaceDto[], places) => accumulator.concat(places),
        []
      );

      this.spots = allPlaces.map((place) => this.mapPlaceToSpot(place));
      this.parkings = parkingsToUse.map((parking, index) =>
        this.mapParkingToCard(parking, placeResponses[index] ?? [], index)
      );

      if (this.selectedParking) {
        this.selectedParking =
          this.parkings.find((parking) => parking.id_park === this.selectedParking?.id_park) ?? null;
      }
    } catch (error: any) {
      this.toastService.show(
        error?.error?.msg || error?.error?.error || 'Impossible de charger les parkings',
        'error'
      );
    } finally {
      this.isLoadingParkings = false;
    }
  }

  private async loadVehicles(): Promise<void> {
    this.isLoadingVehicles = true;
    try {
      const vehicleDtos = await firstValueFrom(this.vehicleService.getVehicles());
      this.vehicles = vehicleDtos.map((vehicle, index) => this.mapVehicle(vehicle, index));
    } catch (error: any) {
      this.toastService.show(
        error?.error?.msg || error?.error?.error || 'Impossible de charger les vehicules',
        'error'
      );
    } finally {
      this.isLoadingVehicles = false;
    }
  }

  private async loadReservations(): Promise<void> {
    this.isLoadingReservations = true;
    try {
      const reservations = await firstValueFrom(this.reservationService.getReservations());
      this.reservations = reservations.map((reservation) => this.mapReservationHistory(reservation));
    } catch (error: any) {
      this.toastService.show(
        error?.error?.msg || error?.error?.error || 'Impossible de charger les reservations',
        'error'
      );
    } finally {
      this.isLoadingReservations = false;
    }
  }

  private async loadSubscriptions(): Promise<void> {
    this.isLoadingSubscriptions = true;
    try {
      const subscriptions = await firstValueFrom(this.subscriptionService.getSubscriptions());
      this.subscriptions = subscriptions.map((subscription) => this.mapSubscription(subscription));
      this.notifyExpiringSubscriptions();
    } catch (error: any) {
      this.toastService.show(
        error?.error?.msg || error?.error?.error || 'Impossible de charger les abonnements',
        'error'
      );
    } finally {
      this.isLoadingSubscriptions = false;
    }
  }

  private mapParkingToCard(parking: ParkingDto, places: PlaceDto[], index: number): ParkingCard {
    const availablePlaces = places.filter((place) => this.isSpotAvailable(place.etat)).length;
    const coordinates = this.getFallbackCoordinates(index);

    return {
      id_park: parking.id_park,
      nom: parking.nom,
      adresse: parking.adresse,
      ville: this.extractCityFromAddress(parking.adresse),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      prix_heure: Number(parking.prix_heure),
      frequent: index < 3,
      distanceKm: 0.8 + index * 1.1,
      availablePlaces,
    };
  }

  private mapPlaceToSpot(place: PlaceDto): ParkingSpot {
    return {
      id_place: place.id_place,
      parking_id: place.parking_id,
      num_place: place.num_place,
      etat: this.normalizePlaceStatus(place.etat),
      zone: place.zone || 'A',
      etage: place.etage || 'RDC',
    };
  }

  private mapVehicle(vehicle: VehicleDto, index: number): Vehicle {
    return {
      id: vehicle.id_veh,
      matricule: vehicle.matricule,
      marque: vehicle.marque || 'Vehicule',
      type: vehicle.type || 'Standard',
      isDefault: index === 0,
    };
  }

  private mapReservationHistory(reservation: ReservationHistoryDto): ReservationItem {
    const place = reservation.place;
    const parking = reservation.parking;
    const vehicle = reservation.vehicule;

    return {
      id_res: reservation.id_res,
      parkingId: parking?.id_park ?? place?.parking_id ?? null,
      parkingNom: parking?.nom || 'Parking',
      placeLabel: place
        ? this.buildSpotLabel({
            id_place: place.id_place,
            parking_id: place.parking_id,
            num_place: place.num_place,
            etat: place.etat,
            zone: place.zone || 'A',
            etage: place.etage || 'RDC',
          })
        : 'Place indisponible',
      date_debut: reservation.date_debut,
      date_fin: reservation.date_fin,
      statut: reservation.statut,
      prix_total: Number(reservation.prix_total),
      paymentMode: 'en_ligne',
      vehiculeLabel: vehicle ? `${vehicle.marque || 'Vehicule'} ${vehicle.type || ''}`.trim() : 'Vehicule inconnu',
    };
  }

  private mapSubscription(subscription: SubscriptionDto): SubscriptionItem {
    const place = subscription.place;
    const parking = subscription.parking;

    return {
      id_abon: subscription.id_abon,
      parkingId: parking?.id_park ?? place?.parking_id ?? null,
      parkingNom: parking?.nom || 'Parking',
      placeLabel: place
        ? this.buildSpotLabel({
            id_place: place.id_place,
            parking_id: place.parking_id,
            num_place: place.num_place,
            etat: place.etat,
            zone: place.zone || 'A',
            etage: place.etage || 'RDC',
          })
        : 'Place indisponible',
      type: subscription.type,
      date_debut: subscription.date_debut,
      date_fin: subscription.date_fin,
      statut: subscription.statut,
      tarif: Number(subscription.tarif),
      cancelled_at: subscription.cancelled_at || null,
      canCancel: subscription.statut === 'actif' || subscription.statut === 'en_attente',
    };
  }

  private extractCityFromAddress(address: string): string {
    const segments = address
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean);
    return segments[segments.length - 1] || 'Ville';
  }

  private getFallbackCoordinates(index: number): { latitude: number; longitude: number } {
    return {
      latitude: this.driverPosition.latitude + 0.006 + index * 0.0045,
      longitude: this.driverPosition.longitude - 0.01 + index * 0.005,
    };
  }

  get availableReservationSpots(): ParkingSpot[] {
    const parkingId = Number(this.reservationForm.get('parking_id')?.value);
    return this.spots.filter((spot) => spot.parking_id === parkingId && this.isSpotAvailable(spot.etat));
  }

  get availableSubscriptionSpots(): ParkingSpot[] {
    const parkingId = Number(this.subscriptionForm.get('parking_id')?.value);
    return this.spots.filter((spot) => spot.parking_id === parkingId && this.isSpotAvailable(spot.etat));
  }


  get selectedSubscriptionStructure(): ParkingStructureSection[] {
    const parkingId = Number(this.subscriptionForm.get('parking_id')?.value);
    const parkingSpots = this.spots
      .filter((spot) => spot.parking_id === parkingId)
      .sort((a, b) => a.num_place - b.num_place);

    const floors = new Map<string, Map<string, ParkingSpot[]>>();

    parkingSpots.forEach((spot) => {
      const floorKey = (spot.etage || 'RDC').trim() || 'RDC';
      const zoneKey = (spot.zone || 'A').trim() || 'A';
      const floorZones = floors.get(floorKey) ?? new Map<string, ParkingSpot[]>();
      const zoneSpots = floorZones.get(zoneKey) ?? [];
      zoneSpots.push(spot);
      floorZones.set(zoneKey, zoneSpots);
      floors.set(floorKey, floorZones);
    });

    return Array.from(floors.entries()).map(([etage, zones]) => ({
      etage,
      zones: Array.from(zones.entries()).map(([name, spots]) => ({
        name,
        spots,
      })),
    }));
  }

  selectParkingFromSearch(parking: ParkingCard): void {
    this.searchTerm = parking.nom;
    window.setTimeout(() => {
      this.mapComponent?.focusOnParking(this.toMapParking(parking));
    }, 0);
  }

  reserveParkingFromSearch(parking: ParkingCard): void {
    this.searchTerm = '';
    this.openReservation(parking);
  }

  getRecentParkingActivityLabel(type: 'reservation' | 'abonnement'): string {
    return type === 'abonnement' ? 'Dernier abonnement' : 'Derniere reservation';
  }

  openReservation(parking?: ParkingCard): void {
    this.selectedParking = parking ?? null;
    const preferredParkingId = parking?.id_park ?? this.parkings[0]?.id_park ?? '';
    const fallbackParkingId = this.findFirstParkingWithAvailableSpot();
    const targetParkingId = this.hasAvailableSpot(preferredParkingId) ? preferredParkingId : fallbackParkingId;
    const defaultVehicleId = this.defaultVehicle?.id ?? '';

    const availableSpot = this.spots.find(
      (spot) => spot.parking_id === Number(targetParkingId) && this.isSpotAvailable(spot.etat)
    );


      this.reservationForm.reset({
        parking_id: targetParkingId ?? '',
      vehicule_id: defaultVehicleId,
      place_id: availableSpot?.id_place ?? '',
      date_debut: '',
      date_fin: '',
      payment_mode: 'en_ligne',
      payment_method: 'carte_bancaire',
      card_holder: '',
      card_number: '',
      card_expiry: '',
      card_cvv: '',
      });

      this.isReservationModalOpen = true;
      this.startReservationLiveRefresh();
    }

  handleMapParkingSelected(parking: MapParking): void {
    const selectedParking = this.parkings.find((item) => item.id_park === parking.id);
    if (selectedParking) {
      this.openReservation(selectedParking);
    }
  }

  closeReservationModal(): void {
    this.stopReservationLiveRefresh();
    this.isReservationModalOpen = false;
    this.selectedParking = null;
  }

  onReservationParkingChange(): void {
    const firstSpot = this.availableReservationSpots[0];
    this.reservationForm.patchValue({
      place_id: firstSpot?.id_place ?? '',
    });
    this.selectedParking =
      this.parkings.find((parking) => parking.id_park === Number(this.reservationForm.get('parking_id')?.value)) ??
      null;
    this.refreshReservationParkingOccupancy();
  }

  selectReservationSpot(spot: ParkingSpot): void {
    if (!this.isSpotAvailable(spot.etat)) {
      return;
    }

    this.reservationForm.patchValue({
      place_id: spot.id_place,
    });
  }

  isReservationSpotSelected(spotId: number): boolean {
    return Number(this.reservationForm.get('place_id')?.value) === spotId;
  }

  private hasAvailableSpot(parkingId: number | string | undefined): boolean {
    const normalizedParkingId = Number(parkingId);
    if (!normalizedParkingId) {
      return false;
    }

    return this.spots.some((spot) => spot.parking_id === normalizedParkingId && spot.etat === 'libre');
  }

  private findFirstParkingWithAvailableSpot(): number | null {
    const parking = this.parkings.find((item) => this.hasAvailableSpot(item.id_park));
    return parking?.id_park ?? null;
  }

  async submitReservation(): Promise<void> {
    const values = this.reservationForm.value;

    const validationError = this.getReservationFormErrorMessage();
    if (validationError) {
      this.reservationForm.markAllAsTouched();
      this.toastService.show(validationError, 'error');
      return;
    }

    const parking = this.parkings.find((item) => item.id_park === Number(values.parking_id));
    const spot = this.spots.find((item) => item.id_place === Number(values.place_id));
    const selectedVehicleId = values.vehicule_id ? Number(values.vehicule_id) : null;
    const vehicle = selectedVehicleId !== null
      ? this.vehicles.find((item) => item.id === selectedVehicleId)
      : undefined;

    if (!parking || !spot) {
      this.toastService.show('Selection de parking ou de place invalide', 'error');
      return;
    }

    if (!vehicle) {
      this.toastService.show('Ajoutez d abord une voiture dans votre profil avant de reserver', 'error');
      return;
    }

    const start = new Date(values.date_debut);
    const end = new Date(values.date_fin);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      this.toastService.show('La date de fin doit etre apres la date de debut', 'error');
      return;
    }

    if (this.isOnlinePaymentSelected) {
      const paymentValidationError = this.validateOnlinePaymentFields();
      if (paymentValidationError) {
        this.toastService.show(paymentValidationError, 'error');
        return;
      }
    }

    this.isReservationSubmitting = true;
    try {
      if (this.isOnlinePaymentSelected) {
        await firstValueFrom(
          this.paymentService.simulatePayment({
            amount: this.reservationEstimatedTotal ?? 0,
            method: this.reservationForm.value.payment_method,
            card_holder: this.reservationForm.value.card_holder,
            card_number: this.reservationForm.value.card_number,
            card_expiry: this.reservationForm.value.card_expiry,
            card_cvv: this.reservationForm.value.card_cvv,
          })
        );
      }

      const reservationResponse = await firstValueFrom(
        this.reservationService.createReservation({
          vehicule_id: vehicle.id,
          place_id: Number(values.place_id),
          date_debut: start.toISOString(),
          date_fin: end.toISOString(),
        })
      );

      if (this.isOnlinePaymentSelected) {
        await firstValueFrom(
          this.paymentService.createPayment({
            reservation_id: Number(reservationResponse?.reservation?.id_res),
            montant: Number(reservationResponse?.prix ?? this.reservationEstimatedTotal ?? 0),
            mode: this.reservationForm.value.payment_method,
          })
        );
      }

      this.spots = this.spots.map((item) =>
        item.id_place === spot.id_place
          ? { ...item, etat: 'reservee' }
          : item
      );
      this.parkings = this.parkings.map((item) =>
        item.id_park === parking.id_park
          ? { ...item, availablePlaces: Math.max(item.availablePlaces - 1, 0) }
          : item
      );

      await this.loadReservations();
      this.toastService.show(
        this.isOnlinePaymentSelected
          ? 'Paiement valide et reservation creee avec succes'
          : 'Reservation creee avec succes',
        'success'
      );
      this.closeReservationModal();
      this.activeTab = 'historique';
    } catch (error: any) {
      this.toastService.show(
        error?.error?.msg || error?.error?.error || 'Erreur lors de la reservation',
        'error'
      );
    } finally {
      this.isReservationSubmitting = false;
    }
  }

  openVehicleModal(): void {
    this.vehicleForm.reset({
      matricule: '',
      marque: '',
      type: '',
    });
    this.isVehicleModalOpen = true;
  }

  closeVehicleModal(): void {
    this.isVehicleModalOpen = false;
  }

  async submitVehicle(): Promise<void> {
    if (this.vehicleForm.invalid) {
      this.vehicleForm.markAllAsTouched();
      return;
    }

    const matricule = this.vehicleService.normalizePlate(this.vehicleForm.value.matricule);
    const marque = String(this.vehicleForm.value.marque || '').trim();
    const type = String(this.vehicleForm.value.type || '').trim();

    this.vehicleForm.patchValue({ matricule, marque, type }, { emitEvent: false });

    if (!this.vehicleService.isSupportedPlateFormat(matricule)) {
      this.toastService.show('Le matricule doit etre au format: chiffres تونس chiffres', 'error');
      return;
    }

    this.isVehicleSubmitting = true;
    try {
      await firstValueFrom(
        this.vehicleService.createVehicle({
          matricule,
          marque,
          type,
        })
      );

      await this.loadVehicles();
      this.toastService.show('Vehicule cree avec succes', 'success');
      this.closeVehicleModal();
    } catch (error: any) {
      this.toastService.show(
        error?.error?.msg || error?.error?.error || 'Erreur lors de la creation du vehicule',
        'error'
      );
    } finally {
      this.isVehicleSubmitting = false;
    }
  }

  setDefaultVehicle(vehicleId: number): void {
    this.vehicles = this.vehicles.map((vehicle) => ({
      ...vehicle,
      isDefault: vehicle.id === vehicleId,
    }));
  }

  async saveProfile(): Promise<void> {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isProfileSubmitting = true;
    try {
      const updatedUser = await firstValueFrom(this.authService.updateProfile(this.profileForm.value));
      this.driverProfile = {
        ...this.driverProfile,
        nom: updatedUser.nom,
        email: updatedUser.email,
        telephone: updatedUser.telephone || '',
        avatar: this.buildAvatar(updatedUser.nom),
      };
      this.closeProfileModal();
      this.toastService.show('Profil mis a jour avec succes', 'success');
    } catch (error: any) {
      this.toastService.show(
        error?.error?.msg || error?.error?.error || 'Impossible de mettre a jour le profil',
        'error'
      );
    } finally {
      this.isProfileSubmitting = false;
    }
  }

  openProfileModal(): void {
    this.profileForm.patchValue(this.driverProfile);
    this.isProfileModalOpen = true;
  }

  closeProfileModal(): void {
    this.isProfileModalOpen = false;
  }

  async openSubscriptionModal(): Promise<void> {
    await this.loadParkingsAndPlaces();

    const defaultParking = this.parkings[0]?.id_park ?? '';
    const firstSpot = this.spots.find(
      (spot) => spot.parking_id === defaultParking && this.isSpotAvailable(spot.etat)
    );

    this.subscriptionForm.reset({
      parking_id: defaultParking,
      place_id: firstSpot?.id_place ?? '',
      type: 'mensuel',
      date_debut: '',
    });
    this.isSubscriptionModalOpen = true;
  }

  closeSubscriptionModal(): void {
    this.isSubscriptionModalOpen = false;
  }

  onSubscriptionParkingChange(): void {
    const firstSpot = this.availableSubscriptionSpots[0];
    this.subscriptionForm.patchValue({
      place_id: firstSpot?.id_place ?? '',
    });
  }

  selectSubscriptionSpot(spot: ParkingSpot): void {
    if (!this.isSpotAvailable(spot.etat)) {
      return;
    }

    this.subscriptionForm.patchValue({
      place_id: spot.id_place,
    });
  }

  isSubscriptionSpotSelected(spotId: number): boolean {
    return Number(this.subscriptionForm.get('place_id')?.value) === spotId;
  }

  async submitSubscription(): Promise<void> {
    if (this.subscriptionForm.invalid) {
      this.subscriptionForm.markAllAsTouched();
      return;
    }

    const values = this.subscriptionForm.value;
    const parking = this.parkings.find((item) => item.id_park === Number(values.parking_id));
    const spot = this.spots.find((item) => item.id_place === Number(values.place_id));

    if (!parking || !spot) {
      return;
    }

    const startDate = new Date(values.date_debut);
    const endDate = new Date(startDate);
    let tarif = 12000;

    if (values.type === 'trimestriel') {
      endDate.setMonth(endDate.getMonth() + 3);
      tarif = 32000;
    } else if (values.type === 'annuel') {
      endDate.setFullYear(endDate.getFullYear() + 1);
      tarif = 115000;
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    this.isSubscriptionSubmitting = true;
    try {
      const payload: CreateSubscriptionPayload = {
        type: values.type,
        date_debut: values.date_debut,
        date_fin: endDate.toISOString().slice(0, 10),
        tarif,
        place_id: Number(values.place_id),
      };

      await firstValueFrom(this.subscriptionService.createPlaceSubscription(payload));
      await this.loadParkingsAndPlaces();
      await this.loadSubscriptions();
      this.toastService.show('Abonnement cree avec succes', 'success');
      this.closeSubscriptionModal();
    } catch (error: any) {
      this.toastService.show(
        error?.error?.msg || error?.error?.error || 'Erreur lors de la creation de l abonnement',
        'error'
      );
    } finally {
      this.isSubscriptionSubmitting = false;
    }
  }

  async cancelSubscription(subscription: SubscriptionItem): Promise<void> {
    if (!subscription.canCancel || this.cancellingSubscriptionId === subscription.id_abon) {
      return;
    }

    const isConfirmed = window.confirm(
      `Voulez-vous vraiment annuler l abonnement de ${subscription.placeLabel} ? ` +
      'Cette action liberera la place pour un autre conducteur et aucun remboursement ne sera effectue.'
    );

    if (!isConfirmed) {
      return;
    }

    this.cancellingSubscriptionId = subscription.id_abon;
    try {
      const response = await firstValueFrom(
        this.subscriptionService.cancelPlaceSubscription(subscription.id_abon)
      );
      await this.loadParkingsAndPlaces();
      await this.loadSubscriptions();
      this.toastService.show(
        response.msg || 'Abonnement annule avec succes',
        'success'
      );
    } catch (error: any) {
      this.toastService.show(
        error?.error?.msg || error?.error?.error || 'Impossible d annuler cet abonnement',
        'error'
      );
    } finally {
      this.cancellingSubscriptionId = null;
    }
  }

  getStatusLabel(status: ReservationItem['statut'] | SubscriptionItem['statut']): string {
    const labels: Record<string, string> = {
      en_attente: 'En attente',
      confirmee: 'Confirmee',
      annulee: 'Annulee',
      terminee: 'Terminee',
      actif: 'Actif',
      expire: 'Expire',
      suspendu: 'Annule',
    };

    return labels[status] ?? status;
  }

  getPaymentLabel(mode: PaymentMode): string {
    return mode === 'en_ligne' ? 'Paiement en ligne' : 'Paiement sur place';
  }

  trackByParking(_: number, parking: ParkingCard): number {
    return parking.id_park;
  }

  trackByRecentActivity(_: number, activity: { parking: ParkingCard }): number {
    return activity.parking.id_park;
  }

  trackByReservation(_: number, reservation: ReservationItem): number {
    return reservation.id_res;
  }

  trackByVehicle(_: number, vehicle: Vehicle): number {
    return vehicle.id;
  }

  trackBySubscription(_: number, subscription: SubscriptionItem): number {
    return subscription.id_abon;
  }

  getMarkerStyle(parking: ParkingCard): Record<string, string> {
    const minLat = Math.min(...this.parkings.map((item) => item.latitude), this.driverPosition.latitude);
    const maxLat = Math.max(...this.parkings.map((item) => item.latitude), this.driverPosition.latitude);
    const minLng = Math.min(...this.parkings.map((item) => item.longitude), this.driverPosition.longitude);
    const maxLng = Math.max(...this.parkings.map((item) => item.longitude), this.driverPosition.longitude);

    const left = 12 + ((parking.longitude - minLng) / Math.max(maxLng - minLng, 0.0001)) * 76;
    const top = 18 + ((maxLat - parking.latitude) / Math.max(maxLat - minLat, 0.0001)) * 56;

    return {
      left: `${left}%`,
      top: `${top}%`,
    };
  }

  getDriverMarkerStyle(): Record<string, string> {
    const minLat = Math.min(...this.parkings.map((item) => item.latitude), this.driverPosition.latitude);
    const maxLat = Math.max(...this.parkings.map((item) => item.latitude), this.driverPosition.latitude);
    const minLng = Math.min(...this.parkings.map((item) => item.longitude), this.driverPosition.longitude);
    const maxLng = Math.max(...this.parkings.map((item) => item.longitude), this.driverPosition.longitude);

    const left = 12 + ((this.driverPosition.longitude - minLng) / Math.max(maxLng - minLng, 0.0001)) * 76;
    const top = 18 + ((maxLat - this.driverPosition.latitude) / Math.max(maxLat - minLat, 0.0001)) * 56;

    return {
      left: `${left}%`,
      top: `${top}%`,
    };
  }

  focusDriverLocation(): void {
    this.isDriverLocationFocused = true;
    window.setTimeout(() => {
      this.isDriverLocationFocused = false;
    }, 1800);
  }

  buildSpotLabel(spot: ParkingSpot): string {
    return `Place ${spot.zone}-${spot.num_place} • Etage ${spot.etage}`;
  }

  getSpotStatusLabel(status: ParkingSpot['etat']): string {
    if (status === 'libre') {
      return 'Libre';
    }
    if (status === 'reservee') {
      return 'Reservee';
    }
    return 'Occupee';
  }

  getSpotVisualState(status: ParkingSpot['etat']): 'libre' | 'reservee' | 'occupee' {
    return this.normalizePlaceStatus(status);
  }

  private buildSubscriptionExpiryNotification(subscription: SubscriptionItem): HeaderNotificationItem | null {
    if (this.isSubscriptionExpired(subscription)) {
      return {
        title: 'Abonnement expire',
        description: `${subscription.parkingNom} • ${subscription.placeLabel}`,
        timestamp: this.formatNotificationTimestamp(subscription.date_fin),
        icon: 'alert-circle-outline',
        tone: 'warning',
      };
    }

    const remainingDays = this.getSubscriptionRemainingDays(subscription);
    if (subscription.statut === 'actif' && remainingDays !== null && remainingDays <= this.subscriptionAlertWindowDays) {
      return {
        title: 'Abonnement bientot termine',
        description: `${subscription.placeLabel} expire dans ${remainingDays} jour${remainingDays > 1 ? 's' : ''}`,
        timestamp: this.formatNotificationTimestamp(subscription.date_fin),
        icon: 'notifications-outline',
        tone: 'alert',
      };
    }

    return null;
  }

  private getSubscriptionRemainingDays(subscription: SubscriptionItem): number | null {
    if (!subscription.date_fin) {
      return null;
    }

    const endDate = new Date(subscription.date_fin);
    if (Number.isNaN(endDate.getTime())) {
      return null;
    }

    endDate.setHours(23, 59, 59, 999);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffMs = endDate.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  private isSubscriptionExpired(subscription: SubscriptionItem): boolean {
    const remainingDays = this.getSubscriptionRemainingDays(subscription);
    return subscription.statut === 'expire' || (remainingDays !== null && remainingDays < 0);
  }

  private notifyExpiringSubscriptions(): void {
    this.subscriptions.forEach((subscription) => {
      const remainingDays = this.getSubscriptionRemainingDays(subscription);
      const isAlertable =
        subscription.statut === 'actif' &&
        remainingDays !== null &&
        remainingDays >= 0 &&
        remainingDays <= this.subscriptionAlertWindowDays;

      if (!isAlertable || this.notifiedSubscriptionIds.has(subscription.id_abon)) {
        return;
      }

      this.notifiedSubscriptionIds.add(subscription.id_abon);
      this.toastService.show(
        `Alerte abonnement: votre place ${subscription.placeLabel} expire dans ${remainingDays} jour${remainingDays > 1 ? 's' : ''}.`,
        'info'
      );
    });
  }

  private formatNotificationTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Mise a jour recente';
    }

    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private validateOnlinePaymentFields(): string | null {
    const values = this.reservationForm.value;

    if (!values.payment_method) {
      return 'Choisissez une methode de paiement';
    }

    if (!values.card_holder?.trim()) {
      return 'Saisissez le nom du porteur';
    }

    const normalizedCardNumber = String(values.card_number || '').replace(/\s+/g, '');
    if (normalizedCardNumber.length < 12) {
      return 'Saisissez un numero de carte valide';
    }

    if (!String(values.card_expiry || '').trim()) {
      return 'Saisissez la date d expiration';
    }

    const normalizedCvv = String(values.card_cvv || '').trim();
    if (normalizedCvv.length < 3) {
      return 'Saisissez un code de securite valide';
    }

    return null;
  }

  private getReservationFormErrorMessage(): string | null {
    const values = this.reservationForm.value;

    if (!values.parking_id) {
      return 'Choisissez un parking';
    }

    if (!values.vehicule_id) {
      return 'Choisissez une voiture pour continuer';
    }

    if (!values.place_id) {
      return 'Choisissez une place disponible';
    }

    if (!values.date_debut) {
      return 'Choisissez la date de debut';
    }

    if (!values.date_fin) {
      return 'Choisissez la date de fin';
    }

    if (!values.payment_mode) {
      return 'Choisissez un mode de paiement';
    }

    if (this.isOnlinePaymentSelected) {
      return this.validateOnlinePaymentFields();
    }

    return null;
  }

  get mapParkings(): MapParking[] {
    return this.displayedMapParkings.map((parking) => this.toMapParking(parking));
  }

  get totalAvailableSpaces(): number {
    return this.parkings.reduce((sum, parking) => sum + parking.availablePlaces, 0);
  }

private startLocationTracking(): void {
  // Vérifier si la géolocalisation est supportée
  if (!('geolocation' in navigator)) {
    console.warn('⚠️ Géolocalisation non supportée par ce navigateur');
    this.gpsStatus = 'error';
    this.driverPosition = {
      latitude: 36.7538,
      longitude: 3.0588
    };
    return;
  }

  console.log('📍 Demande de géolocalisation en cours...');
  this.gpsStatus = 'waiting';

  // Options pour une meilleure précision
  const options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  };

  // Récupérer la position
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      console.log(`✅ Position trouvée: ${latitude}, ${longitude}`);
      console.log(`🎯 Précision: ±${accuracy} mètres`);
      
      this.driverPosition = { latitude, longitude };
      this.gpsStatus = 'active';
      
      // Forcer la mise à jour de la carte
      setTimeout(() => {
        const mapComponent = document.querySelector('app-map') as any;
        if (mapComponent && mapComponent.focusOnUser) {
          mapComponent.focusOnUser();
        }
      }, 500);
    },
    (error) => {
      console.error('❌ Erreur de géolocalisation:', error.message);
      
      // Analyser le type d'erreur
      let errorMessage = '';
      switch(error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = 'Accès à la position refusé. Activez la localisation.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = 'Position non disponible. Vérifiez le GPS.';
          break;
        case error.TIMEOUT:
          errorMessage = 'Délai d\'attente dépassé.';
          break;
      }
      console.warn(errorMessage);
      
      this.gpsStatus = 'error';
      // Garder la position par défaut
      this.driverPosition = {
        latitude: 36.7538,
        longitude: 3.0588
      };
    },
    options
  );

  // Suivi en temps réel
  if (this.locationWatchId !== null) {
    navigator.geolocation.clearWatch(this.locationWatchId);
  }
  
  this.locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      console.log(`🔄 Position mise à jour: ${latitude}, ${longitude}`);
      this.driverPosition = { latitude, longitude };
      this.gpsStatus = 'active';
    },
    (error) => {
      console.warn('⚠️ Erreur de suivi:', error.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000
    }
  );
}

// Ajoute cette méthode pour afficher un toast de confirmation
private showLocationToast(latitude: number, longitude: number): void {
  // Créer un toast simple (sans dépendance)
  const toast = document.createElement('div');
  toast.textContent = `📍 Position détectée: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    z-index: 1000;
    animation: fadeOut 3s forwards;
  `;
  
  // Ajouter l'animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeOut {
      0% { opacity: 1; }
      70% { opacity: 1; }
      100% { opacity: 0; visibility: hidden; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

  private updateDriverPosition(latitude: number, longitude: number): void {
  this.driverPosition = { latitude, longitude };
  this.gpsStatus = 'active';
  console.log(`📍 Position mise à jour: ${latitude}, ${longitude}`);
}
  private buildAvatar(name: string): string {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join('');
  }

  private matchesParkingSearch(parking: ParkingCard, term: string): boolean {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) {
      return true;
    }

    return [parking.nom, parking.adresse, parking.ville].some((value) =>
      value.toLowerCase().includes(normalizedTerm)
    );
  }

  private getActivityTimestamp(value: string): number {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  private toMapParking(parking: ParkingCard): MapParking {
    return {
      id: parking.id_park,
      nom: parking.nom,
      adresse: `${parking.adresse}, ${parking.ville}`,
      latitude: parking.latitude,
      longitude: parking.longitude,
      availableSpaces: parking.availablePlaces,
      price: parking.prix_heure,
    };
  }

  private normalizePlaceStatus(status?: string): ParkingSpot['etat'] {
    const normalizedStatus = (status || '').trim().toLowerCase();
    if (normalizedStatus === 'reservee' || normalizedStatus === 'occupee') {
      return normalizedStatus;
    }
    return 'libre';
  }

  private isSpotAvailable(status?: string): boolean {
    return this.normalizePlaceStatus(status) === 'libre';
  }

  private startReservationLiveRefresh(): void {
    this.stopReservationLiveRefresh();
    void this.refreshReservationParkingOccupancy();
    this.reservationRefreshIntervalId = window.setInterval(() => {
      void this.refreshReservationParkingOccupancy();
    }, this.liveParkingRefreshIntervalMs);
  }

  private stopReservationLiveRefresh(): void {
    if (this.reservationRefreshIntervalId !== null) {
      window.clearInterval(this.reservationRefreshIntervalId);
      this.reservationRefreshIntervalId = null;
    }
  }

  private async refreshReservationParkingOccupancy(): Promise<void> {
    if (!this.isReservationModalOpen) {
      return;
    }

    const parkingId = Number(this.reservationForm.get('parking_id')?.value);
    if (!parkingId) {
      return;
    }

    try {
      const places = await firstValueFrom(this.placeService.getPlaces(parkingId));
      const refreshedSpots = places.map((place) => this.mapPlaceToSpot(place));
      const remainingSpots = this.spots.filter((spot) => spot.parking_id !== parkingId);
      this.spots = [...remainingSpots, ...refreshedSpots];

      const availablePlaces = refreshedSpots.filter((spot) => this.isSpotAvailable(spot.etat)).length;
      this.parkings = this.parkings.map((parking) =>
        parking.id_park === parkingId ? { ...parking, availablePlaces } : parking
      );

      this.selectedParking =
        this.parkings.find((parking) => parking.id_park === parkingId) ?? this.selectedParking;

      const selectedSpotId = Number(this.reservationForm.get('place_id')?.value);
      const selectedSpot = refreshedSpots.find((spot) => spot.id_place === selectedSpotId);

      if (selectedSpot && !this.isSpotAvailable(selectedSpot.etat)) {
        const fallbackSpot = refreshedSpots.find((spot) => this.isSpotAvailable(spot.etat));
        this.reservationForm.patchValue({
          place_id: fallbackSpot?.id_place ?? '',
        });
        this.toastService.show(
          'La place choisie vient de changer d etat. Selectionnez une place libre.',
          'info'
        );
      }
    } catch (error) {
      console.warn('Impossible de rafraichir l occupation du parking pour la reservation.', error);
    }
  }

}
