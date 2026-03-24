import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  show(message: string, type: 'success' | 'error' | 'info' = 'info') {
    // Créer un élément toast
    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.textContent = message;
    
    // Styles du toast
    toast.style.position = 'fixed';
    toast.style.bottom = '30px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '50px';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '500';
    toast.style.zIndex = '2000';
    toast.style.animation = 'fadeInUp 0.3s ease';
    
    // Couleurs selon le type
    if (type === 'success') {
      toast.style.backgroundColor = '#10b981';
      toast.style.color = 'white';
    } else if (type === 'error') {
      toast.style.backgroundColor = '#ef4444';
      toast.style.color = 'white';
    } else {
      toast.style.backgroundColor = '#4a90e2';
      toast.style.color = 'white';
    }
    
    document.body.appendChild(toast);
    
    // Ajouter l'animation CSS
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
    `;
    document.head.appendChild(style);
    
    // Supprimer le toast après 3 secondes
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}