import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth';

type DriverTab = 'home' | 'historique' | 'profil';
type PaymentMode = 'en_ligne' | 'sur_place';

interface DriverProfile {
  nom: string;
  email: string;
  telephone: string;
  adresse: string;
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
  parkingNom: string;
  placeLabel: string;
  type: 'mensuel' | 'trimestriel' | 'annuel';
  date_debut: string;
  date_fin: string;
  statut: 'actif' | 'expire' | 'suspendu' | 'en_attente';
  tarif: number;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  standalone: false,
})
export class DashboardComponent implements OnInit {
  activeTab: DriverTab = 'home';
  searchTerm = '';
  notificationsCount = 3;
  isDriverLocationFocused = false;

  isReservationModalOpen = false;
  isVehicleModalOpen = false;
  isSubscriptionModalOpen = false;

  selectedParking: ParkingCard | null = null;

  driverProfile: DriverProfile = {
    nom: 'Nadia Benali',
    email: 'nadia.benali@parkini.com',
    telephone: '+213 555 20 10 15',
    adresse: 'Cité 120 logements, Alger',
    avatar: 'NB',
  };

  readonly driverPosition = {
    latitude: 36.7538,
    longitude: 3.0588,
  };

  vehicles: Vehicle[] = [
    { id: 1, matricule: '123456-115-16', marque: 'Mercedes', type: 'Classe C', isDefault: true },
    { id: 2, matricule: '458972-116-16', marque: 'BMW', type: 'Série 3', isDefault: false },
  ];

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
      nom: 'Parking Aéroport',
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
      parkingNom: 'Parking Centre Ville',
      placeLabel: 'Place A-19',
      type: 'mensuel',
      date_debut: '2026-03-01',
      date_fin: '2026-03-31',
      statut: 'actif',
      tarif: 12000,
    },
  ];

  profileForm: FormGroup;
  reservationForm: FormGroup;
  vehicleForm: FormGroup;
  subscriptionForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    this.profileForm = this.fb.group({
      nom: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      telephone: ['', Validators.required],
      adresse: ['', Validators.required],
    });

    this.reservationForm = this.fb.group({
      parking_id: ['', Validators.required],
      vehicule_id: ['', Validators.required],
      place_id: ['', Validators.required],
      date_debut: ['', Validators.required],
      date_fin: ['', Validators.required],
      payment_mode: ['en_ligne', Validators.required],
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

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.driverProfile = {
        ...this.driverProfile,
        nom: currentUser.username || this.driverProfile.nom,
        email: currentUser.email || this.driverProfile.email,
      };
    }

    this.profileForm.patchValue(this.driverProfile);
  }

  setActiveTab(tab: DriverTab): void {
    this.activeTab = tab;
  }

  get filteredParkings(): ParkingCard[] {
    const term = this.searchTerm.trim().toLowerCase();
    const source = this.parkings.filter((parking) => parking.frequent);
    if (!term) {
      return source;
    }

    return source.filter((parking) =>
      [parking.nom, parking.adresse, parking.ville].some((value) => value.toLowerCase().includes(term))
    );
  }

  get defaultVehicle(): Vehicle | undefined {
    return this.vehicles.find((vehicle) => vehicle.isDefault);
  }

  get availableReservationSpots(): ParkingSpot[] {
    const parkingId = Number(this.reservationForm.get('parking_id')?.value);
    return this.spots.filter((spot) => spot.parking_id === parkingId && spot.etat === 'libre');
  }

  get availableSubscriptionSpots(): ParkingSpot[] {
    const parkingId = Number(this.subscriptionForm.get('parking_id')?.value);
    return this.spots.filter((spot) => spot.parking_id === parkingId && spot.etat === 'libre');
  }

  openReservation(parking?: ParkingCard): void {
    this.selectedParking = parking ?? null;
    const preferredParkingId = parking?.id_park ?? this.parkings[0]?.id_park ?? '';
    const defaultVehicleId = this.defaultVehicle?.id ?? '';
    const availableSpot = this.spots.find((spot) => spot.parking_id === preferredParkingId && spot.etat === 'libre');

    this.reservationForm.reset({
      parking_id: preferredParkingId,
      vehicule_id: defaultVehicleId,
      place_id: availableSpot?.id_place ?? '',
      date_debut: '',
      date_fin: '',
      payment_mode: 'en_ligne',
    });

    this.isReservationModalOpen = true;
  }

  closeReservationModal(): void {
    this.isReservationModalOpen = false;
    this.selectedParking = null;
  }

  onReservationParkingChange(): void {
    const firstSpot = this.availableReservationSpots[0];
    this.reservationForm.patchValue({
      place_id: firstSpot?.id_place ?? '',
    });
  }

  submitReservation(): void {
    if (this.reservationForm.invalid) {
      this.reservationForm.markAllAsTouched();
      return;
    }

    const values = this.reservationForm.value;
    const parking = this.parkings.find((item) => item.id_park === Number(values.parking_id));
    const spot = this.spots.find((item) => item.id_place === Number(values.place_id));
    const vehicle = this.vehicles.find((item) => item.id === Number(values.vehicule_id));

    if (!parking || !spot || !vehicle) {
      return;
    }

    const start = new Date(values.date_debut);
    const end = new Date(values.date_fin);
    const durationInHours = Math.max((end.getTime() - start.getTime()) / (1000 * 60 * 60), 1);
    const total = Math.round(durationInHours * parking.prix_heure);

    this.reservations = [
      {
        id_res: Date.now(),
        parkingNom: parking.nom,
        placeLabel: this.buildSpotLabel(spot),
        date_debut: values.date_debut,
        date_fin: values.date_fin,
        statut: 'en_attente',
        prix_total: total,
        paymentMode: values.payment_mode as PaymentMode,
        vehiculeLabel: `${vehicle.marque} ${vehicle.type}`,
      },
      ...this.reservations,
    ];

    this.closeReservationModal();
    this.activeTab = 'historique';
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

  submitVehicle(): void {
    if (this.vehicleForm.invalid) {
      this.vehicleForm.markAllAsTouched();
      return;
    }

    this.vehicles = [
      ...this.vehicles,
      {
        id: Date.now(),
        matricule: this.vehicleForm.value.matricule,
        marque: this.vehicleForm.value.marque,
        type: this.vehicleForm.value.type,
        isDefault: this.vehicles.length === 0,
      },
    ];

    this.closeVehicleModal();
  }

  setDefaultVehicle(vehicleId: number): void {
    this.vehicles = this.vehicles.map((vehicle) => ({
      ...vehicle,
      isDefault: vehicle.id === vehicleId,
    }));
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.driverProfile = {
      ...this.driverProfile,
      ...this.profileForm.value,
      avatar: this.buildAvatar(this.profileForm.value.nom),
    };
  }

  openSubscriptionModal(): void {
    const defaultParking = this.parkings[0]?.id_park ?? '';
    const firstSpot = this.spots.find((spot) => spot.parking_id === defaultParking && spot.etat === 'libre');

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

  submitSubscription(): void {
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

    this.subscriptions = [
      {
        id_abon: Date.now(),
        parkingNom: parking.nom,
        placeLabel: this.buildSpotLabel(spot),
        type: values.type,
        date_debut: values.date_debut,
        date_fin: endDate.toISOString().slice(0, 10),
        statut: 'en_attente',
        tarif,
      },
      ...this.subscriptions,
    ];

    this.closeSubscriptionModal();
  }

  getStatusLabel(status: ReservationItem['statut'] | SubscriptionItem['statut']): string {
    const labels: Record<string, string> = {
      en_attente: 'En attente',
      confirmee: 'Confirmée',
      annulee: 'Annulée',
      terminee: 'Terminée',
      actif: 'Actif',
      expire: 'Expiré',
      suspendu: 'Suspendu',
    };

    return labels[status] ?? status;
  }

  getPaymentLabel(mode: PaymentMode): string {
    return mode === 'en_ligne' ? 'Paiement en ligne' : 'Paiement sur place';
  }

  trackByParking(_: number, parking: ParkingCard): number {
    return parking.id_park;
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

  private buildAvatar(name: string): string {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join('');
  }
}
