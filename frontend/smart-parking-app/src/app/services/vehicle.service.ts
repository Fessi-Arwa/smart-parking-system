import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from './auth.service';

export interface VehicleDto {
  id_veh: number;
  conducteur_id: number;
  matricule: string;
  marque?: string;
  type?: string;
  created_at?: string;
}

export interface CreateVehiclePayload {
  matricule: string;
  marque?: string;
  type?: string;
}

@Injectable({
  providedIn: 'root',
})
export class VehicleService {
  private apiUrl = `${environment.apiBaseUrl}/vehicules`;
  private readonly tunisianPlatePattern = /^\d+\s+تونس\s+\d+$/;

  constructor(private http: HttpClient, private authService: AuthService) {}

  normalizePlate(value: string): string {
    return String(value || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
  }

  isSupportedPlateFormat(value: string): boolean {
    return this.tunisianPlatePattern.test(this.normalizePlate(value));
  }

  getVehicles(): Observable<VehicleDto[]> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.get<VehicleDto[]>(`${this.apiUrl}/`, { headers });
  }

  createVehicle(payload: CreateVehiclePayload): Observable<any> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;
    const normalizedPayload: CreateVehiclePayload = {
      ...payload,
      matricule: this.normalizePlate(payload.matricule),
      marque: payload.marque?.trim(),
      type: payload.type?.trim(),
    };

    return this.http.post(`${this.apiUrl}/`, normalizedPayload, { headers });
  }
}
