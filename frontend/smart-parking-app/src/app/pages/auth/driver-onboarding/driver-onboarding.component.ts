import { AfterViewInit, Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../services/toast.service';
import { VehicleService } from '../../../services/vehicle.service';

@Component({
  selector: 'app-driver-onboarding',
  templateUrl: './driver-onboarding.component.html',
  styleUrls: ['./driver-onboarding.component.scss'],
  standalone: false,
})
export class DriverOnboardingComponent implements AfterViewInit {
  vehicleForm: FormGroup;
  isLoading = false;
  isFormVisible = false;
  animateCar = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private vehicleService: VehicleService,
    private toastService: ToastService
  ) {
    this.vehicleForm = this.fb.group({
      matricule: ['', [Validators.required]],
      marque: [''],
      type: [''],
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
    if (this.vehicleForm.invalid) {
      this.vehicleForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    try {
      const { matricule, marque, type } = this.vehicleForm.value;
      await firstValueFrom(
        this.vehicleService.createVehicle({
          matricule,
          marque,
          type,
        })
      );
      this.toastService.show('Vehicule ajoute avec succes', 'success');
      await this.router.navigate(['/dashboard']);
    } catch (error: any) {
      this.toastService.show(error.error?.msg || error.error?.error || 'Erreur lors de la creation du vehicule', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  async skip(): Promise<void> {
    await this.router.navigate(['/dashboard']);
  }
}
