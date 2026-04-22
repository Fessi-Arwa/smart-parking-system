import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

import { AuthService } from './auth.service';

export interface EtageDto {
  id_etage: number;
  parking_id: number;
  nom: string;
  ordre: number;
  created_at?: string;
}

export interface CreateEtagePayload {
  parking_id: number;
  nom: string;
  ordre?: number;
}

export interface UpdateEtagePayload {
  nom?: string;
  ordre?: number;
}

@Injectable({
  providedIn: 'root',
})
export class EtageService {
  private apiUrl = `${environment.apiBaseUrl}/etages`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  getEtages(parkingId?: number): Observable<EtageDto[]> {
    const url = parkingId == null ? `${this.apiUrl}/` : `${this.apiUrl}/?parking_id=${parkingId}`;
    return this.http.get<EtageDto[]>(url);
  }

  createEtage(payload: CreateEtagePayload): Observable<EtageDto> {
    return this.http.post<EtageDto>(`${this.apiUrl}/`, payload, {
      headers: this.buildAuthHeaders(),
    });
  }

  updateEtage(etageId: number, payload: UpdateEtagePayload): Observable<EtageDto> {
    return this.http.put<EtageDto>(`${this.apiUrl}/${etageId}`, payload, {
      headers: this.buildAuthHeaders(),
    });
  }

  deleteEtage(etageId: number): Observable<{ msg: string }> {
    return this.http.delete<{ msg: string }>(`${this.apiUrl}/${etageId}`, {
      headers: this.buildAuthHeaders(),
    });
  }

  private buildAuthHeaders(): HttpHeaders | undefined {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }
}
