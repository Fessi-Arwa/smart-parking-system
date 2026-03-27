import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface PlaceDto {
  id_place: number;
  parking_id: number;
  num_place: number;
  etat: 'libre' | 'reservee' | 'occupee';
  zone?: string;
  etage?: string;
  created_at?: string;
}

export interface CreatePlacePayload {
  parking_id: number;
  num_place: number;
  etat?: 'libre' | 'reservee' | 'occupee';
  zone?: string;
  etage?: string;
}

export interface UpdatePlacePayload {
  num_place?: number;
  etat?: 'libre' | 'reservee' | 'occupee';
  zone?: string;
  etage?: string;
}

@Injectable({
  providedIn: 'root',
})
export class PlaceService {
  private apiUrl = 'http://localhost:5000/api/places';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  getPlaces(parkingId?: number): Observable<PlaceDto[]> {
    const url = parkingId == null ? `${this.apiUrl}/` : `${this.apiUrl}/?parking_id=${parkingId}`;
    return this.http.get<PlaceDto[]>(url);
  }

  createPlace(payload: CreatePlacePayload): Observable<PlaceDto> {
    return this.http.post<PlaceDto>(`${this.apiUrl}/`, payload, {
      headers: this.buildAuthHeaders(),
    });
  }

  updatePlace(placeId: number, payload: UpdatePlacePayload): Observable<PlaceDto> {
    return this.http.put<PlaceDto>(`${this.apiUrl}/${placeId}`, payload, {
      headers: this.buildAuthHeaders(),
    });
  }

  deletePlace(placeId: number): Observable<{ msg: string }> {
    return this.http.delete<{ msg: string }>(`${this.apiUrl}/${placeId}`, {
      headers: this.buildAuthHeaders(),
    });
  }

  private buildAuthHeaders(): HttpHeaders | undefined {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }
}
