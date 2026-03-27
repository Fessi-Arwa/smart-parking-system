import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

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
  private readonly apiUrl = 'http://localhost:5000/api/owner';
  private readonly backendOrigin = 'http://localhost:5000';

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

    return sources.map((source) => ({
      ...source,
      preview_url: source.preview_url ? `${this.backendOrigin}${source.preview_url}` : null,
    }));
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

    return {
      ...source,
      preview_url: source.preview_url ? `${this.backendOrigin}${source.preview_url}` : null,
    };
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
}
