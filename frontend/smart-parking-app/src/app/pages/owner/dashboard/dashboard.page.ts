import { Component, OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { OwnerWorkflowState } from '../../../models/owner-workflow.model';
import { AuthService } from '../../../services/auth.service';
import {
  ParkingAISource,
  ParkingAiSourceService,
} from '../../../services/parking-ai-source.service';
import { OwnerWorkflowService } from '../../../services/owner-workflow.service';
import { ParkingDto, ParkingService } from '../../../services/parking.service';
import { PlaceDto, PlaceService } from '../../../services/place.service';
import { ReservationHistoryDto, ReservationService } from '../../../services/reservation';
import { SubscriptionDto, SubscriptionService } from '../../../services/subscription.service';
import { HeaderNotificationItem } from '../../../shared/components/header/header.component';

export interface OwnerStats {
  totalParkings: number;
  totalSpaces: number;
  occupiedSpaces: number;
  occupancyRate: number;
  todayReservations: number;
  todayRevenue: number;
  monthlyRevenue: number;
  activeSubscriptions: number;
  unreadFeedbacks: number;
}

export interface OwnerParking {
  id: number;
  name: string;
  address: string;
  totalSpaces: number;
  availableSpaces: number;
  status: 'active' | 'maintenance';
  image: string;
}

export interface OwnerReservation {
  id: number;
  parkingName: string;
  userName: string;
  time: string;
  plate: string;
  amount: number;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class DashboardPage implements OnInit {
  parkings: OwnerParking[] = [];
  reservations: ReservationHistoryDto[] = [];
  subscriptions: SubscriptionDto[] = [];
  workflowState: OwnerWorkflowState | null = null;
  aiSources: ParkingAISource[] = [];
  isLoading = false;

  constructor(
    private authService: AuthService,
    private ownerWorkflowService: OwnerWorkflowService,
    private parkingAiSourceService: ParkingAiSourceService,
    private parkingService: ParkingService,
    private placeService: PlaceService,
    private reservationService: ReservationService,
    private subscriptionService: SubscriptionService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadOwnerData();
  }

  get todayReservations(): OwnerReservation[] {
    return this.reservations
      .filter((reservation) => this.isToday(reservation.date_debut))
      .slice(0, 5)
      .map((reservation) => ({
        id: reservation.id_res,
        parkingName: reservation.parking?.nom || 'Parking',
        userName: reservation.conducteur?.nom || 'Conducteur',
        time: this.formatReservationTime(reservation.date_debut, reservation.date_fin),
        plate: reservation.vehicule?.matricule || 'Matricule indisponible',
        amount: Number(reservation.prix_total),
      }));
  }

  get stats(): OwnerStats {
    const totalParkings = this.parkings.length;
    const totalSpaces = this.parkings.reduce((sum, parking) => sum + parking.totalSpaces, 0);
    const availableSpaces = this.parkings.reduce((sum, parking) => sum + parking.availableSpaces, 0);
    const occupiedSpaces = Math.max(totalSpaces - availableSpaces, 0);
    const occupancyRate = totalSpaces > 0 ? Math.round((occupiedSpaces / totalSpaces) * 100) : 0;

    const todayReservations = this.reservations.filter((reservation) => this.isToday(reservation.date_debut));
    const todayRevenue = todayReservations.reduce((sum, reservation) => sum + Number(reservation.prix_total), 0);
    const monthlyRevenue = this.reservations
      .filter((reservation) => this.isCurrentMonth(reservation.date_debut))
      .reduce((sum, reservation) => sum + Number(reservation.prix_total), 0);
    const activeSubscriptions = this.subscriptions.filter((subscription) => subscription.statut === 'actif').length;

    return {
      totalParkings,
      totalSpaces,
      occupiedSpaces,
      occupancyRate,
      todayReservations: todayReservations.length,
      todayRevenue: Math.round(todayRevenue),
      monthlyRevenue: Math.round(monthlyRevenue),
      activeSubscriptions,
      unreadFeedbacks: 0,
    };
  }

  get notificationItems(): HeaderNotificationItem[] {
    const maintenanceNotifications = this.parkings
      .filter((parking) => parking.status === 'maintenance')
      .map((parking) => ({
        title: 'Parking en maintenance',
        description: `${parking.name} requiert une intervention`,
        timestamp: 'Mise a jour recente',
      }));

    const reservationNotifications = this.todayReservations.slice(0, 3).map((reservation) => ({
      title: 'Reservation du jour',
      description: `${reservation.userName} • ${reservation.parkingName} • ${reservation.time}`,
      timestamp: 'Aujourd hui',
    }));

    const subscriptionNotifications =
      this.stats.activeSubscriptions > 0
        ? [
            {
              title: 'Abonnements actifs',
              description: `${this.stats.activeSubscriptions} abonnements actifs sur vos parkings`,
              timestamp: 'Aujourd hui',
            },
          ]
        : [];

    return [...maintenanceNotifications, ...reservationNotifications, ...subscriptionNotifications].slice(0, 5);
  }

  get notificationsCount(): number {
    return this.notificationItems.length;
  }

  isImageSource(source: ParkingAISource): boolean {
    return source.source_type === 'image';
  }

  isVideoSource(source: ParkingAISource): boolean {
    return source.source_type === 'video';
  }

  isCameraSource(source: ParkingAISource): boolean {
    return source.source_type === 'camera';
  }

  private async loadOwnerData(): Promise<void> {
    this.isLoading = true;
    try {
      const currentUser = this.authService.getCurrentUser();
      const ownerId = currentUser?.id;
      const [workflowState, parkings, places, reservations, subscriptions] = await Promise.all([
        this.ownerWorkflowService.refresh(),
        firstValueFrom(this.parkingService.getParkings()),
        firstValueFrom(this.placeService.getPlaces()),
        firstValueFrom(this.reservationService.getOwnerReservations()),
        firstValueFrom(this.subscriptionService.getOwnerSubscriptions()),
      ]);

      const ownerParkings = ownerId
        ? parkings.filter((parking) => parking.owner_id === ownerId)
        : [];

      this.workflowState = workflowState;
      this.parkings = ownerParkings.map((parking, index) => this.mapParking(parking, places, index));
      this.reservations = reservations;
      this.subscriptions = subscriptions;
      this.aiSources = workflowState.parkingId
        ? await this.parkingAiSourceService.getSources(workflowState.parkingId)
        : [];
    } finally {
      this.isLoading = false;
    }
  }

  private mapParking(parking: ParkingDto, places: PlaceDto[], index: number): OwnerParking {
    const parkingPlaces = places.filter((place) => place.parking_id === parking.id_park);
    const availableSpaces = parkingPlaces.length
      ? parkingPlaces.filter((place) => place.etat === 'libre').length
      : parking.capacite;

    return {
      id: parking.id_park,
      name: parking.nom,
      address: parking.adresse,
      totalSpaces: parking.capacite,
      availableSpaces,
      status: parking.statut === 'actif' ? 'active' : 'maintenance',
      image: `assets/parking${(index % 3) + 1}.jpg`,
    };
  }

  private isToday(value: string): boolean {
    const date = new Date(value);
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }

  private isCurrentMonth(value: string): boolean {
    const date = new Date(value);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  private formatReservationTime(startValue: string, endValue: string): string {
    const start = new Date(startValue);
    const end = new Date(endValue);

    return `${this.formatTime(start)} - ${this.formatTime(end)}`;
  }

  private formatTime(value: Date): string {
    return value.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
