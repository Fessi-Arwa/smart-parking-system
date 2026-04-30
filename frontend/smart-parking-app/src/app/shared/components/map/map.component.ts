import { AfterViewInit, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import * as L from 'leaflet';

const iconDefault = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = iconDefault;

export interface MapParking {
  id: number;
  nom: string;
  adresse: string;
  latitude: number;
  longitude: number;
  availableSpaces: number;
  price: number;
}

let mapInstanceCount = 0;

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
  standalone: false,
})
export class MapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() parkings: MapParking[] = [];
  @Input() userLatitude = 36.7538;
  @Input() userLongitude = 3.0588;
  @Output() parkingSelected = new EventEmitter<MapParking>();

  readonly mapId = `map-${++mapInstanceCount}`;

  private map?: L.Map;
  private userMarker?: L.Marker;
  private parkingMarkers: L.Marker[] = [];
  private isViewInitialized = false;

  ngAfterViewInit(): void {
    this.isViewInitialized = true;
    setTimeout(() => {
      this.initMap();
      this.syncMapState(true);
    }, 100);
  }

  ngOnChanges(_: SimpleChanges): void {
    if (!this.isViewInitialized || !this.map) {
      return;
    }
    this.syncMapState();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }

  focusOnUser(): void {
    if (this.map && this.userMarker) {
      this.map.setView([this.userLatitude, this.userLongitude], 16);
      this.userMarker.openPopup();
    }
  }

  focusOnParking(parking: MapParking): void {
    if (!this.map) return;
    this.map.setView([parking.latitude, parking.longitude], 16);
    const marker = this.parkingMarkers.find((item) => {
      const latLng = item.getLatLng();
      return latLng.lat === parking.latitude && latLng.lng === parking.longitude;
    });
    marker?.openPopup();
  }

  private initMap(): void {
    const element = document.getElementById(this.mapId);
    if (!element) return;

    this.map = L.map(this.mapId, {
      zoomControl: true,
    }).setView([this.userLatitude, this.userLongitude], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CartoDB',
      subdomains: 'abcd',
      maxZoom: 19,
      minZoom: 3
    }).addTo(this.map);
  }

  private syncMapState(shouldFitBounds = false): void {
    this.updateUserMarker();
    this.refreshParkingMarkers();

    if (shouldFitBounds) {
      this.fitToContent();
    }
  }

  private updateUserMarker(): void {
    if (!this.map) return;

    const userLatLng = L.latLng(this.userLatitude, this.userLongitude);

    if (!this.userMarker) {
      const userIcon = L.divIcon({
        className: 'user-marker',
        html: '<div class="user-marker-dot"><div class="user-marker-pulse"></div></div>',
        iconSize: [30, 30],
        popupAnchor: [0, -15]
      });

      this.userMarker = L.marker(userLatLng, { icon: userIcon })
        .addTo(this.map);
      return;
    }

    this.userMarker.setLatLng(userLatLng);
  }

  private refreshParkingMarkers(): void {
    if (!this.map) return;

    this.parkingMarkers.forEach((marker) => marker.remove());
    this.parkingMarkers = [];

    this.parkings.forEach((parking) => {
      const parkingIcon = L.divIcon({
        className: 'parking-marker-custom',
        html: `
          <div class="parking-marker-content">
            <span class="parking-marker-core"></span>
            <span class="parking-marker-ring"></span>
          </div>
        `,
        iconSize: [26, 26],
        popupAnchor: [0, -14]
      });

      const marker = L.marker([parking.latitude, parking.longitude], { icon: parkingIcon })
        .addTo(this.map!)
        .bindPopup(`
          <div class="parking-popup">
            <strong>${parking.nom}</strong><br>
            ${parking.adresse}<br>
            <span class="popup-price">${parking.price} DT/heure</span><br>
            <span class="popup-spaces">${parking.availableSpaces} places disponibles</span><br>
            <button class="popup-btn" data-id="${parking.id}">Reserver</button>
          </div>
        `);

      marker.on('popupopen', () => {
        const btn = document.querySelector(`.popup-btn[data-id="${parking.id}"]`);
        btn?.addEventListener('click', () => this.parkingSelected.emit(parking), { once: true });
      });

      this.parkingMarkers.push(marker);
    });
  }

  private fitToContent(): void {
    if (!this.map) return;

    const points: L.LatLngExpression[] = [
      [this.userLatitude, this.userLongitude],
      ...this.parkings.map((parking) => [parking.latitude, parking.longitude] as L.LatLngExpression),
    ];

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      this.map.fitBounds(bounds, { padding: [24, 24] });
    }
  }
}
