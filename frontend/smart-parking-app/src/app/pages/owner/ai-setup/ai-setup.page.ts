import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { OwnerWorkflowState } from '../../../models/owner-workflow.model';
import { OwnerWorkflowService } from '../../../services/owner-workflow.service';
import {
  ParkingAISource,
  ParkingAiSourceService,
} from '../../../services/parking-ai-source.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-owner-ai-setup',
  templateUrl: './ai-setup.page.html',
  styleUrls: ['./ai-setup.page.scss'],
  standalone: false,
})
export class AiSetupPage implements OnInit {
  workflowState!: OwnerWorkflowState;
  isSubmitting = false;
  isLoadingSources = true;
  isUploadingImage = false;
  isUploadingVideo = false;
  isAddingCamera = false;
  aiSources: ParkingAISource[] = [];
  cameraDraft = {
    label: '',
    streamUrl: '',
  };
  aiTasks = [
    'Ajouter des images statiques du parking',
    'Deposer des videos pour analyser circulation et occupation',
    'Connecter une ou plusieurs cameras de surveillance',
    'Laisser le modele IA exploiter ces sources pour la detection',
  ];

  constructor(
    private ownerWorkflowService: OwnerWorkflowService,
    private parkingAiSourceService: ParkingAiSourceService,
    private router: Router,
    private toastService: ToastService
  ) {}

  async ngOnInit(): Promise<void> {
    this.workflowState = await this.ownerWorkflowService.refresh();
    await this.loadSources();
  }

  async refreshStatus(): Promise<void> {
    this.workflowState = await this.ownerWorkflowService.refresh();
    await this.loadSources();
    const route = this.ownerWorkflowService.getNextRoute(this.workflowState);
    if (route !== '/owner/ai-setup') {
      await this.router.navigateByUrl(route);
    }
  }

  async onImageSelected(event: Event): Promise<void> {
    const file = this.extractFile(event);
    if (!file || !this.workflowState.parkingId) {
      return;
    }

    this.isUploadingImage = true;

    try {
      const source = await this.parkingAiSourceService.uploadSource(
        this.workflowState.parkingId,
        file,
        'image',
        file.name
      );
      this.aiSources = [source, ...this.aiSources];
      this.toastService.show('Image IA ajoutee avec succes.', 'success');
    } catch (error) {
      console.error('Erreur upload image IA', error);
      this.toastService.show('Impossible d envoyer cette image.', 'error');
    } finally {
      this.isUploadingImage = false;
      this.resetInput(event);
    }
  }

  async onVideoSelected(event: Event): Promise<void> {
    const file = this.extractFile(event);
    if (!file || !this.workflowState.parkingId) {
      return;
    }

    this.isUploadingVideo = true;

    try {
      const source = await this.parkingAiSourceService.uploadSource(
        this.workflowState.parkingId,
        file,
        'video',
        file.name
      );
      this.aiSources = [source, ...this.aiSources];
      this.toastService.show('Video IA ajoutee avec succes.', 'success');
    } catch (error) {
      console.error('Erreur upload video IA', error);
      this.toastService.show('Impossible d envoyer cette video.', 'error');
    } finally {
      this.isUploadingVideo = false;
      this.resetInput(event);
    }
  }

  async addCamera(): Promise<void> {
    if (!this.workflowState.parkingId) {
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
        this.workflowState.parkingId,
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
      this.toastService.show('Impossible d enregistrer cette camera.', 'error');
    } finally {
      this.isAddingCamera = false;
    }
  }

  async removeSource(sourceId: number): Promise<void> {
    try {
      await this.parkingAiSourceService.deleteSource(sourceId);
      this.aiSources = this.aiSources.filter((source) => source.id_source !== sourceId);
      this.toastService.show('Source IA supprimee.', 'success');
    } catch (error) {
      console.error('Erreur suppression source IA', error);
      this.toastService.show('Impossible de supprimer cette source IA.', 'error');
    }
  }

  async activateAiSetup(): Promise<void> {
    if (!this.workflowState.parkingId) {
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
        this.workflowState.parkingId,
        'active'
      );
      this.toastService.show('Configuration IA activee avec succes.', 'success');

      const route = this.ownerWorkflowService.getNextRoute(this.workflowState);
      await this.router.navigateByUrl(route);
    } catch (error) {
      console.error('Erreur activation configuration IA', error);
      this.toastService.show('Impossible d activer la configuration IA.', 'error');
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

  private async loadSources(): Promise<void> {
    if (!this.workflowState?.parkingId) {
      this.aiSources = [];
      this.isLoadingSources = false;
      return;
    }

    this.isLoadingSources = true;

    try {
      this.aiSources = await this.parkingAiSourceService.getSources(this.workflowState.parkingId);
    } catch (error) {
      console.error('Erreur chargement sources IA', error);
      this.toastService.show('Impossible de charger les sources IA du parking.', 'error');
      this.aiSources = [];
    } finally {
      this.isLoadingSources = false;
    }
  }

  private extractFile(event: Event): File | null {
    const input = event.target as HTMLInputElement | null;
    return input?.files?.[0] || null;
  }

  private resetInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (input) {
      input.value = '';
    }
  }
}
