import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private readonly containerId = 'app-toast-container';
  private readonly stylesId = 'app-toast-styles';

  show(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const container = this.ensureContainer();
    this.ensureStyles();

    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-message--hide');
      setTimeout(() => toast.remove(), 260);
    }, 3000);
  }

  private ensureContainer(): HTMLDivElement {
    let container = document.getElementById(this.containerId) as HTMLDivElement | null;
    if (container) {
      return container;
    }

    container = document.createElement('div');
    container.id = this.containerId;
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  }

  private ensureStyles(): void {
    if (document.getElementById(this.stylesId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = this.stylesId;
    style.textContent = `
      .toast-container {
        position: fixed;
        right: 20px;
        bottom: 24px;
        display: grid;
        gap: 10px;
        z-index: 3000;
        pointer-events: none;
      }

      .toast-message {
        min-width: 260px;
        max-width: 360px;
        padding: 14px 18px;
        border-radius: 18px;
        box-shadow: 0 20px 44px rgba(15, 23, 42, 0.18);
        color: #ffffff;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.5;
        pointer-events: auto;
        animation: toastSlideIn 0.28s ease;
      }

      .toast-success {
        background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);
      }

      .toast-error {
        background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
      }

      .toast-info {
        background: linear-gradient(135deg, #2563eb 0%, #38bdf8 100%);
      }

      .toast-message--hide {
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.25s ease, transform 0.25s ease;
      }

      @keyframes toastSlideIn {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;

    document.head.appendChild(style);
  }
}
