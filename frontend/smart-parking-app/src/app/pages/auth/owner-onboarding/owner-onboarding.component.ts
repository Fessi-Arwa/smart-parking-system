import { AfterViewInit, Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ParkingService } from '../../../services/parking.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-owner-onboarding',
  templateUrl: './owner-onboarding.component.html',
  styleUrls: ['./owner-onboarding.component.scss'],
  standalone: false,
})
export class OwnerOnboardingComponent implements AfterViewInit {
  parkingForm: FormGroup;
  isLoading = false;
  isFormVisible = false;
  animateCar = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private parkingService: ParkingService,
    private toastService: ToastService
  ) {
    this.parkingForm = this.fb.group({
      nom: ['', [Validators.required]],
      adresse: ['', [Validators.required]],
      capacite: [null, [Validators.required, Validators.min(1)]],
      prix_heure: [null, [Validators.required, Validators.min(0)]],
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.animateCar = true;
    }, 100);
    setTimeout(() => {
      this.isFormVisible = true;
    }, 1350);
  }

  async onSubmit(): Promise<void> {
    if (this.parkingForm.invalid) {
      this.parkingForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    try {
      const { nom, adresse, capacite, prix_heure } = this.parkingForm.value;
      await firstValueFrom(
        this.parkingService.createParking({
          nom,
          adresse,
          capacite: Number(capacite),
          prix_heure: Number(prix_heure),
        })
      );
      this.toastService.show('Parking ajoute avec succes', 'success');
      await this.router.navigate(['/owner/dashboard']);
    } catch (error: any) {
      this.toastService.show(error.error?.msg || error.error?.error || 'Erreur lors de la creation du parking', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  async skip(): Promise<void> {
    await this.router.navigate(['/owner/dashboard']);
  }
}
