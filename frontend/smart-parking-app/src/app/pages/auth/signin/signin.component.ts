import { AfterViewInit, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { OwnerWorkflowService } from '../../../services/owner-workflow.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-signin',
  templateUrl: './signin.component.html',
  styleUrls: ['./signin.component.scss'],
  standalone: false,
})
export class SigninComponent implements OnInit, AfterViewInit {
  signinForm: FormGroup;
  isLoading = false;
  isFormVisible = false;
  animateCar = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private ownerWorkflowService: OwnerWorkflowService,
    private router: Router,
    private toastService: ToastService
  ) {
    this.signinForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit() {
    if (this.authService.isAuthenticated()) {
      void this.redirectByRole();
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.animateCar = true;
    }, 100);
    setTimeout(() => {
      this.isFormVisible = true;
    }, 1350);
  }

  async onSubmit() {
    if (this.signinForm.invalid) {
      this.signinForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    try {
      const { email, password } = this.signinForm.value;
      await firstValueFrom(this.authService.signin(email, password));
      this.toastService.show('Connexion reussie ! Bienvenue sur PARKINI', 'success');
      await this.redirectByRole();
    } catch (error: any) {
      this.toastService.show(error.error?.msg || error.error?.error || 'Erreur de connexion', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  goToSignup() {
    this.router.navigate(['/pages/auth/signup']);
  }

  goToForgotPassword() {
    this.router.navigate(['/pages/auth/forgot-password']);
  }

  private getAuthErrorMessage(error: any, fallback: string): string {
    if (error?.status === 0) {
      return "API indisponible. Verifie que le backend Flask tourne et que DATABASE_URL est configuree.";
    }

    if (typeof error?.error === 'string' && error.error.includes('<!doctype html>')) {
      return "Erreur serveur backend. Verifie le demarrage du serveur et la configuration Supabase.";
    }

    return error?.error?.msg || error?.error?.error || fallback;
  }

  private async redirectByRole(): Promise<void> {
    const user = this.authService.getCurrentUser();

    if (user?.role === 'admin') {
      await this.router.navigate(['/admin']);
      return;
    }

    if (user?.role === 'owner') {
      const route = await this.ownerWorkflowService.resolveEntryRoute();
      await this.router.navigateByUrl(route);
      return;
    }

    await this.router.navigate(['/dashboard']);
  }
}
