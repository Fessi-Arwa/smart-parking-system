import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { DEFAULT_OWNER_WORKFLOW_STATE, OwnerWorkflowState } from '../../../models/owner-workflow.model';
import { AuthService } from '../../../services/auth.service';
import { OwnerWorkflowService } from '../../../services/owner-workflow.service';
import { PlaceDto, PlaceService } from '../../../services/place.service';
import {
  ParkingAISource,
  ParkingAiAuthError,
  ParkingAISlot,
  ParkingAiUploadProgress,
  ParkingAiSourceService,
} from '../../../services/parking-ai-source.service';
import { ParkingDto, ParkingService } from '../../../services/parking.service';
import { ToastService } from '../../../services/toast.service';

interface OwnerAiParkingOption {
  id: number;
  name: string;
  address: string;
  setupStatus: string;
  aiSetupStatus: string;
}

@Component({
  selector: 'app-owner-ai-setup',
  templateUrl: './ai-setup.page.html',
  styleUrls: ['./ai-setup.page.scss'],
  standalone: false,
})
export class AiSetupPage implements OnInit, OnDestroy {
  @ViewChild('calibrationCanvas') calibrationCanvasRef?: ElementRef<HTMLCanvasElement>;
  workflowState: OwnerWorkflowState = { ...DEFAULT_OWNER_WORKFLOW_STATE };
  ownerParkings: OwnerAiParkingOption[] = [];
  isSubmitting = false;
  isLoadingSources = true;
  isUploadingImage = false;
  isUploadingVideo = false;
  videoUploadProgress = 0;
  currentVideoUploadName = '';
  videoUploadHint: string | null = null;
  isAddingCamera = false;
  isLoadingCalibration = false;
  isSavingCalibration = false;
  reanalyzingSourceIds = new Set<number>();
  aiSources: ParkingAISource[] = [];
  calibrationPlaces: PlaceDto[] = [];
  calibrationSlots: ParkingAISlot[] = [];
  calibrationSource: ParkingAISource | null = null;
  calibrationUsesCustomSlots = false;
  calibrationImageUrl: string | null = null;
  calibrationWarning: string | null = null;
  cameraDraft = {
    label: '',
    streamUrl: '',
  };
  private calibrationImage = new Image();
  private dragStart: { x: number; y: number } | null = null;
  private draftRect: { x: number; y: number; w: number; h: number } | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private analysisVideoErrorIds = new Set<number>();
  private objectUrls = new Set<string>();
  private sourceBlobs = new Map<number, string>();
  private analysisBlobs = new Map<number, string>();
  private analysisPreviewBlobs = new Map<number, string>();
  private routeParkingId: number | null = null;

  constructor(
    private authService: AuthService,
    private ownerWorkflowService: OwnerWorkflowService,
    private parkingAiSourceService: ParkingAiSourceService,
    private parkingService: ParkingService,
    private placeService: PlaceService,
    private route: ActivatedRoute,
    private router: Router,
    private toastService: ToastService
  ) {
    this.calibrationImage.onload = () => this.redrawCalibrationCanvas();
  }

  async ngOnInit(): Promise<void> {
    this.routeParkingId = this.parseParkingId(this.route.snapshot.queryParamMap.get('parking'));
    this.workflowState = await this.ownerWorkflowService.refresh();
    await this.loadOwnerParkings();
    await this.ensureSelectedParking();
    if (!this.activeParkingId) {
      await this.router.navigateByUrl(this.ownerWorkflowService.getNextRoute(this.workflowState));
      return;
    }
    await this.loadSources();
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.revokeObjectUrls();
  }

  async refreshStatus(): Promise<void> {
    this.workflowState = await this.ownerWorkflowService.refresh();
    await this.loadOwnerParkings();
    await this.ensureSelectedParking();
    await this.loadSources();
    if (this.hasRouteParkingSelection) {
      return;
    }
    const route = this.ownerWorkflowService.getNextRoute(this.workflowState);
    if (route !== '/owner/ai-setup') {
      await this.router.navigateByUrl(route);
    }
  }

  async onImageSelected(event: Event): Promise<void> {
    const files = this.extractFiles(event);
    if (files.length === 0 || !this.activeParkingId) {
      return;
    }

    this.isUploadingImage = true;

    try {
      const result = await this.uploadSources(files, 'image');
      const createdSources = result.sources;
      await this.loadBlobUrlsForSpecificSources(createdSources);
      this.aiSources = [...createdSources, ...this.aiSources];
      this.notifyUploadResult(result, 'image');
    } catch (error) {
      console.error('Erreur upload image IA', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible d envoyer ces images.'), 'error');
    } finally {
      this.isUploadingImage = false;
      this.resetInput(event);
    }
  }

  async onVideoSelected(event: Event): Promise<void> {
    const files = this.extractFiles(event);
    if (files.length === 0 || !this.activeParkingId) {
      return;
    }

    this.isUploadingVideo = true;
    this.videoUploadProgress = 0;
    this.currentVideoUploadName = files[0]?.name || '';
    this.videoUploadHint = this.buildVideoUploadHint(files);

    try {
      const result = await this.uploadSources(files, 'video');
      const createdSources = result.sources;
      await this.loadBlobUrlsForSpecificSources(createdSources);
      this.aiSources = [...createdSources, ...this.aiSources];
      this.notifyUploadResult(result, 'video');
    } catch (error) {
      console.error('Erreur upload video IA', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible d envoyer ces videos.'), 'error');
    } finally {
      this.isUploadingVideo = false;
      this.videoUploadProgress = 0;
      this.currentVideoUploadName = '';
      this.resetInput(event);
    }
  }

  async addCamera(): Promise<void> {
    if (!this.activeParkingId) {
      this.toastService.show('Aucun parking owner n a ete trouve.', 'error');
      return;
    }

    if (!this.cameraDraft.streamUrl.trim()) {
      this.toastService.show('Ajoutez une URL de camera ou un flux de surveillance.', 'error');
      return;
    }

    this.isAddingCamera = true;

    try {
      const source = await this.parkingAiSourceService.createCameraSource(
        this.activeParkingId,
        {
          label: this.cameraDraft.label.trim() || 'Camera surveillance',
          stream_url: this.cameraDraft.streamUrl.trim(),
        }
      );

      this.aiSources = [source, ...this.aiSources];
      this.cameraDraft = { label: '', streamUrl: '' };
      this.toastService.show('Camera ajoutee avec succes.', 'success');
    } catch (error) {
      console.error('Erreur ajout camera IA', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible d enregistrer cette camera.'), 'error');
    } finally {
      this.isAddingCamera = false;
    }
  }

  async removeSource(sourceId: number): Promise<void> {
    try {
      await this.parkingAiSourceService.deleteSource(sourceId);
      if (this.calibrationSource?.id_source === sourceId) {
        this.closeCalibration();
      }
      this.revokeSourceSpecificObjectUrls(sourceId);
      this.aiSources = this.aiSources.filter((source) => source.id_source !== sourceId);
      this.toastService.show('Source IA supprimee.', 'success');
    } catch (error) {
      console.error('Erreur suppression source IA', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible de supprimer cette source IA.'), 'error');
    }
  }

  async activateAiSetup(): Promise<void> {
    if (!this.activeParkingId) {
      this.toastService.show('Aucun parking owner n a ete trouve.', 'error');
      return;
    }

    if (this.aiSources.length === 0) {
      this.toastService.show('Ajoutez au moins une image, video ou camera avant activation.', 'error');
      return;
    }

    this.isSubmitting = true;

    try {
      this.workflowState = await this.ownerWorkflowService.updateAiSetupStatus(
        this.activeParkingId,
        'active'
      );
      this.toastService.show('Configuration IA activee avec succes.', 'success');

      const route = this.ownerWorkflowService.getNextRoute(this.workflowState);
      await this.router.navigateByUrl(route);
    } catch (error) {
      console.error('Erreur activation configuration IA', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible d activer la configuration IA.'), 'error');
    } finally {
      this.isSubmitting = false;
    }
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

  async openCalibration(source: ParkingAISource): Promise<void> {
    const calibrationMediaUrl = source.calibration_preview_url || source.preview_url || null;
    if (!this.activeParkingId || !calibrationMediaUrl || this.isCameraSource(source)) {
      this.toastService.show('Choisissez une image ou une video exploitable pour calibrer les places.', 'error');
      return;
    }

    this.isLoadingCalibration = true;
    try {
      const [places, slotsResponse] = await Promise.all([
        firstValueFrom(this.placeService.getPlaces(this.activeParkingId)),
        this.parkingAiSourceService.getParkingSlots(this.activeParkingId),
      ]);
      this.calibrationPlaces = (places || []).sort((a, b) => a.num_place - b.num_place);
      this.calibrationSlots = this.autoAssignCalibrationSlots(
        [...slotsResponse.slots].sort((a, b) => a.slot_index - b.slot_index)
      );
      this.calibrationUsesCustomSlots = slotsResponse.uses_custom_slots;
      this.calibrationWarning = slotsResponse.warning || null;
      this.calibrationSource = source;
      if (slotsResponse.auto_assigned_count) {
        this.toastService.show(
          `${slotsResponse.auto_assigned_count} slot(s) ont ete associes automatiquement aux places existantes.`,
          'info'
        );
      }
      this.replaceCalibrationImageUrl(
        await this.parkingAiSourceService.fetchProtectedMediaObjectUrl(calibrationMediaUrl)
      );
      this.calibrationImage.src = this.calibrationImageUrl || '';
      if (this.calibrationPlaces.length === 0) {
        this.toastService.show(
          `Aucune place n est encore creee pour le parking #${this.activeParkingId}. Termine d abord l etape parking.`,
          'info'
        );
      }
      setTimeout(() => this.redrawCalibrationCanvas(), 0);
    } catch (error) {
      console.error('Erreur chargement calibration', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible de charger la calibration du parking.'), 'error');
    } finally {
      this.isLoadingCalibration = false;
    }
  }

  async reanalyzeSource(source: ParkingAISource): Promise<void> {
    if (this.isCameraSource(source) || this.reanalyzingSourceIds.has(source.id_source)) {
      return;
    }

    this.reanalyzingSourceIds.add(source.id_source);
    try {
      const updatedSource = await this.parkingAiSourceService.reanalyzeSource(source.id_source);
      await this.loadBlobUrlsForSpecificSources([updatedSource]);
      this.aiSources = this.aiSources.map((item) =>
        item.id_source === updatedSource.id_source ? updatedSource : item
      );
      this.syncPollingState();
      if (this.calibrationSource?.id_source === updatedSource.id_source) {
        this.calibrationSource = updatedSource;
      }
      this.toastService.show(
        this.isVideoSource(updatedSource)
          ? 'Retraitement video lance. Les resultats apparaitront automatiquement.'
          : 'Source retraitee avec succes.',
        'success'
      );
    } catch (error) {
      console.error('Erreur retraitement source IA', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible de retraiter cette source.'), 'error');
    } finally {
      this.reanalyzingSourceIds.delete(source.id_source);
    }
  }

  closeCalibration(): void {
    this.calibrationSource = null;
    this.replaceCalibrationImageUrl(null);
    this.calibrationSlots = [];
    this.calibrationWarning = null;
    this.draftRect = null;
    this.dragStart = null;
  }

  onCalibrationMouseDown(event: MouseEvent): void {
    if (!this.calibrationCanvasRef) {
      return;
    }
    this.dragStart = this.getCanvasPoint(event);
    this.draftRect = { x: this.dragStart.x, y: this.dragStart.y, w: 0, h: 0 };
    this.redrawCalibrationCanvas();
  }

  onCalibrationMouseMove(event: MouseEvent): void {
    if (!this.dragStart) {
      return;
    }
    this.draftRect = this.normalizeRect(this.dragStart, this.getCanvasPoint(event));
    this.redrawCalibrationCanvas();
  }

  onCalibrationMouseUp(event: MouseEvent): void {
    if (!this.dragStart) {
      return;
    }
    const rect = this.normalizeRect(this.dragStart, this.getCanvasPoint(event));
    this.dragStart = null;
    this.draftRect = null;

    if (rect.w >= 12 && rect.h >= 12) {
      const nextPlace = this.getNextAvailableCalibrationPlaceId();
      this.calibrationSlots = [
        ...this.calibrationSlots,
        {
          slot_index: this.calibrationSlots.length + 1,
          place_id: nextPlace,
          place_number: this.getCalibrationPlaceNumber(nextPlace),
          ...rect,
        },
      ];
    }

    this.redrawCalibrationCanvas();
  }

  updateCalibrationPlace(slotIndex: number, value: string): void {
    const placeId = Number(value || 0);
    this.calibrationSlots = this.calibrationSlots.map((slot, index) =>
      index === slotIndex
        ? { ...slot, place_id: placeId || null, place_number: this.getCalibrationPlaceNumber(placeId || null) }
        : slot
    );
    this.redrawCalibrationCanvas();
  }

  removeCalibrationSlot(slotIndex: number): void {
    this.calibrationSlots = this.calibrationSlots
      .filter((_, index) => index !== slotIndex)
      .map((slot, index) => ({ ...slot, slot_index: index + 1 }));
    this.redrawCalibrationCanvas();
  }

  getCalibrationPlaceLabel(placeId: number | null | undefined): string {
    const place = this.calibrationPlaces.find((item) => item.id_place === placeId);
    return place ? `Place ${place.num_place}` : 'Non assignee';
  }

  getCalibrationPlaceNumber(placeId: number | null | undefined): number | null {
    if (!placeId) {
      return null;
    }
    const place = this.calibrationPlaces.find((item) => item.id_place === placeId);
    return place?.num_place ?? null;
  }

  hasCalibrationDuplicates(): boolean {
    const used = this.calibrationSlots
      .map((slot) => slot.place_id)
      .filter((value): value is number => typeof value === 'number' && value > 0);
    return new Set(used).size !== used.length;
  }

  hasUnassignedCalibrationSlots(): boolean {
    return this.calibrationSlots.some((slot) => !slot.place_id);
  }

  hasCalibrationPlaces(): boolean {
    return this.calibrationPlaces.length > 0;
  }

  async selectParking(parkingId: number): Promise<void> {
    if (parkingId === this.activeParkingId) {
      return;
    }

    this.routeParkingId = parkingId;
    this.closeCalibration();
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { parking: parkingId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    await this.loadSources();
  }

  isSelectedParking(parkingId: number): boolean {
    return this.activeParkingId === parkingId;
  }

  get activeParkingOption(): OwnerAiParkingOption | null {
    if (!this.activeParkingId) {
      return null;
    }

    return this.ownerParkings.find((parking) => parking.id === this.activeParkingId) ?? null;
  }

  get activeParkingLabel(): string {
    const parking = this.activeParkingOption;
    if (!parking) {
      return this.activeParkingId ? `Parking #${this.activeParkingId}` : 'Aucun parking';
    }

    return `${parking.name} (#${parking.id})`;
  }

  get canSwitchParking(): boolean {
    return this.ownerParkings.length > 1;
  }

  get canActivateAi(): boolean {
    return this.aiSources.length > 0 && !this.isLoadingSources && !this.isSubmitting;
  }

  get aiPrimaryActionLabel(): string {
    if (this.isSubmitting) {
      return 'Activation...';
    }

    return this.aiSources.length === 0 ? 'Ajoutez une source pour continuer' : 'Activer et continuer';
  }

  get hasVideoUploadHint(): boolean {
    return Boolean(this.videoUploadHint);
  }

  get videoUploadProgressLabel(): string {
    if (!this.isUploadingVideo) {
      return '';
    }
    return this.currentVideoUploadName
      ? `${this.currentVideoUploadName} • ${this.videoUploadProgress}%`
      : `${this.videoUploadProgress}%`;
  }

  getParkingStateLabel(parking: OwnerAiParkingOption): string {
    if (parking.aiSetupStatus === 'active') {
      return 'IA active';
    }
    if (parking.setupStatus === 'terminee') {
      return 'Pret pour IA';
    }
    return 'Parking a finaliser';
  }

  async goToParkingSetup(): Promise<void> {
    await this.router.navigate(['/owner/parking-setup'], {
      queryParams: this.activeParkingId ? { parking: this.activeParkingId } : {},
    });
  }

  async saveCalibration(): Promise<void> {
    if (!this.activeParkingId || !this.calibrationSource) {
      return;
    }
    if (this.calibrationSlots.length === 0) {
      this.toastService.show('Dessinez au moins un slot.', 'error');
      return;
    }
    if (this.calibrationSlots.some((slot) => !slot.place_id)) {
      this.toastService.show('Associez chaque slot a une place.', 'error');
      return;
    }
    if (this.hasCalibrationDuplicates()) {
      this.toastService.show('Une meme place ne peut pas etre utilisee plusieurs fois.', 'error');
      return;
    }

    this.isSavingCalibration = true;
    try {
      const savedSlots = await this.parkingAiSourceService.saveParkingSlots(this.activeParkingId, this.calibrationSlots);
      this.calibrationSlots = this.autoAssignCalibrationSlots(savedSlots.slots);
      const updatedSource = await this.parkingAiSourceService.reanalyzeSource(this.calibrationSource.id_source);
      await this.loadBlobUrlsForSpecificSources([updatedSource]);
      this.aiSources = this.aiSources.map((source) =>
        source.id_source === updatedSource.id_source ? updatedSource : source
      );
      this.syncPollingState();
      this.calibrationSource = updatedSource;
      this.calibrationUsesCustomSlots = true;
      this.calibrationWarning = savedSlots.warning || null;
      this.toastService.show(
        this.isVideoSource(updatedSource)
          ? 'Calibration enregistree. Le traitement video est relance en arriere-plan.'
          : 'Calibration enregistree et source retraitee.',
        'success'
      );
    } catch (error) {
      console.error('Erreur sauvegarde calibration', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible d enregistrer la calibration.'), 'error');
    } finally {
      this.isSavingCalibration = false;
    }
  }

  hasProcessedAnalysis(source: ParkingAISource): boolean {
    return source.analysis?.status === 'done';
  }

  hasAnalysisError(source: ParkingAISource): boolean {
    return source.analysis?.status === 'error';
  }

  hasPendingVideoProcessing(source: ParkingAISource): boolean {
    return this.isVideoSource(source) && (!source.analysis || source.analysis.status === 'pending');
  }

  isVideoProcessing(source: ParkingAISource): boolean {
    return source.analysis?.status === 'processing';
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

  getAnalysisMediaUrl(source: ParkingAISource): string | null {
    return this.analysisBlobs.get(source.id_source) || this.getAnalysisOutputUrl(source);
  }

  getAnalysisPreviewUrl(source: ParkingAISource): string | null {
    return this.analysisPreviewBlobs.get(source.id_source) || source.analysis?.output_preview_url || null;
  }

  isImageAnalysis(source: ParkingAISource): boolean {
    return this.isImageSource(source) && !!this.getAnalysisOutputUrl(source);
  }

  isVideoAnalysis(source: ParkingAISource): boolean {
    return this.isVideoSource(source) && !!this.getAnalysisOutputUrl(source);
  }

  showAnalysisVideo(source: ParkingAISource): boolean {
    return this.isVideoAnalysis(source) && !this.analysisVideoErrorIds.has(source.id_source);
  }

  markAnalysisVideoError(source: ParkingAISource): void {
    this.analysisVideoErrorIds.add(source.id_source);
  }

  showAnalysisVideoFallback(source: ParkingAISource): boolean {
    return this.isVideoAnalysis(source) && !this.showAnalysisVideo(source);
  }

  getAnalysisError(source: ParkingAISource): string | null {
    return source.analysis?.error || null;
  }

  getSlotDebugRows(source: ParkingAISource): string[] {
    const rows = source.analysis?.slot_debug || [];
    return rows.map((item) => {
      const parts = [
        `S${item.slot_index}`,
        item.place_number ? `Place ${item.place_number}` : item.place_id ? `P${item.place_id}` : null,
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

  get videoSourcesCount(): number {
    return this.aiSources.filter((source) => this.isVideoSource(source)).length;
  }

  trackSource(_: number, source: ParkingAISource): number {
    return source.id_source;
  }

  isReanalyzingSource(sourceId: number): boolean {
    return this.reanalyzingSourceIds.has(sourceId);
  }

  private async loadSources(): Promise<void> {
    if (!this.activeParkingId) {
      this.closeCalibration();
      this.aiSources = [];
      this.isLoadingSources = false;
      return;
    }

    this.isLoadingSources = true;

    try {
      this.aiSources = await this.parkingAiSourceService.getSources(this.activeParkingId);
      await this.loadBlobUrlsForSources();
      this.syncPollingState();
    } catch (error) {
      console.error('Erreur chargement sources IA', error);
      this.toastService.show(this.getErrorMessage(error, 'Impossible de charger les sources IA du parking.'), 'error');
      this.aiSources = [];
      this.stopPolling();
    } finally {
      this.isLoadingSources = false;
    }
  }

  private async loadBlobUrlsForSources(): Promise<void> {
    await this.loadBlobUrlsForSpecificSources(this.aiSources);
  }

  private async loadBlobUrlsForSpecificSources(sources: ParkingAISource[]): Promise<void> {
    for (const source of sources) {
      if ((this.isVideoSource(source) || this.isImageSource(source)) && source.preview_url) {
        try {
          const blobUrl = await this.parkingAiSourceService.fetchProtectedMediaObjectUrl(source.id_source);
          if (blobUrl) {
            this.replaceBlobUrl(this.sourceBlobs, source.id_source, blobUrl);
          }
        } catch (error) {
          console.warn(`Erreur lors du chargement du blob pour la source ${source.id_source}:`, error);
        }
      }

      const analysisOutputUrl = this.getAnalysisOutputUrl(source);
      if (analysisOutputUrl) {
        try {
          const blobUrl = await this.parkingAiSourceService.fetchProtectedMediaObjectUrl(analysisOutputUrl);
          if (blobUrl) {
            this.replaceBlobUrl(this.analysisBlobs, source.id_source, blobUrl);
          }
        } catch (error) {
          console.warn(`Erreur lors du chargement du resultat analyse pour ${source.id_source}:`, error);
        }
      }

      const analysisPreviewUrl = source.analysis?.output_preview_url;
      if (analysisPreviewUrl) {
        try {
          const blobUrl = await this.parkingAiSourceService.fetchProtectedMediaObjectUrl(analysisPreviewUrl);
          if (blobUrl) {
            this.replaceBlobUrl(this.analysisPreviewBlobs, source.id_source, blobUrl);
          }
        } catch (error) {
          console.warn(`Erreur lors du chargement de la preview analyse pour ${source.id_source}:`, error);
        }
      }
    }
  }

  getSourceMediaUrl(source: ParkingAISource): string {
    return this.sourceBlobs.get(source.id_source) || source.preview_url || '';
  }

  private extractFiles(event: Event): File[] {
    const input = event.target as HTMLInputElement | null;
    return input?.files ? Array.from(input.files) : [];
  }

  private resetInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (input) {
      input.value = '';
    }
  }

  private redrawCalibrationCanvas(): void {
    const canvas = this.calibrationCanvasRef?.nativeElement;
    if (!canvas || !this.calibrationImageUrl || !this.calibrationImage.complete) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    canvas.width = this.calibrationImage.naturalWidth;
    canvas.height = this.calibrationImage.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.calibrationImage, 0, 0, canvas.width, canvas.height);

    this.calibrationSlots.forEach((slot, index) => {
      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = 3;
      ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);
      ctx.fillStyle = 'rgba(15, 118, 110, 0.18)';
      ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
      ctx.fillStyle = '#102a43';
      ctx.font = 'bold 16px Segoe UI';
      ctx.fillText(`S${index + 1}`, slot.x + 8, Math.max(18, slot.y + 20));
      ctx.font = '600 13px Segoe UI';
      ctx.fillText(this.getCalibrationPlaceLabel(slot.place_id), slot.x + 8, Math.max(36, slot.y + 38));
    });

    if (this.draftRect) {
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(this.draftRect.x, this.draftRect.y, this.draftRect.w, this.draftRect.h);
      ctx.setLineDash([]);
    }
  }

  private getCanvasPoint(event: MouseEvent): { x: number; y: number } {
    const canvas = this.calibrationCanvasRef!.nativeElement;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.round(((event.clientX - rect.left) * canvas.width) / rect.width),
      y: Math.round(((event.clientY - rect.top) * canvas.height) / rect.height),
    };
  }

  private normalizeRect(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): { x: number; y: number; w: number; h: number } {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x),
      h: Math.abs(end.y - start.y),
    };
  }

  private autoAssignCalibrationSlots(slots: ParkingAISlot[]): ParkingAISlot[] {
    const availablePlaces = [...this.calibrationPlaces];
    const placesById = new Map(availablePlaces.map((place) => [place.id_place, place]));
    const usedPlaceIds = new Set<number>();

    const normalized = slots.map((slot, index) => {
      let placeId = slot.place_id ?? null;
      let placeNumber = slot.place_number ?? this.getCalibrationPlaceNumber(placeId);

      if (placeId && placesById.has(placeId) && !usedPlaceIds.has(placeId)) {
        usedPlaceIds.add(placeId);
        return {
          ...slot,
          slot_index: index + 1,
          place_id: placeId,
          place_number: placeNumber,
        };
      }

      const nextPlace = availablePlaces.find((place) => !usedPlaceIds.has(place.id_place)) || null;
      if (!nextPlace) {
        return {
          ...slot,
          slot_index: index + 1,
          place_id: null,
          place_number: null,
        };
      }

      usedPlaceIds.add(nextPlace.id_place);
      return {
        ...slot,
        slot_index: index + 1,
        place_id: nextPlace.id_place,
        place_number: nextPlace.num_place,
      };
    });

    return normalized;
  }

  private getNextAvailableCalibrationPlaceId(): number | null {
    const usedPlaceIds = new Set(
      this.calibrationSlots
        .map((slot) => slot.place_id)
        .filter((value): value is number => Boolean(value))
    );
    const nextPlace = this.calibrationPlaces.find((place) => !usedPlaceIds.has(place.id_place));
    return nextPlace?.id_place ?? null;
  }

  private async uploadSources(
    files: File[],
    sourceType: 'image' | 'video'
  ): Promise<{ sources: ParkingAISource[]; failures: string[] }> {
    if (!this.activeParkingId) {
      return { sources: [], failures: [] };
    }

    const createdSources: ParkingAISource[] = [];
    const failures: string[] = [];
    for (const [index, file] of files.entries()) {
      try {
        const baseProgress = index / files.length;
        const progressSpan = 1 / files.length;
        if (sourceType === 'video') {
          this.currentVideoUploadName = file.name;
          this.videoUploadProgress = Math.round(baseProgress * 100);
        }
        const source = await this.parkingAiSourceService.uploadSource(
          this.activeParkingId,
          file,
          sourceType,
          file.name,
          sourceType === 'video'
            ? (progress: ParkingAiUploadProgress) => {
                this.videoUploadProgress = Math.min(
                  100,
                  Math.round((baseProgress + progressSpan * (progress.percent / 100)) * 100)
                );
              }
            : undefined
        );
        createdSources.push(source);
      } catch (error) {
        console.error(`Erreur upload ${sourceType}`, file.name, error);
        failures.push(file.name);
      }
    }

    return { sources: createdSources, failures };
  }

  private buildVideoUploadHint(files: File[]): string | null {
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const largestFile = files.reduce((largest, file) => (file.size > largest.size ? file : largest), files[0]);
    const formatBytes = (bytes: number): string => {
      if (bytes < 1024 * 1024) {
        return `${Math.round(bytes / 1024)} KB`;
      }
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    if (largestFile.size >= 200 * 1024 * 1024) {
      return `Video lourde detectee (${largestFile.name}, ${formatBytes(largestFile.size)}). Utilise idealement une capture plus courte.`;
    }

    if (totalBytes >= 250 * 1024 * 1024) {
      return `Upload total ${formatBytes(totalBytes)}. Le transfert peut prendre du temps selon ton reseau.`;
    }

    return `Upload estime: ${formatBytes(totalBytes)} a transferer.`;
  }

  private notifyUploadResult(
    result: { sources: ParkingAISource[]; failures: string[] },
    sourceType: 'image' | 'video'
  ): void {
    const successCount = result.sources.length;
    const failureCount = result.failures.length;
    const plural = sourceType === 'image' ? 'image' : 'video';

    if (successCount > 0 && failureCount === 0) {
      this.toastService.show(
        successCount > 1
          ? `${successCount} ${plural}s IA ajoutees avec succes.`
          : `${sourceType === 'image' ? 'Image' : 'Video'} IA ajoutee avec succes.`,
        'success'
      );
      return;
    }

    if (successCount > 0 && failureCount > 0) {
      this.toastService.show(
        `${successCount} ${plural}(s) ajoutee(s), ${failureCount} echec(s).`,
        'info'
      );
      return;
    }

    this.toastService.show(
      `Impossible d envoyer ${sourceType === 'image' ? 'ces images' : 'ces videos'}.`,
      'error'
    );
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof ParkingAiAuthError) {
      return error.message;
    }

    const payload = (error as { error?: { msg?: string; error?: string } })?.error;
    return payload?.msg || payload?.error || fallback;
  }

  private syncPollingState(): void {
    const hasRunningJob = this.aiSources.some((source) =>
      source.analysis?.status === 'pending' || source.analysis?.status === 'processing'
    );

    if (hasRunningJob && !this.pollingTimer) {
      this.pollingTimer = setInterval(() => {
        void this.loadSources();
      }, 5000);
      return;
    }

    if (!hasRunningJob) {
      this.stopPolling();
    }
  }

  private stopPolling(): void {
    if (!this.pollingTimer) {
      return;
    }

    clearInterval(this.pollingTimer);
    this.pollingTimer = null;
  }

  private replaceCalibrationImageUrl(nextUrl: string | null): void {
    if (this.calibrationImageUrl && this.objectUrls.has(this.calibrationImageUrl)) {
      URL.revokeObjectURL(this.calibrationImageUrl);
      this.objectUrls.delete(this.calibrationImageUrl);
    }

    this.calibrationImageUrl = nextUrl;

    if (nextUrl) {
      this.objectUrls.add(nextUrl);
    }
  }

  private revokeObjectUrls(): void {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls.clear();
    this.sourceBlobs.clear();
    this.analysisBlobs.clear();
    this.analysisPreviewBlobs.clear();
  }

  private replaceBlobUrl(target: Map<number, string>, sourceId: number, nextUrl: string): void {
    const previousUrl = target.get(sourceId);
    if (previousUrl && this.objectUrls.has(previousUrl)) {
      URL.revokeObjectURL(previousUrl);
      this.objectUrls.delete(previousUrl);
    }

    target.set(sourceId, nextUrl);
    this.objectUrls.add(nextUrl);
  }

  private revokeSourceSpecificObjectUrls(sourceId: number): void {
    const collections = [this.sourceBlobs, this.analysisBlobs, this.analysisPreviewBlobs];
    collections.forEach((collection) => {
      const currentUrl = collection.get(sourceId);
      if (currentUrl && this.objectUrls.has(currentUrl)) {
        URL.revokeObjectURL(currentUrl);
        this.objectUrls.delete(currentUrl);
      }
      collection.delete(sourceId);
    });
    this.analysisVideoErrorIds.delete(sourceId);
  }

  get activeParkingId(): number | null {
    if (this.routeParkingId) {
      return this.routeParkingId;
    }
    return this.workflowState?.parkingId ?? null;
  }

  get hasRouteParkingSelection(): boolean {
    return Boolean(this.routeParkingId);
  }

  private async loadOwnerParkings(): Promise<void> {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.id) {
      this.ownerParkings = [];
      return;
    }

    const parkings = await firstValueFrom(this.parkingService.getParkings());
    this.ownerParkings = parkings
      .filter((parking) => parking.owner_id === currentUser.id)
      .map((parking) => this.mapOwnerParking(parking));
  }

  private async ensureSelectedParking(): Promise<void> {
    const activeParkingId = this.activeParkingId;
    if (activeParkingId && this.ownerParkings.some((parking) => parking.id === activeParkingId)) {
      return;
    }

    const fallbackParkingId = this.ownerParkings[0]?.id ?? null;
    if (!fallbackParkingId) {
      return;
    }

    this.routeParkingId = fallbackParkingId;
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { parking: fallbackParkingId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private mapOwnerParking(parking: ParkingDto): OwnerAiParkingOption {
    return {
      id: parking.id_park,
      name: parking.nom,
      address: parking.adresse,
      setupStatus: parking.setup_status || 'non_commencee',
      aiSetupStatus: parking.ai_setup_status || 'non_configuree',
    };
  }

  private parseParkingId(value: string | null): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
}
