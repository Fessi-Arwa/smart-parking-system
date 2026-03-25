import { AfterViewInit, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
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
      this.router.navigate(['/dashboard']);
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
    if (this.signinForm.valid) {
      this.isLoading = true;
      try {
        const { email, password } = this.signinForm.value;
        await firstValueFrom(this.authService.signin(email, password));
        this.toastService.show('Connexion réussie ! Bienvenue sur PARKINI 🚗', 'success');
        this.router.navigate(['/dashboard']);
      } catch (error: any) {
        this.toastService.show(error.error?.msg || error.error?.error || 'Erreur de connexion', 'error');
      } finally {
        this.isLoading = false;
      }
    }
  }

  goToSignup() {
    this.router.navigate(['/pages/auth/signup']);
  }
}
