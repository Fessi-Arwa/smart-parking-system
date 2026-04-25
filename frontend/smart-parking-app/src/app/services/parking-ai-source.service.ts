import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export type ParkingAISourceType = 'image' | 'video' | 'camera';

export interface ParkingAISource {
  id_source: number;
  parking_id: number;
  source_type: ParkingAISourceType;
  label?: string;
  file_path?: string;
  original_name?: string;
  mime_type?: string;
  stream_url?: string;
  camera_status?: 'idle' | 'active' | 'offline' | 'error' | string;
  auto_processing_enabled?: boolean;
  auto_process_interval_seconds?: number;
  camera_processing_mode?: 'cloud' | 'edge_required' | 'unknown' | null;
  camera_processing_hint?: string | null;
  last_processed_at?: string | null;
  last_error?: string | null;
  preview_url?: string | null;
  calibration_preview_url?: string | null;
  created_at?: string;
  analysis?: ParkingAISourceAnalysis | null;
}

export interface ParkingAISourceAnalysis {
  source_id: number;
  parking_id: number;
  source_type: ParkingAISourceType;
  status: 'pending' | 'processing' | 'done' | 'error';
  processed_at?: string;
  free?: number | null;
  occupied?: number | null;
  total?: number | null;
  processed_frames?: number | null;
  fps?: number | null;
  resolution?: string | null;
  class_mapping?: Record<string, string> | null;
  slot_debug?: Array<{
    slot_index: number;
    place_id?: number | null;
    place_number?: number | null;
    label: string;
    average_confidence?: number | null;
    free_votes?: number | null;
    busy_votes?: number | null;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  }> | null;
  model_path?: string | null;
  slots_path?: string | null;
  sync_mode?: string | null;
  synced_places?: number | null;
  sync_warning?: string | null;
  output_url?: string | null;
  output_preview_url?: string | null;
  error?: string | null;
}

export interface ParkingAISlot {
  slot_index: number;
  place_id: number | null;
  place_number?: number | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ParkingAISlotsResponse {
  slots: ParkingAISlot[];
  slots_path: string;
  uses_custom_slots: boolean;
  warning?: string | null;
  auto_assigned_count?: number | null;
}

interface DirectUploadInitResponse {
  upload_url: string;
  object_key: string;
  headers?: Record<string, string>;
  expires_in?: number;
  filename: string;
  label: string;
  mime_type: string;
  source_type: ParkingAISourceType;
}

export interface ParkingVideoBatchResult {
  id: string;
  parking_id: number;
  source_filename: string;
  stored_input_filename: string;
  output_filename: string;
  processed_at: string;
  free: number;
  occupied: number;
  total: number;
  processed_frames: number;
  fps: number;
  resolution: string;
  class_mapping: Record<string, string>;
  model_path: string;
  slots_path: string;
  video_url: string;
  download_url: string;
}

export interface ParkingVideoBatchResponse {
  results: ParkingVideoBatchResult[];
  errors: Array<{ filename: string; error: string }>;
}

export interface ParkingVideoBatchJob {
  id: string;
  parking_id: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  total_files: number;
  processed_files: number;
  success_count: number;
  error_count: number;
  results: ParkingVideoBatchResult[];
  errors: Array<{ filename?: string | null; error: string }>;
}

export class ParkingAiAuthError extends Error {
  constructor(message = 'Session expiree. Reconnectez-vous pour utiliser le module IA.') {
    super(message);
    this.name = 'ParkingAiAuthError';
  }
}

export interface ParkingAiUploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

@Injectable({
  providedIn: 'root',
})
export class ParkingAiSourceService {
  private readonly apiUrl = `${environment.apiBaseUrl}/owner`;
  private readonly backendOrigin = environment.backendOrigin;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  async getSources(parkingId: number): Promise<ParkingAISource[]> {
    const sources = await firstValueFrom(
      this.http.get<ParkingAISource[]>(
        `${this.apiUrl}/parkings/${parkingId}/ai-sources`,
        { headers: this.buildAuthHeaders() }
      )
    );

    return sources.map((source) => this.normalizeSource(source));
  }

  async uploadSource(
    parkingId: number,
    file: File,
    sourceType: 'image' | 'video',
    label?: string,
    onProgress?: (progress: ParkingAiUploadProgress) => void
  ): Promise<ParkingAISource> {
    if (sourceType === 'video' || sourceType === 'image') {
      try {
        return await this.uploadSourceDirectToStorage(parkingId, file, sourceType, label, onProgress);
      } catch (error) {
        console.warn(`Upload direct ${sourceType} indisponible, fallback vers upload backend classique.`, error);
      }
    }

    return this.uploadSourceViaBackend(parkingId, file, sourceType, label, onProgress);
  }

  private async uploadSourceViaBackend(
    parkingId: number,
    file: File,
    sourceType: 'image' | 'video',
    label?: string,
    onProgress?: (progress: ParkingAiUploadProgress) => void
  ): Promise<ParkingAISource> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source_type', sourceType);
    if (label?.trim()) {
      formData.append('label', label.trim());
    }

    const source = await this.uploadMultipartWithProgress<ParkingAISource>(
      `${this.apiUrl}/parkings/${parkingId}/ai-sources/upload`,
      formData,
      this.buildAuthHeaders(),
      onProgress
    );

    return this.normalizeSource(source);
  }

  async createCameraSource(
    parkingId: number,
    payload: { label?: string; stream_url: string }
  ): Promise<ParkingAISource> {
    const source = await firstValueFrom(
      this.http.post<ParkingAISource>(
        `${this.apiUrl}/parkings/${parkingId}/ai-sources/camera`,
        payload,
        { headers: this.buildAuthHeaders() }
      )
    );

    return this.normalizeSource(source);
  }

  private async uploadSourceDirectToStorage(
    parkingId: number,
    file: File,
    sourceType: 'image' | 'video',
    label?: string,
    onProgress?: (progress: ParkingAiUploadProgress) => void
  ): Promise<ParkingAISource> {
    const init = await firstValueFrom(
      this.http.post<DirectUploadInitResponse>(
        `${this.apiUrl}/parkings/${parkingId}/ai-sources/upload-init`,
        {
          filename: file.name,
          mime_type: file.type || 'application/octet-stream',
          source_type: sourceType,
          label: label?.trim() || file.name,
        },
        { headers: this.buildAuthHeaders() }
      )
    );

    await this.uploadBinaryWithProgress(
      init.upload_url,
      file,
      init.headers || { 'Content-Type': file.type || 'application/octet-stream' },
      onProgress
    );

    const source = await firstValueFrom(
      this.http.post<ParkingAISource>(
        `${this.apiUrl}/parkings/${parkingId}/ai-sources/upload-complete`,
        {
          object_key: init.object_key,
          filename: init.filename,
          mime_type: init.mime_type,
          source_type: init.source_type,
          label: init.label,
        },
        { headers: this.buildAuthHeaders() }
      )
    );

    return this.normalizeSource(source);
  }

  async deleteSource(sourceId: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.apiUrl}/ai-sources/${sourceId}`, {
        headers: this.buildAuthHeaders(),
      })
    );
  }

  async reanalyzeSource(sourceId: number): Promise<ParkingAISource> {
    const source = await firstValueFrom(
      this.http.post<ParkingAISource>(
        `${this.apiUrl}/ai-sources/${sourceId}/reanalyze`,
        {},
        { headers: this.buildAuthHeaders() }
      )
    );

    return this.normalizeSource(source);
  }

  async updateCameraAutoProcessing(
    sourceId: number,
    payload: { enabled: boolean; interval_seconds?: number }
  ): Promise<ParkingAISource> {
    const source = await firstValueFrom(
      this.http.post<ParkingAISource>(
        `${this.apiUrl}/ai-sources/${sourceId}/auto-processing`,
        payload,
        { headers: this.buildAuthHeaders() }
      )
    );

    return this.normalizeSource(source);
  }

  async getVideoBatchHistory(parkingId: number): Promise<ParkingVideoBatchResult[]> {
    const history = await firstValueFrom(
      this.http.get<ParkingVideoBatchResult[]>(
        `${environment.apiBaseUrl}/ai/parkings/${parkingId}/video-batch/history`,
        { headers: this.buildAuthHeaders() }
      )
    );

    return history.map((item) => this.normalizeBatchResult(item));
  }

  async processParkingVideos(parkingId: number, files: File[]): Promise<ParkingVideoBatchJob> {
    const formData = new FormData();
    files.forEach((file) => formData.append('videos', file));

    const job = await firstValueFrom(
      this.http.post<ParkingVideoBatchJob>(
        `${environment.apiBaseUrl}/ai/parkings/${parkingId}/video-batch/process`,
        formData,
        { headers: this.buildAuthHeaders() }
      )
    );

    return this.normalizeBatchJob(job);
  }

  async getBatchJob(parkingId: number, jobId: string): Promise<ParkingVideoBatchJob> {
    const job = await firstValueFrom(
      this.http.get<ParkingVideoBatchJob>(
        `${environment.apiBaseUrl}/ai/parkings/${parkingId}/video-batch/jobs/${jobId}`,
        { headers: this.buildAuthHeaders() }
      )
    );

    return this.normalizeBatchJob(job);
  }

  async getParkingSlots(parkingId: number): Promise<ParkingAISlotsResponse> {
    return firstValueFrom(
      this.http.get<ParkingAISlotsResponse>(
        `${this.apiUrl}/parkings/${parkingId}/ai-slots`,
        { headers: this.buildAuthHeaders() }
      )
    );
  }

  async saveParkingSlots(parkingId: number, slots: ParkingAISlot[]): Promise<ParkingAISlotsResponse> {
    return firstValueFrom(
      this.http.put<ParkingAISlotsResponse>(
        `${this.apiUrl}/parkings/${parkingId}/ai-slots`,
        { slots },
        { headers: this.buildAuthHeaders() }
      )
    );
  }

  async fetchProtectedMediaObjectUrl(mediaUrlOrSourceId: string | number): Promise<string> {
    const mediaUrl =
      typeof mediaUrlOrSourceId === 'number'
        ? `${this.apiUrl}/ai-sources/${mediaUrlOrSourceId}/file`
        : mediaUrlOrSourceId;
    const blob = await firstValueFrom(
      this.http.get(mediaUrl, {
        headers: this.buildAuthHeaders(),
        responseType: 'blob',
      })
    );

    return URL.createObjectURL(blob);
  }

  private buildAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    if (!token) {
      this.authService.handleUnauthorized();
      throw new ParkingAiAuthError();
    }

    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private uploadMultipartWithProgress<T>(
    url: string,
    formData: FormData,
    headers: HttpHeaders,
    onProgress?: (progress: ParkingAiUploadProgress) => void
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      headers.keys().forEach((key) => {
        const value = headers.get(key);
        if (value) {
          xhr.setRequestHeader(key, value);
        }
      });

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !onProgress) {
          return;
        }
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      };

      xhr.onerror = () => reject(new Error('Erreur reseau pendant l upload.'));
      xhr.onabort = () => reject(new Error('Upload annule.'));
      xhr.onload = () => {
        const raw = xhr.responseText || '{}';
        const payload = raw ? JSON.parse(raw) : {};
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload as T);
          return;
        }
        reject({ status: xhr.status, error: payload });
      };

      xhr.send(formData);
    });
  }

  private uploadBinaryWithProgress(
    url: string,
    file: File,
    headers: Record<string, string>,
    onProgress?: (progress: ParkingAiUploadProgress) => void
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !onProgress) {
          return;
        }
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      };

      xhr.onerror = () => reject(new Error('Erreur reseau pendant l upload direct.'));
      xhr.onabort = () => reject(new Error('Upload direct annule.'));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        reject(new Error(`Echec upload stockage direct (${xhr.status})`));
      };

      xhr.send(file);
    });
  }

  private normalizeSource(source: ParkingAISource): ParkingAISource {
    return {
      ...source,
      preview_url: this.normalizePreviewUrl(source.preview_url),
      calibration_preview_url: this.normalizePreviewUrl(source.calibration_preview_url),
      analysis: source.analysis
        ? {
            ...source.analysis,
            output_url: this.normalizePreviewUrl(source.analysis.output_url) || undefined,
            output_preview_url: this.normalizePreviewUrl(source.analysis.output_preview_url) || undefined,
          }
        : source.analysis,
    };
  }

  private normalizeBatchResult(result: ParkingVideoBatchResult): ParkingVideoBatchResult {
    return {
      ...result,
      video_url: this.normalizePreviewUrl(result.video_url) || '',
      download_url: this.normalizePreviewUrl(result.download_url) || '',
    };
  }

  private normalizeBatchJob(job: ParkingVideoBatchJob): ParkingVideoBatchJob {
    return {
      ...job,
      results: (job.results || []).map((item) => this.normalizeBatchResult(item)),
      errors: job.errors || [],
    };
  }

  private normalizePreviewUrl(previewUrl?: string | null): string | null {
    if (!previewUrl) {
      return null;
    }

    if (/^https?:\/\//i.test(previewUrl)) {
      return previewUrl;
    }

    return `${this.backendOrigin}${previewUrl}`;
  }
}
