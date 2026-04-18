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
  validationStatus: string;
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

interface OverviewCard {
  title: string;
  value: string;
  subtitle: string;
  deltaLabel: string;
  deltaTone: 'positive' | 'negative' | 'neutral';
  points: string;
  fillPath: string;
  accent: 'emerald' | 'blue' | 'amber' | 'slate';
}

interface ParkingAiGallery {
  parkingId: number;
  parkingName: string;
  parkingAddress: string;
  sources: ParkingAISource[];
}

interface TrendChartPoint {
  label: string;
  reservations: number;
  revenue: number;
}

interface RevenueBar {
  label: string;
  reservationRevenue: number;
  subscriptionRevenue: number;
  reservationHeight: number;
  subscriptionHeight: number;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class DashboardPage implements OnInit {
  private readonly dashboardParkingLimit = 3;
  private readonly ownerSubscriptionAlertWindowDays = 5;
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
  private analysisVideoErrorIds = new Set<number>();

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

  get visibleParkings(): OwnerParking[] {
    return this.parkings.slice(0, this.dashboardParkingLimit);
  }

  get hiddenParkingsCount(): number {
    return Math.max(this.parkings.length - this.visibleParkings.length, 0);
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
    return `${this.formatCurrency(this.stats.monthlyRevenue)} ce mois`;
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

  get occupancyDeltaLabel(): string {
    return this.formatDelta(this.selectedPeriodOccupancyDelta);
  }

  get overviewCards(): OverviewCard[] {
    const cards = [
      {
        title: 'Parkings',
        value: String(this.stats.totalParkings),
        subtitle: 'parcs actifs et suivis',
        deltaValue: this.periodReservationDelta,
        series: this.trendChartData.map((point) => point.reservations + 1),
        accent: 'emerald' as const,
      },
      {
        title: 'Reservations',
        value: this.formatCompactNumber(this.filteredReservations.length),
        subtitle: this.selectedPeriodLabel,
        deltaValue: this.periodReservationDelta,
        series: this.trendChartData.map((point) => point.reservations),
        accent: 'blue' as const,
      },
      {
        title: 'Occupation',
        value: `${this.stats.occupancyRate}%`,
        subtitle: this.occupancySummary,
        deltaValue: this.selectedPeriodOccupancyDelta,
        series: this.occupancyChartData.map((point) => point.occupancyRate),
        accent: 'amber' as const,
      },
      {
        title: 'Revenu',
        value: this.formatCompactCurrency(this.stats.monthlyRevenue),
        subtitle: 'revenu mensuel',
        deltaValue: this.monthlyRevenueDelta,
        series: this.monthlyBusinessBars.map(
          (bar) => bar.reservationRevenue + bar.subscriptionRevenue
        ),
        accent: 'slate' as const,
      },
    ];

    return cards.map((card) => ({
      title: card.title,
      value: card.value,
      subtitle: card.subtitle,
      deltaLabel: this.formatDelta(card.deltaValue),
      deltaTone: this.getDeltaTone(card.deltaValue),
      points: this.buildSparklinePoints(card.series),
      fillPath: this.buildSparklineFillPath(card.series),
      accent: card.accent,
    }));
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

  get dashboardParkingStatusLabel(): string | null {
    if (!this.workflowState?.parkingId) {
      return null;
    }

    const parking = this.parkings.find((item) => item.id === this.workflowState?.parkingId);
    if (!parking) {
      return `Parking #${this.workflowState.parkingId}`;
    }

    const statusMap: Record<string, string> = {
      brouillon: 'Brouillon',
      en_attente_validation: 'En attente de validation',
      valide: 'Valide',
      rejete: 'Rejete',
    };
    const label = statusMap[parking.validationStatus] || parking.validationStatus;
    return `${parking.name} • ${label}`;
  }

  get showDashboardPendingParkingBanner(): boolean {
    return Boolean(
      this.workflowState?.hasParking &&
      this.workflowState?.parkingStatus &&
      this.workflowState.parkingStatus !== 'valide'
    );
  }

  get aiSummary(): string {
    const images = this.aiSources.filter((source) => source.source_type === 'image').length;
    const videos = this.aiSources.filter((source) => source.source_type === 'video').length;
    const cameras = this.aiSources.filter((source) => source.source_type === 'camera').length;

    return `${images} image(s), ${videos} video(s), ${cameras} camera(s)`;
  }

  get occupancyChartData(): OccupancyChartPoint[] {
    const buckets = this.getPeriodBuckets(this.selectedPeriod);

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

  get trendChartData(): TrendChartPoint[] {
    return this.getPeriodBuckets(this.selectedPeriod).map((bucket) => {
      const bucketReservations = this.reservations.filter((reservation) => {
        const diffDays = this.daysAgo(reservation.date_debut);
        return diffDays >= bucket.daysAgoEnd && diffDays <= bucket.daysAgoStart;
      });

      return {
        label: bucket.label,
        reservations: bucketReservations.length,
        revenue: bucketReservations.reduce(
          (sum, reservation) => sum + Number(reservation.prix_total),
          0
        ),
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

  get reservationTrendPoints(): string {
    return this.buildChartPolyline(
      this.trendChartData.map((point) => point.reservations),
      160
    );
  }

  get reservationTrendAreaPath(): string {
    return this.buildAreaPath(
      this.trendChartData.map((point) => point.reservations),
      160
    );
  }

  get revenueTrendPoints(): string {
    return this.buildChartPolyline(
      this.trendChartData.map((point) => point.revenue),
      160
    );
  }

  get monthlyBusinessBars(): RevenueBar[] {
    const months = this.getLastMonths(6);
    const bars = months.map(({ label, month, year }) => {
      const reservationRevenue = this.reservations
        .filter((reservation) => {
          const date = new Date(reservation.date_debut);
          return date.getMonth() === month && date.getFullYear() === year;
        })
        .reduce((sum, reservation) => sum + Number(reservation.prix_total), 0);

      const subscriptionRevenue = this.subscriptions
        .filter((subscription) => {
          const date = new Date(subscription.date_debut);
          return date.getMonth() === month && date.getFullYear() === year;
        })
        .reduce((sum, subscription) => sum + Number(subscription.tarif), 0);

      return {
        label,
        reservationRevenue,
        subscriptionRevenue,
        reservationHeight: 0,
        subscriptionHeight: 0,
      };
    });

    const maxTotal = Math.max(
      ...bars.map((bar) => bar.reservationRevenue + bar.subscriptionRevenue),
      1
    );

    return bars.map((bar) => ({
      ...bar,
      reservationHeight: Math.max((bar.reservationRevenue / maxTotal) * 100, bar.reservationRevenue > 0 ? 8 : 0),
      subscriptionHeight: Math.max((bar.subscriptionRevenue / maxTotal) * 100, bar.subscriptionRevenue > 0 ? 8 : 0),
    }));
  }

  get dashboardInsightText(): string {
    if (!this.parkings.length) {
      return 'Ajoutez votre premier parking pour commencer le suivi owner.';
    }

    if (this.workflowCompletion < 100) {
      return `${this.workflowCompletion}% du workflow est termine. ${this.nextAction.description}`;
    }

    if (this.stats.occupancyRate >= 80) {
      return 'L occupation est elevee. Ouvrez de nouvelles places ou ajustez les tarifs.';
    }

    if (this.stats.activeSubscriptions > 0) {
      return `${this.stats.activeSubscriptions} abonnement(s) actif(s) generent un revenu recurrent.`;
    }

    return 'Le tableau de bord consolide reservations, revenus et configuration IA.';
  }

  get selectedPeriodRevenue(): number {
    return Math.round(
      this.filteredReservations.reduce((sum, reservation) => sum + Number(reservation.prix_total), 0)
    );
  }

  get notificationItems(): HeaderNotificationItem[] {
    const ownerSubscriptionNotifications = this.getOwnerSubscriptionNotifications();

    const parkingValidatedNotification =
      this.workflowState?.ownerStatus === 'accepte' &&
      this.workflowState?.parkingStatus === 'valide' &&
      this.workflowState?.subscriptionStatus !== 'actif'
        ? [
            {
              title: 'Parking valide par l admin',
              description: 'Le parking est valide. Terminez maintenant l abonnement pour debloquer la suite.',
              timestamp: this.workflowState?.parkingId ? `Parking #${this.workflowState.parkingId}` : 'Mise a jour recente',
              icon: 'checkmark-circle-outline',
              tone: 'success' as const,
            },
          ]
        : [];

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

    const reservationNotifications = this.getRecentReservations(3).map((reservation) => ({
      title: 'Nouvelle reservation',
      description: `${reservation.conducteur?.nom || 'Conducteur'} - ${reservation.parking?.nom || 'Parking'}`,
      timestamp: this.formatOwnerNotificationTimestamp(reservation.date_debut),
      icon: 'car-sport-outline',
      tone: 'success' as const,
    }));

    const subscriptionNotifications = this.getRecentPlaceSubscriptions(3).map((subscription) => ({
      title: 'Nouvel abonnement de place',
      description: `${subscription.parking?.nom || 'Parking'} - Place ${subscription.place?.zone || 'A'}-${subscription.place?.num_place || '--'}`,
      timestamp: this.formatOwnerNotificationTimestamp(subscription.created_at || subscription.date_debut),
      icon: 'card-outline',
      tone: 'info' as const,
    }));

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
      ...ownerSubscriptionNotifications,
      ...parkingValidatedNotification,
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

  hasProcessedAnalysis(source: ParkingAISource): boolean {
    return source.analysis?.status === 'done';
  }

  hasAnalysisError(source: ParkingAISource): boolean {
    return source.analysis?.status === 'error';
  }

  getAnalysisSummary(source: ParkingAISource): string | null {
    const analysis = source.analysis;
    if (!analysis || analysis.status !== 'done') {
      return null;
    }

    const parts = [
      analysis.free !== undefined && analysis.free !== null ? `${analysis.free} free` : null,
      analysis.occupied !== undefined && analysis.occupied !== null ? `${analysis.occupied} occupied` : null,
      analysis.total !== undefined && analysis.total !== null ? `${analysis.total} total` : null,
    ].filter((value): value is string => Boolean(value));

    return parts.length > 0 ? parts.join(' | ') : 'Analyse terminee';
  }

  getAnalysisMeta(source: ParkingAISource): string | null {
    const analysis = source.analysis;
    if (!analysis || analysis.status !== 'done') {
      return null;
    }

    const parts = [
      analysis.processed_frames ? `${analysis.processed_frames} frames` : null,
      analysis.fps ? `${analysis.fps} FPS` : null,
      analysis.resolution || null,
    ].filter((value): value is string => Boolean(value));

    return parts.length > 0 ? parts.join(' | ') : null;
  }

  getSyncMeta(source: ParkingAISource): string | null {
    const analysis = source.analysis;
    if (!analysis || analysis.status !== 'done') {
      return null;
    }

    const parts = [
      analysis.sync_mode ? `sync: ${analysis.sync_mode}` : null,
      analysis.synced_places !== undefined && analysis.synced_places !== null
        ? `${analysis.synced_places} place(s) mise(s) a jour`
        : null,
    ].filter((value): value is string => Boolean(value));

    return parts.length > 0 ? parts.join(' | ') : null;
  }

  getSyncWarning(source: ParkingAISource): string | null {
    return source.analysis?.sync_warning || null;
  }

  getAnalysisOutputUrl(source: ParkingAISource): string | null {
    return source.analysis?.output_url || null;
  }

  getAnalysisPreviewUrl(source: ParkingAISource): string | null {
    return source.analysis?.output_preview_url || null;
  }

  getAnalysisError(source: ParkingAISource): string | null {
    return source.analysis?.error || null;
  }

  showAnalysisVideo(source: ParkingAISource): boolean {
    return this.isVideoSource(source) && !!this.getAnalysisOutputUrl(source) && !this.analysisVideoErrorIds.has(source.id_source);
  }

  markAnalysisVideoError(source: ParkingAISource): void {
    this.analysisVideoErrorIds.add(source.id_source);
  }

  showAnalysisVideoFallback(source: ParkingAISource): boolean {
    return this.isVideoSource(source) && !!this.getAnalysisOutputUrl(source) && !this.showAnalysisVideo(source);
  }

  getSlotDebugRows(source: ParkingAISource): string[] {
    const rows = source.analysis?.slot_debug || [];
    return rows.map((item) => {
      const parts = [
        `S${item.slot_index}`,
        item.place_id ? `P${item.place_id}` : null,
        item.label,
        item.average_confidence !== undefined && item.average_confidence !== null
          ? `${Math.round(item.average_confidence * 100)}%`
          : null,
        item.free_votes !== undefined && item.busy_votes !== undefined
          ? `F${item.free_votes}/B${item.busy_votes}`
          : null,
      ].filter((value): value is string => Boolean(value));
      return parts.join(' • ');
    });
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
      validationStatus: parking.validation_status || 'brouillon',
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

  private getOwnerSubscriptionNotifications(): HeaderNotificationItem[] {
    if (!this.workflowState?.hasParking || !this.workflowState?.parkingName) {
      return [];
    }

    if (this.workflowState.subscriptionStatus === 'expire') {
      return [
        {
          title: 'Abonnement parking expire',
          description: `${this.workflowState.parkingName} n est plus couvert par un abonnement actif.`,
          timestamp: this.workflowState.subscriptionEndDate
            ? this.formatOwnerNotificationTimestamp(this.workflowState.subscriptionEndDate)
            : 'Mise a jour recente',
          icon: 'alert-circle-outline',
          tone: 'alert',
        },
      ];
    }

    const remainingDays = this.getOwnerSubscriptionRemainingDays();
    if (
      this.workflowState.subscriptionStatus === 'actif' &&
      remainingDays !== null &&
      remainingDays >= 0 &&
      remainingDays <= this.ownerSubscriptionAlertWindowDays
    ) {
      return [
        {
          title: 'Abonnement parking bientot termine',
          description: `${this.workflowState.parkingName} expire dans ${remainingDays} jour${remainingDays > 1 ? 's' : ''}.`,
          timestamp: this.workflowState.subscriptionEndDate
            ? this.formatOwnerNotificationTimestamp(this.workflowState.subscriptionEndDate)
            : 'Mise a jour recente',
          icon: 'notifications-outline',
          tone: 'warning',
        },
      ];
    }

    return [];
  }

  private getOwnerSubscriptionRemainingDays(): number | null {
    const endDateValue = this.workflowState?.subscriptionEndDate;
    if (!endDateValue) {
      return null;
    }

    const endDate = new Date(endDateValue);
    if (Number.isNaN(endDate.getTime())) {
      return null;
    }

    endDate.setHours(23, 59, 59, 999);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffMs = endDate.getTime() - today.getTime();
    return Math.ceil(diffMs / 86400000);
  }

  private getRecentReservations(limit: number): ReservationHistoryDto[] {
    return [...this.reservations]
      .sort((a, b) => new Date(b.date_debut).getTime() - new Date(a.date_debut).getTime())
      .slice(0, limit);
  }

  private getRecentPlaceSubscriptions(limit: number): SubscriptionDto[] {
    return [...this.subscriptions]
      .sort((a, b) => {
        const first = new Date(b.created_at || b.date_debut).getTime();
        const second = new Date(a.created_at || a.date_debut).getTime();
        return first - second;
      })
      .slice(0, limit);
  }

  private formatOwnerNotificationTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Mise a jour recente';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffHours < 1) {
      return 'Il y a moins d une heure';
    }

    if (diffHours < 24) {
      return `Il y a ${diffHours} h`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
    }

    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
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

  getParkingOccupancyRate(parking: OwnerParking): number {
    if (!parking.totalSpaces) {
      return 0;
    }

    return Math.round(((parking.totalSpaces - parking.availableSpaces) / parking.totalSpaces) * 100);
  }

  private get periodReservationDelta(): number {
    return this.calculatePeriodDelta(
      () => this.filteredReservations.length,
      (period) => this.countReservationsForPeriod(period)
    );
  }

  private get monthlyRevenueDelta(): number {
    const current = this.sumReservationRevenueForMonthOffset(0);
    const previous = this.sumReservationRevenueForMonthOffset(1);
    return this.calculateDelta(current, previous);
  }

  private get selectedPeriodOccupancyDelta(): number {
    const currentAverage = this.averageTrendReservations(this.selectedPeriod, 0);
    const previousAverage = this.averageTrendReservations(this.selectedPeriod, 1);
    return this.calculateDelta(currentAverage, previousAverage);
  }

  private calculatePeriodDelta(
    currentFactory: () => number,
    previousFactory: (period: DashboardPeriod) => number
  ): number {
    return this.calculateDelta(currentFactory(), previousFactory(this.selectedPeriod));
  }

  private countReservationsForPeriod(period: DashboardPeriod, periodOffset = 1): number {
    const rangeDays = period === '90d' ? 90 : period === '30d' ? 30 : 7;
    const start = periodOffset * rangeDays;
    const end = start + rangeDays - 1;

    return this.reservations.filter((reservation) => {
      const diffDays = this.daysAgo(reservation.date_debut);
      return diffDays >= start && diffDays <= end;
    }).length;
  }

  private averageTrendReservations(period: DashboardPeriod, periodOffset = 0): number {
    const rangeDays = period === '90d' ? 90 : period === '30d' ? 30 : 7;
    const start = periodOffset * rangeDays;
    const end = start + rangeDays - 1;
    const reservations = this.reservations.filter((reservation) => {
      const diffDays = this.daysAgo(reservation.date_debut);
      return diffDays >= start && diffDays <= end;
    }).length;

    return reservations / rangeDays;
  }

  private sumReservationRevenueForMonthOffset(monthOffset: number): number {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);

    return this.reservations
      .filter((reservation) => {
        const date = new Date(reservation.date_debut);
        return (
          date.getFullYear() === target.getFullYear() &&
          date.getMonth() === target.getMonth()
        );
      })
      .reduce((sum, reservation) => sum + Number(reservation.prix_total), 0);
  }

  private calculateDelta(current: number, previous: number): number {
    if (current === 0 && previous === 0) {
      return 0;
    }

    if (previous === 0) {
      return 100;
    }

    return Math.round(((current - previous) / previous) * 100);
  }

  private getDeltaTone(delta: number): 'positive' | 'negative' | 'neutral' {
    if (delta > 0) {
      return 'positive';
    }

    if (delta < 0) {
      return 'negative';
    }

    return 'neutral';
  }

  private formatDelta(delta: number): string {
    if (delta > 0) {
      return `+${delta}%`;
    }

    if (delta < 0) {
      return `${delta}%`;
    }

    return '0%';
  }

  private formatCompactNumber(value: number): string {
    const absoluteValue = Math.abs(value);

    if (absoluteValue >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1).replace('.0', '')}M`;
    }

    if (absoluteValue >= 1_000) {
      return `${(value / 1_000).toFixed(1).replace('.0', '')}k`;
    }

    return Math.round(value).toString();
  }

  private formatCurrency(value: number): string {
    return `${Math.round(value).toLocaleString('fr-FR')} TND`;
  }

  private formatCompactCurrency(value: number): string {
    return `${this.formatCompactNumber(value)} TND`;
  }

  private buildSparklinePoints(values: number[]): string {
    const max = Math.max(...values, 1);
    return values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * 100;
        const y = 34 - (value / max) * 24;
        return `${x},${y}`;
      })
      .join(' ');
  }

  private buildSparklineFillPath(values: number[]): string {
    const points = this.buildSparklinePoints(values);
    if (!points) {
      return '';
    }

    return `M 0 34 L ${points.replace(/ /g, ' L ')} L 100 34 Z`;
  }

  private buildChartPolyline(values: number[], height: number): string {
    const max = Math.max(...values, 1);
    return values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * 100;
        const y = height - (value / max) * (height - 18) - 10;
        return `${x},${y}`;
      })
      .join(' ');
  }

  private buildAreaPath(values: number[], height: number): string {
    const points = this.buildChartPolyline(values, height);
    if (!points) {
      return '';
    }

    return `M 0 ${height} L ${points.replace(/ /g, ' L ')} L 100 ${height} Z`;
  }

  private getPeriodBuckets(period: DashboardPeriod): Array<{
    label: string;
    daysAgoStart: number;
    daysAgoEnd: number;
  }> {
    if (period === '7d') {
      return [
        { label: 'Lun', daysAgoStart: 6, daysAgoEnd: 6 },
        { label: 'Mar', daysAgoStart: 5, daysAgoEnd: 5 },
        { label: 'Mer', daysAgoStart: 4, daysAgoEnd: 4 },
        { label: 'Jeu', daysAgoStart: 3, daysAgoEnd: 3 },
        { label: 'Ven', daysAgoStart: 2, daysAgoEnd: 2 },
        { label: 'Sam', daysAgoStart: 1, daysAgoEnd: 1 },
        { label: 'Dim', daysAgoStart: 0, daysAgoEnd: 0 },
      ];
    }

    if (period === '30d') {
      return [
        { label: 'S1', daysAgoStart: 29, daysAgoEnd: 23 },
        { label: 'S2', daysAgoStart: 22, daysAgoEnd: 16 },
        { label: 'S3', daysAgoStart: 15, daysAgoEnd: 9 },
        { label: 'S4', daysAgoStart: 8, daysAgoEnd: 0 },
      ];
    }

    return [
      { label: 'M-3', daysAgoStart: 89, daysAgoEnd: 67 },
      { label: 'M-2', daysAgoStart: 66, daysAgoEnd: 44 },
      { label: 'M-1', daysAgoStart: 43, daysAgoEnd: 21 },
      { label: 'Act.', daysAgoStart: 20, daysAgoEnd: 0 },
    ];
  }

  private getLastMonths(count: number): Array<{ label: string; month: number; year: number }> {
    const months = [];
    const now = new Date();

    for (let index = count - 1; index >= 0; index -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      months.push({
        label: date.toLocaleDateString('fr-FR', { month: 'short' }),
        month: date.getMonth(),
        year: date.getFullYear(),
      });
    }

    return months;
  }
}
