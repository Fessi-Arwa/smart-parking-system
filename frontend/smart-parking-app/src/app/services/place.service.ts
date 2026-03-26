import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface PlaceDto {
  id_place: number;
  parking_id: number;
  num_place: number;
  etat: 'libre' | 'reservee' | 'occupee';
  zone?: string;
  etage?: string;
  created_at?: string;
}

@Injectable({
  providedIn: 'root',
})
export class PlaceService {
  private apiUrl = 'http://localhost:5000/api/places';

  constructor(private http: HttpClient) {}

  getPlaces(parkingId?: number): Observable<PlaceDto[]> {
    const url = parkingId == null ? `${this.apiUrl}/` : `${this.apiUrl}/?parking_id=${parkingId}`;
    return this.http.get<PlaceDto[]>(url);
  }
}
