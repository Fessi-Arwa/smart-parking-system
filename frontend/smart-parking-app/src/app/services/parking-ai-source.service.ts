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
  preview_url?: string | null;
  created_at?: string;
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
    label?: string
  ): Promise<ParkingAISource> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source_type', sourceType);
    if (label?.trim()) {
      formData.append('label', label.trim());
    }

    const source = await firstValueFrom(
      this.http.post<ParkingAISource>(
        `${this.apiUrl}/parkings/${parkingId}/ai-sources/upload`,
        formData,
        { headers: this.buildAuthHeaders() }
      )
    );

    return this.normalizeSource(source);
  }

  async createCameraSource(
    parkingId: number,
    payload: { label?: string; stream_url: string }
  ): Promise<ParkingAISource> {
    return firstValueFrom(
      this.http.post<ParkingAISource>(
        `${this.apiUrl}/parkings/${parkingId}/ai-sources/camera`,
        payload,
        { headers: this.buildAuthHeaders() }
      )
    );
  }

  async deleteSource(sourceId: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.apiUrl}/ai-sources/${sourceId}`, {
        headers: this.buildAuthHeaders(),
      })
    );
  }

  private buildAuthHeaders(): HttpHeaders | undefined {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }

  private normalizeSource(source: ParkingAISource): ParkingAISource {
    return {
      ...source,
      preview_url: this.normalizePreviewUrl(source.preview_url),
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
