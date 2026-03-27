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

interface OwnerWorkflowStep {
  label: string;
  status: 'done' | 'current' | 'upcoming';
}

interface OwnerQuickAction {
  title: string;
  description: string;
  icon: string;
  route: string;
  tone: 'primary' | 'accent' | 'neutral';
}

interface OccupancyChartPoint {
  label: string;
  occupancyRate: number;
  reservations: number;
}

type DashboardPeriod = '7d' | '30d' | '90d';

interface ParkingAiGallery {
  parkingId: number;
  parkingName: string;
  parkingAddress: string;
  sources: ParkingAISource[];
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
  aiParkingGroups: ParkingAiGallery[] = [];
  isLoading = false;
  selectedPeriod: DashboardPeriod = '7d';
  selectedAiParkingId: number | null = null;
  private previewErrorIds = new Set<number>();

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

  get ownerName(): string {
    return this.authService.getCurrentUser()?.nom || 'owner';
  }

  get todayReservations(): OwnerReservation[] {
    return this.filteredReservations
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

  get filteredReservations(): ReservationHistoryDto[] {
    return this.reservations.filter((reservation) =>
      this.isWithinPeriod(reservation.date_debut, this.selectedPeriod)
    );
  }

  get stats(): OwnerStats {
    const totalParkings = this.parkings.length;
    const totalSpaces = this.parkings.reduce((sum, parking) => sum + parking.totalSpaces, 0);
    const availableSpaces = this.parkings.reduce((sum, parking) => sum + parking.availableSpaces, 0);
    const occupiedSpaces = Math.max(totalSpaces - availableSpaces, 0);
    const occupancyRate = totalSpaces > 0 ? Math.round((occupiedSpaces / totalSpaces) * 100) : 0;

    const periodReservations = this.filteredReservations;
    const todayRevenue = periodReservations.reduce((sum, reservation) => sum + Number(reservation.prix_total), 0);
    const monthlyRevenue = this.reservations
      .filter((reservation) => this.isCurrentMonth(reservation.date_debut))
      .reduce((sum, reservation) => sum + Number(reservation.prix_total), 0);
    const activeSubscriptions = this.subscriptions.filter((subscription) => subscription.statut === 'actif').length;

    return {
      totalParkings,
      totalSpaces,
      occupiedSpaces,
      occupancyRate,
      todayReservations: periodReservations.length,
      todayRevenue: Math.round(todayRevenue),
      monthlyRevenue: Math.round(monthlyRevenue),
      activeSubscriptions,
      unreadFeedbacks: 0,
    };
  }

  get monthlyRevenueLabel(): string {
    return `${this.stats.monthlyRevenue} EUR ce mois`;
  }

  get selectedPeriodLabel(): string {
    if (this.selectedPeriod === '30d') {
      return '30 derniers jours';
    }
    if (this.selectedPeriod === '90d') {
      return '90 derniers jours';
    }
    return '7 derniers jours';
  }

  get occupancySummary(): string {
    return `${this.stats.occupiedSpaces}/${this.stats.totalSpaces} places occupees`;
  }

  get workflowCompletion(): number {
    if (!this.workflowState) {
      return 0;
    }

    let completed = 0;
    if (this.workflowState.ownerStatus === 'accepte' && this.workflowState.parkingStatus === 'valide') {
      completed += 1;
    }
    if (this.workflowState.subscriptionStatus === 'actif') {
      completed += 1;
    }
    if (this.workflowState.parkingSetupStatus === 'terminee') {
      completed += 1;
    }
    if (this.workflowState.aiSetupStatus === 'active') {
      completed += 1;
    }

    return Math.round((completed / 4) * 100);
  }

  get workflowSteps(): OwnerWorkflowStep[] {
    const state = this.workflowState;
    if (!state) {
      return [];
    }

    const steps = [
      {
        label: 'Validation owner',
        done: state.ownerStatus === 'accepte' && state.parkingStatus === 'valide',
      },
      {
        label: 'Abonnement actif',
        done: state.subscriptionStatus === 'actif',
      },
      {
        label: 'Parking setup termine',
        done: state.parkingSetupStatus === 'terminee',
      },
      {
        label: 'IA activee',
        done: state.aiSetupStatus === 'active',
      },
    ];

    const currentIndex = steps.findIndex((step) => !step.done);

    return steps.map((step, index) => ({
      label: step.label,
      status: step.done ? 'done' : index === currentIndex ? 'current' : 'upcoming',
    }));
  }

  get nextAction(): OwnerQuickAction {
    if (!this.workflowState) {
      return {
        title: 'Charger le workflow',
        description: 'Recuperez votre etat owner pour continuer la configuration.',
        icon: 'refresh-outline',
        route: '/owner/dashboard',
        tone: 'neutral',
      };
    }

    if (this.workflowState.ownerStatus !== 'accepte' || this.workflowState.parkingStatus !== 'valide') {
      return {
        title: 'Verifier la validation',
        description: 'Votre compte owner ou votre parking attend encore une validation.',
        icon: 'time-outline',
        route: '/owner/pending',
        tone: 'neutral',
      };
    }

    if (this.workflowState.subscriptionStatus !== 'actif') {
      return {
        title: 'Activer l abonnement',
        description: 'Debloquez le dashboard complet en activant votre abonnement.',
        icon: 'card-outline',
        route: '/owner/subscription',
        tone: 'accent',
      };
    }

    if (this.workflowState.parkingSetupStatus !== 'terminee') {
      return {
        title: 'Finaliser le parking setup',
        description: 'Completer les informations d exploitation de votre parking.',
        icon: 'construct-outline',
        route: '/owner/parking-setup',
        tone: 'primary',
      };
    }

    if (this.workflowState.aiSetupStatus !== 'active') {
      return {
        title: 'Configurer les sources IA',
        description: 'Ajoutez images, videos ou cameras pour activer la detection.',
        icon: 'sparkles-outline',
        route: '/owner/ai-setup',
        tone: 'primary',
      };
    }

    return {
      title: 'Mettre a jour le profil owner',
      description: 'Gardez vos coordonnees et informations de parking a jour.',
      icon: 'person-circle-outline',
      route: '/owner/profile',
      tone: 'neutral',
    };
  }

  get aiSummary(): string {
    const images = this.aiSources.filter((source) => source.source_type === 'image').length;
    const videos = this.aiSources.filter((source) => source.source_type === 'video').length;
    const cameras = this.aiSources.filter((source) => source.source_type === 'camera').length;

    return `${images} image(s), ${videos} video(s), ${cameras} camera(s)`;
  }

  get occupancyChartData(): OccupancyChartPoint[] {
    const buckets =
      this.selectedPeriod === '7d'
        ? [
            { label: 'Lun', daysAgoStart: 6, daysAgoEnd: 6 },
            { label: 'Mar', daysAgoStart: 5, daysAgoEnd: 5 },
            { label: 'Mer', daysAgoStart: 4, daysAgoEnd: 4 },
            { label: 'Jeu', daysAgoStart: 3, daysAgoEnd: 3 },
            { label: 'Ven', daysAgoStart: 2, daysAgoEnd: 2 },
            { label: 'Sam', daysAgoStart: 1, daysAgoEnd: 1 },
            { label: 'Dim', daysAgoStart: 0, daysAgoEnd: 0 },
          ]
        : this.selectedPeriod === '30d'
          ? [
              { label: 'S1', daysAgoStart: 29, daysAgoEnd: 23 },
              { label: 'S2', daysAgoStart: 22, daysAgoEnd: 16 },
              { label: 'S3', daysAgoStart: 15, daysAgoEnd: 9 },
              { label: 'S4', daysAgoStart: 8, daysAgoEnd: 0 },
            ]
          : [
              { label: 'M-3', daysAgoStart: 89, daysAgoEnd: 67 },
              { label: 'M-2', daysAgoStart: 66, daysAgoEnd: 44 },
              { label: 'M-1', daysAgoStart: 43, daysAgoEnd: 21 },
              { label: 'Act.', daysAgoStart: 20, daysAgoEnd: 0 },
            ];

    const baseline = Math.max(this.stats.occupancyRate, 12);

    return buckets.map((bucket, index) => {
      const reservationCount = this.reservations.filter((reservation) => {
        const diffDays = this.daysAgo(reservation.date_debut);
        return diffDays >= bucket.daysAgoEnd && diffDays <= bucket.daysAgoStart;
      }).length;

      const wave = ((index % 3) - 1) * 7;
      const occupancyRate = Math.max(8, Math.min(98, baseline + wave + reservationCount * 4));

      return {
        label: bucket.label,
        occupancyRate,
        reservations: reservationCount,
      };
    });
  }

  get occupancyPolylinePoints(): string {
    const data = this.occupancyChartData;
    if (!data.length) {
      return '';
    }

    return data
      .map((point, index) => {
        const x = (index / Math.max(data.length - 1, 1)) * 100;
        const y = 100 - point.occupancyRate;
        return `${x},${y}`;
      })
      .join(' ');
  }

  get notificationItems(): HeaderNotificationItem[] {
    const workflowNotification =
      this.workflowState && this.workflowCompletion < 100
        ? [
            {
              title: 'Action owner en attente',
              description: this.nextAction.description,
              timestamp: `${this.workflowCompletion}% du workflow complete`,
              icon: this.nextAction.icon,
              tone: this.nextAction.tone === 'accent' ? 'warning' as const : 'info' as const,
            },
          ]
        : [];

    const maintenanceNotifications = this.parkings
      .filter((parking) => parking.status === 'maintenance')
      .map((parking) => ({
        title: 'Parking en maintenance',
        description: `${parking.name} requiert une intervention`,
        timestamp: 'Mise a jour recente',
        icon: 'construct-outline',
        tone: 'warning' as const,
      }));

    const reservationNotifications = this.todayReservations.slice(0, 3).map((reservation) => ({
      title: 'Reservation du jour',
      description: `${reservation.userName} - ${reservation.parkingName} - ${reservation.time}`,
      timestamp: 'Aujourd hui',
      icon: 'car-sport-outline',
      tone: 'success' as const,
    }));

    const subscriptionNotifications =
      this.stats.activeSubscriptions > 0
        ? [
            {
              title: 'Abonnements actifs',
              description: `${this.stats.activeSubscriptions} abonnements actifs sur vos parkings`,
              timestamp: 'Aujourd hui',
              icon: 'card-outline',
              tone: 'info' as const,
            },
          ]
        : [];

    const aiNotifications =
      this.aiSources.length > 0
        ? [
            {
              title: 'Sources IA disponibles',
              description: this.aiSummary,
              timestamp: 'Configuration synchronisee',
              icon: 'sparkles-outline',
              tone: 'info' as const,
            },
          ]
        : [];

    return [
      ...workflowNotification,
      ...maintenanceNotifications,
      ...reservationNotifications,
      ...subscriptionNotifications,
      ...aiNotifications,
    ].slice(0, 6);
  }

  get notificationsCount(): number {
    return this.notificationItems.length;
  }

  get activeAiParkingGroup(): ParkingAiGallery | null {
    if (!this.aiParkingGroups.length) {
      return null;
    }

    return (
      this.aiParkingGroups.find((group) => group.parkingId === this.selectedAiParkingId) ||
      this.aiParkingGroups[0]
    );
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

      const aiSourcesByParking = await Promise.all(
        ownerParkings.map(async (parking) => ({
          parkingId: parking.id_park,
          parkingName: parking.nom,
          parkingAddress: parking.adresse,
          sources: await this.parkingAiSourceService.getSources(parking.id_park),
        }))
      );

      this.aiParkingGroups = aiSourcesByParking;
      this.aiSources = aiSourcesByParking.reduce<ParkingAISource[]>(
        (allSources, group) => allSources.concat(group.sources),
        []
      );

      const preferredParkingId =
        workflowState.parkingId && aiSourcesByParking.some((group) => group.parkingId === workflowState.parkingId)
          ? workflowState.parkingId
          : aiSourcesByParking[0]?.parkingId ?? null;
      this.selectedAiParkingId = preferredParkingId;
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

  trackByParking(_: number, parking: OwnerParking): number {
    return parking.id;
  }

  trackByReservation(_: number, reservation: OwnerReservation): number {
    return reservation.id;
  }

  trackBySource(_: number, source: ParkingAISource): number {
    return source.id_source;
  }

  chartPointLeft(index: number, total: number): number {
    return (index / Math.max(total - 1, 1)) * 100;
  }

  selectAiParking(parkingId: number): void {
    this.selectedAiParkingId = parkingId;
  }

  showPreview(source: ParkingAISource): boolean {
    return !!source.preview_url && !this.previewErrorIds.has(source.id_source);
  }

  markPreviewError(source: ParkingAISource): void {
    this.previewErrorIds.add(source.id_source);
  }

  setSelectedPeriod(period: DashboardPeriod): void {
    this.selectedPeriod = period;
  }

  isSelectedPeriod(period: DashboardPeriod): boolean {
    return this.selectedPeriod === period;
  }

  private isWithinPeriod(value: string, period: DashboardPeriod): boolean {
    const diffDays = this.daysAgo(value);
    const maxDays = period === '30d' ? 29 : period === '90d' ? 89 : 6;
    return diffDays >= 0 && diffDays <= maxDays;
  }

  private daysAgo(value: string): number {
    const date = new Date(value);
    const now = new Date();
    const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const normalizedNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((normalizedNow.getTime() - normalizedDate.getTime()) / 86400000);
  }
}
