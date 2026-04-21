import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from './auth.service';

export interface ParkingDto {
  id_park: number;
  owner_id: number;
  nom: string;
  adresse: string;
  capacite: number;
  prix_heure: number;
  statut: string;
  validation_status?: string;
  setup_status?: string;
  ai_setup_status?: string;
  created_at?: string;
}

export interface CreateParkingPayload {
  nom: string;
  adresse: string;
  capacite: number;
  prix_heure: number;
  statut?: 'actif' | 'inactif';
}

export interface CreateParkingResponse {
  msg: string;
  parking: ParkingDto;
}

export interface UpdateParkingPayload {
  nom?: string;
  adresse?: string;
  capacite?: number;
  prix_heure?: number;
  statut?: 'actif' | 'inactif';
}

@Injectable({
  providedIn: 'root',
})
export class ParkingService {
  private apiUrl = `${environment.apiBaseUrl}/parkings`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  getParkings(): Observable<ParkingDto[]> {
    return this.http.get<ParkingDto[]>(`${this.apiUrl}/`, {
      headers: this.buildAuthHeaders(),
    });
  }

  getParking(parkingId: number): Observable<ParkingDto> {
    return this.http.get<ParkingDto>(`${this.apiUrl}/${parkingId}`, {
      headers: this.buildAuthHeaders(),
    });
  }

  createParking(payload: CreateParkingPayload): Observable<CreateParkingResponse> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.post<CreateParkingResponse>(`${this.apiUrl}/`, payload, { headers });
  }

  updateParking(parkingId: number, payload: UpdateParkingPayload): Observable<any> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.put(`${this.apiUrl}/${parkingId}`, payload, { headers });
  }

  deleteParking(parkingId: number): Observable<any> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.delete(`${this.apiUrl}/${parkingId}`, { headers });
  }

  private buildAuthHeaders(): HttpHeaders | undefined {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }
}
